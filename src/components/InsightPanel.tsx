import { useId, useState, type ReactNode } from 'react';
import type { AnalysisReport } from '../inference/types';
import { Icon } from './Icon';
import { StatusBadge } from './StatusBadge';
import { Confidence, CopyCommand } from './ui';

export const PROVIDER_LABEL: Record<AnalysisReport['providerId'], string> = {
  local: 'On-device · browser text model + local agents',
  scenario: 'Demo simulation · prepared transcript',
  'cloud-demo': 'Cloud fallback · external provider',
  native: 'On-device · SafeScreen Windows host',
};

interface Props {
  report: AnalysisReport;
  onCopied?: () => void;
  /** Compact variant for marketing previews: fewer controls, no processing block. */
  compact?: boolean;
  /** Extra buttons (e.g. "Ask about this screen"). */
  actions?: ReactNode;
  onFocusRegions?: (ids: string[]) => void;
}

/**
 * Every detection answers the same five questions: what SafeScreen sees,
 * what it means, why it matters, what to do, and how sure it is.
 */
export function InsightPanel({ report, onCopied, compact, actions, onFocusRegions }: Props) {
  const a = report.analysis;
  const [explain, setExplain] = useState(false);
  const [steps, setSteps] = useState(false);
  const explainId = useId();
  const stepsId = useId();
  const fix = a.actions.find((x) => x.command);
  const [copied, setCopied] = useState(false);

  const copyFix = async () => {
    if (!fix?.command) return;
    try {
      await navigator.clipboard.writeText(fix.command);
      setCopied(true);
      onCopied?.();
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setSteps(true);
    }
  };

  const riskIds = report.regions.filter((r) => r.tone === 'risk' || r.tone === 'issue').map((r) => r.id);

  return (
    <div className={`insight${compact ? ' compact' : ''}`}>
      <header className="insight-head">
        <div className="insight-badges">
          <StatusBadge severity={a.severity} />
          <span className="chip">{a.category}</span>
          {report.simulated && !compact && <span className="chip chip-sim">Demo simulation</span>}
        </div>
        <h2 className="insight-title">{a.headline}</h2>
      </header>

      <section className="insight-sec" aria-label="What I see">
        <h3 className="label">What I see</h3>
        <ul className="obs">
          {a.detected.slice(0, compact ? 3 : 6).map((d, i) => (
            <li key={i}>
              <span>{d.text}</span>
              {!compact && <span className="src">{d.source}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="insight-sec" aria-label="What it means">
        <h3 className="label">What it means</h3>
        {a.interpretation.slice(0, compact ? 1 : 3).map((t, i) => (
          <p key={i}>{t}</p>
        ))}
      </section>

      {!compact && (
        <section className="insight-sec" aria-label="Why it matters">
          <h3 className="label">Why it matters</h3>
          <p className={explain ? '' : 'clamp-3'}>{a.explanation}</p>
        </section>
      )}

      <section className="insight-sec rec" aria-label="Recommended action" data-present="action">
        <h3 className="label">Recommended action</h3>
        <p className="rec-main">{a.actions[0]?.text}</p>
        {fix?.command && <CopyCommand command={fix.command} onCopied={onCopied} />}
        {fix?.caution && (
          <p className="caution">
            <Icon name="review" />
            {fix.caution}
          </p>
        )}
        {!compact && <p className="tiny subtle">SafeScreen suggests commands but never runs them, submits forms or types into other apps.</p>}
      </section>

      {!compact && (
        <section className="insight-sec" aria-label="Confidence">
          <h3 className="label">Confidence</h3>
          <Confidence level={a.confidence.level} reason={`${a.confidence.reason} Rule-based level, not a calibrated probability.`} />
        </section>
      )}

      {!compact && (
        <div className="insight-actions">
          <button type="button" className="btn btn-secondary btn-sm" aria-expanded={explain} aria-controls={explainId} onClick={() => setExplain((v) => !v)}>
            <Icon name="info" />
            {explain ? 'Hide explanation' : 'Explain'}
          </button>
          {fix?.command && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={copyFix}>
              <Icon name={copied ? 'check' : 'copy'} />
              {copied ? 'Fix copied' : 'Copy fix'}
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" aria-expanded={steps} aria-controls={stepsId} onClick={() => setSteps((v) => !v)}>
            <Icon name="list" />
            {steps ? 'Hide steps' : 'Show steps'}
          </button>
          {onFocusRegions && riskIds.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onFocusRegions(riskIds)}>
              <Icon name="target" />
              Show on screen
            </button>
          )}
          {actions}
        </div>
      )}

      {explain && (
        <section className="insight-sec" id={explainId} aria-label="Detailed explanation">
          {a.terms.length > 0 && (
            <>
              <h3 className="label">Terms on this screen</h3>
              <dl className="terms">
                {a.terms.map((t) => (
                  <div key={t.term}>
                    <dt>{t.term}</dt>
                    <dd>{t.meaning}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          <h3 className="label">Evidence</h3>
          <ul className="evidence">
            {a.evidence.map((e, i) => (
              <li key={i}>
                <blockquote>{e.quote}</blockquote>
                <span>
                  {e.note}
                  {e.line ? ` · line ${e.line}` : ''}
                </span>
              </li>
            ))}
            {a.evidence.length === 0 && <li className="subtle">No quoted lines for this result.</li>}
          </ul>
        </section>
      )}

      {steps && (
        <section className="insight-sec" id={stepsId} aria-label="Steps">
          <h3 className="label">Steps</h3>
          <ol className="steps-list">
            {a.actions.map((x, i) => (
              <li key={i}>
                <span>{x.text}</span>
                {x.command && i > 0 && <CopyCommand command={x.command} onCopied={onCopied} />}
                {x.caution && i > 0 && (
                  <span className="caution">
                    <Icon name="review" />
                    {x.caution}
                  </span>
                )}
              </li>
            ))}
          </ol>
          {a.location && (
            <p className="small" style={{ marginTop: 10 }}>
              <span className="subtle">Likely location: </span>
              <code style={{ overflowWrap: 'anywhere' }}>{a.location}</code>
            </p>
          )}
          {a.keyLines && a.keyLines.length > 0 && (
            <div className="keylines">
              {a.keyLines.map((k) => (
                <div key={k.line}>
                  <span>{k.line}</span>
                  <span>{k.text}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {!compact && (
        <dl className="processing">
          <div>
            <dt>Processing</dt>
            <dd>{report.providerId === 'local' && report.ocrEngine ? `On-device · ${report.ocrEngine.label} + local agents` : PROVIDER_LABEL[report.providerId]}</dd>
          </div>
          <div>
            <dt>Screen data sent off device</dt>
            <dd className={report.leftDevice ? 'bad' : 'good'}>{report.leftDevice ? 'Yes, to the cloud fallback provider' : 'None'}</dd>
          </div>
          <div>
            <dt>Agent</dt>
            <dd>{a.agent}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{report.simulated ? 'Not measured (simulation)' : `${report.elapsedMs} ms in this browser`}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
