import { useEffect, useState } from 'react';
import { probeRuntime, type RuntimeProbe } from './probe';

let last: RuntimeProbe | null = null;

/** Runtime probe results, re-probed on demand. */
export function useRuntime() {
  const [probe, setProbe] = useState<RuntimeProbe | null>(last);
  const [loading, setLoading] = useState(!last);
  useEffect(() => {
    let live = true;
    if (!last) {
      probeRuntime().then((p) => {
        last = p;
        if (live) {
          setProbe(p);
          setLoading(false);
        }
      });
    }
    return () => {
      live = false;
    };
  }, []);
  const refresh = async () => {
    setLoading(true);
    const p = await probeRuntime(true);
    last = p;
    setProbe(p);
    setLoading(false);
  };
  return { probe, loading, refresh };
}

export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
