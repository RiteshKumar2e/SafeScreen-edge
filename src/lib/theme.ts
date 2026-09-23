import { useEffect, useState } from 'react';
import { useStore, type Appearance } from '../store/store';

/**
 * Light is the default everywhere ("auto" is kept for settings saved by
 * earlier versions). "system" follows the OS. Keep in sync with
 * public/theme-init.js.
 */
export function resolveTheme(pref: Appearance, systemDark: boolean): 'light' | 'dark' {
  if (pref === 'dark') return 'dark';
  if (pref === 'system') return systemDark ? 'dark' : 'light';
  return 'light';
}

function useSystemDark() {
  const [dark, setDark] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return dark;
}

export function useApplyTheme() {
  const pref = useStore((s) => s.settings.appearance);
  const reduced = useStore((s) => s.settings.reducedMotion);
  const systemDark = useSystemDark();
  const theme = resolveTheme(pref, systemDark);
  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute('data-theme', theme);
    if (reduced) el.setAttribute('data-motion', 'reduced');
    else el.removeAttribute('data-motion');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b0d10' : '#f7f6f2');
  }, [theme, reduced]);
  return theme;
}
