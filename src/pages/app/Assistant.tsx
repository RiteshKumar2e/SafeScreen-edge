import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { Icon } from '../../components/Icon';
import { ScreenPreview } from '../../components/ScreenPreview';
import { StatusBadge } from '../../components/StatusBadge';
import { CopyCommand, EmptyState } from '../../components/ui';
import { getScenario, SCENARIOS } from '../../demo/scenarios';
import { answer, SUGGESTED_QUESTIONS, type Answer } from '../../inference/assistant';
import { usePageMeta } from '../../lib/usePageMeta';
import { getState, log, markDetection } from '../../store/store';

interface Turn {
  id: number;
  q: string;
  a: Answer;
  frameUrl: string;
}

export default function Assistant() {
  usePageMeta('Screen Assistant', 'Ask questions about what is on your screen. Answers come from the on-device analysis and point to the evidence.');
  const s = useSession();
  const [params, setParams] = useSearchParams();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [focus, setFocus] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const pending = useRef<string | null>(params.get('q'));
  const r = s.status === 'done' ? s.report : null;
  const scenario = getScenario(s.frame?.scenarioId);

  const ask = (q: string) => {
    const text = q.trim();
    if (!text || !r || !s.frame) return;
    const a = answer(text, r);
    setTurns((t) => [...t, { id: ++seq.current, q: text, a, frameUrl: s.frame!.url }]);
    setFocus(a.regions);
    setInput('');
    const d = getState().detections[0];
    if (d) markDetection(d.id, 'asked');
  };

  // Clear the conversation when the screen changes.
  useEffect(() => {
    setTurns((t) => t.filter((x) => x.frameUrl === s.frame?.url));
    setFocus([]);
  }, [s.frame?.url]);

  // A question passed in the URL (from the command palette) is asked once the screen is analyzed.
  useEffect(() => {
    if (pending.current && r) {
      ask(pending.current);
      pending.current = null;
      setParams({}, { replace: true });
    }
  });

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns.length]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Screen Assistant</h1>
          <p>Ask about what is on the screen. Answers are assembled from this screen's analysis on your device, and the areas they rely on are highlighted.</p>
        </div>
      </div>

      {!s.frame ? (
        <div className="card">
          <EmptyState
            icon="message"
            title="Load a screen to ask about it"
            actions={
              <>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => s.loadScenario('enterprise-dashboard', { analyze: true })}>
                  Try the complex dashboard
                </button>
                <Link to="/app/live-analysis" className="btn btn-secondary btn-sm">
                  Capture or upload a screen
                </Link>
              </>
            }
          >
            The assistant answers from what SafeScreen sees. It does not answer general questions, and it never sends your screen anywhere.
          </EmptyState>
        </div>
      ) : (
        <div className="as-grid">
          <section className="card stage" aria-label="Screen">
            <div className="stage-toolbar">
              <span className="title">
                <Icon name="monitor" />
                <span>{s.frame.label}</span>
              </span>
              <span className="grow" />
              {s.isSimulation && <span className="chip chip-sim">Demo simulation</span>}
              {r && <StatusBadge severity={r.analysis.severity} />}
            </div>
            <div className="stage-body">
              <ScreenPreview
                src={s.frame.url}
                alt={scenario?.alt ?? 'Screen being discussed'}
                regions={r?.regions}
                showRegions={!!r}
                active={focus}
                scanning={s.status === 'analyzing'}
                width={scenario?.width}
                height={scenario?.height}
                eager
              />
            </div>
            <div className="stage-foot" style={{ gridTemplateColumns: '1fr' }}>
              <div className="scenario-chips" role="group" aria-label="Switch screen">
                {SCENARIOS.map((sc) => (
                  <button key={sc.id} type="button" aria-pressed={s.frame?.scenarioId === sc.id} onClick={() => s.loadScenario(sc.id, { analyze: true })}>
                    {sc.shortTitle}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="card chat" aria-label="Conversation">
            <div className="card-head">
              <h2>Ask about this screen</h2>
              <span className="chip chip-local">
                <Icon name="lock" />
                On-device
              </span>
            </div>
            <div className="chat-log" ref={logRef} aria-live="polite">
              {!r && s.status !== 'analyzing' && (
                <EmptyState
                  icon="scan"
                  title="Not analyzed yet"
                  actions={
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => s.analyzeNow()}>
                      Analyze this screen
                    </button>
                  }
                >
                  The assistant needs the screen's analysis before it can answer.
                </EmptyState>
              )}
              {s.status === 'analyzing' && (
                <p className="btn-row small muted">
                  <span className="spinner" aria-hidden="true" /> Reading the screen…
                </p>
              )}
              {r && turns.length === 0 && (
                <div className="msg bot">
                  <p>
                    <strong>Screen understood.</strong> {r.analysis.headline}
                  </p>
                  <p className="small muted">Pick a question below or type your own.</p>
                </div>
              )}
              {turns.map((t) => (
                <div key={t.id} style={{ display: 'grid', gap: 8 }}>
                  <div className="msg user">{t.q}</div>
                  <div className="msg bot">
                    {t.a.paragraphs.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                    {t.a.bullets && t.a.bullets.length > 0 && (
                      <ul>
                        {t.a.bullets.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    )}
                    {t.a.command && (
                      <CopyCommand
                        command={t.a.command}
                        onCopied={() => log('action', 'Suggested command copied from the assistant. SafeScreen did not run it.')}
                      />
                    )}
                    <span className="meta">
                      Answered from this screen's analysis · no language model
                      {t.a.regions.length > 0 && (
                        <button type="button" className="btn btn-ghost btn-xs" onClick={() => setFocus(t.a.regions)}>
                          <Icon name="target" />
                          Highlight {t.a.regions.length} area{t.a.regions.length === 1 ? '' : 's'}
                        </button>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="suggest" role="group" aria-label="Suggested questions">
              {SUGGESTED_QUESTIONS.map((x) => (
                <button key={x.q} type="button" onClick={() => ask(x.q)} disabled={!r}>
                  {x.q}
                </button>
              ))}
            </div>
            <form
              className="chat-input"
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
            >
              <label htmlFor="ask" className="visually-hidden">
                Ask a question about this screen
              </label>
              <input id="ask" className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder={r ? 'e.g. What should I click?' : 'Analyze the screen first'} disabled={!r} autoComplete="off" />
              <button type="submit" className="btn btn-primary" disabled={!r || !input.trim()} aria-label="Ask">
                <Icon name="send" />
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
