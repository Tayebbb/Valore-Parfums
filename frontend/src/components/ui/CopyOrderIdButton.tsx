"use client";

import { MouseEvent, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "@/components/ui/Toaster";

interface CopyOrderIdButtonProps {
  orderId: string;
  className?: string;
  tooltip?: string;
  stopPropagation?: boolean;
}

export function CopyOrderIdButton({
  orderId,
  className = "",
  tooltip = "Copy Order ID",
  stopPropagation = false,
}: CopyOrderIdButtonProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    if (stopPropagation) {
      event.stopPropagation();
    }

    const value = String(orderId ?? "");
    if (value.length === 0) {
      toast("Order ID unavailable", "error");
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = value;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        textArea.setSelectionRange(0, textArea.value.length);
        const copiedWithFallback = document.execCommand("copy");
        document.body.removeChild(textArea);
        if (!copiedWithFallback) {
          throw new Error("Fallback clipboard copy failed");
        }
      }
      setCopied(true);
      toast("Order ID copied", "success");
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      toast("Could not copy Order ID", "error");
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      title={tooltip}
      aria-label={tooltip}
      className={`inline-flex h-9 w-9 min-w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-all hover:border-[var(--gold)] hover:text-[var(--gold)] active:scale-[0.97] ${className}`}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}
