import { analyzeText } from '../inference/analyze';
import { labelRegions, layoutLines } from '../inference/structure';
import type { AnalysisReport } from '../inference/types';
import { getScenario } from './scenarios';

const cache = new Map<string, AnalysisReport>();

/**
 * Real agent output for a demo scenario, computed synchronously from its
 * prepared transcript. Used for static product previews on marketing pages.
 */
export function scenarioReport(id: string): AnalysisReport {
  const hit = cache.get(id);
  if (hit) return hit;
  const s = getScenario(id);
  if (!s) throw new Error(`Unknown scenario ${id}`);
  const r = analyzeText(s.transcript, s.uiElements);
  const lines = layoutLines(s.transcript, s.layout, s.width, s.height);
  const report: AnalysisReport = {
    analysis: r.analysis,
    recognizedText: r.redactedText,
    uiElements: r.context.uiElements,
    sensitiveKinds: r.sensitiveKinds,
    providerId: 'scenario',
    leftDevice: false,
    simulated: true,
    elapsedMs: 0,
    timings: {},
    backends: {},
    regions: labelRegions(lines, r.context, r.analysis, r.structure, 'Prepared text layout'),
    structure: r.structure,
    network: { requests: 0, external: [] },
  };
  cache.set(id, report);
  return report;
}
