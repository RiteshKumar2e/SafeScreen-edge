import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getScenario } from '../../demo/scenarios';
import { scenarioReport } from '../../demo/scenarioReport';
import { TECH_BUILT, TECH_ROADMAP } from '../../runtime/plan';
import { useStore } from '../../store/store';
import { Icon, type IconName } from '../Icon';
import { Pipeline, STAGES } from '../Pipeline';
import { InsightPanel } from '../InsightPanel';
import { ScreenPreview } from '../ScreenPreview';

const prefersReduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Hero visual ---------- */
const HERO_SCENARIOS = ['developer-error', 'suspicious-login', 'enterprise-dashboard'];

export function HeroVisual() {
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState(3);
  const [paused, setPaused] = useState(false);
  const id = HERO_SCENARIOS[i];
  const sc = getScenario(id)!;
  const report = scenarioReport(id);

  // Screen, then regions, then the insight; then the next scenario.
  useEffect(() => {
    if (paused || prefersReduced()) {
      setPhase(3);
      return;
    }
    setPhase(0);
    const timers = [1, 2, 3].map((p) => window.setTimeout(() => setPhase(p), p * 700));
    const next = window.setTimeout(() => setI((x) => (x + 1) % HERO_SCENARIOS.length), 7500);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(next);
    };
  }, [i, paused]);

  return (
    <div className="hero-visual" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)}>
      <div className="window">
        <div className="window-bar">
          <span className="t">SafeScreen Edge</span>
          <span className="subtle">Live Analysis</span>
          <span className="grow" />
          <span className="chip chip-local">Local processing</span>
        </div>
        <div className="window-body">
          <div className="window-screen">
            <div className="window-tabs" role="tablist" aria-label="Example screens">
              {HERO_SCENARIOS.map((sid, n) => (
                <button
                  key={sid}
                  type="button"
                  role="tab"
                  aria-selected={n === i}
                  onClick={() => {
                    setI(n);
                    setPaused(true);
                  }}
                >
                  {getScenario(sid)!.shortTitle}
                </button>
              ))}
            </div>
            <ScreenPreview
              key={id}
              src={sc.image}
              alt={sc.alt}
              regions={report.regions}
              showRegions={phase >= 1}
              scanning={phase === 0}
              width={sc.width}
              height={sc.height}
              eager
              stagger={110}
            />
          </div>
          <div className="window-side" aria-live="polite">
            {phase >= 3 ? (
              <InsightPanel key={id} report={report} compact />
            ) : (
              <div className="analyzing-card">
                <p className="btn-row small muted">
                  <span className="spinner" style={{ color: 'var(--accent-text)' }} aria-hidden="true" />
                  {phase < 2 ? 'Understanding the screen…' : 'Reasoning locally…'}
                </p>
                <div className="skeleton" style={{ height: 18, width: '60%' }} />
                <div className="skeleton" style={{ height: 12, width: '90%' }} />
                <div className="skeleton" style={{ height: 12, width: '75%' }} />
              </div>
            )}
          </div>
        </div>
        <div className="window-foot">
          <span className="ok">No screenshot uploaded</span>
          <span>Demo simulation · output computed by SafeScreen's agents</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Why ---------- */
const WHY: [string, string][] = [
  ['Understand', 'SafeScreen reads the text on screen together with where it sits, so it knows which line is the error, which field wants a password and which button matters.'],
  ['Detect', 'Errors, risky sign-in pages, elevation prompts and messages that need attention are flagged with the exact lines that triggered them.'],
  ['Assist', 'You get a plain explanation and a next step. Commands appear as text you can copy. SafeScreen never runs them.'],
];

export function WhySection() {
  return (
    <dl className="rows">
      {WHY.map(([t, d]) => (
        <div key={t}>
          <dt>{t}</dt>
          <dd>{d}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------- Privacy comparison ---------- */
function Down() {
  return (
    <span className="down" aria-hidden="true">
      <Icon name="arrowRight" />
    </span>
  );
}

export function PrivacyCompare() {
  return (
    <div className="compare">
      <div className="compare-col">
        <h3>
          Traditional AI assistant <span className="chip chip-issue">Leaves device</span>
        </h3>
        <ol className="chain" aria-label="Traditional AI data flow">
          <li>
            <span className="n">
              Screen
            </span>
            <Down />
          </li>
          <li>
            <span className="n warn">
              Upload to cloud <small>entire screenshot</small>
            </span>
            <Down />
          </li>
          <li>
            <span className="n warn">
              Remote AI
            </span>
            <Down />
          </li>
          <li>
            <span className="n">
              Response
            </span>
          </li>
        </ol>
        <p className="compare-note">Everything visible goes with it: emails, code, keys, other windows.</p>
      </div>
      <div className="compare-col ours">
        <h3>
          SafeScreen Edge <span className="chip chip-local">Stays on device</span>
        </h3>
        <ol className="chain" aria-label="SafeScreen Edge data flow">
          <li>
            <div className="device-box">
              <span className="label">Your device</span>
              <span className="n good">
                Screen
              </span>
              <Down />
              <span className="n good">
                Local AI <small>OCR · UI · agents</small>
              </span>
              <Down />
              <span className="n good">
                Response
              </span>
            </div>
          </li>
        </ol>
        <p className="compare-note">No automatic upload. The web app is only permitted to connect to its own origin.</p>
      </div>
    </div>
  );
}

/* ---------- Use cases ---------- */
export const USE_CASES: { id: string; title: string; line: string; icon: IconName; scenario: string; body: string }[] = [
  {
    id: 'developers',
    title: 'Developers',
    line: 'Understand errors instantly.',
    icon: 'terminal',
    scenario: 'developer-error',
    body: 'Tracebacks, build logs and container output are reduced to the line that matters, the likely cause, and a fix you can copy. Long logs are summarized with the key lines kept.',
  },
  {
    id: 'security',
    title: 'Security',
    line: 'Identify suspicious interface signals.',
    icon: 'shield',
    scenario: 'suspicious-login',
    body: 'Sign-in pages on unexpected domains, elevation prompts from unknown publishers, gift-card payment demands and paste-this-command instructions are flagged with the signals behind them.',
  },
  {
    id: 'productivity',
    title: 'Productivity',
    line: 'Understand complex applications.',
    icon: 'layers',
    scenario: 'enterprise-dashboard',
    body: 'Busy consoles are summarized into navigation, the main action and the one message that needs attention. Ask "What should I click?" and the answer is highlighted on screen.',
  },
  {
    id: 'accessibility',
    title: 'Accessibility',
    line: 'Make unfamiliar interfaces easier to understand.',
    icon: 'accessibility',
    scenario: 'enterprise-dashboard',
    body: 'Every detected region has a text label that screen readers announce, and the assistant describes a screen in plain language on request, without sending it anywhere.',
  },
  {
    id: 'it-support',
    title: 'IT Support',
    line: 'Diagnose visual problems without uploaded screenshots.',
    icon: 'headset',
    scenario: 'security-warning',
    body: 'Users get a first diagnosis on their own device, and the activity log records what was analyzed and where, so support teams can help without collecting screenshots.',
  },
];

export function UseCases() {
  const [active, setActive] = useState(USE_CASES[0].id);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const uc = USE_CASES.find((u) => u.id === active)!;
  const sc = getScenario(uc.scenario)!;
  const report = scenarioReport(uc.scenario);

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = USE_CASES.length;
    const map: Record<string, number> = { ArrowDown: (i + 1) % n, ArrowUp: (i - 1 + n) % n, Home: 0, End: n - 1 };
    const next = map[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setActive(USE_CASES[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div className="uc">
      <div className="uc-list" role="tablist" aria-label="Use cases" aria-orientation="vertical">
        {USE_CASES.map((u, i) => (
          <button
            key={u.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-t-${u.id}`}
            aria-selected={active === u.id}
            aria-controls={`${base}-panel`}
            tabIndex={active === u.id ? 0 : -1}
            className="uc-card"
            onClick={() => setActive(u.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <span>
              <strong>{u.title}</strong>
              <span>{u.line}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="uc-panel" role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-t-${active}`}>
        <div className="window">
          <div className="window-bar">
            <span className="t">{uc.title}</span>
            <span className="subtle">{sc.title}</span>
            <span className="grow" />
            <span className="chip chip-sim">Demo simulation</span>
          </div>
          <div className="window-body">
            <div className="window-screen">
              <ScreenPreview key={uc.id} src={sc.image} alt={sc.alt} regions={report.regions} width={sc.width} height={sc.height} />
            </div>
          </div>
          <div className="uc-caption">
            <p>{uc.body}</p>
            <p>
              <strong style={{ color: 'var(--text)' }}>SafeScreen:</strong> {report.analysis.headline}
            </p>
            <Link to={`/app/live-analysis?scenario=${uc.scenario}`} className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }}>
              Try this scenario
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- How it works ---------- */
const STEPS: [string, string][] = [
  ['Capture', 'You choose a screen, window or region. Frames stay in memory, and excluded apps are dropped before analysis.'],
  ['Understand', 'On-device OCR reads the text and its position. Fields, buttons, dialogs and messages are located.'],
  ['Reason', 'Error, risk and UI agents weigh the evidence locally and choose the most specific explanation.'],
  ['Assist', 'You see the explanation, the evidence and a recommended action. Every system action stays with you.'],
];

const TRACE: Partial<Record<string, string>> = {
  preprocess: 'Prepared demo image',
  ocr: 'Prepared transcript, 6 lines with positions',
  vision: 'Terminal window located (simulated annotation)',
  context: '1 UI element, no web addresses',
  agents: 'Error agent selected',
};

export function HowItWorks() {
  const r = scenarioReport('developer-error');
  const stages = Object.fromEntries(
    STAGES.map((st) => [
      st.id,
      {
        id: st.id,
        status: 'done' as const,
        detail: TRACE[st.id] ?? (st.id === 'evidence' ? `${r.analysis.evidence.length} quoted lines` : `${r.analysis.category}, ${r.regions.length} regions`),
      },
    ]),
  );
  return (
    <div className="how">
      <ol className="how-steps">
        {STEPS.map(([t, d], i) => (
          <li key={t}>
            <span className="num">0{i + 1}</span>
            <div>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          </li>
        ))}
      </ol>
      <figure className="how-trace">
        <figcaption>
          <span className="label">Pipeline trace from the app</span>
          <span className="small subtle">Developer error scenario, demo simulation</span>
        </figcaption>
        <Pipeline stages={stages} />
      </figure>
    </div>
  );
}

/* ---------- Technology ---------- */
const STACK: { label: string; status: string; hw?: boolean }[] = [
  { label: 'Snapdragon X Series HP PCs', status: 'Target', hw: true },
  { label: 'NPU acceleration', status: 'Via Windows host', hw: true },
  { label: 'ONNX Runtime', status: 'Web build in use' },
  { label: 'Qualcomm AI Hub EasyOCR', status: 'INT8, built' },
  { label: 'Local AI reasoning', status: 'Built' },
];

export function TechStack() {
  return (
    <div className="tech">
      <ol className="stack" aria-label="SafeScreen Edge AI stack, hardware at the top">
        {STACK.map((x) => (
          <li key={x.label} className={x.hw ? 'hw' : ''}>
            <span>{x.label}</span>
            <span className={`stack-status${/built|in use/i.test(x.status) ? ' is-built' : ''}`}>{x.status}</span>
          </li>
        ))}
      </ol>
      <div className="tech-groups">
        <section aria-labelledby="tech-built">
          <h3 id="tech-built" className="tech-group-title">In this build</h3>
          <dl className="rows rows-tight">
            {TECH_BUILT.map((t) => (
              <div key={t.name}>
                <dt>{t.name}</dt>
                <dd>{t.what}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section aria-labelledby="tech-roadmap">
          <h3 id="tech-roadmap" className="tech-group-title">Snapdragon roadmap</h3>
          <p className="tech-group-note">Ships with the SafeScreen Windows host. Not used by this web build yet.</p>
          <dl className="rows rows-tight">
            {TECH_ROADMAP.map((t) => (
              <div key={t.name}>
                <dt>{t.name}</dt>
                <dd>{t.what}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}

/* ---------- Performance ---------- */
export function Performance() {
  const runs = useStore((s) => s.runs);
  const last = runs[0];
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : null;
  };
  const ocr = median(runs.map((r) => r.stages.ocr ?? NaN).filter(Number.isFinite));
  const total = median(runs.map((r) => r.totalMs));
  return (
    <div>
      <div className="perf" role="group" aria-label="Runtime measurements">
        <div>
          <span className="label">Inference</span>
          <span className={`val${ocr === null ? ' none' : ''}`}>{ocr === null ? 'Not measured' : `${Math.round(ocr)} ms`}</span>
          <span className="sub">{ocr === null ? 'OCR stage, measured on your device' : `OCR median, ${runs.length} run${runs.length === 1 ? '' : 's'} here`}</span>
        </div>
        <div>
          <span className="label">Latency</span>
          <span className={`val${total === null ? ' none' : ''}`}>{total === null ? 'Not measured' : `${Math.round(total)} ms`}</span>
          <span className="sub">End to end, capture to insight</span>
        </div>
        <div>
          <span className="label">Backend</span>
          <span className="val" style={{ fontSize: 18 }}>
            NPU / GPU / CPU
          </span>
          <span className="sub">{last ? `Last run: ${last.backend}` : 'Reported per stage at runtime'}</span>
        </div>
        <div>
          <span className="label">Power mode</span>
          <span className="val none">Not measured</span>
          <span className="sub">Requires the Windows host</span>
        </div>
        <div>
          <span className="label">Model</span>
          <span className="val" style={{ fontSize: 18 }}>
            EasyOCR
          </span>
          <span className="sub">Qualcomm AI Hub, INT8 (w8a8)</span>
        </div>
      </div>
      <p className="perf-note">
        {runs.length
          ? 'Values above were measured in this browser on this device. They are not Snapdragon NPU benchmarks.'
          : 'Numbers appear after you analyze a real screen in the app. Nothing here is estimated.'}{' '}
        Qualcomm AI Hub publishes 13.45 ms for this EasyOCR detector on the Snapdragon X Elite NPU; that is Qualcomm's figure. <strong>SafeScreen's own NPU benchmark is available after hardware profiling.</strong>
      </p>
    </div>
  );
}

/* ---------- Before / after demo ---------- */
const DEMOS: { id: string; label: string; before: string }[] = [
  { id: 'developer-error', label: 'Developer error', before: "ModuleNotFoundError: No module named 'pandas'" },
  { id: 'suspicious-login', label: 'Login page', before: 'microsoft-account.secure-verify-login.co · Sign in to continue' },
  { id: 'enterprise-dashboard', label: 'Complex UI', before: 'Northwind Console · 5 sections · 3 cards · 1 table · 2 buttons' },
];

export function DemoBeforeAfter() {
  const [id, setId] = useState(DEMOS[0].id);
  const [after, setAfter] = useState(true);
  const d = DEMOS.find((x) => x.id === id)!;
  const sc = getScenario(id)!;
  const r = scenarioReport(id);
  const a = r.analysis;
  const fix = a.actions.find((x) => x.command);
  return (
    <div className="ba">
      <div className="ba-controls">
        <div className="segmented" role="radiogroup" aria-label="Demo">
          {DEMOS.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={id === x.id} onClick={() => setId(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
        <div className="segmented" role="radiogroup" aria-label="Before or after SafeScreen">
          <button type="button" role="radio" aria-checked={!after} onClick={() => setAfter(false)}>
            Before
          </button>
          <button type="button" role="radio" aria-checked={after} onClick={() => setAfter(true)}>
            After
          </button>
        </div>
      </div>
      <div className="ba-body">
        <div className="ba-screen">
          <ScreenPreview key={id + after} src={sc.image} alt={sc.alt} regions={r.regions} showRegions={after} width={sc.width} height={sc.height} />
        </div>
        {after ? (
          <div className="ba-result" aria-live="polite">
            <span className="chip chip-local" style={{ justifySelf: 'start' }}>
              Understood on this device
            </span>
            <h3>{a.headline}</h3>
            <p className="muted">{a.interpretation[0]}</p>
            {fix?.command ? (
              <>
                <span className="label">Suggested fix</span>
                <div className="raw">$ {fix.command}</div>
              </>
            ) : (
              <>
                <span className="label">Recommended</span>
                <p>{a.actions[0]?.text}</p>
              </>
            )}
            <Link to={`/app/live-analysis?scenario=${id}`} className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }}>
              Open in the app
            </Link>
          </div>
        ) : (
          <div className="ba-result before">
            <span className="label">What you see</span>
            <div className="raw">{d.before}</div>
            <p className="muted small">No explanation, no evidence, no next step. Switch to After.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Promise ---------- */
export const PROMISES = [
  'No automatic screenshot uploads',
  'Local-first processing',
  'User-controlled capture',
  'Excluded applications',
  'Transparent AI runtime',
  'Clear privacy controls',
];

export function PromiseList() {
  return (
    <ul className="promise-list">
      {PROMISES.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ul>
  );
}
