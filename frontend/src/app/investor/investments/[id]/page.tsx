"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/Toaster";

interface Allocation {
  id: string;
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
  notes: string;
  createdAt?: string;
}

interface InvestmentDetail {
  id: string;
  amountMinor: number;
  recoveredCapitalMinor: number;
  remainingInventoryCostMinor: number;
  availableProfitMinor: number;
  withdrawnProfitMinor: number;
  profitSharePercentage: number;
  status: string;
  createdAt?: string;
  allocations?: Allocation[];
  ledger?: LedgerEntry[];
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

export default function InvestorInvestmentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [data, setData] = useState<InvestmentDetail | null>(null);
  const [streamFilter, setStreamFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/investor/investments/${id}${streamFilter ? `?stream=${streamFilter}` : ""}`);
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 404) setNotFound(true);
        else toast(json.error || "Failed to load investment", "error");
        setData(null);
      } else {
        setNotFound(false);
        setData(json);
      }
    } catch {
      toast("Failed to load investment", "error");
    } finally {
      setLoading(false);
    }
  }, [id, streamFilter]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <div className="py-12 text-center text-[var(--text-muted)]">Loading…</div>;

  if (notFound || !data) {
    return (
      <div className="py-12 text-center space-y-2">
        <p className="text-[var(--text-primary)]">Investment not found.</p>
        <Link href="/investor" className="text-sm text-[var(--gold)]">← Back to dashboard</Link>
      </div>
    );
  }

  const recoveryPercent = data.amountMinor > 0
    ? Math.round((data.recoveredCapitalMinor / data.amountMinor) * 100)
    : 0;
  const ledger = data.ledger || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/investor" className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><ArrowLeft size={18} /></Link>
        <div>
          <h2 className="font-serif text-2xl font-light text-[var(--text-primary)]">Investment {id.slice(0, 8)}</h2>
          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[11px] uppercase tracking-wider ${STATUS_BADGE[data.status] || ""}`}>
            {data.status.replace(/_/g, " ")}
          </span>
        </div>
        <button onClick={load} className="ml-auto p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]" title="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Invested", value: bdt(data.amountMinor) },
          { label: "Capital Returned", value: `${bdt(data.recoveredCapitalMinor)} (${recoveryPercent}%)` },
          { label: "Still In Inventory", value: bdt(data.remainingInventoryCostMinor) },
          { label: "Available Profit", value: bdt(data.availableProfitMinor) },
          { label: "Withdrawn Profit", value: bdt(data.withdrawnProfitMinor) },
        ].map((c) => (
          <div key={c.label} className="p-4 rounded border border-[var(--border)] bg-[var(--bg-surface)]">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{c.label}</p>
            <p className="text-base font-medium text-[var(--text-primary)] mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="h-2 rounded-full bg-[var(--bg-surface)] border border-[var(--border)] overflow-hidden">
        <div className="h-full bg-[var(--gold)]" style={{ width: `${Math.min(100, recoveryPercent)}%` }} />
      </div>
      <p className="text-xs text-[var(--text-muted)] -mt-4">
        Capital recovery: {recoveryPercent}% — your capital returns automatically as funded inventory sells. Your profit share: {data.profitSharePercentage}%.
      </p>

      {/* Allocations */}
      <div className="rounded border border-[var(--border)] bg-[var(--bg-surface)] overflow-x-auto">
        <p className="px-4 pt-3 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Funded inventory</p>
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
            {(data.allocations || []).map((a) => (
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

      {/* Ledger */}
      <div className="rounded border border-[var(--border)] bg-[var(--bg-surface)] overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-3">
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Transaction history</p>
          <select value={streamFilter} onChange={(e) => setStreamFilter(e.target.value)} className="px-2 py-1 text-xs rounded border border-[var(--border)] bg-[var(--bg-base)]">
            <option value="">All</option>
            <option value="capital">Capital returns</option>
            <option value="profit">Profit</option>
          </select>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">ml</th>
              <th className="px-4 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {ledger.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-[var(--text-muted)]">No transactions yet</td></tr>
            )}
            {ledger.map((e) => (
              <tr key={e.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-2 text-[var(--text-secondary)] whitespace-nowrap">{e.createdAt ? new Date(e.createdAt).toLocaleString() : "—"}</td>
                <td className="px-4 py-2">{e.type.replace(/_/g, " ")}</td>
                <td className={`px-4 py-2 ${e.amountMinor < 0 ? "text-red-400" : ""}`}>{bdt(e.amountMinor)}</td>
                <td className="px-4 py-2">{e.mlSold ?? ""}</td>
                <td className="px-4 py-2 text-[var(--text-secondary)] max-w-64 truncate" title={e.notes}>{e.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
