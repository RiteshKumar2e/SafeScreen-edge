import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useSession } from './session';

/**
 * Guided product demo for presentations. It drives the real Live Analysis
 * page with the developer-error scenario and spotlights each part in turn.
 * Everything shown is the app's actual output for that scenario.
 */

const STEP_MS = 12000;

interface Step {
  title: string;
  body: string;
  target: string;
}

const STEPS: Step[] = [
  {
    title: 'Screen captured',
    body: 'A terminal with a Python error is on screen. In this walkthrough it is a prepared demo frame, clearly labeled as a simulation; live capture uses the same pipeline.',
    target: 'screen',
  },
  {
    title: 'UI understood',
    body: 'SafeScreen locates the terminal, the error message and the code location, and draws them as labeled regions over the screen.',
    target: 'screen',
  },
  {
    title: 'Issue detected',
    body: 'The error agent recognizes a missing Python dependency from the traceback, and quotes the exact lines it relied on.',
    target: 'insight',
  },
  {
    title: 'AI explanation generated',
    body: 'Observation, interpretation and impact are kept separate, so you can see what was read from the screen and what was inferred from it.',
    target: 'insight',
  },
  {
    title: 'Recommended action',
    body: 'A specific fix, ready to copy. SafeScreen never runs commands itself: every system action stays with the user.',
    target: 'action',
  },
  {
    title: 'Local processing verified',
    body: '',
    target: 'processing',
  },
];

interface Ctx {
  active: boolean;
  start: () => void;
}

const PresentationCtx = createContext<Ctx>({ active: false, start: () => {} });
const StateCtx = createContext<{ step: number; paused: boolean; setStep: (n: number) => void; setPaused: (p: boolean) => void; stop: () => void } | null>(null);

export const usePresentation = () => useContext(PresentationCtx);

export function PresentationProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const start = useCallback(() => {
    setStep(0);
    setPaused(false);
    setActive(true);
  }, []);
  const stop = useCallback(() => setActive(false), []);
  const pub = useMemo(() => ({ active, start }), [active, start]);
  const priv = useMemo(() => (active ? { step, paused, setStep, setPaused, stop } : null), [active, step, paused, stop]);
  return (
    <PresentationCtx.Provider value={pub}>
      <StateCtx.Provider value={priv}>{children}</StateCtx.Provider>
    </PresentationCtx.Provider>
  );
}

export function PresentationMode() {
  const st = useContext(StateCtx);
  const session = useSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const barRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const step = st?.step ?? -1;

  // Drive the app for each step.
  useEffect(() => {
    if (!st) return;
    const s = sessionRef.current;
    if (step === 0) {
      if (!pathname.startsWith('/app/live-analysis')) navigate('/app/live-analysis');
      s.stopCapture();
      s.setLiveOcr(false);
      s.loadScenario('developer-error');
    } else if (step === 1 && (s.frame?.scenarioId !== 'developer-error' || s.status !== 'done')) {
      if (s.frame?.scenarioId !== 'developer-error') s.loadScenario('developer-error', { analyze: true });
      else void s.analyzeNow();
    }
  }, [step, !!st]);

  // Spotlight the target element.
  useEffect(() => {
    if (!st) return;
    const target = STEPS[step]?.target;
    const t = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-present="${target}"]`);
      if (!el) return;
      el.setAttribute('data-spotlight', 'true');
      el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }, 350);
    return () => {
      window.clearTimeout(t);
      document.querySelectorAll('[data-spotlight]').forEach((n) => n.removeAttribute('data-spotlight'));
    };
  }, [st, step, session.status]);

  // Auto-advance.
  useEffect(() => {
    if (!st || st.paused) return;
    if (step >= STEPS.length - 1) return;
    const t = window.setTimeout(() => st.setStep(step + 1), STEP_MS);
    return () => window.clearTimeout(t);
  }, [st, step]);

  useEffect(() => {
    if (!st) return;
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        st.stop();
      } else if (e.key === 'ArrowRight') st.setStep(Math.min(step + 1, STEPS.length - 1));
      else if (e.key === 'ArrowLeft') st.setStep(Math.max(step - 1, 0));
      else if (e.key === ' ' && document.activeElement === document.body) {
        e.preventDefault();
        st.setPaused(!st.paused);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [st, step]);

  useEffect(() => {
    if (st) barRef.current?.focus();
  }, [!!st]);

  if (!st) return null;
  const cur = STEPS[step];
  const r = session.report;
  const body =
    step === STEPS.length - 1
      ? r
        ? `Screen data sent off device: ${r.leftDevice ? 'yes' : 'none'}. Network requests during analysis: ${r.network.requests}${r.network.external.length ? `, external: ${r.network.external.join(', ')}` : ', none to other origins'}. OCR runs on this device; on a Snapdragon PC with the SafeScreen host, the same stage targets the NPU.`
        : 'Run the analysis to verify where processing happened.'
      : cur.body;

  return (
    <div ref={barRef} className="present-bar" role="region" aria-label="Presentation mode" aria-live="polite" tabIndex={-1}>
      <div className="present-top">
        <span className="num">{String(step + 1).padStart(2, '0')} / 06</span>
        <h2>{cur.title}</h2>
        <button type="button" className="icon-btn" onClick={() => st.setStep(Math.max(step - 1, 0))} disabled={step === 0} aria-label="Previous step">
          <Icon name="arrowLeft" />
        </button>
        <button type="button" className="icon-btn" onClick={() => st.setPaused(!st.paused)} aria-label={st.paused ? 'Resume' : 'Pause'}>
          <Icon name={st.paused ? 'play' : 'pause'} />
        </button>
        <button type="button" className="icon-btn" onClick={() => st.setStep(Math.min(step + 1, STEPS.length - 1))} disabled={step === STEPS.length - 1} aria-label="Next step">
          <Icon name="arrowRight" />
        </button>
        <button type="button" className="icon-btn" onClick={st.stop} aria-label="Exit presentation mode">
          <Icon name="close" />
        </button>
      </div>
      <p>{body}</p>
      <div className="present-steps" style={{ ['--dur' as string]: `${STEP_MS}ms` }}>
        {STEPS.map((s, i) => (
          <button
            key={s.title}
            type="button"
            data-state={i < step ? 'done' : i === step ? 'current' : 'todo'}
            data-paused={st.paused}
            onClick={() => st.setStep(i)}
            aria-label={`Step ${i + 1}: ${s.title}`}
            aria-current={i === step ? 'step' : undefined}
          >
            <span key={step} />
          </button>
        ))}
      </div>
    </div>
  );
}
