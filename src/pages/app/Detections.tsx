import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { PROVIDER_LABEL } from '../../components/InsightPanel';
import { StatusBadge } from '../../components/StatusBadge';
import { Confidence, ConfirmDialog, EmptyState } from '../../components/ui';
import { usePageMeta } from '../../lib/usePageMeta';
import { clearHistory, markDetection, useStore, type Detection, type DetectionKind, type UserAction } from '../../store/store';
import { timeOf } from './Overview';

const FILTERS: { id: 'all' | DetectionKind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'issue', label: 'Issues' },
  { id: 'security', label: 'Security' },
  { id: 'ui', label: 'UI' },
  { id: 'info', label: 'Other' },
];

const KIND_TITLE: Record<DetectionKind, string> = {
  issue: 'Problem detected',
  security: 'Potential risk detected',
  ui: 'UI structure understood',
  info: 'Screen read',
};

const ACTION_LABEL: Record<UserAction, string> = {
  'copied-fix': 'Copied the suggested command',
  reviewed: 'Marked as reviewed',
  dismissed: 'Dismissed',
  asked: 'Asked the assistant about it',
};

export function dayLabel(t: number) {
  const d = new Date(t);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function Item({ d, open, onToggle }: { d: Detection; open: boolean; onToggle: () => void }) {
  const id = `det-${d.id}`;
  return (
    <li className="tl-item" id={d.id}>
      <span className="tl-time">{timeOf(d.time)}</span>
      <span className="tl-rail" aria-hidden="true">
        <span className={`node ${d.severity}`} />
      </span>
      <div className="card tl-card" data-open={open}>
        <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle}>
          <span className="tl-title">
            <strong>{KIND_TITLE[d.kind]}</strong>
            <span>
              {d.category} · {d.headline}
            </span>
          </span>
          <span className="btn-row" style={{ gap: 8 }}>
            {d.simulated && <span className="chip chip-sim">Demo</span>}
            {d.userActions.includes('dismissed') && <span className="chip">Dismissed</span>}
            <Icon name="chevronDown" />
          </span>
        </button>
        {open && (
          <div className="tl-detail" id={id}>
            <div>
              <h4>Timestamp</h4>
              <p>{new Date(d.time).toLocaleString()}</p>
            </div>
            <div>
              <h4>Detection type</h4>
              <p style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <StatusBadge severity={d.severity} />
                {d.category}
              </p>
            </div>
            <div className="full">
              <h4>Evidence</h4>
              {d.evidence.length ? (
                <ul className="evidence" style={{ paddingLeft: 0 }}>
                  {d.evidence.map((e, i) => (
                    <li key={i}>
                      <blockquote>{e.quote}</blockquote>
                      <span>{e.note}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul>
                  {d.detected.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4>Confidence</h4>
              <Confidence level={d.confidence.level} reason={d.confidence.reason} />
            </div>
            <div>
              <h4>Recommended action</h4>
              <ul>
                {d.actions.slice(0, 3).map((a, i) => (
                  <li key={i}>
                    {a.text}
                    {a.command && (
                      <>
                        {' '}
                        <code>{a.command}</code>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Processing mode</h4>
              <p>{PROVIDER_LABEL[d.providerId]}</p>
              <p className="small subtle">{d.leftDevice ? 'Frame sent to cloud fallback with your approval.' : 'Nothing left this device.'}</p>
            </div>
            <div>
              <h4>User action</h4>
              {d.userActions.length ? (
                <ul>
                  {d.userActions.map((a) => (
                    <li key={a}>{ACTION_LABEL[a]}</li>
                  ))}
                </ul>
              ) : (
                <p className="subtle">None yet</p>
              )}
            </div>
            {d.thumbnail && (
              <div className="full">
                <h4>Stored thumbnail (this browser only)</h4>
                <img className="thumb" src={d.thumbnail} alt={`Thumbnail of the screen for: ${d.headline}`} />
              </div>
            )}
            <div className="full btn-row">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => markDetection(d.id, 'reviewed')} disabled={d.userActions.includes('reviewed')}>
                <Icon name="check" />
                {d.userActions.includes('reviewed') ? 'Reviewed' : 'Mark reviewed'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => markDetection(d.id, 'dismissed')} disabled={d.userActions.includes('dismissed')}>
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

export default function Detections() {
  usePageMeta('Detections', 'A local timeline of what SafeScreen detected, with evidence, confidence and the action taken.');
  const detections = useStore((s) => s.detections);
  const history = useStore((s) => s.settings.history);
  const retention = useStore((s) => s.settings.retention);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const { hash } = useLocation();
  const [open, setOpen] = useState<string | null>(hash ? hash.slice(1) : null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'center' });
  }, [hash]);

  const list = filter === 'all' ? detections : detections.filter((d) => d.kind === filter);
  const groups: { day: string; items: Detection[] }[] = [];
  for (const d of list) {
    const day = dayLabel(d.time);
    const g = groups[groups.length - 1];
    if (g?.day === day) g.items.push(d);
    else groups.push({ day, items: [d] });
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Detections</h1>
          <p>
            Everything SafeScreen flagged, newest first. {history ? (retention === 'session' ? 'Kept for this session only.' : `Stored in this browser for ${retention === '24h' ? '24 hours' : retention === '7d' ? '7 days' : '30 days'}.`) : 'History is off, so detections are kept in memory until you close the tab.'}
          </p>
        </div>
        {detections.length > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirm(true)}>
            <Icon name="trash" />
            Clear history
          </button>
        )}
      </div>

      <div className="filters">
        <div className="segmented" role="radiogroup" aria-label="Filter detections">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
              <span className="subtle">{f.id === 'all' ? detections.length : detections.filter((d) => d.kind === f.id).length}</span>
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="list"
            title="No detections yet."
            actions={
              <Link to="/app/live-analysis" className="btn btn-primary btn-sm">
                Open Live Analysis
              </Link>
            }
          >
            {detections.length ? 'Nothing matches this filter.' : 'Start screen analysis to see AI insights here.'}
          </EmptyState>
        </div>
      ) : (
        <ol className="timeline" aria-label="Detections timeline">
          {groups.map((g) => (
            <li key={g.day}>
              <h2 className="label tl-day">{g.day}</h2>
              <ol className="timeline">
                {g.items.map((d) => (
                  <Item key={d.id} d={d} open={open === d.id} onToggle={() => setOpen((o) => (o === d.id ? null : d.id))} />
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}

      <ConfirmDialog
        open={confirm}
        title="Clear local history?"
        body="This deletes all detections, activity and run times stored in this browser. It cannot be undone."
        confirmLabel="Clear history"
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          clearHistory();
          setConfirm(false);
        }}
      />
    </div>
  );
}
