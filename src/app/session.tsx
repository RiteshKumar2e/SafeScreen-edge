import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getScenario } from '../demo/scenarios';
import { cloudConfigured, cloudDemoProvider, ExcludedFrameError, localProvider, nativeProvider, scenarioProvider, type AnalyzeOptions } from '../inference/providers';
import { AnalysisError, type AnalysisReport, type InferenceProvider, type InputSource, type StageId, type StageUpdate } from '../inference/types';
import { nativeHost } from '../runtime/nativeBridge';
import { excludedMatch, getState, kindOf, log, recordDetection, useStore } from '../store/store';
import { useToast } from '../components/ui';

export interface Frame {
  url: string;
  source: InputSource;
  scenarioId?: string;
  label: string;
  /** Object URLs we created and must revoke. */
  owned: boolean;
}

export type Status = 'idle' | 'ready' | 'analyzing' | 'done' | 'error';

interface CaptureState {
  active: boolean;
  surface?: string;
  since?: number;
  frames: number;
  skipped: number;
}

interface SessionValue {
  frame: Frame | null;
  status: Status;
  stages: Partial<Record<StageId, StageUpdate>>;
  report: AnalysisReport | null;
  error: string;
  /** Local analysis failed and cloud fallback is allowed: the user may send this frame. */
  canOfferCloud: boolean;
  capture: CaptureState;
  canCapture: boolean;
  liveOcr: boolean;
  setLiveOcr: (v: boolean) => void;
  isSimulation: boolean;
  loadScenario: (id: string, opts?: { analyze?: boolean }) => void;
  loadBlob: (blob: Blob, source: InputSource, label: string) => void;
  startCapture: () => Promise<void>;
  stopCapture: (reason?: string) => void;
  analyzeNow: () => Promise<AnalysisReport | null>;
  analyzeWithCloud: () => Promise<void>;
  /** Stops any running analysis and capture. */
  stopAll: () => void;
  clear: () => void;
}

const Ctx = createContext<SessionValue | null>(null);

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}

const MAX_BYTES = 20 * 1024 * 1024;
export const canCaptureScreen = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

/** 16×9 grayscale fingerprint, used to skip frames that have not changed. */
function fingerprint(source: CanvasImageSource, w: number, h: number): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 9;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h, 0, 0, 16, 9);
  const d = ctx.getImageData(0, 0, 16, 9).data;
  const out = new Uint8ClampedArray(144);
  for (let i = 0; i < 144; i++) out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  return out;
}

function diff(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

async function thumbnail(url: string): Promise<string | undefined> {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    const scale = 240 / img.naturalWidth;
    c.width = 240;
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.6);
  } catch {
    return undefined;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const settings = useStore((s) => s.settings);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [stages, setStages] = useState<Partial<Record<StageId, StageUpdate>>>({});
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState('');
  const [canOfferCloud, setCanOfferCloud] = useState(false);
  const [liveOcr, setLiveOcr] = useState(false);
  const [capture, setCapture] = useState<CaptureState>({ active: false, frames: 0, skipped: 0 });

  const frameRef = useRef<Frame | null>(null);
  frameRef.current = frame;
  const abortRef = useRef<AbortController | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastPrint = useRef<Uint8ClampedArray | null>(null);
  const busy = useRef(false);
  const liveOcrRef = useRef(liveOcr);
  liveOcrRef.current = liveOcr;

  const setFrameSafely = useCallback((next: Frame | null) => {
    abortRef.current?.abort();
    const prev = frameRef.current;
    if (prev?.owned && prev.url !== next?.url) URL.revokeObjectURL(prev.url);
    frameRef.current = next;
    setFrame(next);
    setStatus(next ? 'ready' : 'idle');
    setReport(null);
    setStages({});
    setError('');
    setCanOfferCloud(false);
  }, []);

  const providerFor = useCallback((f: Frame): InferenceProvider<AnalyzeOptions> => {
    if (f.scenarioId && !liveOcrRef.current) return scenarioProvider;
    if (nativeHost()) return nativeProvider;
    return localProvider;
  }, []);

  const run = useCallback(
    async (provider: InferenceProvider<AnalyzeOptions>, f: Frame): Promise<AnalysisReport | null> => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      busy.current = true;
      setStatus('analyzing');
      setReport(null);
      setError('');
      setCanOfferCloud(false);
      setStages({});
      try {
        const s = getState().settings;
        const result = await provider.analyze(
          { imageUrl: f.url, source: f.source, scenarioId: f.scenarioId },
          (u) => !ctrl.signal.aborted && setStages((x) => ({ ...x, [u.id]: u })),
          { signal: ctrl.signal, exclude: (text) => excludedMatch(text, s.excludedApps) },
        );
        if (ctrl.signal.aborted) return null;
        setReport(result);
        setStatus('done');
        const thumb = s.storeScreenshots && !f.scenarioId ? await thumbnail(f.url) : undefined;
        const d = recordDetection(result, { source: f.source, scenarioId: f.scenarioId, thumbnail: thumb });
        log(
          'analysis',
          `${result.simulated ? 'Demo simulation' : 'Frame'} analyzed · ${result.analysis.category} · ${result.leftDevice ? 'sent to cloud fallback' : 'processed on this device'}${result.simulated ? '' : ` in ${result.elapsedMs} ms`}.`,
        );
        if (d && s.notifications && kindOf(result) === 'security' && f.source === 'live') {
          toast({ tone: 'risk', title: 'Potential risk on screen', body: result.analysis.headline });
        }
        return result;
      } catch (err) {
        if ((err as Error).name === 'AbortError' || ctrl.signal.aborted) return null;
        if (err instanceof ExcludedFrameError) {
          log('excluded', `Frame discarded: ${err.appName} is excluded. Nothing from it was analyzed or kept.`);
          setFrameSafely(null);
          toast({ tone: 'info', title: 'Excluded app on screen', body: `${err.appName} was visible, so the frame was discarded.` });
          return null;
        }
        if (err instanceof AnalysisError) console.warn('SafeScreen analysis stopped:', err.userMessage, err.cause);
        else console.error('SafeScreen analysis failed', err);
        setStages((x) => {
          const running = Object.values(x).find((y) => y?.status === 'running');
          return running ? { ...x, [running.id]: { ...running, status: 'error' } } : x;
        });
        const s = getState().settings;
        setCanOfferCloud(provider.id === 'local' && s.cloudFallback && !s.localOnly && cloudConfigured);
        setError(err instanceof AnalysisError ? err.userMessage : 'Screen analysis unavailable. Check capture permissions and try again.');
        setStatus('error');
        return null;
      } finally {
        busy.current = false;
      }
    },
    [setFrameSafely, toast],
  );

  const analyzeNow = useCallback(async () => {
    const f = frameRef.current;
    if (!f) return null;
    return run(providerFor(f), f);
  }, [run, providerFor]);

  const analyzeWithCloud = useCallback(async () => {
    const f = frameRef.current;
    if (!f) return;
    log('privacy', 'You approved sending one frame to the cloud fallback provider.');
    await run(cloudDemoProvider, f);
  }, [run]);

  const loadScenario = useCallback(
    (id: string, opts?: { analyze?: boolean }) => {
      const s = getScenario(id);
      if (!s) return;
      const f: Frame = { url: s.image, source: 'demo', scenarioId: s.id, owned: false, label: s.title };
      setFrameSafely(f);
      if (opts?.analyze) void run(liveOcrRef.current ? localProvider : scenarioProvider, f);
    },
    [setFrameSafely, run],
  );

  const loadBlob = useCallback(
    (blob: Blob, source: InputSource, label: string) => {
      if (!blob.type.startsWith('image/')) {
        toast({ tone: 'warn', title: 'Not an image', body: 'Choose a PNG, JPEG or WebP screenshot.' });
        return;
      }
      if (blob.size > MAX_BYTES) {
        toast({ tone: 'warn', title: 'Image too large', body: 'Capture a smaller region or compress the screenshot (20 MB limit).' });
        return;
      }
      setFrameSafely({ url: URL.createObjectURL(blob), source, owned: true, label });
    },
    [setFrameSafely, toast],
  );

  const stopCapture = useCallback((reason = 'Screen capture stopped.') => {
    const stream = streamRef.current;
    if (!stream) return;
    stream.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    videoRef.current = null;
    lastPrint.current = null;
    setCapture((c) => ({ ...c, active: false, surface: undefined, since: undefined }));
    log('capture', reason);
  }, []);

  /** Grabs the current frame from the live stream and analyzes it. */
  const grab = useCallback(
    async (manual: boolean) => {
      const video = videoRef.current;
      if (!video || busy.current || !video.videoWidth) return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      const print = fingerprint(video, w, h);
      if (!manual && lastPrint.current && diff(print, lastPrint.current) < 2) {
        setCapture((c) => ({ ...c, skipped: c.skipped + 1 }));
        return;
      }
      lastPrint.current = print;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
      if (!blob) return;
      const f: Frame = { url: URL.createObjectURL(blob), source: 'live', owned: true, label: `Live frame · ${w} × ${h}` };
      setFrameSafely(f);
      setCapture((c) => ({ ...c, frames: c.frames + 1 }));
      await run(providerFor(f), f);
    },
    [run, providerFor, setFrameSafely],
  );

  const startCapture = useCallback(async () => {
    const s = getState().settings;
    if (!s.monitoringAllowed) {
      toast({ tone: 'info', title: 'Screen monitoring is off', body: 'Turn on screen monitoring in the Privacy Center to capture your screen.' });
      return;
    }
    if (!canCaptureScreen) {
      toast({ tone: 'warn', title: 'Screen capture unavailable', body: 'This browser cannot capture the screen. Upload a screenshot or use a demo scenario.' });
      return;
    }
    if (streamRef.current) {
      await grab(true);
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
    } catch (err) {
      const name = (err as DOMException).name;
      toast({
        tone: name === 'NotAllowedError' ? 'info' : 'warn',
        title: name === 'NotAllowedError' ? 'Capture cancelled' : 'Screen analysis unavailable',
        body: name === 'NotAllowedError' ? 'Nothing was captured.' : 'Check capture permissions and try again.',
      });
      return;
    }
    const track = stream.getVideoTracks()[0];
    const label = track?.label ?? '';
    const excluded = excludedMatch(label, s.excludedApps);
    if (excluded) {
      stream.getTracks().forEach((t) => t.stop());
      log('excluded', `Capture refused: the selected source matches ${excluded}, which is excluded.`);
      toast({ tone: 'info', title: 'Excluded source', body: `${excluded} is excluded in Privacy settings, so capture was not started.` });
      return;
    }
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    try {
      await video.play();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      toast({ tone: 'warn', title: 'Screen analysis unavailable', body: 'The capture could not be read. Try again.' });
      return;
    }
    streamRef.current = stream;
    videoRef.current = video;
    const surface = (track.getSettings() as { displaySurface?: string }).displaySurface;
    const surfaceLabel = surface === 'monitor' ? 'Entire screen' : surface === 'window' ? 'Window' : surface === 'browser' ? 'Browser tab' : 'Screen';
    track.addEventListener('ended', () => stopCapture('Screen capture ended from the browser sharing control.'));
    setCapture({ active: true, surface: surfaceLabel, since: Date.now(), frames: 0, skipped: 0 });
    log('capture', `Screen capture started (${surfaceLabel.toLowerCase()}). Frames stay in memory on this device.`);
    await grab(true);
  }, [grab, stopCapture, toast]);

  // Automatic analysis while capturing, if enabled. Unchanged frames are skipped.
  useEffect(() => {
    if (!capture.active || !settings.autoAnalyzeSeconds) return;
    const t = window.setInterval(() => void grab(false), settings.autoAnalyzeSeconds * 1000);
    return () => window.clearInterval(t);
  }, [capture.active, settings.autoAnalyzeSeconds, grab]);

  // Turning monitoring off in Privacy stops an active capture immediately.
  useEffect(() => {
    if (!settings.monitoringAllowed && streamRef.current) stopCapture('Screen capture stopped because monitoring was turned off.');
  }, [settings.monitoringAllowed, stopCapture]);

  const stopAll = useCallback(() => {
    if (abortRef.current && busy.current) {
      abortRef.current.abort();
      busy.current = false;
      setStatus(frameRef.current ? 'ready' : 'idle');
      setStages({});
    }
    stopCapture();
  }, [stopCapture]);

  const clear = useCallback(() => setFrameSafely(null), [setFrameSafely]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (frameRef.current?.owned) URL.revokeObjectURL(frameRef.current.url);
    },
    [],
  );

  const value = useMemo<SessionValue>(
    () => ({
      frame,
      status,
      stages,
      report,
      error,
      canOfferCloud,
      capture,
      canCapture: canCaptureScreen,
      liveOcr,
      setLiveOcr,
      isSimulation: !!frame?.scenarioId && !liveOcr,
      loadScenario,
      loadBlob,
      startCapture,
      stopCapture,
      analyzeNow,
      analyzeWithCloud,
      stopAll,
      clear,
    }),
    [frame, status, stages, report, error, canOfferCloud, capture, liveOcr, loadScenario, loadBlob, startCapture, stopCapture, analyzeNow, analyzeWithCloud, stopAll, clear],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
