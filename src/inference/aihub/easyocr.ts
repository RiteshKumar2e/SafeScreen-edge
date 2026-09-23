import type { InferenceSession, Tensor } from 'onnxruntime-web';
import type { TextLine } from '../types';

/**
 * EasyOCR from Qualcomm AI Hub (qai-hub-models v0.62.2, w8a8 ONNX export,
 * Apache-2.0). Two models:
 *
 *   detector    CRAFT text detector, uint8 [1,3,608,800] RGB -> uint8 [1,304,400,2]
 *               (character region score, affinity score)
 *   recognizer  CRNN (VGG + BiLSTM + CTC), uint8 [1,1,64,W] grey -> uint8 [1,W/4-1,97]
 *               (published with W fixed at 800; the shipped copy takes any width,
 *               so a short line runs on a narrow strip)
 *
 * The weights are stored as INT8 (scripts/fold-aihub-weights.py); outputs are
 * bit-identical to the published export. Pre- and post-processing follow
 * Qualcomm's reference app (qai_hub_models/models/easyocr/app.py) and
 * EasyOCR's craft_utils / group_text_box.
 *
 * The same model files are what the SafeScreen Windows host runs with
 * ONNX Runtime's QNN execution provider on the Snapdragon NPU.
 */

export const EASYOCR_MODEL = {
  name: 'EasyOCR',
  source: 'Qualcomm AI Hub',
  release: 'qai-hub-models v0.62.2',
  precision: 'w8a8 (INT8 weights and activations)',
  license: 'Apache-2.0',
  files: { detector: '/models/easyocr/detector.int8.onnx', recognizer: '/models/easyocr/recognizer.int8.onnx' },
  // Published by Qualcomm AI Hub for this export; not measured by SafeScreen.
  published: { device: 'Snapdragon X Elite', unit: 'NPU', runtime: 'ONNX Runtime (QNN)', detectorMs: 13.45 },
} as const;

const DET_H = 608;
const DET_W = 800;
const MAP_H = 304;
const MAP_W = 400;
const DET_OUT = { scale: 0.004232470877468586, zero: 12 };
const REC_H = 64;
/** Width of the published export. The shipped recognizer accepts any width (see NOTICE.txt). */
const REC_W = 800;
/** Longest strip sent to the recognizer; longer lines are split at word gaps. */
const REC_MAX_W = 1600;
const REC_OUT = { scale: 0.2553488612174988, zero: 127 };

// EasyOCR english_g2 character set; index 0 of the output is the CTC blank.
const CHARS = '0123456789!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~ €ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// Detector thresholds from Qualcomm's DETECTOR_ARGS.
const TEXT_THRESHOLD = 0.7;
const LINK_THRESHOLD = 0.4;
const LOW_TEXT = 0.4;
const MIN_SIZE = 20;
const Y_CENTER_THS = 0.5;
const HEIGHT_THS = 0.5;
const WIDTH_THS = 0.5;
const ADD_MARGIN = 0.1;

export type EasyOcrBackend = 'webgpu' | 'wasm';

type Ort = typeof import('onnxruntime-web');
interface Engine {
  ort: Ort;
  detector: InferenceSession;
  recognizer: InferenceSession;
  backend: EasyOcrBackend;
}

let enginePromise: Promise<Engine> | null = null;
let engineBackend: EasyOcrBackend | null = null;

const WEBGPU_WARMUP_MS = 30000;
/** Upper bound for one model run, so a lost GPU device surfaces as an error instead of a hang. */
const RUN_TIMEOUT_MS = 180000;

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new EasyOcrError(message)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

export class EasyOcrError extends Error {
  name = 'EasyOcrError';
}

/** True when this browser exposes a WebGPU adapter. */
export async function webGpuAvailable(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

/**
 * Loads both models on the requested backend. WebAssembly (multithreaded when
 * the page is cross-origin isolated) is the default. WebGPU is opt-in: some
 * GPU drivers accept the session and then lose the device mid-run, and ONNX
 * Runtime Web cannot recover from that without a page reload, so a timed
 * warm-up run checks the GPU before it is used.
 */
function loadEngine(backend: EasyOcrBackend, onStatus: (s: string) => void): Promise<Engine> {
  if (enginePromise && engineBackend !== backend) {
    throw new EasyOcrError('The text model is already loaded on another backend. Reload the page to switch between WebAssembly and WebGPU.');
  }
  if (!enginePromise) {
    engineBackend = backend;
    enginePromise = (async () => {
      onStatus('Loading ONNX Runtime');
      const ort = await import('onnxruntime-web');
      // Runtime files are served from this site; no CDN.
      ort.env.wasm.wasmPaths = '/ort/';
      ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(navigator.hardwareConcurrency || 4, 8) : 1;
      // Run inference in a worker so the page stays responsive during long runs.
      ort.env.wasm.proxy = backend === 'wasm';
      ort.env.logLevel = 'error';
      if (backend === 'webgpu' && !(await webGpuAvailable())) {
        throw new EasyOcrError('WebGPU is not available in this browser. Turn off GPU acceleration in Settings.');
      }
      const label = backend === 'webgpu' ? 'WebGPU' : 'WebAssembly';
      onStatus(`Loading Qualcomm AI Hub models (${label})`);
      const opts = { executionProviders: [backend], graphOptimizationLevel: 'all' as const };
      const detector = await ort.InferenceSession.create(EASYOCR_MODEL.files.detector, opts);
      const recognizer = await ort.InferenceSession.create(EASYOCR_MODEL.files.recognizer, opts);
      if (backend === 'webgpu') {
        onStatus('Checking the GPU with a warm-up run');
        const fail = 'The GPU did not finish a warm-up run. Turn off GPU acceleration in Settings and reload the page.';
        await withTimeout(detector.run({ image: new ort.Tensor('uint8', new Uint8Array(3 * DET_H * DET_W), [1, 3, DET_H, DET_W]) }), WEBGPU_WARMUP_MS, fail);
        await withTimeout(recognizer.run({ image: new ort.Tensor('uint8', new Uint8Array(REC_H * REC_W), [1, 1, REC_H, REC_W]) }), WEBGPU_WARMUP_MS, fail);
      }
      return { ort, detector, recognizer, backend };
    })().catch((err) => {
      // A hung GPU run poisons the runtime for this page, so only allow a retry for other failures.
      if (!(err instanceof EasyOcrError)) {
        enginePromise = null;
        engineBackend = null;
      }
      throw err;
    });
  }
  return enginePromise;
}

export interface EasyOcrResult {
  text: string;
  lines: TextLine[];
  backend: EasyOcrBackend;
  detectorMs: number;
  recognizerMs: number;
  words: number;
}

/** [xmin, xmax, ymin, ymax] in source pixels. */
type Box = [number, number, number, number];

/** Letterbox the image into the 608x800 detector input, uint8 CHW. */
function detectorInput(src: HTMLCanvasElement) {
  const scale = Math.min(DET_H / src.height, DET_W / src.width);
  const w = Math.floor(src.width * scale);
  const h = Math.floor(src.height * scale);
  const padX = Math.floor((DET_W - w) / 2);
  const padY = Math.floor((DET_H - h) / 2);
  const c = document.createElement('canvas');
  c.width = DET_W;
  c.height = DET_H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, DET_W, DET_H);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, padX, padY, w, h);
  const px = ctx.getImageData(0, 0, DET_W, DET_H).data;
  const plane = DET_W * DET_H;
  const out = new Uint8Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    out[i] = px[i * 4];
    out[plane + i] = px[i * 4 + 1];
    out[2 * plane + i] = px[i * 4 + 2];
  }
  return { data: out, scale, padX, padY };
}

/**
 * CRAFT post-processing (craft_utils.getDetBoxes_core, axis-aligned): threshold
 * region and link scores, find connected components, keep components with a
 * confident character core, and dilate each by a size-dependent margin.
 */
function detectBoxes(map: Uint8Array, scale: number, padX: number, padY: number, srcW: number, srcH: number): Box[] {
  const n = MAP_W * MAP_H;
  const text = new Float32Array(n);
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const t = (map[i * 2] - DET_OUT.zero) * DET_OUT.scale;
    const l = (map[i * 2 + 1] - DET_OUT.zero) * DET_OUT.scale;
    text[i] = t;
    mask[i] = t > LOW_TEXT || l > LINK_THRESHOLD ? 1 : 0;
  }
  const label = new Int32Array(n);
  const stack = new Int32Array(n);
  const boxes: Box[] = [];
  let next = 0;
  for (let s = 0; s < n; s++) {
    if (!mask[s] || label[s]) continue;
    next++;
    let top = 0;
    stack[top++] = s;
    label[s] = next;
    let size = 0;
    let peak = 0;
    let x0 = MAP_W, y0 = MAP_H, x1 = 0, y1 = 0;
    while (top) {
      const p = stack[--top];
      const x = p % MAP_W;
      const y = (p - x) / MAP_W;
      size++;
      if (text[p] > peak) peak = text[p];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && mask[p - 1] && !label[p - 1]) (label[p - 1] = next), (stack[top++] = p - 1);
      if (x < MAP_W - 1 && mask[p + 1] && !label[p + 1]) (label[p + 1] = next), (stack[top++] = p + 1);
      if (y > 0 && mask[p - MAP_W] && !label[p - MAP_W]) (label[p - MAP_W] = next), (stack[top++] = p - MAP_W);
      if (y < MAP_H - 1 && mask[p + MAP_W] && !label[p + MAP_W]) (label[p + MAP_W] = next), (stack[top++] = p + MAP_W);
    }
    if (size < 10 || peak < TEXT_THRESHOLD) continue;
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const it = Math.floor(Math.sqrt((size * Math.min(w, h)) / (w * h)) * 2);
    // Map (304x400) -> detector input (608x800) -> source pixels.
    const toX = (v: number) => (v * 2 - padX) / scale;
    const toY = (v: number) => (v * 2 - padY) / scale;
    const box: Box = [toX(x0 - it), toX(x1 + 1 + it), toY(y0 - it), toY(y1 + 1 + it)];
    box[0] = Math.max(0, box[0]);
    box[1] = Math.min(srcW, box[1]);
    box[2] = Math.max(0, box[2]);
    box[3] = Math.min(srcH, box[3]);
    if (box[1] > box[0] && box[3] > box[2]) boxes.push(box);
  }
  return boxes;
}

/**
 * EasyOCR group_text_box for horizontal text: words whose vertical centers and
 * heights agree are chained left to right when the gap is small, then padded
 * by a margin proportional to the line height.
 */
function groupLines(boxes: Box[]): Box[][] {
  const items = boxes.map((b) => ({ b, yc: (b[2] + b[3]) / 2, h: b[3] - b[2] })).sort((a, b) => a.yc - b.yc);
  const rows: (typeof items)[] = [];
  for (const it of items) {
    const row = rows[rows.length - 1];
    if (row) {
      const meanH = row.reduce((s, r) => s + r.h, 0) / row.length;
      const meanY = row.reduce((s, r) => s + r.yc, 0) / row.length;
      if (Math.abs(meanY - it.yc) < Y_CENTER_THS * meanH) {
        row.push(it);
        continue;
      }
    }
    rows.push([it]);
  }
  const lines: Box[][] = [];
  for (const row of rows) {
    row.sort((a, b) => a.b[0] - b.b[0]);
    let cur: Box[] = [];
    for (const it of row) {
      const last = cur[cur.length - 1];
      if (!last) {
        cur.push(it.b);
        continue;
      }
      const hLast = last[3] - last[2];
      const sameHeight = Math.abs(hLast - it.h) < HEIGHT_THS * Math.max(hLast, it.h);
      const close = it.b[0] - last[1] < WIDTH_THS * Math.max(hLast, it.h);
      if (sameHeight && close) cur.push(it.b);
      else {
        lines.push(cur);
        cur = [it.b];
      }
    }
    if (cur.length) lines.push(cur);
  }
  return lines;
}

function union(bs: Box[], srcW: number, srcH: number): Box {
  const x0 = Math.min(...bs.map((b) => b[0]));
  const x1 = Math.max(...bs.map((b) => b[1]));
  const y0 = Math.min(...bs.map((b) => b[2]));
  const y1 = Math.max(...bs.map((b) => b[3]));
  const m = ADD_MARGIN * (y1 - y0);
  return [Math.max(0, x0 - m), Math.min(srcW, x1 + m), Math.max(0, y0 - m), Math.min(srcH, y1 + m)];
}

/**
 * A line longer than REC_MAX_W at 64 px height is split at word gaps, so text
 * is never shrunk below the height the recognizer was trained on.
 */
function splitForRecognizer(words: Box[], srcW: number, srcH: number): Box[] {
  const out: Box[] = [];
  let cur: Box[] = [];
  for (const w of words) {
    const trial = union([...cur, w], srcW, srcH);
    if (cur.length && (trial[1] - trial[0]) / (trial[3] - trial[2]) > REC_MAX_W / REC_H) {
      out.push(union(cur, srcW, srcH));
      cur = [w];
    } else cur.push(w);
  }
  if (cur.length) out.push(union(cur, srcW, srcH));
  return out;
}

/** Leftmost column that differs clearly from the crop's border colour. */
function inkStart(px: Uint8ClampedArray, w: number, h: number): number {
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(px[x * 4], px[((h - 1) * w + x) * 4]);
  for (let y = 0; y < h; y++) border.push(px[y * w * 4], px[(y * w + w - 1) * 4]);
  border.sort((a, b) => a - b);
  const bg = border[border.length >> 1];
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) if (Math.abs(px[(y * w + x) * 4] - bg) > 40) return x;
  }
  return 0;
}

/**
 * Grey crop, resized to height 64 keeping aspect, left-aligned, padded on the
 * right with its corner value. Blank space before the first glyph is trimmed:
 * the recognizer tends to read a leading gap as "~".
 */
function recognizerInput(grey: CanvasRenderingContext2D, box: Box, work: CanvasRenderingContext2D): { data: Uint8Array; width: number } {
  let [x0, x1, y0, y1] = [Math.floor(box[0]), Math.ceil(box[1]), Math.floor(box[2]), Math.ceil(box[3])];
  const crop = grey.getImageData(x0, y0, x1 - x0, y1 - y0);
  x0 += Math.max(0, inkStart(crop.data, crop.width, crop.height) - 2);
  const cw = x1 - x0;
  const ch = y1 - y0;
  const s = Math.min(REC_H / ch, (REC_MAX_W - 8) / cw);
  const rw = Math.max(1, Math.floor(cw * s));
  const rh = Math.max(1, Math.floor(ch * s));
  // Widths are rounded up to 64 px steps so the runtime sees few distinct shapes.
  const width = Math.min(REC_MAX_W, Math.ceil((rw + 8) / 64) * 64);
  const corner = crop.data[0];
  work.fillStyle = `rgb(${corner},${corner},${corner})`;
  work.fillRect(0, 0, width, REC_H);
  work.imageSmoothingQuality = 'high';
  work.drawImage(grey.canvas, x0, y0, cw, ch, 0, Math.floor((REC_H - rh) / 2), rw, rh);
  const px = work.getImageData(0, 0, width, REC_H).data;
  const data = new Uint8Array(width * REC_H);
  for (let i = 0; i < data.length; i++) data[i] = px[i * 4];
  return { data, width };
}

/** Greedy CTC decode with EasyOCR's confidence (custom_mean). */
function decode(logits: Uint8Array): { text: string; confidence: number } {
  const T = logits.length / 97;
  let prev = 0;
  let text = '';
  const probs: number[] = [];
  const row = new Float32Array(97);
  for (let t = 0; t < T; t++) {
    let max = -Infinity;
    for (let k = 0; k < 97; k++) {
      row[k] = (logits[t * 97 + k] - REC_OUT.zero) * REC_OUT.scale;
      if (row[k] > max) max = row[k];
    }
    let sum = 0;
    let best = 0;
    let bestP = 0;
    for (let k = 0; k < 97; k++) {
      const e = Math.exp(row[k] - max);
      sum += e;
      if (e > bestP) (bestP = e), (best = k);
    }
    if (best !== 0) {
      probs.push(bestP / sum);
      if (best !== prev) text += CHARS[best - 1];
    }
    prev = best;
  }
  const confidence = probs.length ? Math.pow(probs.reduce((a, b) => a * b, 1), 2 / Math.sqrt(probs.length)) : 0;
  text = text.trim();
  // The recognizer can emit these where the strip is padded (Qualcomm app.py).
  if (/[\]|]$/.test(text)) text = text.slice(0, -1).trim();
  return { text, confidence };
}

function greyCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    px[i] = px[i + 1] = px[i + 2] = l;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export async function recognizeEasyOcr(
  image: HTMLCanvasElement,
  onProgress: (p: number, status: string) => void,
  opts: { signal?: AbortSignal; backend?: EasyOcrBackend } = {},
): Promise<EasyOcrResult> {
  const { signal, backend: wanted = 'wasm' } = opts;
  const engine = await loadEngine(wanted, (s) => onProgress(0, s));
  const { ort, detector, recognizer, backend } = engine;
  const W = image.width;
  const H = image.height;

  onProgress(0.05, 'Detecting text regions');
  const input = detectorInput(image);
  const t0 = performance.now();
  const detOut = await withTimeout(detector.run({ image: new ort.Tensor('uint8', input.data, [1, 3, DET_H, DET_W]) }), RUN_TIMEOUT_MS, 'The model run did not finish. If GPU acceleration is on, turn it off in Settings and reload the page.');
  const detectorMs = performance.now() - t0;
  const map = (detOut[detector.outputNames[0]] as Tensor).data as Uint8Array;
  const words = detectBoxes(map, input.scale, input.padX, input.padY, W, H);
  const strips = groupLines(words)
    .flatMap((l) => splitForRecognizer(l, W, H))
    .filter((b) => Math.max(b[1] - b[0], b[3] - b[2]) > MIN_SIZE / input.scale / 2);

  const grey = greyCanvas(image).getContext('2d', { willReadFrequently: true })!;
  const work = document.createElement('canvas');
  work.width = REC_MAX_W;
  work.height = REC_H;
  const wctx = work.getContext('2d', { willReadFrequently: true })!;
  const lines: TextLine[] = [];
  let recognizerMs = 0;
  for (let i = 0; i < strips.length; i++) {
    if (signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
    onProgress(0.1 + (0.9 * i) / strips.length, 'Reading text');
    const b = strips[i];
    const { data, width } = recognizerInput(grey, b, wctx);
    const t1 = performance.now();
    const out = await withTimeout(recognizer.run({ image: new ort.Tensor('uint8', data, [1, 1, REC_H, width]) }), RUN_TIMEOUT_MS, 'The model run did not finish. If GPU acceleration is on, turn it off in Settings and reload the page.');
    recognizerMs += performance.now() - t1;
    const { text, confidence } = decode((out[recognizer.outputNames[0]] as Tensor).data as Uint8Array);
    if (!text) continue;
    lines.push({ text, box: { x: b[0] / W, y: b[2] / H, w: (b[1] - b[0]) / W, h: (b[3] - b[2]) / H }, confidence: Math.round(confidence * 100) });
  }
  onProgress(1, 'Done');
  // Reading order: top to bottom, then left to right within a row.
  lines.sort((a, b) => (Math.abs(a.box.y - b.box.y) < Math.min(a.box.h, b.box.h) / 2 ? a.box.x - b.box.x : a.box.y - b.box.y));
  return {
    text: joinRows(lines),
    lines,
    backend,
    detectorMs: Math.round(detectorMs),
    recognizerMs: Math.round(recognizerMs),
    words: words.length,
  };
}

/** Lines on the same row are joined with spaces; rows become text lines. */
function joinRows(lines: TextLine[]): string {
  const rows: TextLine[][] = [];
  for (const l of lines) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].box.y - l.box.y) < Math.min(row[0].box.h, l.box.h) / 2) row.push(l);
    else rows.push([l]);
  }
  return rows.map((r) => r.map((l) => l.text).join('  ')).join('\n');
}
