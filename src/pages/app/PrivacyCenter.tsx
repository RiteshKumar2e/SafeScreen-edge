import { useState } from 'react';
import { useSession } from '../../app/session';
import { Icon } from '../../components/Icon';
import { ConfirmDialog, Toggle, useToast } from '../../components/ui';
import { cloudConfigured, cloudOrigin } from '../../inference/providers';
import { usePageMeta } from '../../lib/usePageMeta';
import { clearHistory, storedBytes, updateSettings, useStore, type Retention } from '../../store/store';

const RETENTION: { v: Retention; label: string }[] = [
  { v: 'session', label: 'This session only' },
  { v: '24h', label: '24 hours' },
  { v: '7d', label: '7 days' },
  { v: '30d', label: '30 days' },
];

export default function PrivacyCenter() {
  usePageMeta('Privacy Center', 'Control screen capture, local-only processing, cloud fallback, excluded apps and data retention.');
  const s = useStore((x) => x.settings);
  const detections = useStore((x) => x.detections);
  const activity = useStore((x) => x.activity);
  const session = useSession();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [name, setName] = useState('');
  const [match, setMatch] = useState('');
  const thumbs = detections.filter((d) => d.thumbnail).length;
  const local = s.localOnly || !s.cloudFallback;

  const addApp = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const m = match
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (!n) return;
    updateSettings({ excludedApps: [...s.excludedApps, { id: crypto.randomUUID(), name: n, match: m.length ? m : [n] }] }, `Excluded application added: ${n}.`);
    setName('');
    setMatch('');
    toast({ tone: 'success', title: 'Exclusion added', body: `SafeScreen will discard frames that show ${n}.` });
  };

  const rows: { key: keyof typeof s; title: string; desc: string; disabled?: boolean; note?: string }[] = [
    { key: 'localOnly', title: 'Local-only processing', desc: 'All analysis runs on this device. Cloud fallback is blocked while this is on.' },
    { key: 'monitoringAllowed', title: 'Screen monitoring', desc: 'Allow SafeScreen to capture a screen you choose. Turning it off stops any active capture.' },
    {
      key: 'cloudFallback',
      title: 'Cloud fallback',
      desc: 'If local analysis fails, offer to send that one frame to an external provider. You approve every upload.',
      disabled: s.localOnly || !cloudConfigured,
      note: !cloudConfigured ? 'No cloud provider is configured in this build.' : s.localOnly ? 'Turn off local-only processing first.' : undefined,
    },
    { key: 'storeScreenshots', title: 'Store screenshots', desc: 'Keep a small thumbnail with each detection, in this browser only. Full frames are never stored.' },
    { key: 'history', title: 'Analysis history', desc: 'Keep detections, activity and run times on this device. Turning it off deletes them.' },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Your screen. Your control.</h1>
          <p>What SafeScreen may capture, where it is processed, and what is kept. Defaults favor privacy.</p>
        </div>
      </div>

      <div className="pv-hero">
        <section className="card pv-status" aria-labelledby="pv-status">
          <span className={`headline${local ? '' : ' cloud'}`}>
            <span className={`dot${session.capture.active ? ' dot-live' : ''}`} />
            {local ? 'LOCAL PROCESSING' : 'LOCAL FIRST · CLOUD FALLBACK ALLOWED'}
          </span>
          <h2 id="pv-status">{local ? 'Your screen is analyzed on this device.' : 'Your screen is analyzed on this device unless you approve an upload.'}</h2>
          <ul className="checks">
            <li className="yes">
              <Icon name="check" />
              No screenshot uploaded
            </li>
            <li className={local ? 'yes' : 'no'}>
              <Icon name={local ? 'check' : 'attention'} />
              {local ? 'No cloud inference' : 'Cloud inference only with per-frame approval'}
            </li>
            <li className="yes">
              <Icon name="check" />
              This page may only connect to its own origin{cloudOrigin ? ` and ${cloudOrigin}` : ''} (enforced by Content Security Policy)
            </li>
            <li className={session.capture.active ? 'no' : 'yes'}>
              <Icon name={session.capture.active ? 'capture' : 'check'} />
              Capture: {session.capture.active ? `Active · ${session.capture.surface}` : s.monitoringAllowed ? 'Off until you start it' : 'Paused'}
            </li>
          </ul>
          {session.capture.active && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => session.stopCapture()} style={{ justifySelf: 'start' }}>
              <Icon name="stop" />
              Stop capture now
            </button>
          )}
        </section>

        <section className="card pv-flow" aria-labelledby="pv-flow">
          <h2 id="pv-flow" className="label" style={{ marginBottom: 12 }}>
            How a frame is handled
          </h2>
          <ol className="vflow">
            <li>
              <span>
                <strong>Capture</strong>
                <small>Only the source you pick, only while you allow it</small>
              </span>
            </li>
            <li>
              <span>
                <strong>Temporary frame buffer</strong>
                <small>In memory. Discarded when the next frame arrives</small>
              </span>
            </li>
            <li>
              <span>
                <strong>Local preprocessing</strong>
                <small>Excluded apps are detected and dropped here</small>
              </span>
            </li>
            <li>
              <span>
                <strong>Local inference</strong>
                <small>OCR, UI understanding and agents on this device</small>
              </span>
            </li>
            <li>
              <span>
                <strong>Local result</strong>
                <small>Secrets such as keys and card numbers are masked</small>
              </span>
            </li>
            <li>
              <span>
                <strong>Optional local history</strong>
                <small>{s.history ? 'On · text results only' : 'Off'}</small>
              </span>
              <span className={`chip ${s.history ? 'chip-accent' : ''}`}>{s.history ? 'On' : 'Off'}</span>
            </li>
          </ol>
          <p className="stop">
            <Icon name="cloudOff" />
            No automatic upload at any step.
          </p>
        </section>
      </div>

      <div className="pv-grid">
        <section className="card card-pad" aria-labelledby="controls">
          <h2 id="controls" style={{ fontSize: 16, marginBottom: 4 }}>
            Controls
          </h2>
          {rows.map((r) => (
            <div className="setting-row" key={r.key}>
              <span className="copy">
                <strong id={`l-${r.key}`}>{r.title}</strong>
                <span>{r.desc}</span>
                {r.note && <span className="subtle">{r.note}</span>}
              </span>
              <span className="control">
                <span className="small subtle" aria-hidden="true">
                  {s[r.key] ? 'On' : 'Off'}
                </span>
                <Toggle
                  checked={!!s[r.key]}
                  disabled={r.disabled}
                  label={r.title}
                  onChange={(v) => updateSettings({ [r.key]: v } as Partial<typeof s>, `${r.title} turned ${v ? 'on' : 'off'}.`)}
                />
              </span>
            </div>
          ))}
          <div className="setting-row">
            <span className="copy">
              <strong>Data retention</strong>
              <span>How long local history is kept before it is deleted automatically.</span>
            </span>
            <span className="control">
              <label htmlFor="retention" className="visually-hidden">
                Data retention
              </label>
              <select
                id="retention"
                className="select"
                style={{ width: 170 }}
                value={s.retention}
                disabled={!s.history}
                onChange={(e) => updateSettings({ retention: e.target.value as Retention }, `Data retention set to ${RETENTION.find((x) => x.v === e.target.value)?.label.toLowerCase()}.`)}
              >
                {RETENTION.map((r) => (
                  <option key={r.v} value={r.v}>
                    {r.label}
                  </option>
                ))}
              </select>
            </span>
          </div>
        </section>

        <section className="card card-pad" aria-labelledby="excluded">
          <h2 id="excluded" style={{ fontSize: 16, marginBottom: 4 }}>
            Excluded applications
          </h2>
          <p className="small muted" style={{ marginBottom: 8 }}>
            SafeScreen never inspects these. A capture source whose title matches is refused, and a frame showing a matching name is discarded before analysis. In the browser build matching uses
            window titles and on-screen names; the Windows host matches by process.
          </p>
          <ul className="excluded-list">
            {s.excludedApps.map((app) => (
              <li key={app.id}>
                <span>
                  <strong style={{ fontSize: 14 }}>{app.name}</strong>
                  <span className="match" style={{ display: 'block' }}>
                    Matches: {app.match.join(', ')}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => updateSettings({ excludedApps: s.excludedApps.filter((x) => x.id !== app.id) }, `Excluded application removed: ${app.name}.`)}
                  aria-label={`Remove ${app.name}`}
                >
                  <Icon name="trash" />
                  Remove
                </button>
              </li>
            ))}
            {s.excludedApps.length === 0 && <li className="small subtle">No excluded applications.</li>}
          </ul>
          <form className="add-app" onSubmit={addApp}>
            <label className="field">
              <span>Application</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Private workspace" required />
            </label>
            <label className="field">
              <span>Window titles or names (comma-separated)</span>
              <input className="input" value={match} onChange={(e) => setMatch(e.target.value)} placeholder="e.g. Personal Notes, Journal" />
            </label>
            <button type="submit" className="btn btn-secondary" disabled={!name.trim()}>
              <Icon name="plus" />
              Add
            </button>
          </form>
        </section>
      </div>

      <section className="card card-pad" aria-labelledby="stored" style={{ marginTop: 16 }}>
        <div className="btn-row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h2 id="stored" style={{ fontSize: 16 }}>
              What is stored right now
            </h2>
            <p className="small muted">Everything below lives in this browser's storage on this device.</p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirm(true)} disabled={!detections.length && !activity.length}>
            <Icon name="trash" />
            Clear local history
          </button>
        </div>
        <div className="inventory">
          <div>
            <strong>{detections.length}</strong>
            <span>Detections</span>
          </div>
          <div>
            <strong>{activity.length}</strong>
            <span>Activity events</span>
          </div>
          <div>
            <strong>{thumbs}</strong>
            <span>Screenshot thumbnails</span>
          </div>
          <div>
            <strong>{(storedBytes() / 1024).toFixed(1)} KB</strong>
            <span>Total in browser storage</span>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={confirm}
        title="Clear local history?"
        body="Deletes all detections, thumbnails, activity and run times stored in this browser. Settings are kept."
        confirmLabel="Clear history"
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          clearHistory();
          setConfirm(false);
          toast({ tone: 'success', title: 'Local history cleared' });
        }}
      />
    </div>
  );
}
