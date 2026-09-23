import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MOD } from '../../app/AppLayout';
import { Icon } from '../../components/Icon';
import { ConfirmDialog, Toggle, useToast } from '../../components/ui';
import type { ConfidenceLevel } from '../../inference/types';
import { usePageMeta } from '../../lib/usePageMeta';
import { useRuntime } from '../../runtime/useRuntime';
import { resetAll, updateSettings, useStore, type Appearance } from '../../store/store';

const SECTIONS = ['General', 'Privacy', 'AI', 'Appearance', 'About'] as const;
const VERSION = '0.2.0';

function Row({ title, desc, children, htmlFor }: { title: string; desc: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="setting-row">
      <span className="copy">
        {htmlFor ? (
          <label htmlFor={htmlFor}>
            <strong>{title}</strong>
          </label>
        ) : (
          <strong>{title}</strong>
        )}
        <span>{desc}</span>
      </span>
      <span className="control">{children}</span>
    </div>
  );
}

export default function Settings() {
  usePageMeta('Settings', 'SafeScreen Edge settings: shortcuts, notifications, privacy, AI processing, appearance and version information.');
  const s = useStore((x) => x.settings);
  const { probe } = useRuntime();
  const toast = useToast();
  const navigate = useNavigate();
  const [confirmReset, setConfirmReset] = useState(false);

  const appearance: { v: Appearance; label: string; icon: 'monitor' | 'sun' | 'moon' }[] = [
    { v: 'system', label: 'System', icon: 'monitor' },
    { v: 'light', label: 'Light', icon: 'sun' },
    { v: 'dark', label: 'Dark', icon: 'moon' },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Changes apply immediately and are saved in this browser.</p>
        </div>
      </div>
      <div className="settings-grid">
        <nav aria-label="Settings sections">
          <ul className="settings-nav">
            {SECTIONS.map((x) => (
              <li key={x}>
                <a href={`#${x.toLowerCase()}`}>{x}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="settings-sections">
          <section id="general" className="card card-pad" aria-labelledby="h-general">
            <h2 id="h-general">General</h2>
            <Row title="Launch on startup" desc="Start SafeScreen with Windows. Available in the Windows app; browsers cannot launch at startup.">
              <Toggle checked={false} disabled onChange={() => {}} label="Launch on startup" />
            </Row>
            <Row title="Keyboard shortcuts" desc="Start analysis, stop, and open the command palette from anywhere in the app.">
              <span className="small" style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
                <span>
                  <kbd>{MOD}</kbd> <kbd>Shift</kbd> <kbd>S</kbd> <span className="subtle">Start</span>
                </span>
                <span>
                  <kbd>Esc</kbd> <span className="subtle">Stop</span>
                </span>
                <span>
                  <kbd>{MOD}</kbd> <kbd>K</kbd> <span className="subtle">Commands</span>
                </span>
              </span>
            </Row>
            <Row title="Notifications" desc="Show an alert when live monitoring detects a potential security risk.">
              <Toggle checked={s.notifications} onChange={(v) => updateSettings({ notifications: v }, `Risk notifications turned ${v ? 'on' : 'off'}.`)} label="Notifications" />
            </Row>
          </section>

          <section id="privacy" className="card card-pad" aria-labelledby="h-privacy">
            <h2 id="h-privacy">Privacy</h2>
            <Row title="Local-only mode" desc="Analysis never leaves this device.">
              <Toggle checked={s.localOnly} onChange={(v) => updateSettings({ localOnly: v }, `Local-only processing turned ${v ? 'on' : 'off'}.`)} label="Local-only mode" />
            </Row>
            <Row title="Screen capture permissions" desc="Your browser asks each time capture starts. SafeScreen can only see the source you choose.">
              <Toggle checked={s.monitoringAllowed} onChange={(v) => updateSettings({ monitoringAllowed: v }, `Screen monitoring turned ${v ? 'on' : 'off'}.`)} label="Allow screen monitoring" />
            </Row>
            <Row title="Excluded applications" desc={`${s.excludedApps.length} group${s.excludedApps.length === 1 ? '' : 's'}: ${s.excludedApps.map((a) => a.name).join(', ') || 'none'}.`}>
              <Link to="/app/privacy" className="btn btn-secondary btn-sm">
                Manage
              </Link>
            </Row>
            <Row title="Data retention" desc={s.history ? `History kept for ${s.retention === 'session' ? 'this session only' : s.retention === '24h' ? '24 hours' : s.retention === '7d' ? '7 days' : '30 days'}.` : 'History is off.'}>
              <Link to="/app/privacy" className="btn btn-secondary btn-sm">
                Change
              </Link>
            </Row>
          </section>

          <section id="ai" className="card card-pad" aria-labelledby="h-ai">
            <h2 id="h-ai">AI</h2>
            <Row title="Model" desc="OCR model used for on-device text recognition.">
              <span className="small">{probe?.host?.models[0]?.name ?? 'Tesseract 5 LSTM (eng, best_int)'}</span>
            </Row>
            <Row title="Inference mode" desc="Local is always tried first. Cloud fallback, if allowed, asks before each upload.">
              <span className={`chip ${s.localOnly || !s.cloudFallback ? 'chip-local' : 'chip-issue'}`}>{s.localOnly || !s.cloudFallback ? 'Local only' : 'Local, cloud fallback on approval'}</span>
            </Row>
            <Row title="Processing backend" desc="Chosen automatically from what this device supports. See AI Runtime for details.">
              <Link to="/app/runtime" className="btn btn-secondary btn-sm">
                {probe?.activeLabel ?? 'CPU · WebAssembly'}
                <Icon name="chevronRight" />
              </Link>
            </Row>
            <Row title="Confidence threshold" desc="Results below this level are shown but not added to Detections." htmlFor="threshold">
              <select
                id="threshold"
                className="select"
                style={{ width: 150 }}
                value={s.confidenceThreshold}
                onChange={(e) => updateSettings({ confidenceThreshold: e.target.value as ConfidenceLevel }, `Confidence threshold set to ${e.target.value}.`)}
              >
                <option value="Low">Low (all)</option>
                <option value="Medium">Medium and up</option>
                <option value="High">High only</option>
              </select>
            </Row>
            <Row title="Auto-analyze while capturing" desc="Analyze a new frame on a timer. Frames that have not changed are skipped." htmlFor="auto-s">
              <select
                id="auto-s"
                className="select"
                style={{ width: 150 }}
                value={s.autoAnalyzeSeconds}
                onChange={(e) => updateSettings({ autoAnalyzeSeconds: Number(e.target.value) as 0 | 10 | 30 | 60 }, `Auto-analyze set to ${e.target.value === '0' ? 'off' : `every ${e.target.value} s`}.`)}
              >
                <option value={0}>Off</option>
                <option value={10}>Every 10 s</option>
                <option value={30}>Every 30 s</option>
                <option value={60}>Every 60 s</option>
              </select>
            </Row>
          </section>

          <section id="appearance" className="card card-pad" aria-labelledby="h-appearance">
            <h2 id="h-appearance">Appearance</h2>
            <Row title="Theme" desc="Light is the default. System follows your operating system.">
              <div className="segmented" role="radiogroup" aria-label="Theme">
                {appearance.map((a) => (
                  <button key={a.v} type="button" role="radio" aria-checked={s.appearance === a.v || (s.appearance === 'auto' && a.v === 'light')} onClick={() => updateSettings({ appearance: a.v })}>
                    <Icon name={a.icon} />
                    {a.label}
                  </button>
                ))}
              </div>
            </Row>
            <Row title="Reduce motion" desc="Turn off scanning and region animations. SafeScreen also follows your system setting.">
              <Toggle checked={s.reducedMotion} onChange={(v) => updateSettings({ reducedMotion: v })} label="Reduce motion" />
            </Row>
          </section>

          <section id="about" className="card card-pad" aria-labelledby="h-about">
            <h2 id="h-about">About</h2>
            <dl className="about-list">
              <dt>Version</dt>
              <dd>
                SafeScreen Edge {VERSION} · browser build
              </dd>
              <dt>Runtime</dt>
              <dd>{probe?.host ? `Windows host ${probe.host.version}, ONNX Runtime` : 'Tesseract.js 7 (WebAssembly) and local agents'}</dd>
              <dt>Model information</dt>
              <dd>Tesseract 5 LSTM, English, integer-quantized weights (tessdata best_int), served from this site</dd>
              <dt>Hardware information</dt>
              <dd>{probe ? probe.probes.filter((p) => ['cpu', 'cores', 'webgpu'].includes(p.id)).map((p) => `${p.label}: ${p.value}`).join(' · ') : 'Checking…'}</dd>
              <dt>Legal</dt>
              <dd>
                <Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link>
              </dd>
            </dl>
            <div className="btn-row" style={{ marginTop: 18 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmReset(true)}>
                <Icon name="refresh" />
                Reset all settings and data
              </button>
            </div>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Reset SafeScreen?"
        body="Restores default settings and deletes all local history, activity and thumbnails from this browser."
        confirmLabel="Reset"
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          resetAll();
          setConfirmReset(false);
          toast({ tone: 'success', title: 'SafeScreen was reset', body: 'Default settings restored.' });
          navigate('/app/overview');
        }}
      />
    </div>
  );
}
