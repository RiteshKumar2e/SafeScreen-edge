import type { Analysis, Box, Region, RegionTone, ScreenContext, ScreenStructure, TextLine } from './types';

// Screen structure is inferred from text labels. A vision model would add
// icon-only controls and exact layout; this layer works on OCR output alone
// and is written so a model's detections can be merged in as UiElements.

const NAV_WORDS =
  /^(home|dashboard|overview|projects?|deployments?|settings|billing|account|profile|team|members|users|analytics|reports?|insights|inbox|messages|files|documents|integrations|security|help|support|docs|documentation|activity|logs|monitoring|orders|customers|products|invoices|payments|storage|databases?|functions|domains|usage|api keys|audit log)$/i;

const ACTION_RE =
  /^(\+\s*)?(create|new|add|save|submit|deploy|continue|next|upload|invite|export|update|retry|sign in|log in|install|confirm|apply|publish|connect|run|start|allow|yes|no|cancel|download)\b[\w\s-]{0,24}$/i;

const ISSUE_RE =
  /\b(error|failed|failure|declined|expired|expiring|denied|refused|unable|invalid|exception|warning|unusual|suspended|suspension|overdue|not found|required|action needed|attention|exited with code [1-9])\b/i;

const FIELD_RE = /^(e-?mail( address)?( or phone)?|username|user name|password|phone|card number|name|search)$/i;

const clean = (s: string) => s.trim().replace(/\s+/g, ' ');

/** The navigation label a line starts with, if any. */
function navLabel(line: string): string | null {
  if (NAV_WORDS.test(line)) return line;
  const words = line.split(' ');
  for (const n of [2, 1]) {
    const head = words.slice(0, n).join(' ');
    if (words.length > n && /^[A-Z]/.test(head) && NAV_WORDS.test(head)) return head;
  }
  return null;
}

export function describeStructure(ctx: ScreenContext): ScreenStructure {
  const lines = ctx.lines.map(clean).filter(Boolean);
  // OCR often merges a sidebar label with the text beside it ("Dashboard Workspace overview"),
  // so a navigation word at the start of a line counts too.
  const navigation = [...new Set(lines.map(navLabel).filter((n): n is string => !!n))];
  // "Sign in to continue" is a heading, not a button.
  const primaryActions = [...new Set(lines.filter((l) => ACTION_RE.test(l) && l.split(' ').length <= 4 && !/\bto (continue|proceed)\b/i.test(l)))];
  const issues = lines.filter((l) => ISSUE_RE.test(l) && l.length > 8).slice(0, 6);
  const fields = [...new Set(lines.filter((l) => FIELD_RE.test(l)))];
  const terminal = ctx.uiElements.some((e) => e.kind === 'terminal');
  const title = terminal ? undefined : lines.find((l) => l.length > 3 && l.length < 60 && !/^https?:|^[$>]|^PS |^(traceback|info|error|warn|debug)\b/i.test(l) && !NAV_WORDS.test(l));
  return { title, navigation: navigation.length >= 3 ? navigation : [], primaryActions, issues, fields };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function similar(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  // Containment only counts when the shorter text is substantial, so "1" or
  // "OK" never match a whole sentence.
  if (long.includes(short) && (short.length >= 12 || short.length >= long.length * 0.6)) return true;
  const ta = new Set(x.split(' '));
  const tb = y.split(' ');
  const hit = tb.filter((t) => ta.has(t)).length;
  return hit / Math.max(ta.size, tb.length) >= 0.6;
}

function union(boxes: Box[], pad = 0.01): Box {
  const x0 = Math.min(...boxes.map((b) => b.x)) - pad;
  const y0 = Math.min(...boxes.map((b) => b.y)) - pad;
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + pad;
  const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + pad;
  return { x: Math.max(0, x0), y: Math.max(0, y0), w: Math.min(1, x1) - Math.max(0, x0), h: Math.min(1, y1) - Math.max(0, y0) };
}

function padBox(b: Box, px = 0.006, py = 0.008): Box {
  return { x: Math.max(0, b.x - px), y: Math.max(0, b.y - py), w: Math.min(1 - Math.max(0, b.x - px), b.w + px * 2), h: b.h + py * 2 };
}

/**
 * Turns positioned text lines plus the analysis into labeled regions for the
 * preview overlay. The same code runs on live OCR output and on the prepared
 * layouts of demo scenarios.
 */
export function labelRegions(
  lines: TextLine[],
  ctx: ScreenContext,
  analysis: Analysis,
  structure: ScreenStructure,
  positionSource: Region['source'],
): Region[] {
  const regions: Region[] = [];
  const used = new Set<number>();
  const add = (label: string, tone: RegionTone, box: Box, detail: string, source: Region['source'] = positionSource) =>
    regions.push({ id: `r${regions.length}`, label, tone, box, source, detail });
  const isRisk = analysis.severity === 'review' && analysis.agent === 'Risk agent';

  // Elements a detector placed directly (vision annotations) come first.
  for (const el of ctx.uiElements) {
    if (!el.box) continue;
    const label =
      el.kind === 'password-field' ? 'PASSWORD FIELD' : el.kind === 'login-form' ? 'LOGIN FORM' : el.kind === 'address-bar' ? 'ADDRESS BAR' : el.kind === 'dialog' ? 'PERMISSION DIALOG' : el.kind === 'button' ? 'BUTTON' : el.kind === 'navigation' ? 'NAVIGATION' : el.kind === 'terminal' ? 'TERMINAL' : 'TEXT FIELD';
    const tone: RegionTone = isRisk && ['password-field', 'address-bar', 'login-form', 'dialog'].includes(el.kind) ? 'risk' : el.kind === 'button' ? 'action' : 'neutral';
    add(label, tone, el.box, el.label, 'Simulated vision annotation');
  }
  const has = (label: string) => regions.some((r) => r.label === label);
  const overlapsField = (t: string) => (/password/i.test(t) ? has('PASSWORD FIELD') : has('TEXT FIELD'));

  const findLine = (pred: (t: string) => boolean) => lines.findIndex((l, i) => !used.has(i) && pred(l.text));

  const overlaps = (b: Box) =>
    regions.some((r) => {
      const ix = Math.max(0, Math.min(r.box.x + r.box.w, b.x + b.w) - Math.max(r.box.x, b.x));
      const iy = Math.max(0, Math.min(r.box.y + r.box.h, b.y + b.h) - Math.max(r.box.y, b.y));
      return r.label !== 'LOGIN FORM' && r.label !== 'PERMISSION DIALOG' && r.label !== 'TERMINAL' && r.label !== 'NAVIGATION' && ix * iy > 0.3 * b.w * b.h;
    });

  // Address bar: a line that starts with a web address. An annotated address
  // bar already covers it.
  const urlLine = findLine((t) => /^https?:\/\/\S+$/i.test(t.trim()) || (/^https?:\/\//i.test(t.trim()) && t.length < 140));
  if (urlLine >= 0 && ctx.urls.some((u) => u.protocol !== 'none')) {
    used.add(urlLine);
    if (!has('ADDRESS BAR')) add('ADDRESS BAR', isRisk ? 'risk' : 'neutral', padBox(lines[urlLine].box), `Address: ${ctx.urls[0].host}`);
  }

  // Evidence lines, labeled by what they say.
  for (const ev of analysis.evidence) {
    const i = findLine((t) => similar(t, ev.quote));
    if (i < 0) continue;
    used.add(i);
    const t = lines[i].text;
    const box = padBox(lines[i].box);
    // A field label is already represented by its field.
    if (FIELD_RE.test(t.trim()) && overlapsField(t)) continue;
    const isErr = /error|exception|failed|refused|traceback|exited with code|not found|declined/i.test(t);
    const isWarn = /warn|unusual|verify|suspen|unknown|within \d+ hours|urgent|immediately/i.test(t);
    const isLoc = /^\s*File ".+", line \d+/.test(t);
    const label = isErr ? 'ERROR MESSAGE' : isWarn ? 'WARNING' : isLoc ? 'CODE LOCATION' : isRisk ? 'RISK SIGNAL' : 'EVIDENCE';
    add(label, isRisk ? 'risk' : isErr ? 'issue' : isWarn ? 'risk' : 'neutral', box, ev.note);
  }

  // Issues from structure that were not already evidence (at most three more).
  let extraIssues = 0;
  for (const issue of structure.issues) {
    if (extraIssues >= 3) break;
    const i = findLine((t) => similar(t, issue));
    if (i < 0) continue;
    used.add(i);
    extraIssues++;
    const isErr = /error|failed|declined|refused|denied|exited/i.test(lines[i].text);
    add(isErr ? 'ERROR MESSAGE' : 'WARNING', isErr && !isRisk ? 'issue' : 'risk', padBox(lines[i].box), issue);
  }

  // Fields: prefer an annotated field box; otherwise mark the label.
  for (const f of structure.fields) {
    const isPw = /password/i.test(f);
    if (isPw && has('PASSWORD FIELD')) continue;
    if (!isPw && has('TEXT FIELD')) continue;
    const i = findLine((t) => norm(t) === norm(f));
    if (i < 0) continue;
    used.add(i);
    add(isPw ? 'PASSWORD FIELD' : 'TEXT FIELD', isPw && isRisk ? 'risk' : 'neutral', padBox(lines[i].box), `Field label "${f}"`);
  }

  // Navigation group
  if (structure.navigation.length && !has('NAVIGATION')) {
    const idx = lines.map((l, i) => (structure.navigation.includes(navLabel(clean(l.text)) ?? '') ? i : -1)).filter((i) => i >= 0);
    if (idx.length >= 3) {
      // Keep only the part of each line occupied by the label itself.
      const boxes = idx.map((i) => {
        const t = clean(lines[i].text);
        const label = navLabel(t) ?? t;
        const b = lines[i].box;
        return { ...b, w: b.w * Math.min(1, (label.length + 1) / t.length) };
      });
      idx.forEach((i) => { if (navLabel(clean(lines[i].text)) === clean(lines[i].text)) used.add(i); });
      add('NAVIGATION', 'neutral', union(boxes), `${idx.length} navigation items`);
    }
  }

  // Primary actions (at most three, to keep the overlay readable)
  let actions = 0;
  for (const a of structure.primaryActions) {
    if (actions >= 3) break;
    const i = findLine((t) => norm(t) === norm(a));
    if (i < 0) continue;
    used.add(i);
    const box = padBox(lines[i].box, 0.012, 0.012);
    if (overlaps(box)) continue;
    actions++;
    add(actions === 1 && !has('BUTTON') ? 'PRIMARY BUTTON' : 'BUTTON', 'action', box, `Action "${a}"`);
  }

  // Login form: union of field and sign-in lines when no annotated form exists.
  if (!has('LOGIN FORM') && ctx.uiElements.some((e) => e.kind === 'login-form')) {
    const parts = regions.filter((r) => ['PASSWORD FIELD', 'TEXT FIELD'].includes(r.label) || /sign in|log in/i.test(r.detail));
    if (parts.length >= 2) add('LOGIN FORM', isRisk ? 'risk' : 'neutral', union(parts.map((p) => p.box), 0.02), 'Sign-in form');
  }

  return mergeAdjacent(regions);
}

/** Joins consecutive lines with the same label (a two-line warning) into one region. */
function mergeAdjacent(regions: Region[]): Region[] {
  const out: Region[] = [];
  for (const r of regions) {
    const prev = out.find(
      (p) =>
        p.label === r.label &&
        p.tone === r.tone &&
        ['WARNING', 'ERROR MESSAGE', 'EVIDENCE', 'RISK SIGNAL'].includes(r.label) &&
        Math.abs(r.box.y - (p.box.y + p.box.h)) < 0.03 &&
        Math.min(p.box.x + p.box.w, r.box.x + r.box.w) > Math.max(p.box.x, r.box.x),
    );
    if (prev) {
      prev.box = union([prev.box, r.box], 0);
      prev.detail = `${prev.detail}; ${r.detail}`;
    } else out.push({ ...r });
  }
  return out.map((r, i) => ({ ...r, id: `r${i}` }));
}

/** Builds line boxes for a prepared scenario from its drawn text layout. */
export function layoutLines(
  transcript: string,
  layout: { x: number; y: number; size: number; mono?: boolean; anchor?: 'middle' }[],
  width: number,
  height: number,
): TextLine[] {
  const rows = transcript.split('\n');
  return rows.flatMap((text, i) => {
    const l = layout[i];
    if (!l || !text.trim()) return [];
    const w = text.length * l.size * (l.mono ? 0.55 : 0.5);
    const x = l.anchor === 'middle' ? l.x - w / 2 : l.x;
    return [{ text, box: { x: x / width, y: (l.y - l.size * 0.9) / height, w: w / width, h: (l.size * 1.2) / height } }];
  });
}
