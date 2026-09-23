import type { ParsedUrl, ScreenContext, SensitiveMatch, UiElement } from './types';

const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu']);

export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const sld = labels[labels.length - 2];
  const tld = labels[labels.length - 1];
  if (tld.length === 2 && SECOND_LEVEL.has(sld)) return labels.slice(-3).join('.');
  return labels.slice(-2).join('.');
}

// Matches explicit URLs and bare hostnames such as "login.example.com/path".
const URL_RE =
  /\b((?:https?):\/\/)?((?:\d{1,3}\.){3}\d{1,3}|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,24}|xn--[a-z0-9-]+))(:\d{2,5})?(\/[^\s"'<>]*)?/gi;

// Filenames that look like hostnames ("session.py", "index.js") are not URLs.
const FILE_EXT = /\.(py|js|ts|tsx|jsx|json|java|go|rs|rb|php|c|cpp|h|cs|txt|log|md|yml|yaml|toml|lock|exe|dll|sh|ps1|html|css|png|svg)$/i;

export function extractUrls(text: string): ParsedUrl[] {
  const out: ParsedUrl[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(URL_RE)) {
    const [raw, proto, host, , path = ''] = m;
    if (!proto && FILE_EXT.test(host)) continue;
    // Require a scheme, a www/login-ish prefix, or a path for bare hosts to cut noise
    // like "e.g" or "v2.0" in prose.
    if (!proto && !/^(www|login|signin|account|secure|auth|my)\b/i.test(host) && !path && host.split('.').length < 3) continue;
    const key = host.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      raw,
      protocol: proto ? (proto.toLowerCase().startsWith('https') ? 'https' : 'http') : 'none',
      host: key,
      registrableDomain: registrableDomain(key),
      path,
    });
  }
  return out;
}

function luhn(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

const SENSITIVE_PATTERNS: { kind: string; re: RegExp; check?: (v: string) => boolean }[] = [
  { kind: 'Private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { kind: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'API key', re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { kind: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { kind: 'Slack token', re: /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/g },
  { kind: 'Password value', re: /\b(?:password|passwd|pwd)\s*[=:]\s*\S{4,}/gi },
  {
    kind: 'Card number',
    re: /\b(?:\d[ -]?){13,19}\b/g,
    check: (v) => luhn(v.replace(/\D/g, '')),
  },
  { kind: 'Email address', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
];

export function findSensitive(text: string): SensitiveMatch[] {
  const found: SensitiveMatch[] = [];
  for (const { kind, re, check } of SENSITIVE_PATTERNS) {
    for (const m of text.matchAll(re)) {
      if (check && !check(m[0])) continue;
      found.push({ kind, value: m[0] });
    }
  }
  return found;
}

/** Replaces sensitive values with a masked form that keeps a hint of the shape. */
export function redact(text: string, matches: SensitiveMatch[]): string {
  let out = text;
  for (const { kind, value } of matches) {
    let masked: string;
    if (kind === 'Email address') {
      const [user, domain] = value.split('@');
      masked = `${user[0]}•••@${domain}`;
    } else if (kind === 'Password value') {
      masked = value.replace(/([=:]\s*)\S+$/, '$1••••••');
    } else if (kind === 'Private key') {
      masked = value;
    } else {
      masked = `${value.slice(0, 4)}••••••`;
    }
    out = out.split(value).join(masked);
  }
  return out;
}

/**
 * Without a vision model, some UI elements can still be inferred from the
 * labels OCR picks up. These are marked "Inferred from text" in the UI.
 */
export function inferUiElements(lines: string[]): UiElement[] {
  const els: UiElement[] = [];
  const text = lines.join('\n');
  if (/\bpassword\b/i.test(text) && !/password\s*[=:]/i.test(text)) {
    els.push({ kind: 'password-field', label: 'Password field', source: 'Inferred from text' });
  }
  if (/\b(sign[\s-]?in|log[\s-]?in)\b/i.test(text) && /\b(e-?mail|username|user name|phone|password)\b/i.test(text)) {
    els.push({ kind: 'login-form', label: 'Login form', source: 'Inferred from text' });
  }
  if (/^\s*(\$|>|PS [A-Z]:\\|C:\\.*>)/m.test(text) || /^Traceback \(most recent call last\)/m.test(text)) {
    els.push({ kind: 'terminal', label: 'Terminal or console output', source: 'Inferred from text' });
  }
  return els;
}

export function buildContext(rawText: string, annotated: UiElement[] = []): ScreenContext {
  let text = rawText.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  // Strip "service-1  | " prefixes from docker compose logs so line patterns match.
  const prefixed = text.split('\n').filter((l) => /^[\w.-]+-\d+\s+\|/.test(l)).length;
  if (prefixed >= 3) text = text.replace(/^[\w.-]+-\d+\s+\| ?/gm, '');
  const lines = text.split('\n');
  const inferred = inferUiElements(lines).filter((e) => !annotated.some((a) => a.kind === e.kind));
  return {
    text,
    lines,
    uiElements: [...annotated, ...inferred],
    urls: extractUrls(text),
    sensitive: findSensitive(text),
  };
}
