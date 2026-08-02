"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/Toaster";

interface InvestorProfile {
  id: string;
  name: string;
  email: string;
  status: string;
  totalInvested: number;
  totalRecoveredCapital: number;
  totalProfit: number;
  totalWithdrawn: number;
  activeInvestmentCount: number;
  completedInvestmentCount: number;
}

interface InvestmentRow {
  id: string;
  status: string;
  amount: number;
  recoveredCapital: number;
  remainingInventoryCost: number;
  availableProfit: number;
  withdrawnProfit: number;
  profitSharePercentage: number;
  recoveryPercent: number;
  createdAt?: string;
}

interface Withdrawal {
  id: string;
  investmentId: string;
  amountMinor: number;
  status: string;
  paymentSource: string;
  rejectReason?: string;
  createdAt?: string;
}

const bdtMajor = (major: number) => `৳${major.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
const bdtMinor = (minor: number) => bdtMajor(minor / 100);

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-500",
  recovering: "bg-sky-500/10 text-sky-500",
  closed: "bg-zinc-500/10 text-zinc-400",
  bought_back: "bg-amber-500/10 text-amber-500",
  pending: "bg-amber-500/10 text-amber-500",
  approved: "bg-sky-500/10 text-sky-500",
  rejected: "bg-red-500/10 text-red-500",
  paid: "bg-emerald-500/10 text-emerald-500",
};

function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] uppercase tracking-wider ${STATUS_BADGE[status] || "bg-zinc-500/10 text-zinc-400"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function InvestorDashboardPage() {
  const [investor, setInvestor] = useState<InvestorProfile | null>(null);
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);
  const [wdForm, setWdForm] = useState({ investmentId: "", amount: "", paymentSource: "Bkash" });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, wdRes] = await Promise.all([
        fetch("/api/investor/dashboard").then((r) => ({ ok: r.ok, status: r.status, json: r.json() })),
        fetch("/api/investment-withdrawals").then((r) => r.json()),
      ]);
      const dash = await dashRes.json;
      if (!dashRes.ok) {
        if (dashRes.status === 404) setNotLinked(true);
        else toast(dash.error || "Failed to load dashboard", "error");
        setInvestor(null);
        setInvestments([]);
      } else {
        setNotLinked(false);
        setInvestor(dash.investor);
        setInvestments(dash.investments || []);
      }
      setWithdrawals(Array.isArray(wdRes) ? wdRes : []);
    } catch {
      toast("Failed to load dashboard", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const requestWithdrawal = async () => {
    const amount = Number(wdForm.amount);
    if (!wdForm.investmentId) return toast("Select an investment", "error");
    if (!Number.isFinite(amount) || amount <= 0) return toast("Enter a valid amount", "error");
    setSubmitting(true);
    try {
      const res = await fetch("/api/investment-withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ investmentId: wdForm.investmentId, amount, paymentSource: wdForm.paymentSource }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      toast("Withdrawal requested — pending admin approval", "success");
      setWdForm({ investmentId: "", amount: "", paymentSource: "Bkash" });
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Request failed", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !investor) return <div className="py-12 text-center text-[var(--text-muted)]">Loading your dashboard…</div>;

  if (notLinked) {
    return (
      <div className="py-12 text-center space-y-2">
        <p className="text-[var(--text-primary)]">No investor profile is linked to this account yet.</p>
        <p className="text-sm text-[var(--text-muted)]">Contact Valore Parfums to have your investor profile connected to this email.</p>
      </div>
    );
  }

  if (!investor) return null;

  const totalAvailableProfit = investments.reduce((s, i) => s + (i.availableProfit || 0), 0);
  const withdrawableInvestments = investments.filter((i) => i.availableProfit > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl font-light text-[var(--text-primary)]">Welcome, {investor.name}</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {investor.activeInvestmentCount} active investment{investor.activeInvestmentCount === 1 ? "" : "s"}
          </p>
        </div>
        <button onClick={load} className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]" title="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Invested", value: bdtMajor(investor.totalInvested) },
          { label: "Capital Returned", value: bdtMajor(investor.totalRecoveredCapital) },
          { label: "Profit Earned", value: bdtMajor(investor.totalProfit) },
          { label: "Withdrawn", value: bdtMajor(investor.totalWithdrawn) },
        ].map((c) => (
          <div key={c.label} className="p-4 rounded border border-[var(--border)] bg-[var(--bg-surface)]">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{c.label}</p>
            <p className="text-lg font-medium text-[var(--text-primary)] mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Investments */}
      <div className="rounded border border-[var(--border)] bg-[var(--bg-surface)] overflow-x-auto">
        <p className="px-4 pt-3 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Your investments</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Invested</th>
              <th className="px-4 py-2">Capital Returned</th>
              <th className="px-4 py-2">Recovery</th>
              <th className="px-4 py-2">Available Profit</th>
              <th className="px-4 py-2">Share</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {investments.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-[var(--text-muted)]">No investments yet</td></tr>
            )}
            {investments.map((inv) => (
              <tr key={inv.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-2.5"><Badge status={inv.status} /></td>
                <td className="px-4 py-2.5">{bdtMajor(inv.amount)}</td>
                <td className="px-4 py-2.5">{bdtMajor(inv.recoveredCapital)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 rounded-full bg-[var(--bg-base)] overflow-hidden">
                      <div className="h-full bg-[var(--gold)]" style={{ width: `${Math.min(100, inv.recoveryPercent)}%` }} />
                    </div>
                    <span className="text-xs text-[var(--text-secondary)]">{inv.recoveryPercent}%</span>
                  </div>
                </td>
                <td className="px-4 py-2.5">{bdtMajor(inv.availableProfit)}</td>
                <td className="px-4 py-2.5">{inv.profitSharePercentage}%</td>
                <td className="px-4 py-2.5">
                  <Link href={`/investor/investments/${inv.id}`} className="text-xs text-[var(--gold)] hover:underline">Details</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Withdrawal request */}
      <div className="p-4 rounded border border-[var(--border)] bg-[var(--bg-surface)] space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Request profit withdrawal</p>
          <p className="text-xs text-[var(--text-secondary)]">
            Withdrawable profit: <span className="text-[var(--gold)] font-medium">{bdtMajor(totalAvailableProfit)}</span>
          </p>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Only earned profit can be withdrawn. Invested capital returns automatically as your funded inventory sells.
        </p>
        <div className="grid md:grid-cols-4 gap-2">
          <select
            value={wdForm.investmentId}
            onChange={(e) => setWdForm({ ...wdForm, investmentId: e.target.value })}
            className="px-3 py-2 text-sm rounded border border-[var(--border)] bg-[var(--bg-base)]"
          >
            <option value="">Select investment…</option>
            {withdrawableInvestments.map((i) => (
              <option key={i.id} value={i.id}>
                {i.id.slice(0, 8)} — {bdtMajor(i.availableProfit)} available
              </option>
            ))}
          </select>
          <input
            value={wdForm.amount}
            onChange={(e) => setWdForm({ ...wdForm, amount: e.target.value })}
            placeholder="Amount (BDT)"
            className="px-3 py-2 text-sm rounded border border-[var(--border)] bg-[var(--bg-base)]"
          />
          <select
            value={wdForm.paymentSource}
            onChange={(e) => setWdForm({ ...wdForm, paymentSource: e.target.value })}
            className="px-3 py-2 text-sm rounded border border-[var(--border)] bg-[var(--bg-base)]"
          >
            <option value="Bkash">bKash</option>
            <option value="Bank">Bank</option>
            <option value="Cash">Cash</option>
          </select>
          <button
            onClick={requestWithdrawal}
            disabled={submitting || withdrawableInvestments.length === 0}
            className="px-3 py-2 text-xs bg-[var(--gold)] text-black rounded disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Request Withdrawal"}
          </button>
        </div>
      </div>

      {/* Withdrawal history */}
      <div className="rounded border border-[var(--border)] bg-[var(--bg-surface)] overflow-x-auto">
        <p className="px-4 pt-3 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Withdrawal history</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="px-4 py-2">Requested</th>
              <th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">Source</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {withdrawals.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-[var(--text-muted)]">No withdrawals yet</td></tr>
            )}
            {withdrawals.map((w) => (
              <tr key={w.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-2.5 text-[var(--text-secondary)]">{w.createdAt ? new Date(w.createdAt).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-2.5">{bdtMinor(w.amountMinor)}</td>
                <td className="px-4 py-2.5">{w.paymentSource}</td>
                <td className="px-4 py-2.5">
                  <Badge status={w.status} />
                  {w.status === "rejected" && w.rejectReason && (
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{w.rejectReason}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
