import type { Analysis, Evidence, ScreenContext, ScreenStructure } from '../types';
import { explainTerms } from './glossary';

/**
 * Explains application screens: where navigation is, what the main action is,
 * and which messages need attention. Runs when the screen looks like an app
 * UI (several navigation labels) rather than a terminal or a single dialog.
 */
export function uiAgent(ctx: ScreenContext, s: ScreenStructure): { score: number; analysis: Analysis } | null {
  if (s.navigation.length < 3) return null;
  const lineOf = (t: string) => ctx.lines.findIndex((l) => l.trim().replace(/\s+/g, ' ') === t) + 1;
  const evidence: Evidence[] = s.issues.slice(0, 3).map((i) => ({ quote: i, note: 'Message that needs attention', line: lineOf(i) || undefined }));
  const hasIssue = s.issues.length > 0;
  const action = s.primaryActions.find((a) => !/^(cancel|no)$/i.test(a));
  const issueAction = s.primaryActions.find((a) => /update|retry|fix|review|connect|renew/i.test(a));

  return {
    score: hasIssue ? 0.9 : 0.7,
    analysis: {
      category: 'Application Screen',
      severity: hasIssue ? 'attention' : 'info',
      headline: hasIssue
        ? `Screen understood. ${s.issues.length === 1 ? 'One message needs' : `${s.issues.length} messages need`} attention.`
        : 'Screen understood. No errors or warnings are visible.',
      detected: [
        { text: `Navigation: ${s.navigation.join(', ')}`, source: 'Inferred from text' },
        ...(action ? [{ text: `Primary action: ${action}`, source: 'Inferred from text' as const }] : []),
        ...s.issues.slice(0, 3).map((i) => ({ text: `Message: "${i}"`, source: 'Recognized text' as const })),
      ],
      interpretation: hasIssue
        ? [
            `This looks like ${s.title ? `the "${s.title}" view of ` : ''}an application with ${s.navigation.length} navigation sections.`,
            'The flagged message describes a problem the app is reporting. It usually needs to be resolved before related features work normally.',
          ]
        : [`This looks like ${s.title ? `the "${s.title}" view of ` : ''}an application with ${s.navigation.length} navigation sections.`],
      actions: [
        ...(hasIssue && issueAction ? [{ text: `To resolve the message, start with "${issueAction}".` }] : []),
        ...(hasIssue && !issueAction ? [{ text: 'Open the section named in the message to see details, or check the related settings page.' }] : []),
        ...(action && action !== issueAction ? [{ text: `The main action on this page is "${action}".` }] : []),
        { text: 'Ask SafeScreen "What should I click?" or "Find the warning" to highlight the relevant area.' },
      ],
      evidence,
      terms: explainTerms(ctx.text),
      explanation:
        'SafeScreen grouped the text on this screen into navigation, actions and messages. Navigation labels are short words such as Settings or Billing; actions start with verbs such as Create or Update; messages that mention failures, declines or required steps are flagged. Icon-only buttons are not detected in this build because there is no vision model yet.',
      confidence: {
        level: hasIssue ? 'Medium' : 'Low',
        reason: 'Structure is inferred from text labels, not from a vision model.',
      },
      agent: 'UI agent',
    },
  };
}
