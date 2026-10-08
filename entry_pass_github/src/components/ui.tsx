"use client";

import {
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ChevronDown, CircleAlert, CircleCheck, Info, type LucideIcon } from "lucide-react";
import { formatCountdown, initials, type PillTone } from "@/lib/format";
import { Spinner } from "./Spinner";

export { Spinner };

/* ── Brand ─────────────────────────────────────────────────────────────── */

export function Seal({ size = 34, alt = "", className = "" }: { size?: number; alt?: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/iitd-seal.svg"
      width={size}
      height={size}
      alt={alt}
      className={`seal ${className}`.trim()}
      draggable={false}
    />
  );
}

/* ── Status ────────────────────────────────────────────────────────────── */

export function Pill({
  tone = "neutral",
  children,
  dot = true,
}: {
  tone?: PillTone;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={`pill pill-${tone}`}>
      {dot && <i className="pill-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return (
    <span className={`avatar avatar-${size}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/* ── Layout helpers ────────────────────────────────────────────────────── */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Meta({ children }: { children: ReactNode }) {
  return <div className="meta">{children}</div>;
}

export function MetaItem({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className="meta-item">
      {Icon && <Icon size={14} aria-hidden="true" />}
      <span>{children}</span>
    </span>
  );
}

export function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text?: string }) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden="true">
        <Icon size={22} />
      </span>
      <p className="empty-title">{title}</p>
      {text && <p className="empty-text">{text}</p>}
    </div>
  );
}

export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "info" | "warning";
  children: ReactNode;
}) {
  const Icon = tone === "error" ? CircleAlert : Info;
  return (
    <div className={`alert alert-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

/* ── Form controls ─────────────────────────────────────────────────────── */

type FieldChrome = {
  id: string;
  label: string;
  hint?: string;
  hideLabel?: boolean;
  invalid?: boolean;
  icon?: LucideIcon;
};

export function TextField({
  id,
  label,
  hint,
  hideLabel,
  invalid,
  icon: Icon,
  className = "",
  ...rest
}: FieldChrome & InputHTMLAttributes<HTMLInputElement>) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label className={hideLabel ? "sr-only" : "field-label"} htmlFor={id}>
        {label}
      </label>
      <div className="control">
        {Icon && <Icon className="control-icon" size={18} aria-hidden="true" />}
        <input
          id={id}
          className={`input${Icon ? " has-icon" : ""} ${className}`.trim()}
          aria-invalid={invalid || undefined}
          aria-describedby={hintId}
          {...rest}
        />
      </div>
      {hint && (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  id,
  label,
  hint,
  hideLabel,
  invalid,
  icon: Icon,
  className = "",
  children,
  ...rest
}: FieldChrome & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="field">
      <label className={hideLabel ? "sr-only" : "field-label"} htmlFor={id}>
        {label}
      </label>
      <div className="control">
        {Icon && <Icon className="control-icon" size={18} aria-hidden="true" />}
        <select
          id={id}
          className={`input select${Icon ? " has-icon" : ""} ${className}`.trim()}
          aria-invalid={invalid || undefined}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown className="control-chevron" size={18} aria-hidden="true" />
      </div>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

export function TextAreaField({
  id,
  label,
  hint,
  invalid,
  className = "",
  ...rest
}: Omit<FieldChrome, "icon" | "hideLabel"> & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const length = typeof rest.value === "string" ? rest.value.length : 0;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className={`input textarea ${className}`.trim()}
        aria-invalid={invalid || undefined}
        {...rest}
      />
      {(hint || rest.maxLength) && (
        <p className="field-hint field-hint-row">
          <span>{hint}</span>
          {rest.maxLength ? (
            <span className="tnum">
              {length} / {rest.maxLength}
            </span>
          ) : null}
        </p>
      )}
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: LucideIcon }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {Icon && <Icon size={16} aria-hidden="true" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Countdown ─────────────────────────────────────────────────────────── */

function useCountdown(since: string | null, timeoutMs: number): number | null {
  const [left, setLeft] = useState<number | null>(() =>
    since ? timeoutMs - (Date.now() - new Date(since).getTime()) : null
  );

  useEffect(() => {
    if (!since) {
      setLeft(null);
      return;
    }
    const start = new Date(since).getTime();
    const tick = () => setLeft(timeoutMs - (Date.now() - start));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [since, timeoutMs]);

  return left;
}

/** Live m:ss countdown. Calls `onElapsed` once when it reaches zero. */
export function Countdown({
  since,
  timeoutMs,
  onElapsed,
}: {
  since: string | null;
  timeoutMs: number;
  onElapsed?: () => void;
}) {
  const left = useCountdown(since, timeoutMs);
  const fired = useRef(false);
  const callback = useRef(onElapsed);

  useEffect(() => {
    callback.current = onElapsed;
  }, [onElapsed]);

  useEffect(() => {
    if (left !== null && left <= 0 && !fired.current) {
      fired.current = true;
      callback.current?.();
    }
  }, [left]);

  if (left === null) return null;
  return <span className="tnum">{formatCountdown(left)}</span>;
}

export function CountdownBar({ since, timeoutMs }: { since: string | null; timeoutMs: number }) {
  const left = useCountdown(since, timeoutMs);
  const pct = left === null ? 0 : Math.max(0, Math.min(100, (left / timeoutMs) * 100));
  return (
    <div className="progress" aria-hidden="true">
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ── Toast ─────────────────────────────────────────────────────────────── */

export type ToastTone = "success" | "error" | "info";

export interface ToastMessage {
  id: number;
  text: string;
  tone: ToastTone;
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: number) => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const life = toast.tone === "error" ? 4600 : 3000;
    const hide = setTimeout(() => setLeaving(true), life);
    const remove = setTimeout(() => onDismiss(toast.id), life + 180);
    return () => {
      clearTimeout(hide);
      clearTimeout(remove);
    };
  }, [toast, onDismiss]);

  const Icon = toast.tone === "success" ? CircleCheck : toast.tone === "error" ? CircleAlert : Info;

  return (
    <div
      className={`toast toast-${toast.tone}${leaving ? " is-leaving" : ""}`}
      role={toast.tone === "error" ? "alert" : "status"}
    >
      <Icon size={18} aria-hidden="true" />
      <span>{toast.text}</span>
    </div>
  );
}

export function ToastRegion({
  toast,
  onDismiss,
}: {
  toast: ToastMessage | null;
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="toast-region">
      {toast && <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />}
    </div>
  );
}

/* ── Confirm dialog ────────────────────────────────────────────────────── */

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelFn = useRef(onCancel);

  useEffect(() => {
    cancelFn.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelFn.current();
      } else if (e.key === "Tab") {
        // Keep focus inside the dialog.
        const stops = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLElement[];
        const i = stops.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        stops[(i + (e.shiftKey ? -1 : 1) + stops.length) % stops.length]?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-message"
      >
        <h2 className="dialog-title" id="dialog-title">
          {title}
        </h2>
        <p className="dialog-message" id="dialog-message">
          {message}
        </p>
        <div className="dialog-actions">
          <button ref={confirmRef} className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? <Spinner /> : confirmLabel}
          </button>
          <button ref={cancelRef} className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
