import type { Analysis, Evidence, Observation, ScreenContext, SuggestedAction } from '../types';
import { explainTerms } from './glossary';

interface Diagnosis {
  /** How specific the match is; exact known messages score higher. */
  specificity: number;
  headline: string;
  detected: string;
  interpretation: string[];
  actions: SuggestedAction[];
  explanation: string;
  lineIndex: number;
}

type Rule = (ctx: ScreenContext) => Diagnosis | null;

function findLine(lines: string[], re: RegExp): { index: number; match: RegExpMatchArray } | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i].match(re);
    if (match) return { index: i, match };
  }
  return null;
}

// Import names that differ from the name used to install the package.
const PIP_NAMES: Record<string, string> = {
  cv2: 'opencv-python',
  sklearn: 'scikit-learn',
  PIL: 'Pillow',
  yaml: 'PyYAML',
  bs4: 'beautifulsoup4',
  dotenv: 'python-dotenv',
  jwt: 'PyJWT',
  dateutil: 'python-dateutil',
  psycopg2: 'psycopg2-binary',
};

const TRUST_CAUTION = 'Only run install commands in a project and environment you trust. Packages run code on your machine when installed.';

const rules: Rule[] = [
  // Python: missing module
  (ctx) => {
    const hit = findLine(ctx.lines, /ModuleNotFoundError:\s*No module named ['"‘’]?([\w.-]+)['"‘’]?/);
    if (!hit) return null;
    const mod = hit.match[1];
    const top = mod.split('.')[0];
    const pipName = PIP_NAMES[top] ?? top;
    const renamed = pipName !== top;
    return {
      specificity: 0.95,
      headline: 'A Python module import failed.',
      detected: `Python reported that the module "${mod}" could not be found.`,
      interpretation: [
        `The application is trying to import the ${top} package, but it is not available in the current Python environment.`,
        'This often happens when the project dependencies were not installed, or a different Python interpreter or virtual environment is active.',
      ],
      actions: [
        { text: `Install the missing dependency if this is a trusted project.`, command: `pip install ${pipName}`, caution: TRUST_CAUTION },
        {
          text: 'If the project has a requirements file, install everything it lists instead.',
          command: 'pip install -r requirements.txt',
        },
        { text: 'Check which Python is active; it should be the one for this project.', command: 'python -m pip --version' },
      ],
      explanation: `When Python runs "import ${top}", it searches the packages installed for the interpreter that is currently running. The error means none of those locations contains ${top}.${
        renamed ? ` Note that the package installs under a different name (${pipName}) than the one used in code (${top}).` : ''
      } Installing it into the active environment usually resolves this. If you already installed it, it was probably installed for a different Python interpreter or virtual environment.`,
      lineIndex: hit.index,
    };
  },
  // Node: missing module
  (ctx) => {
    const hit = findLine(ctx.lines, /Cannot find module ['"‘’]([^'"‘’]+)['"‘’]/);
    if (!hit) return null;
    const mod = hit.match[1];
    const local = mod.startsWith('.') || mod.startsWith('/') || /^[A-Z]:\\/i.test(mod);
    return {
      specificity: 0.9,
      headline: local ? 'A local file could not be loaded.' : 'A Node.js package could not be found.',
      detected: `Node.js reported it cannot find "${mod}".`,
      interpretation: local
        ? ['The code refers to a file path that does not exist, possibly due to a typo, a moved file, or a missing build step.']
        : ['The package is not installed in this project\'s node_modules folder.'],
      actions: local
        ? [{ text: 'Check that the file exists at that path, and run the build step if the file is generated.' }]
        : [
            { text: 'Install the project dependencies if this is a trusted project.', command: 'npm install', caution: TRUST_CAUTION },
            { text: 'If the package is not listed in package.json, add it explicitly.', command: `npm install ${mod.split('/').slice(0, mod.startsWith('@') ? 2 : 1).join('/')}` },
          ],
      explanation: local
        ? 'Node resolves relative paths from the file that contains the import. If the target was renamed, moved, or is produced by a build step that has not run, Node cannot load it.'
        : 'Node looks for packages in node_modules folders. This error usually means dependencies were never installed, or were installed in a different folder.',
      lineIndex: hit.index,
    };
  },
  // Command not found
  (ctx) => {
    const hit =
      findLine(ctx.lines, /(?:^|:\s)([\w.-]+): (?:command not found|not found)$/) ??
      findLine(ctx.lines, /['"]?([\w.-]+)['"]? is not recognized as (?:an internal or external command|the name of a cmdlet)/i);
    if (!hit) return null;
    const cmd = hit.match[1];
    return {
      specificity: 0.85,
      headline: `The command "${cmd}" was not found.`,
      detected: `The shell could not find a program named "${cmd}".`,
      interpretation: ['The tool may not be installed, or its install folder is not on the PATH.'],
      actions: [
        { text: `Install ${cmd} from its official source if you need it.` },
        { text: 'If it is installed, open a new terminal so PATH changes take effect.' },
      ],
      explanation: 'The shell looks for programs in the folders listed in the PATH environment variable. A new install often only becomes visible in terminals opened afterwards.',
      lineIndex: hit.index,
    };
  },
  // Port in use
  (ctx) => {
    const hit = findLine(ctx.lines, /EADDRINUSE.*?:(\d{2,5})|address already in use.*?:(\d{2,5})/i);
    if (!hit) return null;
    const port = hit.match[1] ?? hit.match[2];
    return {
      specificity: 0.9,
      headline: `Port ${port} is already in use.`,
      detected: `The program could not listen on port ${port}.`,
      interpretation: ['Another process, possibly an earlier copy of the same app, is already using this port.'],
      actions: [
        { text: 'Stop the other process, or start this one on a different port.' },
        { text: 'On Windows, find what is using the port.', command: `netstat -ano | findstr :${port}` },
      ],
      explanation: 'Only one program can listen on a given network port at a time. Development servers left running in another terminal are a common cause.',
      lineIndex: hit.index,
    };
  },
  // Database / service connection refused
  (ctx) => {
    const hit = findLine(ctx.lines, /(connection refused|ECONNREFUSED)/i);
    if (!hit) return null;
    const targetRe = /(?:host|server at|connect to)\s*"?(localhost|[\d.]+|[a-z][\w.-]*)"?[^\n]*?port\s*(\d{2,5})|(localhost|(?:\d{1,3}\.){3}\d{1,3}|[a-z][\w-]*(?:\.[\w-]+)+):(\d{2,5})/i;
    const target = hit.match.input?.match(targetRe) ?? ctx.text.match(targetRe);
    const where = target ? `${target[1] ?? target[3]}:${target[2] ?? target[4]}` : 'the configured address';
    const isPg = /postgres|psycopg|5432/i.test(ctx.text);
    const inDocker = /docker|container|exited with code/i.test(ctx.text);
    const isLocal = /localhost|127\.0\.0\.1/.test(where);
    return {
      specificity: 0.8,
      headline: `The application could not connect to ${isPg ? 'its PostgreSQL database' : 'a required service'}.`,
      detected: `A connection to ${where} was refused.`,
      interpretation: [
        `${isPg ? 'The database server' : 'The service'} is probably not running, or is listening on a different host or port than the app expects.`,
        ...(inDocker && isLocal
          ? ['The app appears to run in Docker and connects to localhost. In a container, that address refers to the container itself, not to a database in another container.']
          : []),
      ],
      actions: [
        { text: `Check that ${isPg ? 'PostgreSQL' : 'the service'} is running and reachable at ${where}.` },
        { text: 'Confirm the connection settings (host, port, credentials) in the app configuration or .env file.' },
        ...(inDocker && isLocal
          ? [{ text: 'Inside a container, localhost means the container itself. Point the app at the database service name from docker-compose.yml (for example, db) instead.' }]
          : []),
        ...(isPg ? [{ text: 'If the database runs in Docker, check that its container is up.', command: 'docker compose ps' }] : []),
      ],
      explanation: `"Connection refused" means the network request reached the machine, but nothing accepted it on that port. That is different from a wrong password, which would give an authentication error. The app itself may be fine; it is failing because a dependency it needs at startup is not available.`,
      lineIndex: hit.index,
    };
  },
  // Permission denied
  (ctx) => {
    const hit = findLine(ctx.lines, /(EACCES|Permission denied|Access is denied)/i);
    if (!hit || /publickey/i.test(hit.match.input ?? '')) return null;
    return {
      specificity: 0.7,
      headline: 'The operation was blocked by file permissions.',
      detected: 'The system denied access to a file or folder.',
      interpretation: ['The current user account does not have permission for this file or location.'],
      actions: [
        { text: 'Check who owns the file or folder and whether it is open in another program.' },
        { text: 'Avoid running commands as administrator or with sudo just to bypass this, unless you understand what the command will change.' },
      ],
      explanation: 'Operating systems restrict which accounts can change which files. Elevating privileges hides the symptom but can let a script change parts of the system it should not touch.',
      lineIndex: hit.index,
    };
  },
  // Git errors
  (ctx) => {
    const hit = findLine(ctx.lines, /(fatal: not a git repository|\[rejected\].*\((fetch first|non-fast-forward)\)|CONFLICT \(content\)|Permission denied \(publickey\))/);
    if (!hit) return null;
    const s = hit.match[1];
    const map: [RegExp, Omit<Diagnosis, 'lineIndex' | 'specificity'>][] = [
      [/not a git repository/, { headline: 'This folder is not a Git repository.', detected: 'Git could not find a repository in the current folder.', interpretation: ['The terminal is probably in the wrong folder.'], actions: [{ text: 'Move into the project folder, or initialize a repository if this is a new project.', command: 'git init' }], explanation: 'Git looks for a .git folder in the current directory or its parents. Commands run anywhere else will fail this way.' }],
      [/rejected/, { headline: 'Git rejected the push.', detected: 'The remote branch has commits you do not have locally.', interpretation: ['Someone else, or you from another machine, pushed changes first.'], actions: [{ text: 'Fetch and integrate the remote changes, then push again.', command: 'git pull --rebase' }], explanation: 'Git refuses a push that would discard commits on the remote. Integrating the remote changes first keeps both sets of work.' }],
      [/CONFLICT/, { headline: 'A merge conflict needs to be resolved.', detected: 'Git could not combine changes to the same lines automatically.', interpretation: ['Two branches changed the same part of a file.'], actions: [{ text: 'Open the conflicted files, choose the correct content between the conflict markers, then commit.', command: 'git status' }], explanation: 'Conflict markers (<<<<<<<, =======, >>>>>>>) show both versions. Git needs a person to decide which to keep.' }],
      [/publickey/, { headline: 'Git could not authenticate with SSH.', detected: 'The server rejected the SSH key.', interpretation: ['No SSH key is configured for this account, or the key is not added to the hosting service.'], actions: [{ text: 'Check which key the server sees.', command: 'ssh -T git@github.com' }], explanation: 'SSH authentication works by matching a private key on your machine with a public key registered on the server.' }],
    ];
    const entry = map.find(([re]) => re.test(s));
    return entry ? { ...entry[1], specificity: 0.85, lineIndex: hit.index } : null;
  },
  // npm dependency resolution
  (ctx) => {
    const hit = findLine(ctx.lines, /npm (ERR!|error) code ERESOLVE/);
    if (!hit) return null;
    return {
      specificity: 0.85,
      headline: 'npm could not resolve compatible package versions.',
      detected: 'npm reported an ERESOLVE dependency conflict.',
      interpretation: ['Two packages require incompatible versions of a shared dependency.'],
      actions: [
        { text: 'Read the "Found" and "Could not resolve" lines to see which packages disagree, then align their versions.' },
        { text: 'As a temporary workaround only, older resolution rules can be used.', command: 'npm install --legacy-peer-deps', caution: 'This can install versions that do not work together. Prefer fixing the version mismatch.' },
      ],
      explanation: 'Packages declare which versions of other packages they work with. When those ranges do not overlap, npm stops instead of guessing.',
      lineIndex: hit.index,
    };
  },
  // CORS
  (ctx) => {
    const hit = findLine(ctx.lines, /blocked by CORS policy/i);
    if (!hit) return null;
    return {
      specificity: 0.85,
      headline: 'The browser blocked a cross-origin request.',
      detected: 'A request was blocked by the CORS policy.',
      interpretation: ['The server did not send headers allowing this page\'s origin to read the response.'],
      actions: [{ text: 'Configure the server to allow the page\'s origin, or route the request through the same origin (for example, a dev server proxy).' }],
      explanation: 'CORS is enforced by the browser to protect users. The fix belongs on the server that receives the request, not in the page.',
      lineIndex: hit.index,
    };
  },
  // Generic exception as last line of a traceback, or JS runtime error
  (ctx) => {
    const hit = findLine(ctx.lines, /^\s*(?:Uncaught\s+)?((?:[a-z_]\w*\.)*[A-Z]\w*(?:Error|Exception)):\s*(.+)$/);
    if (!hit) return null;
    const [, type, msg] = hit.match;
    return {
      specificity: 0.55,
      headline: `The program stopped with a ${type}.`,
      detected: `${type}: ${msg.trim()}`,
      interpretation: ['The code hit a condition it did not handle. The location lines above the error show where.'],
      actions: [
        { text: 'Open the file and line shown in the location, and check the values involved at that point.' },
        { text: 'Search the exact error message together with the library name for known causes.' },
      ],
      explanation: `A ${type} was raised and not caught, so the program stopped. The message "${msg.trim()}" describes the immediate problem; the underlying cause is often a few calls earlier in the stack.`,
      lineIndex: hit.index,
    };
  },
];

function findLocation(lines: string[]): { text: string; index: number } | null {
  // Python frames: prefer the last frame in project code, not in site-packages.
  const py = lines
    .map((l, i) => ({ m: l.match(/File "([^"]+)", line (\d+)(?:, in (\S+))?/), i }))
    .filter((x) => x.m);
  const pyUser = py.filter((x) => !/site-packages|dist-packages|[\\/]lib[\\/]python/i.test(x.m![1]));
  const pyPick = pyUser.at(-1) ?? py.at(-1);
  if (pyPick) {
    const [, file, line, fn] = pyPick.m!;
    return { text: `${file}, line ${line}${fn ? ` (in ${fn})` : ''}`, index: pyPick.i };
  }
  // JS frames: first frame outside node_modules and node internals.
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/at\s+(?:.*?\()?((?:[A-Za-z]:)?[^\s()]+?):(\d+):(\d+)\)?/);
    if (m && !/node_modules|node:internal/.test(m[1])) return { text: `${m[1]}, line ${m[2]}`, index: i };
  }
  return null;
}

const KEY_LINE_RE = /\b(error|exception|fatal|failed|failure|caused by|refused|denied|timed? ?out|critical)\b/i;

export function errorAgent(ctx: ScreenContext): { score: number; analysis: Analysis } | null {
  const diagnoses = rules.map((r) => r(ctx)).filter((d): d is Diagnosis => d !== null);
  const hasTraceback = /Traceback \(most recent call last\)|^\s+at\s+\S+.*:\d+:\d+/m.test(ctx.text);
  const keyLineIdx = ctx.lines.map((l, i) => (KEY_LINE_RE.test(l) ? i : -1)).filter((i) => i >= 0);
  if (diagnoses.length === 0 && !hasTraceback && keyLineIdx.length < 2) return null;

  // Prefer the most specific match; among equals, the one closest to the end
  // of the output, where root causes are usually reported.
  diagnoses.sort((a, b) => b.specificity - a.specificity || b.lineIndex - a.lineIndex);
  const primary = diagnoses[0];
  const location = findLocation(ctx.lines);
  const isLongLog = ctx.lines.length >= 14;

  const evidence: Evidence[] = [];
  if (primary) evidence.push({ quote: ctx.lines[primary.lineIndex].trim(), note: 'Error message', line: primary.lineIndex + 1 });
  if (location && location.index !== primary?.lineIndex) {
    evidence.push({ quote: ctx.lines[location.index].trim(), note: 'Likely error location', line: location.index + 1 });
  }
  for (const d of diagnoses.slice(1, 3)) {
    if (!evidence.some((e) => e.line === d.lineIndex + 1)) {
      evidence.push({ quote: ctx.lines[d.lineIndex].trim(), note: 'Related message', line: d.lineIndex + 1 });
    }
  }

  const detected: Observation[] = [];
  if (primary) detected.push({ text: primary.detected, source: 'Recognized text' });
  if (location) detected.push({ text: `Likely location: ${location.text}`, source: 'Recognized text' });
  if (isLongLog) detected.push({ text: `${ctx.lines.length} lines of output, ${keyLineIdx.length} of them mention errors or failures.`, source: 'Recognized text' });
  if (hasTraceback && !primary) detected.push({ text: 'A stack trace is visible.', source: 'Recognized text' });

  const keyLines = isLongLog
    ? keyLineIdx.slice(-6).map((i) => ({ line: i + 1, text: ctx.lines[i].trim() }))
    : undefined;

  const confidence: Analysis['confidence'] = primary
    ? primary.specificity >= 0.8
      ? { level: 'High', reason: 'The exact error message matches a known, well-documented pattern.' }
      : { level: 'Medium', reason: 'A standard error format was recognized, but the cause depends on code that is not visible.' }
    : { level: 'Low', reason: 'Error-like lines were found, but no known error pattern matched.' };

  const analysis: Analysis = {
    category: isLongLog ? 'Technical Error Log' : 'Developer Error',
    severity: 'attention',
    headline: primary
      ? isLongLog
        ? `Long log summarized. ${primary.headline}`
        : primary.headline
      : 'Error output detected, but the cause is not clear from the visible text.',
    detected,
    interpretation: primary
      ? primary.interpretation
      : ['The visible lines report failures, but they do not match a pattern SafeScreen recognizes yet.'],
    actions: primary
      ? primary.actions
      : [{ text: 'Capture the last lines of the output, where the root cause is usually printed, and analyze again.' }],
    evidence,
    terms: explainTerms(ctx.text),
    explanation: primary
      ? primary.explanation +
        (isLongLog && diagnoses.length > 1 ? ' The other error lines in the log may be side effects of this failure rather than separate problems.' : '')
      : 'Error output is usually read from the bottom up: the last error line states what failed, and the lines above show where.',
    location: location?.text,
    keyLines,
    confidence,
    agent: 'Error agent',
  };
  return { score: primary ? 0.5 + primary.specificity * 0.4 : 0.35, analysis };
}
