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
    today: 'Tesseract 5 LSTM, integer-quantized weights (tessdata best_int), WebAssembly SIMD',
    todayBackend: 'CPU',
    todayStatus: 'Built',
    target: 'Text detection and recognition models, INT8, ONNX Runtime QNN execution provider',
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
  status: 'In this build' | 'Planned integration' | 'Adapter built';
  what: string;
}

export const TECH: TechItem[] = [
  {
    name: 'Local inference',
    status: 'In this build',
    what: 'OCR, context building and agents run on the device. The page is only allowed to connect to its own origin.',
  },
  {
    name: 'Optimized vision models',
    status: 'In this build',
    what: 'The OCR model ships with integer-quantized LSTM weights. A dedicated UI detector is planned.',
  },
  {
    name: 'Snapdragon NPU',
    status: 'Adapter built',
    what: 'The Windows host bridge and runtime probe are built. NPU execution arrives with the native host.',
  },
  {
    name: 'ONNX Runtime',
    status: 'Planned integration',
    what: 'The native host loads models with ONNX Runtime and selects the QNN execution provider when an NPU is present.',
  },
  {
    name: 'Windows AI / Windows ML',
    status: 'Planned integration',
    what: 'Windows ML as an alternative path to the NPU, managed by the OS, for devices where it is preferred.',
  },
  {
    name: 'Qualcomm AI Hub',
    status: 'Planned integration',
    what: 'Used to compile, quantize and profile the OCR and UI models for Snapdragon X Series before shipping.',
  },
];
