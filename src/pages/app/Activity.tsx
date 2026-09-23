import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { EmptyState } from '../../components/ui';
import { usePageMeta } from '../../lib/usePageMeta';
import { useStore, type ActivityKind } from '../../store/store';
import { dayLabel } from './Detections';

const KINDS: { id: 'all' | ActivityKind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'capture', label: 'Capture' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'excluded', label: 'Excluded' },
  { id: 'action', label: 'Actions' },
  { id: 'setting', label: 'Settings' },
];

export default function Activity() {
  usePageMeta('Activity', 'An audit log of every capture, analysis, privacy decision and setting change, kept on this device.');
  const events = useStore((s) => s.activity);
  const history = useStore((s) => s.settings.history);
  const [kind, setKind] = useState<(typeof KINDS)[number]['id']>('all');
  const list = kind === 'all' ? events : events.filter((e) => e.kind === kind || (kind === 'privacy' && e.kind === 'data'));

  const exportLog = () => {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `safescreen-activity-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Activity</h1>
          <p>
            An audit trail of when your screen was captured, where each frame was processed, and every privacy decision. It contains no screen content.{' '}
            {!history && 'History is off, so this log is cleared when you close the tab.'}
          </p>
        </div>
        {events.length > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportLog}>
            <Icon name="download" />
            Export log
          </button>
        )}
      </div>

      <div className="filters">
        <div className="segmented" role="radiogroup" aria-label="Filter activity">
          {KINDS.map((k) => (
            <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)}>
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {list.length === 0 ? (
          <EmptyState icon="pulse" title="No activity yet">
            Captures, analyses and privacy changes will be listed here as they happen.
          </EmptyState>
        ) : (
          <ul className="log" aria-label="Activity log">
            {list.map((e) => (
              <li key={e.id}>
                <time dateTime={new Date(e.time).toISOString()}>
                  {dayLabel(e.time) === 'Today' ? '' : `${dayLabel(e.time)} `}
                  {new Date(e.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                </time>
                <span className="kind" data-kind={e.kind}>
                  {e.kind}
                </span>
                <span>{e.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
