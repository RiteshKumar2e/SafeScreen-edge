import { errorAgent } from './agents/errorAgent';
import { generalAgent } from './agents/generalAgent';
import { riskAgent } from './agents/riskAgent';
import { uiAgent } from './agents/uiAgent';
import { buildContext, redact } from './context';
import { describeStructure } from './structure';
import type { Analysis, ScreenContext, ScreenStructure, UiElement } from './types';

export interface TextAnalysis {
  context: ScreenContext;
  analysis: Analysis;
  structure: ScreenStructure;
  redactedText: string;
  sensitiveKinds: string[];
}

function redactDeep<T>(value: T, fn: (s: string) => string): T {
  if (typeof value === 'string') return fn(value) as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, fn)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v, fn)])) as T;
  }
  return value;
}

/**
 * Runs the specialist agents over recognized screen text and returns the
 * highest-priority result. Pure and synchronous, so it behaves identically
 * whether the text came from live OCR or a prepared demo transcript.
 */
export function analyzeText(text: string, annotated: UiElement[] = []): TextAnalysis {
  const context = buildContext(text, annotated);
  const structure = describeStructure(context);
  const results = [errorAgent(context), riskAgent(context), uiAgent(context, structure)].filter((r) => r !== null);
  results.sort((a, b) => b.score - a.score);
  let analysis = results[0]?.analysis ?? generalAgent(context);

  const kinds = [...new Set(context.sensitive.map((s) => s.kind))];
  if (kinds.length > 0) {
    analysis = {
      ...analysis,
      detected: [
        ...analysis.detected,
        { text: `Sensitive content visible (${kinds.join(', ').toLowerCase()}). Masked in this view.`, source: 'Recognized text' },
      ],
    };
  }
  const mask = (s: string) => redact(s, context.sensitive);
  return {
    context,
    analysis: redactDeep(analysis, mask),
    structure: redactDeep(structure, mask),
    redactedText: mask(context.text),
    sensitiveKinds: kinds,
  };
}
