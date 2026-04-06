"use client";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Close confirmation dialog"
        className="absolute inset-0 bg-black/60 backdrop-blur-md animate-overlay-in"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--border-gold)] bg-[var(--bg-elevated)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] animate-modal-in">
        <h2 className="font-serif text-xl font-light text-[var(--text-primary)]">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">{message}</p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-[var(--border)] px-4 py-2 text-xs uppercase tracking-wider text-[var(--text-secondary)] transition-colors hover:border-[var(--gold)] hover:text-[var(--text-primary)]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded px-4 py-2 text-xs uppercase tracking-wider transition-colors ${
              danger
                ? "bg-[var(--error)] text-white hover:opacity-90"
                : "bg-[var(--gold)] text-black hover:bg-[var(--gold-light)]"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}