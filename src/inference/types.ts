// Shared types for the SafeScreen analysis pipeline.
//
// The pipeline is deliberately split so each stage can be swapped for a
// Snapdragon-accelerated implementation later:
//   capture -> preprocess -> OCR + vision -> context -> agents -> evidence -> explanation

export type Severity = 'info' | 'attention' | 'review';

export const STATUS_LABEL: Record<Severity, string> = {
  info: 'Informational',
  attention: 'Needs Attention',
  review: 'Review Required',
};

export type AgentName = 'Error agent' | 'Risk agent' | 'UI agent' | 'General agent';

/** Where an observation came from. Shown to the user so they can judge it. */
export type ObservationSource =
  | 'Recognized text'
  | 'Address bar text'
  | 'Inferred from text'
  | 'Simulated vision annotation';

/** OBSERVATION: something directly visible in the capture. */
export interface Observation {
  text: string;
  source: ObservationSource;
}

/** RECOMMENDATION: something the user may consider doing. */
export interface SuggestedAction {
  text: string;
  command?: string;
  caution?: string;
}

export interface Evidence {
  quote: string;
  note: string;
  line?: number;
}

export interface TermExplanation {
  term: string;
  meaning: string;
}

export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

export interface Analysis {
  category: string;
  severity: Severity;
  headline: string;
  detected: Observation[];
  /** INTERPRETATION: what this could mean. Never phrased as fact. */
  interpretation: string[];
  actions: SuggestedAction[];
  evidence: Evidence[];
  terms: TermExplanation[];
  /** Longer plain-language explanation for "Explain further". */
  explanation: string;
  location?: string;
  keyLines?: { line: number; text: string }[];
  confidence: { level: ConfidenceLevel; reason: string };
  agent: AgentName;
}

/** Rectangle in normalized image coordinates (0..1). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A UI element seen on screen, either inferred from text or annotated. */
export interface UiElement {
  kind: 'password-field' | 'text-field' | 'login-form' | 'button' | 'address-bar' | 'dialog' | 'terminal' | 'navigation';
  label: string;
  source: ObservationSource;
  /** Where the element is, when a detector reported a position. */
  box?: Box;
}

/** One line of recognized text and where OCR found it. */
export interface TextLine {
  text: string;
  box: Box;
  /** OCR confidence 0..100, when available. */
  confidence?: number;
}

export type RegionTone = 'risk' | 'issue' | 'action' | 'neutral';

/** A labeled area drawn over the screen preview. */
export interface Region {
  id: string;
  label: string;
  tone: RegionTone;
  box: Box;
  /** How the position was obtained. */
  source: 'OCR text position' | 'Simulated vision annotation' | 'Prepared text layout';
  /** Short description for screen readers and tooltips. */
  detail: string;
}

/** Layout-level understanding of the screen, derived from its text. */
export interface ScreenStructure {
  title?: string;
  navigation: string[];
  primaryActions: string[];
  issues: string[];
  fields: string[];
}

export interface ScreenContext {
  text: string;
  lines: string[];
  uiElements: UiElement[];
  urls: ParsedUrl[];
  sensitive: SensitiveMatch[];
}

export interface ParsedUrl {
  raw: string;
  protocol: 'http' | 'https' | 'none';
  host: string;
  registrableDomain: string;
  path: string;
}

export interface SensitiveMatch {
  kind: string;
  value: string;
}

export type StageId = 'preprocess' | 'ocr' | 'vision' | 'context' | 'agents' | 'evidence' | 'explain';

/** Compute backend a stage actually ran on. */
export type Backend = 'CPU · WebAssembly' | 'GPU · WebGPU' | 'CPU · JavaScript' | 'CPU · Canvas 2D' | 'Prepared data' | 'External service' | 'Native host';

export type StageStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';

export interface StageUpdate {
  id: StageId;
  status: StageStatus;
  detail?: string;
  progress?: number;
}

export type InputSource = 'capture' | 'upload' | 'paste' | 'demo' | 'live';

export interface ScreenInput {
  /** Object URL or same-origin URL of the image. */
  imageUrl: string;
  source: InputSource;
  /** Present when the image is a prepared demo scenario. */
  scenarioId?: string;
}

export interface AnalysisReport {
  analysis: Analysis;
  /** Text after sensitive values were redacted. */
  recognizedText: string;
  uiElements: UiElement[];
  sensitiveKinds: string[];
  providerId: ProviderId;
  /** True if any screen content was sent off this device. */
  leftDevice: boolean;
  simulated: boolean;
  /** Wall-clock time in this browser. Not a Snapdragon benchmark. */
  elapsedMs: number;
  /** Measured wall-clock time per stage, in ms. */
  timings: Partial<Record<StageId, number>>;
  /** Backend each stage ran on. */
  backends: Partial<Record<StageId, Backend>>;
  regions: Region[];
  structure: ScreenStructure;
  /** Resource requests this page made while the analysis ran. */
  network: { requests: number; external: string[] };
  /** Text recognition model that produced the text, with measured model times. Absent for demo data. */
  ocrEngine?: OcrEngineInfo;
}

export type OcrEngineId = 'aihub-easyocr' | 'tesseract';

export interface OcrEngineInfo {
  id: OcrEngineId;
  label: string;
  source: string;
  runtime: string;
  /** Measured model inference times on this device, in ms. */
  measured: { name: string; ms: number; runs: number }[];
}

export type ProviderId = 'local' | 'cloud-demo' | 'scenario' | 'native';

export interface ProviderAvailability {
  ok: boolean;
  reason?: string;
}

export interface InferenceProvider<O = { signal?: AbortSignal }> {
  id: ProviderId;
  label: string;
  description: string;
  availability(): ProviderAvailability;
  analyze(input: ScreenInput, onStage: (u: StageUpdate) => void, opts?: O): Promise<AnalysisReport>;
}

/** Error with a message that is safe to show to users. */
export class AnalysisError extends Error {
  constructor(
    public userMessage: string,
    public cause?: unknown,
  ) {
    super(userMessage);
    this.name = 'AnalysisError';
  }
}
