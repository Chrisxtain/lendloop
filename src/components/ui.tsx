"use client";

import { forwardRef, useEffect, useRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { X } from "@phosphor-icons/react";

/* Small UI kit. Shape rule (DESIGN.md): buttons/inputs 8px, cards/dialogs 12px, badges pill. */

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-bg hover:opacity-90",
  secondary: "bg-surface text-ink border border-line hover:bg-surface-2",
  danger: "bg-surface text-danger border border-line hover:bg-danger-soft",
  ghost: "text-muted hover:text-ink hover:bg-surface-2",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "md" | "sm"; busy?: boolean }
>(function Button({ variant = "primary", size = "md", busy, className = "", children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
        size === "md" ? "h-10 px-4 text-sm" : "h-8 px-3 text-[13px]"
      } ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});

// Status colour rule: green = available, amber = needs action, red = overdue,
// strong neutral = on loan, muted = finished. Same status, same look, everywhere.
type Tone = "accent" | "warn" | "danger" | "strong" | "neutral";
const tones: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  strong: "bg-surface-2 text-ink ring-1 ring-inset ring-line",
  neutral: "bg-surface-2 text-muted",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

const loanTone: Record<string, { tone: Tone; label: string }> = {
  requested: { tone: "warn", label: "Pending" },
  approved: { tone: "strong", label: "On loan" },
  declined: { tone: "neutral", label: "Declined" },
  cancelled: { tone: "neutral", label: "Cancelled" },
  returned: { tone: "neutral", label: "Returned" },
};

export function LoanStatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  if (overdue) return <Badge tone="danger">Overdue</Badge>;
  const s = loanTone[status] ?? { tone: "neutral" as Tone, label: status };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function ToolStatusBadge({ status }: { status: "available" | "on_loan" }) {
  return status === "available" ? <Badge tone="accent">Available</Badge> : <Badge tone="strong">On loan</Badge>;
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  "h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none";

/** Native <dialog>: focus trapping, Esc to close and inert background come from the browser. */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="dialog-title"
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-body shadow-[var(--shadow)]"
    >
      {open ? (
        <div className="p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <h2 id="dialog-title" className="text-lg font-semibold tracking-tight text-ink">
              {title}
            </h2>
            <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-ink">
              <X size={18} />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-2 ${className}`} />;
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line px-6 py-14 text-center">
      <div className="mb-3 text-muted">{icon}</div>
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
