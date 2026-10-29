"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { toast } from "@/components/ui/Toaster";

interface Receipt {
  ownerId: "owner1" | "owner2" | null;
  holderId: "owner1" | "owner2" | null;
  amountMinor: number;
  revision: number;
}

interface PaymentSummary {
  enidName: string;
  businessHolder: string;
  canManage: boolean;
  heldMinor: number;
  sequence: number;
  transferredThrough: number;
  receipts: Record<string, Receipt>;
  transfers: { id: string; amountMinor: number; createdAt: string }[];
}

const money = (minor: number) => `৳${(minor / 100).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
const controlClass = "min-h-10 rounded border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] disabled:opacity-50";

export function useOrderPayments() {
  const [data, setData] = useState<PaymentSummary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const saving = useRef(false);
  const readVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++readVersion.current;
    try {
      const response = await fetch("/api/payment-custody", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load payment balances");
      if (version === readVersion.current) { setData(result); setError(""); }
    } catch {
      if (version === readVersion.current) setError("Payment balances could not be loaded. Try again.");
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const onFocus = () => void refresh();
    const interval = window.setInterval(() => { if (!document.hidden && !saving.current) void refresh(); }, 30_000);
    window.addEventListener("focus", onFocus);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, [refresh]);

  const mutate = async (action: "receive" | "transfer", orderId?: string, ownerId?: string, expectedAmountMinor?: number) => {
    if (saving.current || !data || error) return;
    saving.current = true;
    setBusy(orderId || "transfer");
    // Invalidate any background read that began before this write.
    ++readVersion.current;
    try {
      const response = await fetch("/api/payment-custody", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, orderId, ownerId, expectedAmountMinor, transferredThrough: data.transferredThrough, expectedSequence: data.sequence, revision: orderId ? data.receipts[orderId]?.revision || 0 : undefined, requestId: crypto.randomUUID() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save payment");
      toast(action === "transfer" ? "Transfer to business recorded" : "Payment holder saved", "success");
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Could not save payment", "error");
    } finally {
      await refresh();
      saving.current = false;
      setBusy(null);
    }
  };

  return { data, error, busy, refresh, mutate };
}

type Payments = ReturnType<typeof useOrderPayments>;

export function EnidPaymentBalance({ payments }: { payments: Payments }) {
  const { data, error, busy } = payments;
  if (error) return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded border border-[var(--border)] p-4 text-sm">
      <p>{error}</p>
      <button type="button" onClick={() => void payments.refresh()} className={controlClass}>Retry</button>
    </div>
  );
  return (
    <section aria-label="Payment held by Enid" className="rounded border border-[var(--border)] bg-[var(--bg-surface)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm text-[var(--text-secondary)]">{data?.enidName || "Enid"} holds</h2>
          <div aria-live="polite" className="mt-1 font-serif text-3xl tabular-nums text-[var(--gold)]">{data ? money(data.heldMinor) : "Loading…"}</div>
        </div>
        <button type="button" disabled={!data?.canManage || data.heldMinor <= 0 || Boolean(busy)}
          onClick={() => void payments.mutate("transfer")}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded bg-[var(--gold)] px-4 py-2 text-sm text-black transition-colors hover:bg-[var(--gold-light)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] disabled:cursor-not-allowed disabled:opacity-50">
          <ArrowRightLeft size={16} aria-hidden="true" />
          {busy === "transfer" ? "Recording transfer…" : "Transfer to business"}
        </button>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">Across all orders. Prepaid amounts include delivery; COD amounts exclude courier fees. Select an owner only after payment is received.</p>
      {data?.transfers[0] && <p className="mt-1 text-xs text-[var(--text-secondary)]">Last transfer: {money(data.transfers[0].amountMinor)} to business · {new Date(data.transfers[0].createdAt).toLocaleString("en-BD")}</p>}
      {data && !data.canManage && <p className="mt-1 text-xs text-[var(--text-secondary)]">The two owners can update payment holders and record transfers.</p>}
    </section>
  );
}

export function OrderPaymentHolder({ payments, orderId, customerName, cancelled = false, amountMinor }: {
  payments: Payments; orderId: string; customerName: string; cancelled?: boolean; amountMinor: number;
}) {
  const { data, busy, error } = payments;
  const receipt = data?.receipts[orderId];
  const transferred = receipt?.ownerId === "owner2" && receipt?.holderId === "owner1";
  const amountChanged = Boolean(receipt?.holderId && receipt.amountMinor !== amountMinor);
  return (
    <div className="space-y-1" onClick={(event) => event.stopPropagation()}>
      <select aria-label={`Payment held by for ${customerName}`} value={receipt?.holderId || ""}
        disabled={!data?.canManage || Boolean(busy) || Boolean(error)}
        onChange={(event) => void payments.mutate("receive", orderId, event.target.value, amountMinor)} className={`${controlClass} w-full min-w-36`}>
        <option value="">Not received / refunded</option>
        <option value="owner1" disabled={cancelled}>{data?.businessHolder || "Tayeb"} (business)</option>
        <option value="owner2" disabled={cancelled}>{data?.enidName || "Enid"}</option>
      </select>
      {busy === orderId && <p role="status" className="text-xs text-[var(--text-secondary)]">Saving…</p>}
      {transferred && <p className="text-xs text-[var(--text-secondary)]">Transferred to business</p>}
      {cancelled && receipt?.holderId && <p className="text-xs text-[var(--text-secondary)]">Mark refunded once money is returned.</p>}
      {amountChanged && !cancelled && <button type="button" disabled={!data?.canManage || Boolean(busy) || Boolean(error)}
        onClick={() => void payments.mutate("receive", orderId, receipt?.holderId || "", amountMinor)}
        className="text-xs text-[var(--gold)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--gold)] disabled:opacity-50">
        Update received amount ({money(receipt?.amountMinor || 0)})
      </button>}
    </div>
  );
}
