import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ConfidenceLevel } from '../inference/types';
import { Icon, type IconName } from './Icon';

/* ---------- Toggle ---------- */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <span className="toggle">
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
    </span>
  );
}

/* ---------- Modal ---------- */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  labelledBy,
  children,
  className = 'modal',
  center = false,
  initialFocus,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  className?: string;
  center?: boolean;
  initialFocus?: React.RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = requestAnimationFrame(() => {
      (initialFocus?.current ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === 'Tab' && ref.current) {
        const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(t);
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open, initialFocus]);

  if (!open) return null;
  return createPortal(
    <div className={`scrim${center ? ' center' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={className} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal open={open} onClose={onCancel} labelledBy={id} center initialFocus={cancelRef}>
      <div className="modal-body">
        <h2 id={id}>{title}</h2>
        <div className="muted">{body}</div>
      </div>
      <div className="modal-actions">
        <button ref={cancelRef} type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/* ---------- Toasts ---------- */
type ToastTone = 'success' | 'info' | 'warn' | 'risk';
interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

const ToastCtx = createContext<(t: Omit<ToastItem, 'id'>) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: Omit<ToastItem, 'id'>) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-2), { ...t, id }]);
      window.setTimeout(() => dismiss(id), t.tone === 'risk' ? 8000 : 4500);
    },
    [dismiss],
  );
  const icon: Record<ToastTone, IconName> = { success: 'checkCircle', info: 'info', warn: 'attention', risk: 'review' };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`} role={t.tone === 'risk' ? 'alert' : 'status'}>
            <Icon name={icon[t.tone]} />
            <div>
              <strong>{t.title}</strong>
              {t.body && <p>{t.body}</p>}
            </div>
            <button type="button" className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
              <Icon name="close" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* ---------- Tooltip ---------- */
export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  const id = useId();
  return (
    <span className="tip" aria-describedby={id}>
      {children}
      <span role="tooltip" id={id} className="tip-bubble">
        {text}
      </span>
    </span>
  );
}

/* ---------- Empty / error state ---------- */
export function EmptyState({ icon, title, children, actions, error }: { icon: IconName; title: string; children?: ReactNode; actions?: ReactNode; error?: boolean }) {
  return (
    <div className={`state${error ? ' error' : ''}`} role={error ? 'alert' : undefined}>
      <span className="state-icon">
        <Icon name={icon} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div className="btn-row">{actions}</div>}
    </div>
  );
}

/* ---------- Confidence ---------- */
const LEVELS: ConfidenceLevel[] = ['Low', 'Medium', 'High'];

export function Confidence({ level, reason, compact }: { level: ConfidenceLevel; reason?: string; compact?: boolean }) {
  const n = LEVELS.indexOf(level) + 1;
  return (
    <div className="confidence">
      <div className="confidence-head">
        <span className="confidence-bar" role="img" aria-label={`Confidence ${level}, ${n} of 3`}>
          {LEVELS.map((l, i) => (
            <span key={l} className={i < n ? 'on' : ''} />
          ))}
        </span>
        <span>{level}</span>
      </div>
      {!compact && reason && <p className="small muted">{reason}</p>}
    </div>
  );
}

/* ---------- Copy command (never executes) ---------- */
export function CopyCommand({ command, onCopied }: { command: string; onCopied?: () => void }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setState('copied');
      onCopied?.();
    } catch {
      setState('failed');
    }
    window.setTimeout(() => setState('idle'), 2500);
  };
  return (
    <div className="cmd">
      <code>{command}</code>
      <button type="button" onClick={copy} aria-label={`Copy command: ${command}`}>
        <Icon name={state === 'copied' ? 'check' : 'copy'} />
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Select text' : 'Copy'}
      </button>
      <span className="visually-hidden" role="status">
        {state === 'copied' ? 'Command copied. SafeScreen does not run commands; paste it yourself if you choose to.' : state === 'failed' ? 'Copy failed. Select the command text to copy it manually.' : ''}
      </span>
    </div>
  );
}
