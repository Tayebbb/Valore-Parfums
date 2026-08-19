"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/Toaster";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface Allocation {
  id: string;
  perfumeId: string;
  perfumeName: string;
  fundedMl: number;
  remainingMl: number;
  soldMl: number;
  costPerMlMinor: number;
  status: string;
}

interface LedgerEntry {
  id: string;
  type: string;
  stream: string;
  amountMinor: number;
  mlSold: number | null;
  previousBalanceMinor: number;
  newBalanceMinor: number;
  referenceOrderId: string | null;
  notes: string;
  createdAt?: string;
}

interface InvestmentDetail {
  id: string;
  investorId: string;
  investorName: string;
  amountMinor: number;
  recoveredCapitalMinor: number;
  remainingInventoryCostMinor: number;
  availableProfitMinor: number;
  withdrawnProfitMinor: number;
  profitSharePercentage: number;
  status: string;
  createdAt?: string;
  allocations?: Allocation[];
}

interface BuybackQuote {
  remainingInventoryCostMinor: number;
  availableProfitMinor: number;
  totalAmountMinor: number;
}

const bdt = (minor: number) => `৳${(minor / 100).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-500",
  recovering: "bg-sky-500/10 text-sky-500",
  closed: "bg-zinc-500/10 text-zinc-400",
  bought_back: "bg-amber-500/10 text-amber-500",
  open: "bg-emerald-500/10 text-emerald-500",
  depleted: "bg-zinc-500/10 text-zinc-400",
};

export default function AdminInvestmentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [investment, setInvestment] = useState<InvestmentDetail | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [streamFilter, setStreamFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<BuybackQuote | null>(null);
  const [confirmBuyback, setConfirmBuyback] = useState(false);
  const [adjForm, setAdjForm] = useState({ stream: "profit", amount: "", reason: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, ledgerRes] = await Promise.all([
        fetch(`/api/investments/${id}`).then((r) => r.json()),
        fetch(`/api/investments/${id}/ledger${streamFilter ? `?stream=${streamFilter}` : ""}`).then((r) => r.json()),
      ]);
      if (invRes.error) {
        toast(invRes.error, "error");
        setInvestment(null);
      } else {
        setInvestment(invRes);
      }
      setLedger(Array.isArray(ledgerRes) ? ledgerRes : ledgerRes?.entries || []);
    } catch {
      toast("Failed to load investment", "error");
    } finally {
      setLoading(false);
    }
  }, [id, streamFilter]);

  useEffect(() => { load(); }, [load]);

  const loadQuote = async () => {
    const res = await fetch(`/api/investments/${id}/buyback`);
    const data = await res.json();
    if (res.ok) setQuote(data);
    else toast(data.error || "Quote failed", "error");
  };

  const executeBuyback = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/investments/${id}/buyback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Buyback failed");
      toast("Buyback executed — investment closed", "success");
      setQuote(null);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Buyback failed", "error");
    } finally {
      setBusy(false);
      setConfirmBuyback(false);
    }
  };

  const submitAdjustment = async () => {
    const amount = Number(adjForm.amount);
    if (!Number.isFinite(amount) || amount === 0) return toast("Adjustment amount must be a non-zero number (BDT)", "error");
    if (!adjForm.reason.trim()) return toast("Adjustment reason is required", "error");
    setBusy(true);
    try {
      const res = await fetch(`/api/investments/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adjustment: { stream: adjForm.stream, amount, reason: adjForm.reason.trim() } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Adjustment failed");
      toast("Adjustment recorded", "success");
      setAdjForm({ stream: "profit", amount: "", reason: "" });
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Adjustment failed", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !investment) return <div className="p-8 text-[var(--text-muted)]">Loading…</div>;
  if (!investment) {
    return (
      <div className="p-8">
        <p className="text-[var(--text-muted)]">Investment not found.</p>
        <button onClick={() => router.push("/admin/investments")} className="mt-3 text-sm text-[var(--gold)]">← Back to investments</button>
      </div>
    );
  }

  const recoveryPercent = investment.amountMinor > 0
    ? Math.round((investment.recoveredCapitalMinor / investment.amountMinor) * 100)
    : 0;
  const canBuyback = investment.status === "active" || investment.status === "recovering";

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/investments" className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><ArrowLeft size={18} /></Link>
        <div>
          <h1 className="font-serif text-2xl font-light text-[var(--text-primary)]">
            Investment {id.slice(0, 8)} — {investment.investorName}
          </h1>
          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[11px] uppercase tracking-wider ${STATUS_BADGE[investment.status] || ""}`}>
            {investment.status.replace(/_/g, " ")}
          </span>
        </div>
        <button onClick={load} className="ml-auto p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]" title="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Principal", value: bdt(investment.amountMinor) },
          { label: "Capital Recovered", value: `${bdt(investment.recoveredCapitalMinor)} (${recoveryPercent}%)` },
          { label: "Remaining Inventory Cost", value: bdt(investment.remainingInventoryCostMinor) },
          { label: "Available Profit", value: bdt(investment.availableProfitMinor) },
          { label: "Withdrawn Profit", value: bdt(investment.withdrawnProfitMinor) },
        ].map((c) => (
          <div key={c.label} className="p-4 rounded border border-[var(--border)] bg-[var(--bg-surface)]">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{c.label}</p>
            <p className="text-base font-medium text-[var(--text-primary)] mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Capital recovery progress */}
      <div className="h-2 rounded-full bg-[var(--bg-surface)] border border-[var(--border)] overflow-hidden">
        <div className="h-full bg-[var(--gold)]" style={{ width: `${Math.min(100, recoveryPercent)}%` }} />
      </div>

      {/* Allocations */}
      <div className="rounded border border-[var(--border)] bg-[var(--bg-surface)] overflow-x-auto">
        <p className="px-4 pt-3 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Funded inventory lots</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="px-4 py-2">Perfume</th>
              <th className="px-4 py-2">Funded ml</th>
              <th className="px-4 py-2">Remaining ml</th>
              <th className="px-4 py-2">Sold ml</th>
              <th className="px-4 py-2">Cost/ml</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(investment.allocations || []).map((a) => (
              <tr key={a.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-2">{a.perfumeName}</td>
                <td className="px-4 py-2">{a.fundedMl}</td>
                <td className="px-4 py-2">{a.remainingMl}</td>
                <td className="px-4 py-2">{a.soldMl}</td>
                <td className="px-4 py-2">{bdt(a.costPerMlMinor)}</td>
                <td className="px-4 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] uppercase tracking-wider ${STATUS_BADGE[a.status] || ""}`}>
                    {a.status.replace(/_/g, " ")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Buyback + adjustment */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="p-4 rounded border border-[var(--border)] bg-[var(--bg-surface)] space-y-3">
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Buyback</p>
          {canBuyback ? (
            <>
              <p className="text-sm text-[var(--text-secondary)]">
                Store repurchases the remaining funded inventory and pays out unwithdrawn profit. Stock stays in the store (becomes store-owned).
              </p>
              {quote ? (
                <div className="text-sm space-y-1">
                  <p>Remaining inventory cost: <b>{bdt(quote.remainingInventoryCostMinor)}</b></p>
                  <p>Available profit: <b>{bdt(quote.availableProfitMinor)}</b></p>
                  <p>Total payout: <b className="text-[var(--gold)]">{bdt(quote.totalAmountMinor)}</b></p>
                  <button onClick={() => setConfirmBuyback(true)} disabled={busy} className="mt-2 px-3 py-1.5 text-xs bg-[var(--gold)] text-black rounded disabled:opacity-50">
                    Execute Buyback
                  </button>
                </div>
              ) : (
                <button onClick={loadQuote} className="px-3 py-1.5 text-xs border border-[var(--border)] rounded hover:bg-[var(--gold-tint)]">
                  Get Buyback Quote
                </button>
              )}
            </>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Not available for {investment.status.replace(/_/g, " ")} investments.</p>
          )}
        </div>

        <div className="p-4 rounded border border-[var(--border)] bg-[var(--bg-surface)] space-y-3">
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Manual adjustment (ledgered correction)</p>
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <select value={adjForm.stream} onChange={(e) => setAdjForm({ ...adjForm, stream: e.target.value })} className="px-3 py-2 text-sm rounded border border-[var(--border)] bg-[var(--bg-base)]">
              <option value="profit">Profit</option>
              <option value="capital">Capital</option>
            </select>
            <input value={adjForm.amount} onChange={(e) => setAdjForm({ ...adjForm, amount: e.target.value })} placeholder="Amount BDT (signed, e.g. -50)" className="px-3 py-2 text-sm rounded border border-[var(--border)] bg-[var(--bg-base)]" />
          </div>
          <input value={adjForm.reason} onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })} placeholder="Reason (required, audit-logged)" className="w-full px-3 py-2 text-sm rounded border border-[var(--border)] bg-[var(--bg-base)]" />
          <button onClick={submitAdjustment} disabled={busy} className="px-3 py-1.5 text-xs bg-[var(--gold)] text-black rounded disabled:opacity-50">
            Record Adjustment
          </button>
        </div>
      </div>

      {/* Ledger */}
      <div className="rounded border border-[var(--border)] bg-[var(--bg-surface)] overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-3">
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Immutable ledger</p>
          <select value={streamFilter} onChange={(e) => setStreamFilter(e.target.value)} className="px-2 py-1 text-xs rounded border border-[var(--border)] bg-[var(--bg-base)]">
            <option value="">All streams</option>
            <option value="capital">Capital (Stream A)</option>
            <option value="profit">Profit (Stream B)</option>
            <option value="none">Other</option>
          </select>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Stream</th>
              <th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">ml</th>
              <th className="px-4 py-2">Balance</th>
              <th className="px-4 py-2">Order</th>
              <th className="px-4 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {ledger.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-[var(--text-muted)]">No ledger entries</td></tr>
            )}
            {ledger.map((e) => (
              <tr key={e.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-2 text-[var(--text-secondary)] whitespace-nowrap">{e.createdAt ? new Date(e.createdAt).toLocaleString() : "—"}</td>
                <td className="px-4 py-2">{e.type.replace(/_/g, " ")}</td>
                <td className="px-4 py-2 uppercase text-xs">{e.stream}</td>
                <td className={`px-4 py-2 ${e.amountMinor < 0 ? "text-red-400" : ""}`}>{bdt(e.amountMinor)}</td>
                <td className="px-4 py-2">{e.mlSold ?? ""}</td>
                <td className="px-4 py-2 text-[var(--text-secondary)]">{bdt(e.previousBalanceMinor)} → {bdt(e.newBalanceMinor)}</td>
                <td className="px-4 py-2">{e.referenceOrderId ? e.referenceOrderId.slice(0, 8) : ""}</td>
                <td className="px-4 py-2 text-[var(--text-secondary)] max-w-64 truncate" title={e.notes}>{e.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={confirmBuyback}
        title="Execute buyback?"
        message={`This atomically closes the investment and records a payout of ${quote ? "\u09F3" + (quote.totalAmountMinor / 100).toLocaleString("en-BD") : "?"}. This cannot be undone.`}
        confirmLabel={busy ? "Executing…" : "Execute"}
        danger
        onConfirm={executeBuyback}
        onCancel={() => setConfirmBuyback(false)}
      />
    </div>
  );
}
