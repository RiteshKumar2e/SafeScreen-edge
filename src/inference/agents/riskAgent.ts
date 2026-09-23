import type { Analysis, Evidence, Observation, ParsedUrl, ScreenContext, Severity, SuggestedAction } from '../types';
import { explainTerms } from './glossary';

interface Signal {
  observation: Observation;
  evidence?: Evidence;
  /** Contributes to "Review Required" rather than only being context. */
  risk: boolean;
}

// Official domains SafeScreen knows for commonly impersonated services.
// This list is intentionally small; a miss means "not on the list", never
// "malicious".
const BRANDS: { name: string; re: RegExp; domains: string[] }[] = [
  { name: 'Microsoft', re: /\b(microsoft|outlook|office ?365|onedrive)\b/i, domains: ['microsoft.com', 'live.com', 'microsoftonline.com', 'office.com', 'outlook.com', 'onedrive.com'] },
  { name: 'Google', re: /\b(google|gmail)\b/i, domains: ['google.com', 'gmail.com', 'youtube.com'] },
  { name: 'Apple', re: /\b(apple ?id|icloud|apple)\b/i, domains: ['apple.com', 'icloud.com'] },
  { name: 'PayPal', re: /\bpaypal\b/i, domains: ['paypal.com'] },
  { name: 'Amazon', re: /\bamazon\b/i, domains: ['amazon.com', 'amazon.in', 'amazon.co.uk', 'amazon.de'] },
  { name: 'GitHub', re: /\bgithub\b/i, domains: ['github.com'] },
  { name: 'Netflix', re: /\bnetflix\b/i, domains: ['netflix.com'] },
  { name: 'Facebook', re: /\b(facebook|meta)\b/i, domains: ['facebook.com', 'meta.com'] },
  { name: 'LinkedIn', re: /\blinkedin\b/i, domains: ['linkedin.com'] },
  { name: 'Dropbox', re: /\bdropbox\b/i, domains: ['dropbox.com'] },
];

const URGENCY_RE = /\b(urgent(ly)?|immediately|within \d+ hours?|suspended|will be (locked|closed|deleted)|unusual (sign-?in )?activity|verify your (account|identity)|account (is )?(on hold|locked|limited)|expires? today|final notice)\b/i;
const EXTRA_DATA_RE = /\b(social security|SSN|card number|CVV|security code|date of birth|mother'?s maiden|one-time (pass)?code|OTP|recovery code|bank account number)\b/i;

function quoteLine(ctx: ScreenContext, re: RegExp, note: string): Evidence | undefined {
  const i = ctx.lines.findIndex((l) => re.test(l));
  return i >= 0 ? { quote: ctx.lines[i].trim(), note, line: i + 1 } : undefined;
}

function lookalikeNormalize(s: string): string {
  return s.toLowerCase().replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/0/g, 'o').replace(/[1|]/g, 'l').replace(/-/g, '');
}

function brandsMentioned(ctx: ScreenContext, url?: ParsedUrl) {
  // Ignore the URL itself so "microsoft" in a hostname doesn't count as page content.
  const body = url ? ctx.text.split(url.raw).join(' ') : ctx.text;
  return BRANDS.filter((b) => b.re.test(body));
}

function urlSignals(ctx: ScreenContext, url: ParsedUrl): Signal[] {
  const signals: Signal[] = [];
  const ev = (note: string): Evidence => quoteLine(ctx, new RegExp(url.host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), note) ?? { quote: url.raw, note };

  for (const brand of brandsMentioned(ctx, url)) {
    if (brand.domains.includes(url.registrableDomain)) continue;
    signals.push({
      observation: { text: `Page mentions ${brand.name}, but the domain is ${url.registrableDomain}, which is not on SafeScreen's list of ${brand.name} domains.`, source: 'Address bar text' },
      evidence: ev('Domain differs from the organization named on the page'),
      risk: true,
    });
  }

  const sub = url.host.slice(0, Math.max(0, url.host.length - url.registrableDomain.length - 1));
  const brandInSub = BRANDS.find((b) => b.re.test(sub.replace(/[.-]/g, ' ')) && !b.domains.includes(url.registrableDomain));
  if (brandInSub) {
    signals.push({
      observation: { text: `"${brandInSub.name}" appears in the subdomain (${sub}), not in the registered domain.`, source: 'Address bar text' },
      evidence: ev('Unusual URL structure'),
      risk: true,
    });
  }

  const regLabel = url.registrableDomain.split('.')[0];
  const lookalike = BRANDS.find(
    (b) => !b.domains.includes(url.registrableDomain) && lookalikeNormalize(regLabel).includes(b.name.toLowerCase()) && !regLabel.includes(b.name.toLowerCase()),
  );
  if (lookalike) {
    signals.push({
      observation: { text: `The domain "${url.registrableDomain}" resembles ${lookalike.name} when similar-looking characters are swapped.`, source: 'Address bar text' },
      evidence: ev('Possible look-alike domain'),
      risk: true,
    });
  }

  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(url.host)) {
    signals.push({ observation: { text: 'The address is a raw IP number rather than a named domain.', source: 'Address bar text' }, evidence: ev('Unusual URL structure'), risk: true });
  }
  if (url.host.includes('xn--')) {
    signals.push({ observation: { text: 'The domain uses encoded international characters (punycode), which can imitate familiar names.', source: 'Address bar text' }, evidence: ev('Encoded domain'), risk: true });
  }
  if (url.host.split('.').length >= 4 || (regLabel.match(/-/g)?.length ?? 0) >= 2) {
    signals.push({ observation: { text: `Unusual URL structure: ${url.host}`, source: 'Address bar text' }, evidence: ev('Long or heavily hyphenated hostname'), risk: true });
  }
  if (url.protocol === 'http') {
    signals.push({ observation: { text: 'The page address starts with http://, so the connection is not encrypted.', source: 'Address bar text' }, evidence: ev('No HTTPS'), risk: true });
  }
  return signals;
}

function build(
  partial: Pick<Analysis, 'category' | 'severity' | 'headline' | 'interpretation' | 'actions' | 'explanation'>,
  signals: Signal[],
  ctx: ScreenContext,
  confidence: Analysis['confidence'],
): Analysis {
  // One evidence entry per quoted line; several signals on the same line
  // (common for URLs) are listed together in its note.
  const evidence: Evidence[] = [];
  for (const s of signals) {
    if (!s.evidence) continue;
    const same = evidence.find((e) => e.quote === s.evidence!.quote);
    if (!same) evidence.push({ ...s.evidence });
    else if (!same.note.includes(s.evidence.note)) same.note += `; ${s.evidence.note[0].toLowerCase()}${s.evidence.note.slice(1)}`;
  }
  return {
    ...partial,
    detected: signals.map((s) => s.observation),
    evidence,
    terms: explainTerms(ctx.text),
    confidence,
    agent: 'Risk agent',
  };
}

function loginDetector(ctx: ScreenContext): Analysis | null {
  const hasPassword = ctx.uiElements.some((e) => e.kind === 'password-field');
  const hasForm = ctx.uiElements.some((e) => e.kind === 'login-form');
  if (!hasPassword && !hasForm) return null;

  const signals: Signal[] = [];
  for (const el of ctx.uiElements.filter((e) => e.kind === 'login-form' || e.kind === 'password-field')) {
    signals.push({ observation: { text: `${el.label} detected`, source: el.source }, evidence: el.kind === 'password-field' ? quoteLine(ctx, /password/i, 'Request for credentials') : undefined, risk: false });
  }
  const url = ctx.urls[0];
  if (url) signals.push(...urlSignals(ctx, url));
  if (URGENCY_RE.test(ctx.text)) {
    signals.push({ observation: { text: 'Urgent or pressuring wording is present.', source: 'Recognized text' }, evidence: quoteLine(ctx, URGENCY_RE, 'Pressure to act quickly'), risk: true });
  }
  if (EXTRA_DATA_RE.test(ctx.text)) {
    signals.push({ observation: { text: 'The page asks for additional sensitive details beyond a password.', source: 'Recognized text' }, evidence: quoteLine(ctx, EXTRA_DATA_RE, 'Additional sensitive data requested'), risk: true });
  }

  const riskCount = signals.filter((s) => s.risk).length;
  const verifyAction: SuggestedAction = { text: 'Verify the domain through an independent source before entering your password.' };
  const common: SuggestedAction[] = [
    { text: 'Open the service by typing its address yourself or using a saved bookmark, instead of following a link.' },
    { text: 'If you already entered a password here, change it on the official site and turn on two-step verification.' },
  ];

  if (riskCount > 0) {
    return build(
      {
        category: 'Potentially Suspicious Login',
        severity: 'review',
        headline: 'Potentially suspicious. Verify the domain before entering credentials.',
        interpretation: [
          'The page may be attempting to collect credentials.',
          'These signals are consistent with phishing, but a legitimate page can show some of them too. SafeScreen cannot confirm who operates this site from the screen alone.',
        ],
        actions: [verifyAction, ...common],
        explanation:
          'Credential phishing pages usually copy the look of a real sign-in page, so appearance alone says little. The most reliable signal is the domain: the part of the address just before the first single slash, such as microsoft.com. SafeScreen compares what it can read in the address bar with the organization named on the page, and flags structure that is often used to disguise a domain. None of this proves the page is malicious. It means the page deserves a check before you type a password.',
      },
      signals,
      ctx,
      riskCount >= 2
        ? { level: 'Medium', reason: `${riskCount} independent risk signals are visible. Visual analysis cannot confirm who operates the site.` }
        : { level: 'Low', reason: 'One risk signal is visible. Visual analysis cannot confirm who operates the site.' },
    );
  }

  return build(
    {
      category: 'Login Screen',
      severity: url ? 'info' : 'attention',
      headline: url ? 'Login screen detected. No risk signals were found in the visible text.' : 'Login screen detected, but the address bar is not visible.',
      interpretation: url
        ? ['The visible domain did not match any of SafeScreen\'s risk signals. This is not a guarantee the page is legitimate.']
        : ['Without the page address, SafeScreen cannot compare the domain with the organization shown.'],
      actions: url ? [{ text: `Confirm that ${url.registrableDomain} is the site you meant to visit.` }, ...common.slice(0, 1)] : [{ text: 'Capture the full browser window, including the address bar, and analyze again.' }, verifyAction],
      explanation: 'Sign-in pages are where credentials are most often stolen, so SafeScreen always checks them. A clean result only means none of the known signals were visible in this capture.',
    },
    signals,
    ctx,
    { level: 'Low', reason: 'Absence of risk signals is weak evidence on its own.' },
  );
}

function securityWarningDetector(ctx: ScreenContext): Analysis | null {
  const t = ctx.text;
  // Dialog text wraps across lines; match phrases on whitespace-collapsed text.
  const flat = t.replace(/\s+/g, ' ');
  const field = (re: RegExp) => t.match(re)?.[1]?.trim();

  if (/User Account Control|allow this app.{0,40}make changes to your (device|PC)/i.test(flat)) {
    const program = field(/Program name:\s*(.+)/i);
    const publisher = field(/(?:Verified )?publisher:\s*(.+)/i);
    const origin = field(/File origin:\s*(.+)/i);
    const unknown = /unknown publisher|publisher:\s*unknown/i.test(flat);
    const signals: Signal[] = [
      { observation: { text: 'An application is requesting elevated permissions.', source: 'Recognized text' }, evidence: quoteLine(ctx, /make changes to your/i, 'Elevation request'), risk: false },
    ];
    if (program) signals.push({ observation: { text: `Program name: ${program}`, source: 'Recognized text' }, evidence: quoteLine(ctx, /Program name:/i, 'Program requesting access'), risk: false });
    if (publisher) signals.push({ observation: { text: `Publisher: ${publisher}`, source: 'Recognized text' }, evidence: quoteLine(ctx, /publisher:/i, unknown ? 'No verified publisher' : 'Publisher shown by Windows'), risk: unknown });
    else if (unknown) signals.push({ observation: { text: 'The publisher is unknown.', source: 'Recognized text' }, evidence: quoteLine(ctx, /unknown publisher/i, 'No verified publisher'), risk: true });
    if (origin) signals.push({ observation: { text: `File origin: ${origin}`, source: 'Recognized text' }, evidence: quoteLine(ctx, /File origin:/i, 'Where the file came from'), risk: /internet|download/i.test(origin) && unknown });

    return build(
      {
        category: 'Security Warning',
        severity: unknown ? 'review' : 'attention',
        headline: unknown ? 'An unsigned application is asking for administrator access.' : 'An application is asking for administrator access.',
        interpretation: [
          'Administrative permissions can allow an application to make system-level changes.',
          ...(unknown ? ['Because the publisher is unknown, this dialog cannot tell you who made the program. That is common for small or older tools, and also for malicious ones.'] : []),
        ],
        actions: [
          { text: 'Only continue if you recognize the application and expected this request.' },
          { text: 'If you did not just start an installation or a tool that needs admin rights, choose No.' },
          ...(unknown ? [{ text: 'If unsure, get the program again from its official website and check it with your installed security software.' }] : []),
        ],
        explanation:
          'Windows shows this prompt before a program gets administrator rights. With those rights it can install drivers, change system settings and read or modify other users\' files. The prompt itself is legitimate Windows behavior; the question is whether you trust the program that triggered it. A verified publisher means the file is signed and unmodified since signing. An unknown publisher means there is no such proof.',
      },
      signals,
      ctx,
      { level: 'High', reason: 'The dialog text matches the standard Windows elevation prompt.' },
    );
  }

  if (/Windows protected your PC|unrecognized app/i.test(t)) {
    return build(
      {
        category: 'Security Warning',
        severity: 'review',
        headline: 'Windows blocked an unrecognized app from starting.',
        interpretation: ['Microsoft Defender SmartScreen has little or no reputation data for this file. That does not mean it is harmful, only that it is uncommon or new.'],
        actions: [
          { text: 'Only choose "Run anyway" if you downloaded the file from a source you trust and expected it.' },
          { text: 'Otherwise, choose "Don\'t run" and delete the file.' },
        ],
        explanation: 'SmartScreen compares downloaded programs against reputation data. New or rarely downloaded programs trigger this screen even when they are safe, and malicious programs often trigger it too.',
      },
      [{ observation: { text: 'SmartScreen warning about an unrecognized app.', source: 'Recognized text' }, evidence: quoteLine(ctx, /Windows protected your PC|unrecognized app/i, 'SmartScreen warning'), risk: true }],
      ctx,
      { level: 'High', reason: 'The warning text matches the standard SmartScreen screen.' },
    );
  }

  if (/Your connection is not private|NET::ERR_CERT|Warning: Potential Security Risk/i.test(t)) {
    return build(
      {
        category: 'Security Warning',
        severity: 'review',
        headline: 'The browser could not verify this site\'s identity.',
        interpretation: ['The site\'s certificate is invalid, expired, or does not match the address. The connection may be intercepted, or the site may be misconfigured.'],
        actions: [
          { text: 'Do not enter passwords or payment details on this page.' },
          { text: 'Go back, and try again later or from a different network.' },
        ],
        explanation: 'Browsers check a certificate to confirm they are talking to the real site. When that check fails, anything you send could be read by whoever answers instead.',
      },
      [{ observation: { text: 'Browser certificate warning.', source: 'Recognized text' }, evidence: quoteLine(ctx, /not private|NET::ERR_CERT|Potential Security Risk/i, 'Certificate error'), risk: true }],
      ctx,
      { level: 'High', reason: 'The warning text matches a standard browser certificate error.' },
    );
  }

  if (/(call|contact) .{0,40}(support|helpline|technician)/i.test(t) && /(infected|virus|compromised|hacked|blocked)/i.test(t) && /\b\+?1?[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}\b/.test(t)) {
    return build(
      {
        category: 'Potentially Misleading Warning',
        severity: 'review',
        headline: 'A warning asks you to call a phone number for support.',
        interpretation: ['Genuine operating system and antivirus warnings rarely ask you to phone a number. This pattern is common in tech-support scams.'],
        actions: [
          { text: 'Do not call the number or allow remote access to your computer.' },
          { text: 'Close the browser tab. If it will not close, end the browser from Task Manager.' },
        ],
        explanation: 'Scam pages imitate system alerts and use full-screen or looping dialogs to create panic. Closing the browser is enough to dismiss them in most cases.',
      },
      [
        { observation: { text: 'Warning text claims the device is infected or blocked.', source: 'Recognized text' }, evidence: quoteLine(ctx, /infected|virus|compromised|hacked|blocked/i, 'Alarming claim'), risk: true },
        { observation: { text: 'A phone number is presented for support.', source: 'Recognized text' }, evidence: quoteLine(ctx, /\d{3}[\s-]?\d{4}/, 'Phone number'), risk: true },
      ],
      ctx,
      { level: 'Medium', reason: 'Several signals match a well-known scam pattern.' },
    );
  }
  return null;
}

function paymentDetector(ctx: ScreenContext): Analysis | null {
  if (!/\b(pay(ment)?|checkout|card number|amount due|transfer|purchase)\b/i.test(ctx.text)) return null;
  const signals: Signal[] = [{ observation: { text: 'Payment-related content detected.', source: 'Recognized text' }, evidence: quoteLine(ctx, /pay|checkout|card number|amount due|transfer/i, 'Payment request'), risk: false }];
  if (/gift ?cards?/i.test(ctx.text)) signals.push({ observation: { text: 'Payment by gift card is requested.', source: 'Recognized text' }, evidence: quoteLine(ctx, /gift ?card/i, 'Unusual payment method'), risk: true });
  if (/\b(bitcoin|btc|crypto|usdt|wallet address)\b/i.test(ctx.text)) signals.push({ observation: { text: 'Payment in cryptocurrency is requested.', source: 'Recognized text' }, evidence: quoteLine(ctx, /bitcoin|btc|crypto|usdt|wallet/i, 'Irreversible payment method'), risk: true });
  if (URGENCY_RE.test(ctx.text)) signals.push({ observation: { text: 'Urgent or pressuring wording is present.', source: 'Recognized text' }, evidence: quoteLine(ctx, URGENCY_RE, 'Pressure to act quickly'), risk: true });
  if (ctx.urls[0]) signals.push(...urlSignals(ctx, ctx.urls[0]));
  const risky = signals.some((s) => s.risk);
  const severity: Severity = risky ? 'review' : 'info';
  return build(
    {
      category: 'Payment Screen',
      severity,
      headline: risky ? 'Payment request with unusual signals. Review before paying.' : 'Payment screen detected. No unusual signals were found in the visible text.',
      interpretation: risky
        ? ['Requests for gift cards, cryptocurrency, or payment under time pressure are common in scams, because these payments are hard to reverse.']
        : ['Nothing in the visible text stands out. Check the merchant and amount as you normally would.'],
      actions: [
        { text: 'Confirm the merchant, amount and currency match what you expect.' },
        ...(risky ? [{ text: 'If someone contacted you asking for this payment, verify the request through a channel you already trust.' }] : []),
      ],
      explanation: 'Card payments usually offer dispute processes. Gift cards, crypto and wire transfers usually do not, which is why they are preferred by fraudsters.',
    },
    signals,
    ctx,
    { level: risky ? 'Medium' : 'Low', reason: risky ? 'Known high-risk payment patterns are visible.' : 'Only generic payment wording was recognized.' },
  );
}

const RISKY_COMMANDS: { re: RegExp; what: string }[] = [
  { re: /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba|z)?sh\b/i, what: 'downloads a script from the internet and runs it immediately' },
  { re: /\b(iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^\n|]*\|\s*(iex|Invoke-Expression)\b/i, what: 'downloads a PowerShell script and runs it immediately' },
  { re: /powershell(\.exe)?\s+[^\n]*-(e|enc|encodedcommand)\s+[A-Za-z0-9+/=]{16,}/i, what: 'runs an encoded PowerShell command that cannot be read directly' },
  { re: /\brm\s+-rf\s+(\/|~|\*)(\s|$)/, what: 'deletes files recursively from a very broad location' },
  { re: /Set-ExecutionPolicy\s+(Unrestricted|Bypass)/i, what: 'turns off PowerShell script safety checks' },
  { re: /\bchmod\s+(-R\s+)?777\b/, what: 'gives every user full access to the files' },
  { re: /\bmshta\b|\bregsvr32\b.*\/i:http/i, what: 'runs code from a remote location using a Windows system tool' },
];

function riskyCommandDetector(ctx: ScreenContext): Analysis | null {
  const hits = RISKY_COMMANDS.map((c) => ({ ...c, ev: quoteLine(ctx, c.re, 'Command to review') })).filter((c) => c.ev);
  if (hits.length === 0) return null;
  return build(
    {
      category: 'Risky Command',
      severity: 'review',
      headline: 'A command on screen could make significant changes. Review it before running.',
      interpretation: hits.map((h) => `This command ${h.what}.`),
      actions: [
        { text: 'Do not paste this command unless you trust its source and understand what it does.' },
        { text: 'If it came from a website, chat or email asking you to "fix" something, stop and verify with the official documentation first.' },
      ],
      explanation: 'Commands pasted into a terminal run with your account\'s permissions. Instructions to paste a one-line command are a common way to trick people into installing malware, because the command bypasses normal download warnings.',
    },
    hits.map((h) => ({ observation: { text: `Command that ${h.what}.`, source: 'Recognized text' as const }, evidence: h.ev, risk: true })),
    ctx,
    { level: 'High', reason: 'The command matches a pattern known to be high impact.' },
  );
}

export function riskAgent(ctx: ScreenContext): { score: number; analysis: Analysis } | null {
  const candidates = [securityWarningDetector(ctx), riskyCommandDetector(ctx), loginDetector(ctx), paymentDetector(ctx)].filter(
    (a): a is Analysis => a !== null,
  );
  if (candidates.length === 0) return null;
  const rank: Record<Severity, number> = { review: 3, attention: 2, info: 1 };
  candidates.sort((a, b) => rank[b.severity] - rank[a.severity]);
  const top = candidates[0];
  return { score: top.severity === 'review' ? 0.97 : top.severity === 'attention' ? 0.85 : 0.6, analysis: top };
}
