import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { useApplyTheme } from '../lib/theme';
import { useOnline, useRuntime } from '../runtime/useRuntime';
import { useStore } from '../store/store';
import { CommandPalette } from './CommandPalette';
import { PresentationMode, PresentationProvider, usePresentation } from './Presentation';
import { SessionProvider, useSession } from './session';

export const APP_NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/app/overview', label: 'Overview', icon: 'grid' },
  { to: '/app/assistant', label: 'Screen Assistant', icon: 'message' },
  { to: '/app/live-analysis', label: 'Live Analysis', icon: 'scan' },
  { to: '/app/detections', label: 'Detections', icon: 'list' },
  { to: '/app/activity', label: 'Activity', icon: 'pulse' },
  { to: '/app/privacy', label: 'Privacy', icon: 'shield' },
  { to: '/app/runtime', label: 'AI Runtime', icon: 'cpu' },
  { to: '/app/settings', label: 'Settings', icon: 'settings' },
];

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl';

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const detections = useStore((s) => s.detections.length);
  const settings = useStore((s) => s.settings);
  const { probe } = useRuntime();
  const { capture } = useSession();
  const online = useOnline();
  const localOnly = settings.localOnly || !settings.cloudFallback;

  return (
    <nav className={`sidebar${open ? ' open' : ''}`} aria-label="Application">
      <div className="sb-brand">
        <Link to="/" className="brand" aria-label="SafeScreen Edge website">
          <img src="/favicon.svg" alt="" width={26} height={26} />
          <span>
            SafeScreen <em>Edge</em>
          </span>
        </Link>
        <button type="button" className="icon-btn menu-btn" onClick={onClose} aria-label="Close navigation">
          <Icon name="close" />
        </button>
      </div>
      <ul className="sb-nav">
        {APP_NAV.map((n) => (
          <li key={n.to}>
            <NavLink to={n.to} onClick={onClose}>
              <Icon name={n.icon} />
              {n.label}
              {n.to === '/app/detections' && detections > 0 && <span className="count">{detections > 99 ? '99+' : detections}</span>}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="sb-foot">
        <Link to="/app/runtime" className="sb-status" onClick={onClose}>
          <span className="row">
            <span className={`dot ${probe?.activeBackend === 'npu' ? 'ok' : 'off'}`} style={{ color: probe?.activeBackend === 'npu' ? 'var(--local)' : 'var(--text-3)' }} />
            Snapdragon AI
          </span>
          <span className="sub">{!probe ? 'Checking device…' : probe.activeBackend === 'npu' ? 'NPU active via host' : probe.snapdragonLikely ? 'Snapdragon detected · NPU via host' : 'NPU not detected'}</span>
        </Link>
        <Link to="/app/privacy" className="sb-status" onClick={onClose}>
          <span className="row">
            <span className="dot" style={{ color: localOnly ? 'var(--local)' : 'var(--issue)' }} />
            {localOnly ? 'Local processing' : 'Cloud fallback allowed'}
          </span>
          <span className="sub">{localOnly ? 'No screen upload' : 'Asks before each upload'}</span>
        </Link>
        <div className="sb-status" role="status">
          <span className="row">
            <span className={`dot${capture.active ? ' dot-live' : ''}`} style={{ color: capture.active ? 'var(--risk)' : online ? 'var(--local)' : 'var(--issue)' }} />
            {capture.active ? 'Capturing screen' : 'System status'}
          </span>
          <span className="sub">{capture.active ? `${capture.surface} · ${capture.frames} frame${capture.frames === 1 ? '' : 's'}` : online ? `Ready · ${probe?.activeLabel ?? 'CPU · WebAssembly'}` : 'Offline · local AI available'}</span>
        </div>
      </div>
    </nav>
  );
}

function Topbar({ onMenu, onPalette }: { onMenu: () => void; onPalette: () => void }) {
  const { pathname } = useLocation();
  const { capture, stopCapture, status, frame, analyzeNow, startCapture, canCapture } = useSession();
  const { start: startPresentation, active: presenting } = usePresentation();
  const current = APP_NAV.find((n) => pathname.startsWith(n.to));
  return (
    <header className="topbar">
      <button type="button" className="icon-btn menu-btn" onClick={onMenu} aria-label="Open navigation">
        <Icon name="menu" />
      </button>
      <span className="crumb">{current?.label ?? 'SafeScreen'}</span>
      <span className="spacer" />
      {capture.active && (
        <span className="capture-pill" role="status">
          <span className="dot dot-live" />
          <span className="hide-sm">Capturing · {capture.surface}</span>
          <button type="button" className="btn btn-secondary" onClick={() => stopCapture()} aria-label="Stop screen capture">
            <Icon name="stop" />
            Stop
          </button>
        </span>
      )}
      <button type="button" className="cmdk" onClick={onPalette} aria-label="Open command palette">
        <Icon name="search" />
        <span className="label-text">Search or run a command</span>
        <span className="keys" aria-hidden="true">
          <kbd>{MOD}</kbd>
          <kbd>K</kbd>
        </span>
      </button>
      {!presenting && (
        <button type="button" className="btn btn-ghost btn-sm hide-sm" onClick={startPresentation}>
          <Icon name="present" />
          Present
        </button>
      )}
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={status === 'analyzing'}
        onClick={() => (frame && !capture.active ? analyzeNow() : canCapture ? startCapture() : analyzeNow())}
        title={`Start analysis (${MOD}+Shift+S)`}
      >
        {status === 'analyzing' ? <span className="spinner" aria-hidden="true" /> : <Icon name="play" />}
        <span className="hide-sm">{status === 'analyzing' ? 'Analyzing' : capture.active ? 'Analyze frame' : 'Start analysis'}</span>
      </button>
    </header>
  );
}

function Shell() {
  useApplyTheme();
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const session = useSession();
  const online = useOnline();
  const { active: presenting } = usePresentation();
  const mainRef = useRef<HTMLElement>(null);
  const first = useRef(true);

  useEffect(() => {
    setNavOpen(false);
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  // Title shows a capture indicator while the screen is being captured.
  useEffect(() => {
    const base = document.title.replace(/^● /, '');
    document.title = session.capture.active ? `● ${base}` : base;
  }, [session.capture.active, pathname]);

  const startAnalysis = useCallback(() => {
    if (!pathname.startsWith('/app/live-analysis') && !pathname.startsWith('/app/assistant')) navigate('/app/live-analysis');
    if (session.frame && !session.capture.active) void session.analyzeNow();
    else if (session.canCapture) void session.startCapture();
  }, [pathname, navigate, session]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        startAnalysis();
      } else if (e.key === 'Escape' && !paletteOpen && !document.querySelector('[role="dialog"]')) {
        if (navOpen) setNavOpen(false);
        else if (session.capture.active || session.status === 'analyzing') session.stopAll();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [paletteOpen, navOpen, session, startAnalysis]);

  return (
    <div className={`app${presenting ? ' presenting' : ''}`}>
      <a href="#app-main" className="skip-link">
        Skip to content
      </a>
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      {navOpen && <div className="sidebar-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}
      <div className="main">
        <Topbar onMenu={() => setNavOpen(true)} onPalette={() => setPaletteOpen(true)} />
        {!online && (
          <div className="offline-bar" role="status">
            <Icon name="wifiOff" />
            <span>
              <strong>Offline.</strong> Local AI available. Cloud services unavailable.
            </span>
          </div>
        )}
        <main id="app-main" ref={mainRef} tabIndex={-1} style={{ outline: 'none' }}>
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onStartAnalysis={startAnalysis} />
      <PresentationMode />
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading">
      <div className="skeleton" style={{ height: 28, width: 220, marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 16, width: 360, marginBottom: 24 }} />
      <div className="skeleton" style={{ height: 320 }} />
    </div>
  );
}

export default function AppLayout() {
  return (
    <SessionProvider>
      <PresentationProvider>
        <Shell />
      </PresentationProvider>
    </SessionProvider>
  );
}
