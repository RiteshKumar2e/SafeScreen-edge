import type { TextLine, UiElement } from '../inference/types';

/**
 * Bridge to the SafeScreen Windows host.
 *
 * The web app is designed to run inside a WebView2 shell on Windows on
 * Snapdragon. That shell owns screen capture (Windows.Graphics.Capture) and
 * runs models through ONNX Runtime, choosing the QNN execution provider for
 * the Hexagon NPU when it is available. The page talks to it with
 * chrome.webview messages. The protocol is documented in docs/snapdragon.md.
 *
 * In a normal browser there is no host, every function here reports that
 * honestly, and the app uses its in-browser providers instead.
 */

export interface HostInfo {
  version: string;
  /** Execution providers ONNX Runtime reports as available, e.g. ["QNNExecutionProvider", "CPUExecutionProvider"]. */
  executionProviders: string[];
  /** Provider the host will use for vision and OCR models. */
  activeProvider: string;
  device: { processor?: string; npu?: string; os?: string };
  models: { name: string; precision: string; provider: string }[];
}

export interface HostAnalysis {
  text: string;
  lines: TextLine[];
  uiElements: UiElement[];
  executionProvider: string;
  ocrModel: string;
  /** Per-stage times measured inside the host, in ms. */
  timings: Record<string, number>;
}

interface WebView {
  postMessage(msg: unknown): void;
  addEventListener(type: 'message', fn: (e: { data: unknown }) => void): void;
  removeEventListener(type: 'message', fn: (e: { data: unknown }) => void): void;
}

function webview(): WebView | null {
  const w = (window as unknown as { chrome?: { webview?: WebView } }).chrome?.webview;
  return w ?? null;
}

let info: HostInfo | null = null;
let probed: Promise<HostInfo | null> | null = null;

function request<T>(type: string, payload: Record<string, unknown>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  const wv = webview();
  if (!wv) return Promise.reject(new Error('No WebView2 host'));
  const id = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    const done = () => {
      wv.removeEventListener('message', onMsg);
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const onMsg = (e: { data: unknown }) => {
      const d = e.data as { id?: string; ok?: boolean; result?: T; error?: string };
      if (d?.id !== id) return;
      done();
      if (d.ok) resolve(d.result as T);
      else reject(new Error(d.error ?? 'Host error'));
    };
    const onAbort = () => {
      done();
      reject(new DOMException('Analysis cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error('Host did not respond'));
    }, timeoutMs);
    wv.addEventListener('message', onMsg);
    signal?.addEventListener('abort', onAbort);
    wv.postMessage({ id, type, ...payload });
  });
}

/** Asks the host to identify itself. Resolves to null in a normal browser. */
export function connectNativeHost(): Promise<HostInfo | null> {
  if (!probed) {
    probed = webview()
      ? request<HostInfo>('safescreen.describe', {}, 1500)
          .then((i) => (info = i))
          .catch(() => null)
      : Promise.resolve(null);
  }
  return probed;
}

/** The connected host, if the handshake succeeded. */
export function nativeHost() {
  if (!info) return null;
  return {
    info,
    async analyze(frame: Blob, signal?: AbortSignal): Promise<HostAnalysis> {
      const bytes = new Uint8Array(await frame.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return request<HostAnalysis>('safescreen.analyze', { image: btoa(bin), mime: frame.type }, 30000, signal);
    },
  };
}
