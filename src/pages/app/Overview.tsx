import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../../app/session';
import { Icon, type IconName } from '../../components/Icon';
import { EmptyState } from '../../components/ui';
import { SCENARIOS } from '../../demo/scenarios';
import { usePageMeta } from '../../lib/usePageMeta';
import { useRuntime } from '../../runtime/useRuntime';
import { useStore } from '../../store/store';
import { MOD } from '../../app/AppLayout';
import type { Severity } from '../../inference/types';

export const SEV_ICON: Record<Severity, IconName> = { review: 'review', attention: 'attention', info: 'info' };

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function timeOf(t: number) {
  return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function Overview() {
  usePageMeta('Overview', 'SafeScreen Edge command center: runtime, privacy and session status, and recent detections.');
  const navigate = useNavigate();
  const s = useSession();
  const { probe } = useRuntime();
  const settings = useStore((x) => x.settings);
  const detections = useStore((x) => x.detections);
  const runs = useStore((x) => x.runs);

  const issues = detections.filter((d) => d.kind === 'issue').length;
  const security = detections.filter((d) => d.kind === 'security').length;
  const ui = detections.reduce((n, d) => n + d.regions, 0);
  const localOnly = settings.localOnly || !settings.cloudFallback;
  const lastRun = runs[0];

  const runScenario = (id: string) => {
    navigate('/app/live-analysis');
    s.loadScenario(id, { analyze: true });
  };

  return (
    <div className="page">
      <div className="ov-hero">
        <div>
          <h1>{greeting()}.</h1>
          <p>Your screen is analyzed on this device. Nothing is captured until you start.</p>
        </div>
        <div className="btn-row">
          <Link to="/app/live-analysis" className="btn btn-primary">
            <Icon name="scan" />
            Open Live Analysis
          </Link>
        </div>
      </div>

      <div className="ov-cards">
        <Link to="/app/runtime" className="card stat-card">
          <span className="top">
            <span className="label">AI Runtime</span>
            <Icon name="cpu" />
          </span>
          <span className="big">
            <span className="dot" style={{ color: 'var(--local)' }} />
            Ready
          </span>
          <span className="lines">
            <span>Local inference</span>
            <span>{probe ? probe.activeLabel : 'Checking device…'}</span>
            <span className="subtle">{probe?.activeBackend === 'npu' ? 'Snapdragon NPU in use' : 'Snapdragon NPU: via Windows host'}</span>
          </span>
        </Link>
        <Link to="/app/privacy" className="card stat-card">
          <span className="top">
            <span className="label">Privacy</span>
            <Icon name="shieldCheck" />
          </span>
          <span className="big">
            <span className="dot" style={{ color: localOnly ? 'var(--local)' : 'var(--issue)' }} />
            {localOnly ? 'Protected' : 'Cloud allowed'}
          </span>
          <span className="lines">
            <span>{localOnly ? 'No cloud upload' : 'Asks before each upload'}</span>
            <span>Screenshots {settings.storeScreenshots ? 'stored as local thumbnails' : 'not stored'}</span>
            <span className="subtle">{settings.excludedApps.length} excluded app groups</span>
          </span>
        </Link>
        <div className="card stat-card">
          <span className="top">
            <span className="label">Current session</span>
            <Icon name="monitor" />
          </span>
          <span className="big">
            <span className={`dot${s.capture.active ? ' dot-live' : ''}`} style={{ color: s.capture.active ? 'var(--risk)' : 'var(--text-3)' }} />
            {s.capture.active ? 'Monitoring active' : settings.monitoringAllowed ? 'Idle' : 'Paused'}
          </span>
          <span className="lines">
            <span>{s.capture.active ? `${s.capture.surface} · ${s.capture.frames} frames` : 'Screen capture off'}</span>
            <span className="subtle">
              Start with <kbd>{MOD}</kbd> <kbd>Shift</kbd> <kbd>S</kbd>
            </span>
          </span>
        </div>
        <Link to="/app/detections" className="card stat-card">
          <span className="top">
            <span className="label">Detections</span>
            <Icon name="list" />
          </span>
          <span className="counts">
            <span>
              <strong>{issues}</strong>
              <span>Issues detected</span>
            </span>
            <span>
              <strong>{security}</strong>
              <span>Security warnings</span>
            </span>
            <span>
              <strong>{ui}</strong>
              <span>UI elements understood</span>
            </span>
          </span>
        </Link>
      </div>

      <div className="ov-split">
        <section className="card" aria-labelledby="try-title">
          <div className="card-head">
            <h2 id="try-title">Run a scenario</h2>
            <span className="chip chip-sim">Demo simulation</span>
          </div>
          <div className="card-pad">
            <div className="scenario-grid">
              {SCENARIOS.map((sc) => (
                <button key={sc.id} type="button" className="scenario-tile" onClick={() => runScenario(sc.id)}>
                  <span className="thumb">
                    <img src={sc.image} alt="" width={sc.width} height={sc.height} loading="lazy" />
                  </span>
                  <span className="body">
                    <strong>{sc.title}</strong>
                    <span>{sc.pitch}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="card" aria-labelledby="recent-title">
          <div className="card-head">
            <h2 id="recent-title">Recent detections</h2>
            {detections.length > 0 && (
              <Link to="/app/detections" className="small">
                View all
              </Link>
            )}
          </div>
          {detections.length === 0 ? (
            <EmptyState icon="list" title="No detections yet.">
              Start screen analysis to see AI insights here.
            </EmptyState>
          ) : (
            <ul className="mini-list">
              {detections.slice(0, 6).map((d) => (
                <li key={d.id}>
                  <Link to={`/app/detections#${d.id}`}>
                    <span className={`sev-icon ${d.severity}`}>
                      <Icon name={SEV_ICON[d.severity]} />
                    </span>
                    <span className="h">
                      {d.category}
                      <span className="subtle"> · {d.simulated ? 'demo' : 'live'}</span>
                    </span>
                    <span className="t">{timeOf(d.time)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {lastRun && (
            <p className="tiny subtle" style={{ padding: '10px 16px', borderTop: '1px solid var(--line)' }}>
              Last on-device run: {lastRun.totalMs} ms on {lastRun.backend}, measured in this browser.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
