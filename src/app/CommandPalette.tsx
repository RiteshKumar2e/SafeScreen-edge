import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { Modal } from '../components/ui';
import { SCENARIOS } from '../demo/scenarios';
import { getState, updateSettings } from '../store/store';
import { APP_NAV, MOD } from './AppLayout';
import { usePresentation } from './Presentation';
import { useSession } from './session';

interface Command {
  id: string;
  group: 'Actions' | 'Demo scenarios' | 'Go to' | 'Preferences';
  label: string;
  icon: IconName;
  keys?: string[];
  keywords?: string;
  run: () => void;
}

export function CommandPalette({ open, onClose, onStartAnalysis }: { open: boolean; onClose: () => void; onStartAnalysis: () => void }) {
  const navigate = useNavigate();
  const session = useSession();
  const { start: startPresentation } = usePresentation();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const s = getState().settings;
    const go = (to: string) => () => navigate(to);
    return [
      { id: 'start', group: 'Actions', label: 'Start analysis', icon: 'play', keys: [MOD, 'Shift', 'S'], keywords: 'capture analyze scan', run: onStartAnalysis },
      { id: 'stop', group: 'Actions', label: 'Stop analysis', icon: 'stop', keys: ['Esc'], keywords: 'cancel end capture', run: () => session.stopAll() },
      {
        id: 'explain',
        group: 'Actions',
        label: 'Explain screen',
        icon: 'message',
        keywords: 'assistant ask question summarize',
        run: () => navigate('/app/assistant?q=' + encodeURIComponent('Summarize this page.')),
      },
      {
        id: 'risks',
        group: 'Actions',
        label: 'Detect risks',
        icon: 'shieldCheck',
        keywords: 'security warning phishing',
        run: () => navigate('/app/assistant?q=' + encodeURIComponent('Find the warning.')),
      },
      { id: 'present', group: 'Actions', label: 'Start presentation mode', icon: 'present', keywords: 'demo judge guided tour', run: startPresentation },
      ...SCENARIOS.map<Command>((sc) => ({
        id: `sc-${sc.id}`,
        group: 'Demo scenarios',
        label: `Load demo: ${sc.title}`,
        icon: 'image',
        keywords: `${sc.audience} simulation`,
        run: () => {
          navigate('/app/live-analysis');
          session.loadScenario(sc.id, { analyze: true });
        },
      })),
      { id: 'privacy', group: 'Go to', label: 'Open Privacy Center', icon: 'shield', keywords: 'exclusions retention', run: go('/app/privacy') },
      { id: 'settings', group: 'Go to', label: 'Open settings', icon: 'settings', keywords: 'preferences', run: go('/app/settings') },
      ...APP_NAV.filter((n) => !['/app/privacy', '/app/settings'].includes(n.to)).map<Command>((n) => ({ id: `nav-${n.to}`, group: 'Go to', label: `Go to ${n.label}`, icon: n.icon, run: go(n.to) })),
      { id: 'site', group: 'Go to', label: 'Open the SafeScreen website', icon: 'globe', run: go('/') },
      {
        id: 'monitor',
        group: 'Preferences',
        label: s.monitoringAllowed ? 'Pause screen monitoring' : 'Resume screen monitoring',
        icon: s.monitoringAllowed ? 'pause' : 'play',
        run: () => updateSettings({ monitoringAllowed: !s.monitoringAllowed }, s.monitoringAllowed ? 'Screen monitoring paused.' : 'Screen monitoring resumed.'),
      },
      {
        id: 'theme',
        group: 'Preferences',
        label: document.documentElement.dataset.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        icon: document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon',
        keywords: 'appearance color mode',
        run: () => updateSettings({ appearance: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }),
      },
    ];
    // Rebuild when the palette opens so labels reflect current state.
  }, [open]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return commands;
    const words = t.split(/\s+/);
    return commands.filter((c) => {
      const hay = `${c.label} ${c.keywords ?? ''} ${c.group}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [q, commands]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const exec = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    // Run after the dialog closes so focus returns first.
    requestAnimationFrame(() => c.run());
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      exec(filtered[sel]);
    } else if (e.key === 'Home') {
      setSel(0);
    } else if (e.key === 'End') {
      setSel(filtered.length - 1);
    }
  };

  let lastGroup = '';
  return (
    <Modal open={open} onClose={onClose} labelledBy={`${id}-label`} className="palette" initialFocus={inputRef}>
      <span id={`${id}-label`} className="visually-hidden">
        Command palette
      </span>
      <div className="palette-input">
        <Icon name="search" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="Type a command or search…"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${id}-list`}
          aria-activedescendant={filtered[sel] ? `${id}-${filtered[sel].id}` : undefined}
          aria-label="Search commands"
          autoComplete="off"
          spellCheck={false}
        />
        <kbd>Esc</kbd>
      </div>
      <ul ref={listRef} id={`${id}-list`} className="palette-list" role="listbox" aria-label="Commands">
        {filtered.length === 0 && <li className="palette-empty">No commands match “{q}”.</li>}
        {filtered.map((c, i) => {
          const header = c.group !== lastGroup;
          lastGroup = c.group;
          return (
            <li key={c.id} role="presentation">
              {header && (
                <div className="palette-group label" aria-hidden="true">
                  {c.group}
                </div>
              )}
              <div id={`${id}-${c.id}`} role="option" aria-selected={i === sel} className="palette-item" onMouseMove={() => setSel(i)} onClick={() => exec(c)}>
                <Icon name={c.icon} />
                {c.label}
                {c.keys && (
                  <span className="hint" aria-label={`Shortcut ${c.keys.join(' ')}`}>
                    {c.keys.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="palette-foot" aria-hidden="true">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> navigate
        </span>
        <span>
          <kbd>↵</kbd> run
        </span>
        <span>
          <kbd>{MOD}</kbd>
          <kbd>K</kbd> toggle
        </span>
      </div>
    </Modal>
  );
}
