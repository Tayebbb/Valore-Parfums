"use client";

import type { ReactNode } from "react";

type DecisionDrawerProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
};

export function DecisionDrawer({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
  children,
}: DecisionDrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[65] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        aria-label="Close drawer"
        onClick={onCancel}
      />

      <aside className="relative h-full w-full max-w-md border-l border-[var(--border-gold)] bg-[var(--bg-elevated)] px-6 py-6 shadow-2xl animate-drawer-in">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-serif text-2xl leading-tight text-[var(--text-primary)]">{title}</h2>
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-[var(--border)] px-2 py-1 text-xs uppercase tracking-wider text-[var(--text-muted)] hover:border-[var(--gold)] hover:text-[var(--text-primary)]"
          >
            Close
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">{message}</p>

        {children && <div className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">{children}</div>}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded border border-[var(--border)] px-4 py-2 text-xs uppercase tracking-wider text-[var(--text-secondary)] hover:border-[var(--gold)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded px-4 py-2 text-xs uppercase tracking-wider ${
              danger
                ? "bg-[var(--error)] text-white hover:opacity-90"
                : "bg-[var(--gold)] text-black hover:bg-[var(--gold-light)]"
            } disabled:opacity-50`}
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </aside>
    </div>
  );
}
