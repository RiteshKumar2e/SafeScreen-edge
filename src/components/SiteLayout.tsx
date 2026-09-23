import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useApplyTheme } from '../lib/theme';
import { GITHUB_URL } from '../lib/config';
import { updateSettings, useStore, type Appearance } from '../store/store';
import { Icon } from './Icon';

const NAV = [
  { to: '/product', label: 'Product' },
  { to: '/#how-it-works', label: 'How It Works' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/technology', label: 'Technology' },
  { to: '/use-cases', label: 'Use Cases' },
];

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="SafeScreen Edge home">
      <img src="/favicon.svg" alt="" width={26} height={26} />
      <span>
        SafeScreen <em>Edge</em>
      </span>
    </Link>
  );
}

function ThemeSwitch() {
  const pref = useStore((s) => s.settings.appearance);
  const opts: { v: Appearance; icon: 'monitor' | 'sun' | 'moon'; label: string }[] = [
    { v: 'system', icon: 'monitor', label: 'System theme' },
    { v: 'light', icon: 'sun', label: 'Light theme' },
    { v: 'dark', icon: 'moon', label: 'Dark theme' },
  ];
  return (
    <div className="theme-switch" role="radiogroup" aria-label="Theme">
      {opts.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={pref === o.v || (pref === 'auto' && o.v === 'light')} aria-label={o.label} title={o.label} onClick={() => updateSettings({ appearance: o.v })}>
          <Icon name={o.icon} />
        </button>
      ))}
    </div>
  );
}

export function SiteLayout() {
  useApplyTheme();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const first = useRef(true);

  useEffect(() => {
    setOpen(false);
    if (first.current) {
      first.current = false;
      if (location.hash) requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView());
      return;
    }
    if (location.hash) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView();
    } else {
      window.scrollTo(0, 0);
      mainRef.current?.focus({ preventScroll: true });
    }
  }, [location.pathname, location.hash]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const isActive = (to: string) => (to.includes('#') ? false : location.pathname.startsWith(to));

  return (
    <div className="site">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className={`site-header${scrolled || open ? ' scrolled' : ''}`}>
        <div className="container">
          <Brand />
          <nav className="nav-desktop" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={() => (isActive(n.to) ? 'active' : '')}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="header-right">
            <span className="sd-badge">
              Built for Snapdragon AI
            </span>
            <Link to="/app/live-analysis" className="btn btn-primary btn-sm launch">
              Launch Demo
            </Link>
            <button
              ref={toggleRef}
              type="button"
              className="btn btn-secondary btn-sm menu-toggle"
              aria-expanded={open}
              aria-controls="mobile-nav"
              onClick={() => setOpen((o) => !o)}
            >
              <Icon name={open ? 'close' : 'menu'} />
              {open ? 'Close' : 'Menu'}
            </button>
          </div>
        </div>
        <nav id="mobile-nav" className={`nav-mobile${open ? ' open' : ''}`} aria-label="Main">
          <ul>
            <li>
              <NavLink to="/" end>
                Home
              </NavLink>
            </li>
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink to={n.to} className={() => (isActive(n.to) ? 'active' : '')}>
                  {n.label}
                </NavLink>
              </li>
            ))}
            <li>
              <NavLink to="/about">About</NavLink>
            </li>
            <li>
              <Link to="/app/live-analysis" className="btn btn-primary">
                Launch Demo
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      <main id="main" ref={mainRef} tabIndex={-1} style={{ outline: 'none' }}>
        <Suspense fallback={<div style={{ minHeight: '70vh' }} aria-busy="true" />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="site-footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <Brand />
              <p>Private visual intelligence for the edge.</p>
              <p className="small subtle" style={{ marginTop: 16 }}>
                <span className="sd-badge" style={{ display: 'inline-flex' }}>
                  Built for Snapdragon AI
                </span>
              </p>
            </div>
            <nav aria-label="Product">
              <h2>Product</h2>
              <ul>
                <li>
                  <Link to="/product">Product</Link>
                </li>
                <li>
                  <Link to="/use-cases">Use cases</Link>
                </li>
                <li>
                  <Link to="/app/live-analysis">Launch demo</Link>
                </li>
              </ul>
            </nav>
            <nav aria-label="Technology">
              <h2>Technology</h2>
              <ul>
                <li>
                  <Link to="/technology">Technology</Link>
                </li>
                <li>
                  <Link to="/technology#documentation">Documentation</Link>
                </li>
                {GITHUB_URL && (
                  <li>
                    <a href={GITHUB_URL} rel="noopener noreferrer">
                      GitHub
                    </a>
                  </li>
                )}
              </ul>
            </nav>
            <nav aria-label="Company">
              <h2>Company</h2>
              <ul>
                <li>
                  <Link to="/privacy">Privacy</Link>
                </li>
                <li>
                  <Link to="/about">About</Link>
                </li>
                <li>
                  <Link to="/about#contact">Contact</Link>
                </li>
                <li>
                  <Link to="/terms">Terms</Link>
                </li>
              </ul>
            </nav>
          </div>
          <div className="footer-bottom">
            <span>AI analysis is advisory. Verify important security decisions independently.</span>
            <ThemeSwitch />
          </div>
        </div>
      </footer>
    </div>
  );
}
