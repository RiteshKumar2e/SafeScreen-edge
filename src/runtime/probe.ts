import { connectNativeHost, type HostInfo } from './nativeBridge';

/**
 * Probes what this device and browser can actually do. Every value here is
 * read from an API at runtime; nothing is assumed from branding. When an API
 * is missing the result says "Not detected" rather than guessing.
 */

export type ProbeStatus = 'active' | 'available' | 'unavailable' | 'unknown';

export interface Probe {
  id: string;
  label: string;
  status: ProbeStatus;
  value: string;
  note?: string;
}

export interface RuntimeProbe {
  checkedAt: number;
  probes: Probe[];
  arch: string | null;
  platform: string | null;
  cores: number | null;
  gpuVendor: string | null;
  gpuArchitecture: string | null;
  webnnNpu: boolean | null;
  host: HostInfo | null;
  /** True only when the OS reports an Arm CPU and the GPU reports Qualcomm. */
  snapdragonLikely: boolean;
  /** The backend that runs OCR in this session. */
  activeBackend: 'npu' | 'gpu' | 'cpu';
  activeLabel: string;
}

// Smallest module using a v128 instruction; validates only with WASM SIMD.
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

interface UAData {
  platform?: string;
  getHighEntropyValues?(hints: string[]): Promise<{ architecture?: string; bitness?: string; platformVersion?: string; platform?: string }>;
}

interface GpuAdapterLike {
  info?: { vendor?: string; architecture?: string; description?: string };
  requestAdapterInfo?(): Promise<{ vendor?: string; architecture?: string }>;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

let cached: Promise<RuntimeProbe> | null = null;

export function probeRuntime(force = false): Promise<RuntimeProbe> {
  if (!cached || force) cached = run();
  return cached;
}

async function run(): Promise<RuntimeProbe> {
  const nav = navigator as unknown as { userAgentData?: UAData; hardwareConcurrency?: number; gpu?: { requestAdapter(o?: unknown): Promise<GpuAdapterLike | null> }; ml?: { createContext(o?: unknown): Promise<unknown> } };
  const probes: Probe[] = [];

  // CPU architecture and OS
  let arch: string | null = null;
  let platform: string | null = nav.userAgentData?.platform ?? null;
  const hev = nav.userAgentData?.getHighEntropyValues ? await withTimeout(nav.userAgentData.getHighEntropyValues(['architecture', 'bitness', 'platformVersion']), 800) : null;
  if (hev?.architecture) arch = `${hev.architecture}${hev.bitness ? hev.bitness : ''}`;
  if (hev?.platform) platform = hev.platform;
  probes.push({
    id: 'cpu',
    label: 'CPU architecture',
    status: arch ? 'available' : 'unknown',
    value: arch ? `${arch === 'arm64' ? 'Arm64' : arch === 'x8664' ? 'x86-64' : arch}${platform ? ` · ${platform}` : ''}` : 'Not reported by this browser',
    note: arch ? 'Reported by User-Agent Client Hints' : 'Client Hints are available in Chromium browsers such as Edge and Chrome.',
  });

  const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null;
  probes.push({ id: 'cores', label: 'Logical processors', status: cores ? 'available' : 'unknown', value: cores ? String(cores) : 'Not reported' });

  // WebAssembly
  const wasm = typeof WebAssembly === 'object';
  const simd = wasm && WebAssembly.validate(SIMD_PROBE);
  probes.push({
    id: 'wasm',
    label: 'WebAssembly',
    status: wasm ? 'active' : 'unavailable',
    value: wasm ? `Supported${simd ? ', SIMD128' : ', no SIMD'}` : 'Not supported',
    note: wasm ? 'Runs on-device OCR in this build.' : undefined,
  });

  // WebGPU
  let gpuVendor: string | null = null;
  let gpuArchitecture: string | null = null;
  if (nav.gpu) {
    const adapter = await withTimeout(nav.gpu.requestAdapter({ powerPreference: 'low-power' }), 1500);
    if (adapter) {
      const info = adapter.info ?? (adapter.requestAdapterInfo ? await withTimeout(adapter.requestAdapterInfo(), 800) : null);
      gpuVendor = info?.vendor || null;
      gpuArchitecture = info?.architecture || null;
    }
    probes.push({
      id: 'webgpu',
      label: 'WebGPU',
      status: adapter ? 'available' : 'unavailable',
      value: adapter ? `Adapter found${gpuVendor ? ` · ${gpuVendor}${gpuArchitecture ? ` ${gpuArchitecture}` : ''}` : ''}` : 'No adapter',
      note: 'Available for GPU inference. Not used by this build.',
    });
  } else {
    probes.push({ id: 'webgpu', label: 'WebGPU', status: 'unavailable', value: 'Not supported by this browser' });
  }

  // WebNN, which can reach the NPU through Windows ML on supported builds
  let webnnNpu: boolean | null = null;
  if (nav.ml?.createContext) {
    const ctx = await withTimeout(nav.ml.createContext({ deviceType: 'npu' }), 1500);
    webnnNpu = !!ctx;
    probes.push({
      id: 'webnn',
      label: 'WebNN · NPU context',
      status: ctx ? 'available' : 'unavailable',
      value: ctx ? 'NPU context created' : 'API present, NPU context not created',
      note: 'WebNN is experimental. A successful context shows the browser can target an NPU; it is not used by this build yet.',
    });
  } else {
    probes.push({ id: 'webnn', label: 'WebNN · NPU context', status: 'unavailable', value: 'WebNN not exposed by this browser', note: 'WebNN is behind a flag in most browsers.' });
  }

  // Native host
  const host = await connectNativeHost();
  probes.push({
    id: 'host',
    label: 'SafeScreen Windows host',
    status: host ? 'active' : 'unavailable',
    value: host ? `Connected · v${host.version} · ${host.activeProvider}` : 'Not connected (browser build)',
    note: host ? `Providers: ${host.executionProviders.join(', ')}` : 'The Windows host runs ONNX Runtime with the QNN execution provider for the Snapdragon NPU.',
  });

  const armWindows = !!arch && arch.startsWith('arm') && (platform ?? '').toLowerCase().includes('windows');
  const snapdragonLikely = armWindows && (gpuVendor ?? '').toLowerCase().includes('qualcomm');

  const hostNpu = host && /qnn/i.test(host.activeProvider);
  const activeBackend: RuntimeProbe['activeBackend'] = hostNpu ? 'npu' : host && /dml|directml|gpu/i.test(host.activeProvider) ? 'gpu' : 'cpu';
  const activeLabel = hostNpu ? 'Snapdragon NPU · QNN' : host ? host.activeProvider : 'CPU · WebAssembly';

  return { checkedAt: Date.now(), probes, arch, platform, cores, gpuVendor, gpuArchitecture, webnnNpu, host, snapdragonLikely, activeBackend, activeLabel };
}
