/**
 * Where each pipeline stage runs today, and where it is designed to run on a
 * Snapdragon X Series PC. "Built" means it runs in this build; "Planned" means
 * the adapter or interface exists but the hardware path has not shipped.
 * Shared by the AI Runtime page and the Technology page so they never disagree.
 */

export type Status = 'Built' | 'Planned' | 'Simulated in demos';

export interface PlanRow {
  stage: string;
  today: string;
  todayBackend: string;
  todayStatus: Status;
  target: string;
  targetBackend: 'NPU' | 'GPU' | 'CPU' | 'OS';
}

export const EXECUTION_PLAN: PlanRow[] = [
  {
    stage: 'Screen capture',
    today: 'Screen Capture API (getDisplayMedia), user-selected source',
    todayBackend: 'Browser',
    todayStatus: 'Built',
    target: 'Windows.Graphics.Capture in the SafeScreen host, per-window exclusion by handle',
    targetBackend: 'OS',
  },
  {
    stage: 'Frame preprocessing',
    today: 'Canvas 2D scaling, dark-theme inversion, 16×9 change fingerprint',
    todayBackend: 'CPU',
    todayStatus: 'Built',
    target: 'GPU resize and normalize before model input',
    targetBackend: 'GPU',
  },
  {
    stage: 'Text recognition (OCR)',
    today: 'EasyOCR from Qualcomm AI Hub (CRAFT detector + CRNN recognizer, w8a8 INT8) in ONNX Runtime Web; Tesseract LSTM as an option',
    todayBackend: 'CPU',
    todayStatus: 'Built',
    target: 'The same Qualcomm AI Hub EasyOCR models on ONNX Runtime with the QNN execution provider',
    targetBackend: 'NPU',
  },
  {
    stage: 'UI element detection',
    today: 'Inferred from text labels; demo scenarios use annotated positions',
    todayBackend: 'CPU',
    todayStatus: 'Simulated in demos',
    target: 'Quantized UI element detector (fields, buttons, dialogs, icons)',
    targetBackend: 'NPU',
  },
  {
    stage: 'Local reasoning',
    today: 'Error, risk and UI agents with quoted evidence; local question answering',
    todayBackend: 'CPU',
    todayStatus: 'Built',
    target: 'Same agents, plus an optional small on-device language model for phrasing',
    targetBackend: 'NPU',
  },
  {
    stage: 'Response and overlay',
    today: 'Insight panel, labeled regions, local history',
    todayBackend: 'CPU',
    todayStatus: 'Built',
    target: 'Unchanged',
    targetBackend: 'CPU',
  },
];

export interface TechItem {
  name: string;
  what: string;
}

/** Working in this build. */
export const TECH_BUILT: TechItem[] = [
  {
    name: 'Qualcomm AI Hub model',
    what: 'EasyOCR from Qualcomm AI Hub (w8a8 export, CRAFT text detector and CRNN recognizer) runs in this build through ONNX Runtime Web, with INT8 weights served from this site.',
  },
  {
    name: 'Local inference',
    what: 'Text recognition, context building and agents run on the device. The page is only allowed to connect to its own origin.',
  },
  {
    name: 'SafeScreen Windows host',
    what: 'A local host app runs the same AI Hub models natively with ONNX Runtime, choosing the QNN execution provider for the NPU. The app reports NPU use only when the host confirms it.',
  },
];

/** Next steps on Snapdragon hardware. */
export const TECH_ROADMAP: TechItem[] = [
  {
    name: 'NPU validation with QNN',
    what: 'Run the host with onnxruntime-qnn on a Snapdragon HP PC, confirm every operator runs on the Hexagon NPU, and publish measured latency and power.',
  },
  {
    name: 'Windows ML',
    what: 'An OS-managed path to the NPU, for devices where it is preferred.',
  },
  {
    name: 'UI detector from Qualcomm AI Hub',
    what: 'Add a quantized UI element detector (fields, buttons, dialogs) alongside EasyOCR, compiled and profiled with AI Hub.',
  },
];
