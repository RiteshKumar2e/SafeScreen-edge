// Dev check: runs the agents on each demo transcript plus a few extra cases.
import { analyzeText } from '../src/inference/analyze';
import { labelRegions, layoutLines } from '../src/inference/structure';
import { answer, SUGGESTED_QUESTIONS } from '../src/inference/assistant';
import { SCENARIOS } from '../src/demo/scenarios';

const extra: Record<string, string> = {
  'node-missing': "Error: Cannot find module 'express'\nRequire stack:\n- /home/u/app/server.js",
  'port': 'Error: listen EADDRINUSE: address already in use :::3000',
  'curl-pipe': 'To fix your install, run:\ncurl -fsSL https://get.example-tools.sh/install | sudo bash',
  'giftcard': 'Amount due: $500\nPay with Google Play gift cards within 24 hours to avoid account closure',
  'secrets': 'OPENAI_KEY=sk-abcdefghijklmnopqrstuvwx1234\ncontact: jane.doe@example.com\nTypeError: x is undefined',
  'legit-login': 'https://login.microsoftonline.com/common/oauth2\nMicrosoft\nSign in\nEmail or phone\nPassword',
  'blank': '',
  'prose': 'Quarterly planning meeting notes\nDiscussed roadmap and hiring for the next two quarters.',
};

const verbose = process.argv.includes('-v');
const cases = [...SCENARIOS.map((s) => [s.id, s.transcript, s.uiElements, s] as const), ...Object.entries(extra).map(([k, v]) => [k, v, [], null] as const)];
for (const [id, text, ui, s] of cases) {
  const r = analyzeText(text, [...ui]);
  const a = r.analysis;
  console.log(`\n=== ${id} → ${a.category} [${a.severity}] (${a.agent}, ${a.confidence.level})`);
  console.log('  headline:', a.headline);
  a.detected.forEach((d) => console.log('  • det:', d.text, `(${d.source})`));
  if (verbose) a.interpretation.forEach((d) => console.log('  • int:', d));
  a.actions.forEach((d) => console.log('  • act:', d.text, d.command ? `[${d.command}]` : ''));
  a.evidence.forEach((e) => console.log(`  • ev L${e.line}:`, e.quote, '—', e.note));
  console.log('  structure:', JSON.stringify(r.structure));
  if (s) {
    const regions = labelRegions(layoutLines(s.transcript, s.layout, s.width, s.height), r.context, a, r.structure, 'Prepared text layout');
    console.log('  regions:', regions.map((x) => `${x.label}/${x.tone}`).join(', '));
    const bad = regions.filter((x) => [x.box.x, x.box.y, x.box.w, x.box.h].some((v) => !Number.isFinite(v) || v < 0 || v > 1.001));
    if (bad.length) console.log('  !! out-of-range regions', bad);
    if (verbose) {
      const rep = { analysis: a, structure: r.structure, regions, uiElements: r.context.uiElements, leftDevice: false, providerId: 'scenario', network: { requests: 0, external: [] } } as never;
      for (const q of SUGGESTED_QUESTIONS) console.log(`  Q ${q.q} →`, JSON.stringify(answer(q.q, rep)).slice(0, 220));
    }
  }
}
