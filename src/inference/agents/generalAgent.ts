import type { Analysis, ScreenContext } from '../types';
import { explainTerms } from './glossary';

/** Fallback when no specialist agent recognizes the screen. */
export function generalAgent(ctx: ScreenContext): Analysis {
  const words = ctx.text.split(/\s+/).filter(Boolean).length;
  if (words < 3) {
    return {
      category: 'Unreadable Capture',
      severity: 'info',
      headline: 'SafeScreen could not read enough text in this capture.',
      detected: [{ text: words === 0 ? 'No text was recognized.' : `Only ${words} word${words === 1 ? '' : 's'} recognized.`, source: 'Recognized text' }],
      interpretation: ['The image may be small, blurred, low contrast, or mostly graphics.'],
      actions: [
        { text: 'Capture a tighter region around the message, at normal zoom.' },
        { text: 'If the text is very small, zoom the page in before capturing.' },
      ],
      evidence: [],
      terms: [],
      explanation: 'SafeScreen reads screen text with on-device OCR. OCR works best on crisp, horizontal text at a readable size.',
      confidence: { level: 'Low', reason: 'Too little text to analyze.' },
      agent: 'General agent',
    };
  }
  const first = ctx.lines.find((l) => l.trim().length > 12)?.trim() ?? ctx.lines[0].trim();
  return {
    category: 'General Screen',
    severity: 'info',
    headline: 'No known error or risk pattern was recognized.',
    detected: [
      { text: `${ctx.lines.length} line${ctx.lines.length === 1 ? '' : 's'} of text recognized (${words} words).`, source: 'Recognized text' },
      ...ctx.uiElements.map((e) => ({ text: `${e.label} detected`, source: e.source })),
    ],
    interpretation: ['This screen does not match the error, login, warning, payment or command patterns SafeScreen checks for. That does not mean it has been verified as safe.'],
    actions: [
      { text: 'If you need help with a specific message, capture just that region and analyze again.' },
      { text: 'Review the recognized text below to confirm SafeScreen read the screen correctly.' },
    ],
    evidence: first ? [{ quote: first, note: 'First recognized line', line: ctx.lines.indexOf(ctx.lines.find((l) => l.trim() === first) ?? '') + 1 }] : [],
    terms: explainTerms(ctx.text),
    explanation: 'The specialist agents look for developer errors, credential requests, security prompts, payment requests and risky commands. When none of them match, SafeScreen shows what it read so you can decide what to do next.',
    confidence: { level: 'Low', reason: 'No specialist agent matched.' },
    agent: 'General agent',
  };
}
