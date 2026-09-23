import { useSyncExternalStore } from 'react';
import type { AnalysisReport, ConfidenceLevel, InputSource, OcrEngineId, ProviderId, Severity, StageId } from '../inference/types';

/**
 * App state that outlives a page: settings, local detection history, the
 * activity log and measured run times. Settings are always saved in this
 * browser. History, activity and run times are saved only while "Analysis
 * history" is on, and are pruned by the retention setting. Screenshots are
 * never saved unless "Store screenshots" is on, and then only as a small
 * thumbnail in this browser.
 */

export type Appearance = 'auto' | 'light' | 'dark' | 'system';
export type Retention = 'session' | '24h' | '7d' | '30d';

export interface ExcludedApp {
  id: string;
  name: string;
  /** Window titles or on-screen text that identify the app. Case-insensitive. */
  match: string[];
}

export interface Settings {
  appearance: Appearance;
  notifications: boolean;
  reducedMotion: boolean;
  localOnly: boolean;
  monitoringAllowed: boolean;
  cloudFallback: boolean;
  storeScreenshots: boolean;
  history: boolean;
  retention: Retention;
  excludedApps: ExcludedApp[];
  confidenceThreshold: ConfidenceLevel;
  autoAnalyzeSeconds: 0 | 10 | 30 | 60;
  showOverlay: boolean;
  /** Text recognition model used for live capture and uploads. */
  ocrEngine: OcrEngineId;
  /** Run the AI Hub model through WebGPU. Off by default; some GPU drivers hang. */
  gpuAcceleration: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  appearance: 'light',
  notifications: true,
  reducedMotion: false,
  localOnly: true,
  monitoringAllowed: true,
  cloudFallback: false,
  storeScreenshots: false,
  history: true,
  retention: '7d',
  excludedApps: [
    { id: 'pw', name: 'Password managers', match: ['1Password', 'Bitwarden', 'KeePass', 'LastPass', 'Dashlane'] },
    { id: 'bank', name: 'Banking applications', match: ['Online Banking', 'NetBanking', 'Mobile Banking'] },
    { id: 'private', name: 'Private browser windows', match: ['InPrivate', 'Incognito', 'Private Browsing'] },
  ],
  confidenceThreshold: 'Low',
  autoAnalyzeSeconds: 0,
  showOverlay: true,
  ocrEngine: 'aihub-easyocr',
  gpuAcceleration: false,
};

export type DetectionKind = 'issue' | 'security' | 'ui' | 'info';
export type UserAction = 'copied-fix' | 'reviewed' | 'dismissed' | 'asked';

export interface Detection {
  id: string;
  time: number;
  kind: DetectionKind;
  category: string;
  severity: Severity;
  headline: string;
  confidence: { level: ConfidenceLevel; reason: string };
  evidence: { quote: string; note: string }[];
  detected: string[];
  actions: { text: string; command?: string }[];
  providerId: ProviderId;
  simulated: boolean;
  leftDevice: boolean;
  source: InputSource;
  scenarioId?: string;
  elapsedMs: number;
  regions: number;
  userActions: UserAction[];
  thumbnail?: string;
}

export type ActivityKind = 'capture' | 'analysis' | 'excluded' | 'privacy' | 'action' | 'setting' | 'data';

export interface ActivityEvent {
  id: string;
  time: number;
  kind: ActivityKind;
  text: string;
}

/** One measured analysis run. Numbers only; no screen content. */
export interface RunMetric {
  time: number;
  providerId: ProviderId;
  backend: string;
  totalMs: number;
  stages: Partial<Record<StageId, number>>;
  width?: number;
  /** Text recognition model and its measured per-model inference times. */
  engine?: string;
  models?: { name: string; ms: number; runs: number }[];
}

interface State {
  settings: Settings;
  detections: Detection[];
  activity: ActivityEvent[];
  runs: RunMetric[];
}

const KEY = 'safescreen.v2';
const RETENTION_MS: Record<Retention, number> = { session: 0, '24h': 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5 };

function load(): State {
  const empty: State = { settings: DEFAULT_SETTINGS, detections: [], activity: [], runs: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    const saved = JSON.parse(raw) as Partial<State>;
    const settings = { ...DEFAULT_SETTINGS, ...saved.settings };
    const state: State = { settings, detections: saved.detections ?? [], activity: saved.activity ?? [], runs: saved.runs ?? [] };
    return prune(state);
  } catch {
    return empty;
  }
}

function prune(s: State): State {
  const { history, retention } = s.settings;
  if (!history) return { ...s, detections: [], activity: [], runs: [] };
  const max = RETENTION_MS[retention];
  if (!max) return s;
  const cutoff = Date.now() - max;
  return {
    ...s,
    detections: s.detections.filter((d) => d.time >= cutoff),
    activity: s.activity.filter((a) => a.time >= cutoff),
    runs: s.runs.filter((r) => r.time >= cutoff),
  };
}

let state: State = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    const { settings } = state;
    // "Session only" keeps history in memory for this tab and writes settings only.
    const keep = settings.history && settings.retention !== 'session';
    localStorage.setItem(KEY, JSON.stringify({ settings, detections: keep ? state.detections : [], activity: keep ? state.activity : [], runs: keep ? state.runs : [] }));
  } catch {
    /* storage unavailable or full; state stays in memory */
  }
}

function set(next: Partial<State>) {
  state = { ...state, ...next };
  persist();
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state), () => select(state));
}

export const getState = () => state;

const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

export function log(kind: ActivityKind, text: string) {
  const ev: ActivityEvent = { id: uid(), time: Date.now(), kind, text };
  // With history off, activity lives only in memory for this tab.
  set({ activity: [ev, ...state.activity].slice(0, 400) });
}

export function updateSettings(patch: Partial<Settings>, describe?: string) {
  let settings = { ...state.settings, ...patch };
  // Local-only mode always wins over cloud fallback.
  if (settings.localOnly) settings = { ...settings, cloudFallback: false };
  const historyTurnedOff = state.settings.history && !settings.history;
  state = { ...state, settings };
  if (historyTurnedOff) state = { ...state, detections: [], activity: [], runs: [] };
  else state = prune(state);
  set({});
  if (describe) log('setting', describe);
}

export function kindOf(r: AnalysisReport): DetectionKind {
  const a = r.analysis;
  if (a.agent === 'Risk agent' && a.severity !== 'info') return 'security';
  if (a.agent === 'Error agent') return 'issue';
  if (a.agent === 'UI agent') return a.severity === 'info' ? 'ui' : 'issue';
  return 'info';
}

const LEVEL_RANK: Record<ConfidenceLevel, number> = { Low: 1, Medium: 2, High: 3 };
export const meetsThreshold = (level: ConfidenceLevel, min: ConfidenceLevel) => LEVEL_RANK[level] >= LEVEL_RANK[min];

export function recordDetection(r: AnalysisReport, meta: { source: InputSource; scenarioId?: string; thumbnail?: string }): Detection | null {
  const a = r.analysis;
  const run: RunMetric = {
    time: Date.now(),
    providerId: r.providerId,
    backend: r.backends.ocr ?? 'Unknown',
    totalMs: r.elapsedMs,
    stages: r.timings,
    engine: r.ocrEngine?.label,
    models: r.ocrEngine?.measured,
  };
  const runs = r.providerId === 'scenario' ? state.runs : [run, ...state.runs].slice(0, 50);
  if (!meetsThreshold(a.confidence.level, state.settings.confidenceThreshold)) {
    set({ runs });
    log('analysis', `Analysis below the ${state.settings.confidenceThreshold} confidence threshold was not added to Detections (${a.category}).`);
    return null;
  }
  const d: Detection = {
    id: uid(),
    time: Date.now(),
    kind: kindOf(r),
    category: a.category,
    severity: a.severity,
    headline: a.headline,
    confidence: a.confidence,
    evidence: a.evidence.slice(0, 4).map((e) => ({ quote: e.quote, note: e.note })),
    detected: a.detected.map((d) => d.text),
    actions: a.actions.map((x) => ({ text: x.text, command: x.command })),
    providerId: r.providerId,
    simulated: r.simulated,
    leftDevice: r.leftDevice,
    source: meta.source,
    scenarioId: meta.scenarioId,
    elapsedMs: r.elapsedMs,
    regions: r.regions.length,
    userActions: [],
    thumbnail: state.settings.storeScreenshots ? meta.thumbnail : undefined,
  };
  set({ detections: [d, ...state.detections].slice(0, 200), runs });
  return d;
}

export function markDetection(id: string, action: UserAction) {
  set({
    detections: state.detections.map((d) => (d.id === id && !d.userActions.includes(action) ? { ...d, userActions: [...d.userActions, action] } : d)),
  });
}

export function clearHistory() {
  set({ detections: [], activity: [], runs: [] });
  log('data', 'Local history cleared: detections, activity and run times.');
}

export function resetAll() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem('safescreen.mode');
  } catch {
    /* ignore */
  }
  state = { settings: DEFAULT_SETTINGS, detections: [], activity: [], runs: [] };
  listeners.forEach((l) => l());
}

/** Bytes this app currently keeps in browser storage. */
export function storedBytes(): number {
  try {
    return (localStorage.getItem(KEY) ?? '').length * 2;
  } catch {
    return 0;
  }
}

export function excludedMatch(text: string, apps: ExcludedApp[]): string | null {
  const t = text.toLowerCase();
  for (const app of apps) {
    if (app.match.some((m) => m.trim() && t.includes(m.trim().toLowerCase()))) return app.name;
  }
  return null;
}
