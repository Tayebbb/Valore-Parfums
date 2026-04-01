"use client";

import { useEffect, useState } from "react";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
  leaving?: boolean;
}

let addToastFn: ((t: Omit<Toast, "id">) => void) | null = null;

export function toast(message: string, type: Toast["type"] = "info") {
  addToastFn?.({ message, type });
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    addToastFn = (t) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { ...t, id }]);
      const t1 = setTimeout(() => {
        setToasts((prev) => prev.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
      }, 3000);
      const t2 = setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== id));
      }, 3400);
      timers.push(t1, t2);
    };
    return () => {
      addToastFn = null;
      timers.forEach(clearTimeout);
    };
  }, []);

  const iconColor = (type: Toast["type"]) => {
    switch (type) {
      case "success": return "text-[var(--success)]";
      case "error": return "text-[var(--error)]";
      default: return "text-[var(--gold)]";
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex max-w-sm flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto relative overflow-hidden rounded-xl border px-4 py-3 shadow-[0_16px_36px_rgba(0,0,0,0.45)] backdrop-blur-sm flex items-center gap-3 min-w-[280px] ${
            t.leaving
              ? "animate-toast-out border-[var(--border)] bg-[var(--bg-elevated)]"
              : "animate-toast-in border-[var(--border-gold)] bg-[linear-gradient(135deg,var(--bg-elevated),var(--bg-card))]"
          }`}
        >
          <span className={`text-lg ${iconColor(t.type)}`}>
            {t.type === "success" ? "✓" : t.type === "error" ? "✕" : "ℹ"}
          </span>
          <span className="text-sm text-[var(--text-primary)]">{t.message}</span>
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-[var(--gold-tint)]">
            <div className="h-full bg-[var(--gold)] animate-toast-timer" />
          </div>
        </div>
      ))}
    </div>
  );
}
