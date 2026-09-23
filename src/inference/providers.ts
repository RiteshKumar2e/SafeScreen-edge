import { getScenario } from '../demo/scenarios';
import { nativeHost } from '../runtime/nativeBridge';
import { analyzeText, type TextAnalysis } from './analyze';
import { EASYOCR_MODEL, EasyOcrError, recognizeEasyOcr } from './aihub/easyocr';
import { recognize } from './ocr';
import { preprocess } from './preprocess';
import { labelRegions, layoutLines } from './structure';
import {
  AnalysisError,
  type AnalysisReport,
  type Backend,
  type InferenceProvider,
  type OcrEngineId,
  type OcrEngineInfo,
  type ProviderId,
  type Region,
  type StageId,
  type StageUpdate,
  type TextLine,
  type UiElement,
} from './types';

/** Raised when a frame shows an application the user excluded. Nothing from the frame is kept. */
export class ExcludedFrameError extends AnalysisError {
  constructor(public appName: string) {
    super(`This frame showed ${appName}, which you excluded in Privacy settings. It was discarded without analysis.`);
    this.name = 'ExcludedFrameError';
  }
}

export interface AnalyzeOptions {
  signal?: AbortSignal;
  /** Returns the name of an excluded app if the recognized text shows one. */
  exclude?: (text: string) => string | null;
  /** Text recognition model for the local provider. Defaults to Qualcomm AI Hub EasyOCR. */
  engine?: OcrEngineId;
  /** Run the AI Hub model on the GPU through WebGPU instead of WebAssembly. */
  gpu?: boolean;
}

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
}

/** Wraps onStage to measure how long each stage actually took. */
function stageClock(onStage: (u: StageUpdate) => void) {
  const started: Partial<Record<StageId, number>> = {};
  const timings: Partial<Record<StageId, number>> = {};
  const backends: Partial<Record<StageId, Backend>> = {};
  const emit = (u: StageUpdate, backend?: Backend) => {
    if (u.status === 'running' && started[u.id] === undefined) started[u.id] = performance.now();
    if (u.status === 'done' || u.status === 'error') {
      const t0 = started[u.id];
      timings[u.id] = t0 === undefined ? 0 : Math.round((performance.now() - t0) * 10) / 10;
    }
    if (backend) backends[u.id] = backend;
    onStage(u);
  };
  return { emit, timings, backends };
}

/** Counts resource requests this page makes while an analysis runs. */
function networkWatch() {
  const start = performance.getEntriesByType('resource').length;
  return () => {
    const entries = performance.getEntriesByType('resource').slice(start);
    const external = [...new Set(entries.map((e) => new URL(e.name, location.href)).filter((u) => u.origin !== location.origin && u.protocol !== 'blob:' && u.protocol !== 'data:').map((u) => u.origin))];
    return { requests: entries.length, external };
  };
}

/** Runs the shared context -> agents -> evidence -> explanation stages. */
function runAgents(text: string, annotated: UiElement[], clock: ReturnType<typeof stageClock>): TextAnalysis {
  const { emit } = clock;
  emit({ id: 'context', status: 'running' }, 'CPU · JavaScript');
  const t0 = performance.now();
  const result = analyzeText(text, annotated);
  const { context } = result;
  emit({
    id: 'context',
    status: 'done',
    detail: `${context.lines.length} lines, ${context.urls.length} address${context.urls.length === 1 ? '' : 'es'}, ${context.uiElements.length} UI element${context.uiElements.length === 1 ? '' : 's'}`,
  });
  // analyzeText builds context and runs agents in one pass; split its time for the trace.
  clock.timings.context = Math.round((performance.now() - t0) * 10) / 10;
  emit({ id: 'agents', status: 'done', detail: `${result.analysis.agent} selected` }, 'CPU · JavaScript');
  clock.timings.agents = 0;
  emit({ id: 'evidence', status: 'done', detail: `${result.analysis.evidence.length} quoted line${result.analysis.evidence.length === 1 ? '' : 's'}` }, 'CPU · JavaScript');
  clock.timings.evidence = 0;
  return result;
}

function finish(
  result: TextAnalysis,
  lines: TextLine[],
  positionSource: Region['source'],
  providerId: ProviderId,
  started: number,
  clock: ReturnType<typeof stageClock>,
  net: () => AnalysisReport['network'],
  opts: { leftDevice: boolean; simulated: boolean },
): AnalysisReport {
  const t0 = performance.now();
  const regions = labelRegions(lines, result.context, result.analysis, result.structure, positionSource);
  clock.emit({ id: 'explain', status: 'done', detail: `${result.analysis.category}, ${regions.length} region${regions.length === 1 ? '' : 's'}` }, 'CPU · JavaScript');
  clock.timings.explain = Math.round((performance.now() - t0) * 10) / 10;
  return {
    analysis: result.analysis,
    recognizedText: result.redactedText,
    uiElements: result.context.uiElements,
    sensitiveKinds: result.sensitiveKinds,
    providerId,
    leftDevice: opts.leftDevice,
    simulated: opts.simulated,
    elapsedMs: Math.round(performance.now() - started),
    timings: { ...clock.timings },
    backends: { ...clock.backends },
    regions,
    structure: result.structure,
    network: net(),
  };
}

/**
 * Local provider: OCR runs in this browser through WebAssembly, and analysis
 * runs as rule-based agents in this tab. Nothing is uploaded.
 */
export const localProvider: InferenceProvider<AnalyzeOptions> = {
  id: 'local',
  label: 'Local',
  description: 'Text recognition (Qualcomm AI Hub EasyOCR or Tesseract) and analysis run in this browser. Screen content is not uploaded.',
  availability: () =>
    typeof WebAssembly === 'object' && typeof Worker === 'function'
      ? { ok: true }
      : { ok: false, reason: 'This browser does not support WebAssembly workers, which local OCR needs.' },
  async analyze(input, onStage, opts = {}) {
    const { signal, exclude } = opts;
    const started = performance.now();
    const net = networkWatch();
    const clock = stageClock(onStage);
    clock.emit({ id: 'preprocess', status: 'running' }, 'CPU · Canvas 2D');
    const { canvas, width, height, inverted } = await preprocess(input.imageUrl);
    clock.emit({ id: 'preprocess', status: 'done', detail: `${width} × ${height} px${inverted ? ', dark theme inverted' : ''}` });
    checkAbort(signal);

    const engine = opts.engine ?? 'aihub-easyocr';
    let ocr: { text: string; lines: TextLine[] };
    let ocrEngine: OcrEngineInfo;
    if (engine === 'aihub-easyocr') {
      clock.emit({ id: 'ocr', status: 'running', detail: 'Loading Qualcomm AI Hub EasyOCR', progress: 0 }, 'CPU · WebAssembly');
      let r: Awaited<ReturnType<typeof recognizeEasyOcr>>;
      try {
        r = await recognizeEasyOcr(canvas, (p, status) => clock.emit({ id: 'ocr', status: 'running', detail: status, progress: p }), { signal, backend: opts.gpu ? 'webgpu' : 'wasm' });
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        if (err instanceof EasyOcrError) throw new AnalysisError(err.message, err);
        throw new AnalysisError('The Qualcomm AI Hub text model could not start in this browser. Switch the text recognition model to Tesseract in Settings, or load a demo scenario.', err);
      }
      const runtime = r.backend === 'webgpu' ? 'GPU · WebGPU' : 'CPU · WebAssembly';
      clock.backends.ocr = runtime;
      ocr = r;
      ocrEngine = {
        id: 'aihub-easyocr',
        label: `${EASYOCR_MODEL.name} (${EASYOCR_MODEL.source}, INT8)`,
        source: `${EASYOCR_MODEL.source}, ${EASYOCR_MODEL.release}`,
        runtime: `ONNX Runtime Web, ${runtime}`,
        measured: [
          { name: 'EasyOCR detector (CRAFT)', ms: r.detectorMs, runs: 1 },
          { name: 'EasyOCR recognizer (CRNN)', ms: r.recognizerMs, runs: r.lines.length },
        ],
      };
      clock.emit({ id: 'ocr', status: 'done', detail: `Qualcomm AI Hub EasyOCR on ${runtime}: ${r.words} text regions, ${r.lines.length} lines (detector ${r.detectorMs} ms)` });
    } else {
      clock.emit({ id: 'ocr', status: 'running', detail: 'Loading on-device OCR', progress: 0 }, 'CPU · WebAssembly');
      try {
        ocr = await recognize(canvas, (p, status) =>
          clock.emit({ id: 'ocr', status: 'running', detail: status.includes('recogniz') ? 'Reading text' : 'Loading on-device OCR', progress: p }),
        );
      } catch (err) {
        throw new AnalysisError('The on-device text recognizer could not start. Reload the page and try again, or load a demo scenario.', err);
      }
      ocrEngine = { id: 'tesseract', label: 'Tesseract LSTM (INT8 weights)', source: 'tesseract.js, eng best_int', runtime: 'WebAssembly', measured: [] };
      clock.emit({ id: 'ocr', status: 'done', detail: `Tesseract LSTM (WebAssembly), ${ocr.lines.length} lines` });
    }
    checkAbort(signal);
    const excluded = exclude?.(ocr.text);
    if (excluded) throw new ExcludedFrameError(excluded);
    clock.emit({ id: 'vision', status: 'skipped', detail: 'No vision model in this build. UI elements are inferred from text.' });

    const result = runAgents(ocr.text, [], clock);
    return { ...finish(result, ocr.lines, 'OCR text position', 'local', started, clock, net, { leftDevice: false, simulated: false }), ocrEngine };
  },
};

/**
 * Scenario provider: uses the prepared transcript, text layout and simulated
 * vision annotations of a demo scenario, then runs the same agents and region
 * labeling as the local provider. Deterministic, so it is safe to rely on in a
 * live presentation.
 */
export const scenarioProvider: InferenceProvider<AnalyzeOptions> = {
  id: 'scenario',
  label: 'Demo simulation',
  description: 'Uses a prepared transcript of the demo image. Results are deterministic.',
  availability: () => ({ ok: true }),
  async analyze(input, onStage) {
    const started = performance.now();
    const net = networkWatch();
    const clock = stageClock(onStage);
    const scenario = getScenario(input.scenarioId);
    if (!scenario) throw new AnalysisError('This demo scenario could not be found. Choose another scenario.');
    clock.emit({ id: 'preprocess', status: 'done', detail: 'Prepared demo image' }, 'Prepared data');
    clock.emit({ id: 'ocr', status: 'done', detail: 'Prepared transcript (simulated OCR)' }, 'Prepared data');
    clock.emit({ id: 'vision', status: 'done', detail: `${scenario.uiElements.length} simulated annotation${scenario.uiElements.length === 1 ? '' : 's'}` }, 'Prepared data');
    const lines = layoutLines(scenario.transcript, scenario.layout, scenario.width, scenario.height);
    const result = runAgents(scenario.transcript, scenario.uiElements, clock);
    return finish(result, lines, 'Prepared text layout', 'scenario', started, clock, net, { leftDevice: false, simulated: true });
  },
};

/**
 * Native provider: sends the frame to a SafeScreen Windows host over the
 * WebView2 bridge, where OCR and vision models run through ONNX Runtime with
 * the execution provider the host selects (QNN for the Snapdragon NPU when
 * present). Only available when that host is connected.
 */
export const nativeProvider: InferenceProvider<AnalyzeOptions> = {
  id: 'native',
  label: 'Native host',
  description: 'OCR and vision run in the SafeScreen Windows host on this device.',
  availability: () => (nativeHost() ? { ok: true } : { ok: false, reason: 'The SafeScreen Windows host is not connected. Analysis runs in the browser.' }),
  async analyze(input, onStage, opts = {}) {
    const host = nativeHost();
    if (!host) throw new AnalysisError('The SafeScreen Windows host is not connected.');
    const started = performance.now();
    const net = networkWatch();
    const clock = stageClock(onStage);
    clock.emit({ id: 'preprocess', status: 'running' }, 'Native host');
    const blob = await (await fetch(input.imageUrl)).blob();
    clock.emit({ id: 'preprocess', status: 'done', detail: `${Math.round(blob.size / 1024)} KB frame` });
    clock.emit({ id: 'ocr', status: 'running', detail: 'Running in native host' }, 'Native host');
    const res = await host.analyze(blob, opts.signal);
    clock.emit({ id: 'ocr', status: 'done', detail: `${res.ocrModel} on ${res.executionProvider}: ${res.lines.length} lines${typeof res.timings.detector === 'number' ? ` (detector ${Math.round(res.timings.detector)} ms)` : ''}` });
    const excluded = opts.exclude?.(res.text);
    if (excluded) throw new ExcludedFrameError(excluded);
    clock.emit({ id: 'vision', status: res.uiElements.length ? 'done' : 'skipped', detail: res.uiElements.length ? `${res.uiElements.length} elements on ${res.executionProvider}` : 'Not returned by host' }, 'Native host');
    const result = runAgents(res.text, res.uiElements, clock);
    const t = res.timings;
    const ocrEngine: OcrEngineInfo = {
      id: 'aihub-easyocr',
      label: `${res.ocrModel} on ${res.executionProvider.replace('ExecutionProvider', '')}`,
      source: 'Qualcomm AI Hub, via the SafeScreen host',
      runtime: `ONNX Runtime, ${res.executionProvider}`,
      measured: [
        ...(typeof t.detector === 'number' ? [{ name: `EasyOCR detector (CRAFT), host ${res.executionProvider.replace('ExecutionProvider', '')}`, ms: t.detector, runs: 1 }] : []),
        ...(typeof t.recognizer === 'number' && t.recognizerRuns ? [{ name: `EasyOCR recognizer (CRNN), host ${res.executionProvider.replace('ExecutionProvider', '')}`, ms: t.recognizer, runs: t.recognizerRuns }] : []),
      ],
    };
    return { ...finish(result, res.lines, res.uiElements.length ? 'Simulated vision annotation' : 'OCR text position', 'native', started, clock, net, { leftDevice: false, simulated: false }), ocrEngine };
  },
};

const CLOUD_ENDPOINT = import.meta.env.VITE_CLOUD_DEMO_ENDPOINT as string | undefined;

/**
 * Cloud fallback: for development machines without a local model. It sends
 * the image to a configured endpoint that must return
 * { text: string, uiElements?: UiElement[] }. Disabled unless
 * VITE_CLOUD_DEMO_ENDPOINT is set, off by default, and always labeled.
 */
export const cloudDemoProvider: InferenceProvider<AnalyzeOptions> = {
  id: 'cloud-demo',
  label: 'Cloud fallback',
  description: 'Screen content is sent to the configured external AI provider.',
  availability: () =>
    CLOUD_ENDPOINT
      ? { ok: true }
      : { ok: false, reason: 'Not configured in this build. A developer can enable it with an endpoint setting.' },
  async analyze(input, onStage, opts = {}) {
    if (!CLOUD_ENDPOINT) throw new AnalysisError('Cloud fallback is not configured.');
    const started = performance.now();
    const net = networkWatch();
    const clock = stageClock(onStage);
    clock.emit({ id: 'preprocess', status: 'running' }, 'External service');
    const blob = await (await fetch(input.imageUrl)).blob();
    clock.emit({ id: 'preprocess', status: 'done', detail: `${Math.round(blob.size / 1024)} KB` });
    clock.emit({ id: 'ocr', status: 'running', detail: 'Sending to external provider' }, 'External service');
    let payload: { text?: unknown; uiElements?: UiElement[] };
    try {
      const res = await fetch(CLOUD_ENDPOINT, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'image/png' }, signal: opts.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      payload = await res.json();
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      throw new AnalysisError('The cloud provider did not respond. Switch to local processing or try again.', err);
    }
    if (typeof payload.text !== 'string') throw new AnalysisError('The cloud provider returned an unexpected response.');
    clock.emit({ id: 'ocr', status: 'done', detail: 'External provider' });
    clock.emit({ id: 'vision', status: payload.uiElements ? 'done' : 'skipped', detail: payload.uiElements ? 'External provider' : 'Not returned' }, 'External service');
    const result = runAgents(payload.text, payload.uiElements ?? [], clock);
    return finish(result, [], 'OCR text position', 'cloud-demo', started, clock, net, { leftDevice: true, simulated: false });
  },
};

export const cloudConfigured = !!CLOUD_ENDPOINT;
export const cloudOrigin = CLOUD_ENDPOINT ? new URL(CLOUD_ENDPOINT, 'https://invalid.local').origin : null;
