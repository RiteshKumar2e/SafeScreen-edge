import type { Backend, StageId, StageUpdate } from '../inference/types';

export const STAGES: { id: StageId; label: string }[] = [
  { id: 'preprocess', label: 'Frame preprocessing' },
  { id: 'ocr', label: 'Text recognition (OCR)' },
  { id: 'vision', label: 'UI element detection' },
  { id: 'context', label: 'Screen context' },
  { id: 'agents', label: 'Local reasoning agents' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'explain', label: 'Response and regions' },
];

const STATUS_TEXT = { pending: 'Pending', running: 'In progress', done: 'Done', skipped: 'Skipped', error: 'Failed' } as const;

/** Stage-by-stage trace with measured times and the backend each stage ran on. */
export function Pipeline({
  stages,
  timings,
  backends,
}: {
  stages: Partial<Record<StageId, StageUpdate>>;
  timings?: Partial<Record<StageId, number>>;
  backends?: Partial<Record<StageId, Backend>>;
}) {
  return (
    <ol className="trace">
      {STAGES.map(({ id, label }) => {
        const s = stages[id];
        const status = s?.status ?? 'pending';
        const t = timings?.[id];
        const b = backends?.[id];
        return (
          <li key={id} data-status={status}>
            <span className="t-dot" aria-hidden="true" />
            <span>
              <span className="t-name">{label}</span>
              <span className="visually-hidden">: {STATUS_TEXT[status]}</span>
              {s?.detail && <span className="t-detail">{s.detail}</span>}
              {status === 'running' && typeof s?.progress === 'number' && (
                <span className="progress" aria-hidden="true">
                  <span style={{ width: `${Math.round(s.progress * 100)}%` }} />
                </span>
              )}
            </span>
            <span className="t-meta">
              {typeof t === 'number' && status === 'done' && b !== 'Prepared data' ? `${t < 1 ? '<1' : Math.round(t)} ms` : ''}
              {b && (
                <>
                  <br />
                  {b}
                </>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
