import type { AnalysisReport } from './types';

/**
 * Answers questions about the analyzed screen. This is a local intent router
 * over the analysis, not a language model: every answer is assembled from
 * what the agents found on this screen, and points at the regions it used.
 */

export interface Answer {
  intent: Intent;
  paragraphs: string[];
  bullets?: string[];
  command?: string;
  /** Region ids to highlight in the preview. */
  regions: string[];
}

export type Intent = 'problem' | 'explain' | 'click' | 'summarize' | 'warning' | 'fix' | 'privacy' | 'unknown';

export const SUGGESTED_QUESTIONS: { q: string; intent: Intent }[] = [
  { q: 'What is wrong here?', intent: 'problem' },
  { q: 'Explain this error.', intent: 'explain' },
  { q: 'What should I click?', intent: 'click' },
  { q: 'Summarize this page.', intent: 'summarize' },
  { q: 'Find the warning.', intent: 'warning' },
  { q: 'How can I fix this?', intent: 'fix' },
];

const INTENTS: [Intent, RegExp][] = [
  ['privacy', /\b(privacy|upload|cloud|sent|send|leave|where.*(data|screen)|stored?)\b/i],
  ['fix', /\b(fix|solve|resolve|repair|how (do|can) i|what (do|should) i do|next step)\b/i],
  ['click', /\b(click|press|tap|button|where (do|should) i|which (button|option))\b/i],
  ['warning', /\b(warn|warning|risk|danger|suspicious|safe|scam|phish|alert|find)\b/i],
  ['explain', /\b(explain|mean|meaning|why|what does|what is (this|that) (error|message))\b/i],
  ['summarize', /\b(summari[sz]e|summary|overview|what('?s| is) (on|this) (page|screen)|describe|tl;?dr)\b/i],
  ['problem', /\b(wrong|problem|issue|error|broken|fail|happen)\b/i],
];

export function classify(question: string): Intent {
  for (const [intent, re] of INTENTS) if (re.test(question)) return intent;
  return 'unknown';
}

export function answer(question: string, r: AnalysisReport): Answer {
  const a = r.analysis;
  const s = r.structure;
  const intent = classify(question);
  const byLabel = (...labels: string[]) => r.regions.filter((x) => labels.includes(x.label)).map((x) => x.id);
  const riskIds = r.regions.filter((x) => x.tone === 'risk').map((x) => x.id);
  const issueIds = r.regions.filter((x) => x.tone === 'issue' || x.tone === 'risk').map((x) => x.id);
  const isRisk = a.agent === 'Risk agent' && a.severity !== 'info';
  const fix = a.actions.find((x) => x.command);

  switch (intent) {
    case 'problem':
      if (a.severity === 'info' && a.agent !== 'UI agent')
        return { intent, paragraphs: [a.headline, 'Nothing on this screen matches the error or risk patterns SafeScreen checks for. That is not the same as verifying it is safe.'], regions: [] };
      return { intent, paragraphs: [a.headline, ...a.interpretation.slice(0, 1)], bullets: a.detected.slice(0, 3).map((d) => d.text), regions: issueIds };
    case 'explain':
      return {
        intent,
        paragraphs: [a.explanation],
        bullets: a.terms.slice(0, 3).map((t) => `${t.term}: ${t.meaning}`),
        regions: byLabel('ERROR MESSAGE', 'WARNING', 'EVIDENCE'),
      };
    case 'click': {
      if (isRisk)
        return {
          intent,
          paragraphs: [
            'I would hold off clicking anything on this screen until you have checked the signals below.',
            a.actions[0]?.text ?? 'Verify the page or prompt through a source you already trust.',
          ],
          bullets: a.detected.slice(0, 3).map((d) => d.text),
          regions: riskIds,
        };
      const actions = s.primaryActions.filter((x) => !/^(cancel|no)$/i.test(x));
      const issueAction = actions.find((x) => /update|retry|fix|renew|connect/i.test(x));
      if (!actions.length) return { intent, paragraphs: ['I could not find a labeled button in the text on this screen. Icon-only buttons are not detected without a vision model.'], regions: [] };
      return {
        intent,
        paragraphs: [
          issueAction
            ? `To deal with the message on screen, click "${issueAction}".`
            : `The main action on this screen is "${actions[0]}".`,
          ...(issueAction && actions[0] !== issueAction ? [`The page's main action is "${actions[0]}", which is unrelated to the message.`] : []),
        ],
        regions: byLabel('PRIMARY BUTTON', 'BUTTON'),
      };
    }
    case 'summarize':
      return {
        intent,
        paragraphs: [`${a.category}. ${a.headline}`],
        bullets: [
          ...(s.title ? [`Title: ${s.title}`] : []),
          ...(s.navigation.length ? [`Navigation: ${s.navigation.join(', ')}`] : []),
          ...(s.primaryActions.length ? [`Actions: ${s.primaryActions.slice(0, 4).join(', ')}`] : []),
          ...(s.fields.length ? [`Fields: ${s.fields.join(', ')}`] : []),
          ...(s.issues.length ? [`Needs attention: ${s.issues[0]}`] : []),
          `${r.uiElements.length} UI element${r.uiElements.length === 1 ? '' : 's'} and ${r.regions.length} region${r.regions.length === 1 ? '' : 's'} identified.`,
        ],
        regions: r.regions.map((x) => x.id),
      };
    case 'warning': {
      const ids = issueIds;
      if (!ids.length && !s.issues.length)
        return { intent, paragraphs: ['I did not find a warning or error message in the text on this screen.'], regions: [] };
      return {
        intent,
        paragraphs: [isRisk ? 'These are the signals that raised this warning:' : 'This is the message that needs attention:'],
        bullets: isRisk ? a.evidence.map((e) => `"${e.quote}" (${e.note})`) : s.issues.length ? s.issues.slice(0, 3) : a.evidence.map((e) => e.quote),
        regions: ids,
      };
    }
    case 'fix':
      return {
        intent,
        paragraphs: [isRisk ? 'This is not something to fix so much as something to verify first:' : 'Suggested steps, in order:'],
        bullets: a.actions.map((x) => x.text),
        command: fix?.command,
        regions: issueIds,
      };
    case 'privacy':
      return {
        intent,
        paragraphs: [
          r.leftDevice
            ? 'This analysis used cloud fallback, so the frame was sent to the configured external provider.'
            : `This analysis ran on this device (${r.providerId === 'scenario' ? 'demo simulation' : 'local OCR and agents'}). The frame was not uploaded.`,
          `During the analysis this page made ${r.network.requests} network request${r.network.requests === 1 ? '' : 's'}${r.network.external.length ? `, including to ${r.network.external.join(', ')}` : ', all to its own origin'}.`,
        ],
        regions: [],
      };
    default:
      return {
        intent,
        paragraphs: ['I answer questions about what is on this screen. Try one of these:'],
        bullets: SUGGESTED_QUESTIONS.map((x) => x.q),
        regions: [],
      };
  }
}
