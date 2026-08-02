"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Download, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "@/components/ui/Toaster";

// ─── Types (API response shapes) ───────────────────────

interface Report {
  investors: { total: number; active: number };
  investments: { total: number; byStatus: Record<string, number> };
  totals: {
    invested: number;
    capitalRecovered: number;
    remainingInventoryCost: number;
    availableInvestorProfit: number;
    withdrawnInvestorProfit: number;
  };
  inventory: { openAllocations: number; fundedMlRemaining: number; fundedMlSold: number };
  monthlyBreakdown: Array<{ month: string; capitalRecovered: number; investorProfit: number; mlSold: number }>;
  byPerfume: Array<{ perfumeId: string; perfumeName: string; fundedMl: number; remainingMl: number; soldMl: number }>;
  withdrawals: { pendingCount: number; pendingAmount: number; paidCount: number; paidAmount: number };
  invariant: { healthy: boolean; violations: Array<{ investmentId: string; detail: string }> };
}

interface Investor {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  totalInvestedMinor: number;
  totalRecoveredCapitalMinor: number;
  totalProfitMinor: number;
  totalWithdrawnMinor: number;
  activeInvestmentCount: number;
}

interface Investment {
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
}

interface Withdrawal {
  id: string;
  investmentId: string;
  investorId: string;
  amountMinor: number;
  status: string;
  paymentSource: string;
  rejectReason?: string;
  createdAt?: string;
}

interface PerfumeOption {
  id: string;
  name: string;
  brand?: string;
  isPersonalCollection?: boolean;
  isActive?: boolean;
}

const bdt = (minor: number) => `৳${(minor / 100).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
const bdtMajor = (major: number) => `৳${major.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;

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

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] uppercase tracking-wider ${STATUS_BADGE[status] || "bg-zinc-500/10 text-zinc-400"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

const emptyInvestorForm = { name: "", email: "", phone: "", notes: "" };

interface AllocationRow {
  perfumeId: string;
  ml: string;
  costPerMl: string;
}

export default function AdminInvestmentsPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [perfumes, setPerfumes] = useState<PerfumeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"investments" | "investors" | "withdrawals">("investments");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  // Forms
  const [showInvestorForm, setShowInvestorForm] = useState(false);
  const [investorForm, setInvestorForm] = useState(emptyInvestorForm);
  const [showInvestmentForm, setShowInvestmentForm] = useState(false);
  const [invForm, setInvForm] = useState({ investorId: "", profitSharePercentage: "", notes: "" });
  const [allocRows, setAllocRows] = useState<AllocationRow[]>([{ perfumeId: "", ml: "", costPerMl: "" }]);
  const [saving, setSaving] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<Withdrawal | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reportRes, investorsRes, investmentsRes, withdrawalsRes, perfumesRes] = await Promise.all([
        fetch("/api/investments/reports").then((r) => r.json()),
        fetch("/api/investors").then((r) => r.json()),
        fetch("/api/investments").then((r) => r.json()),
        fetch("/api/investment-withdrawals").then((r) => r.json()),
        fetch("/api/perfumes").then((r) => r.json()),
      ]);
      setReport(reportRes.error ? null : reportRes);
      setInvestors(Array.isArray(investorsRes) ? investorsRes : []);
      setInvestments(Array.isArray(investmentsRes) ? investmentsRes : []);
      setWithdrawals(Array.isArray(withdrawalsRes) ? withdrawalsRes : []);
      const perfumeList = Array.isArray(perfumesRes) ? perfumesRes : perfumesRes?.perfumes || [];
      setPerfumes(
        (perfumeList as PerfumeOption[]).filter((p) => !p.isPersonalCollection)
      );
    } catch {
      toast("Failed to load investment data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredInvestments = useMemo(() => {
    let rows = investments;
    if (statusFilter) rows = rows.filter((i) => i.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((i) => i.investorName?.toLowerCase().includes(q) || i.id.toLowerCase().includes(q));
    }
    return rows;
  }, [investments, statusFilter, search]);

  const investorById = useMemo(() => new Map(investors.map((i) => [i.id, i])), [investors]);

  // ─── Actions ───────────────────────────────────────────

  const saveInvestor = async () => {
    if (!investorForm.name || !investorForm.email) return toast("Name and email are required", "error");
    setSaving(true);
    try {
      const res = await fetch("/api/investors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(investorForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast("Investor created", "success");
      setInvestorForm(emptyInvestorForm);
      setShowInvestorForm(false);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to create investor", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleInvestorStatus = async (inv: Investor) => {
    const next = inv.status === "active" ? "inactive" : "active";
    const res = await fetch(`/api/investors/${inv.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      toast(`Investor marked ${next}`, "success");
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error || "Update failed", "error");
    }
  };

  const investmentTotal = useMemo(
    () =>
      allocRows.reduce((s, r) => {
        const ml = Number(r.ml);
        const cost = Number(r.costPerMl);
        if (!Number.isFinite(ml) || !Number.isFinite(cost) || ml <= 0 || cost <= 0) return s;
        return s + ml * cost;
      }, 0),
    [allocRows]
  );

  const saveInvestment = async () => {
    if (!invForm.investorId) return toast("Select an investor", "error");
    const allocations = allocRows
      .filter((r) => r.perfumeId && Number(r.ml) > 0 && Number(r.costPerMl) > 0)
      .map((r) => ({ perfumeId: r.perfumeId, ml: Number(r.ml), costPerMl: Number(r.costPerMl) }));
    if (!allocations.length) return toast("Add at least one allocation", "error");
    setSaving(true);
    try {
      const body: Record<string, unknown> = { investorId: invForm.investorId, allocations, notes: invForm.notes };
      if (invForm.profitSharePercentage.trim()) body.profitSharePercentage = Number(invForm.profitSharePercentage);
      const res = await fetch("/api/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast("Investment created", "success");
      setInvForm({ investorId: "", profitSharePercentage: "", notes: "" });
      setAllocRows([{ perfumeId: "", ml: "", costPerMl: "" }]);
      setShowInvestmentForm(false);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to create investment", "error");
    } finally {
      setSaving(false);
    }
  };

  const decideWithdrawal = async (w: Withdrawal, action: "approve" | "reject" | "paid", reason?: string) => {
    const res = await fetch(`/api/investment-withdrawals/${w.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast(`Withdrawal ${action === "paid" ? "marked paid" : `${action}d`}`, "success");
      load();
    } else {
      toast(data.error || "Action failed", "error");
    }
  };

  // ─── Render ────────────────────────────────────────────

  if (loading && !report) {
    return <div className="p-8 text-[var(--text-muted)]">Loading investments…</div>;
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-light text-[var(--text-primary)]">Investments</h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Inventory investment system — two-stream capital recovery &amp; profit sharing
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]" title="Refresh">
            <RefreshCw size={16} />
          </button>
          {[
            { type: "investments", label: "Investments CSV" },
            { type: "investors", label: "Investors CSV" },
            { type: "investment-ledger", label: "Ledger CSV" },
          ].map((x) => (
            <button
              key={x.type}
              onClick={() => { window.location.href = `/api/export?type=${x.type}`; }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[var(--border)] rounded hover:bg-[var(--gold-tint)]"
            >
              <Download size={14} /> {x.label}
            </button>
          ))}
        </div>
      </div>

      {report && !report.invariant.healthy && (
        <div className="flex items-start gap-2 p-3 rounded border border-red-500/40 bg-red-500/10 text-sm text-red-400">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Invariant violation detected — investigate before further mutations.</p>
            {report.invariant.violations.map((v) => (
              <p key={v.investmentId} className="text-xs mt-1">{v.investmentId}: {v.detail}</p>
            ))}
          </div>
        </div>
      )}

      {/* Overview cards */}
      {report && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Invested", value: bdtMajor(report.totals.invested) },
            { label: "Capital Recovered", value: bdtMajor(report.totals.capitalRecovered) },
            { label: "Remaining Inventory Cost", value: bdtMajor(report.totals.remainingInventoryCost) },
            { label: "Available Investor Profit", value: bdtMajor(report.totals.availableInvestorProfit) },
            { label: "Withdrawn Profit", value: bdtMajor(report.totals.withdrawnInvestorProfit) },
            { label: "Funded Stock Remaining", value: `${report.inventory.fundedMlRemaining} ml` },
            { label: "Funded Stock Sold", value: `${report.inventory.fundedMlSold} ml` },
            { label: "Pending Withdrawals", value: `${report.withdrawals.pendingCount} · ${bdtMajor(report.withdrawals.pendingAmount)}` },
          ].map((c) => (
            <div key={c.label} className="p-4 rounded border border-[var(--border)] bg-[var(--bg-surface)]">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{c.label}</p>
              <p className="text-lg font-medium text-[var(--text-primary)] mt-1">{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Monthly breakdown */}
      {report && report.monthlyBreakdown.length > 0 && (
        <div className="rounded border border-[var(--border)] bg-[var(--bg-surface)] overflow-x-auto">
          <p className="px-4 pt-3 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Monthly activity</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="px-4 py-2">Month</th>
                <th className="px-4 py-2">Capital Recovered</th>
                <th className="px-4 py-2">Investor Profit</th>
                <th className="px-4 py-2">ml Sold</th>
              </tr>
            </thead>
            <tbody>
              {report.monthlyBreakdown.slice(0, 12).map((m) => (
                <tr key={m.month} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2">{m.month}</td>
                  <td className="px-4 py-2">{bdtMajor(m.capitalRecovered)}</td>
                  <td className="px-4 py-2">{bdtMajor(m.investorProfit)}</td>
                  <td className="px-4 py-2">{m.mlSold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        {(["investments", "investors", "withdrawals"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs uppercase tracking-wider border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-[var(--gold)] text-[var(--gold)]"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {t}
            {t === "withdrawals" && report && report.withdrawals.pendingCount > 0 && (
              <span className="ml-1.5 px-1.5 rounded-full bg-amber-500/20 text-amber-500">{report.withdrawals.pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Investments tab ─── */}
      {tab === "investments" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search investor / id…"
              className="px-3 py-1.5 text-sm rounded border border-[var(--border)] bg-[var(--bg-base)] w-56"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 text-sm rounded border border-[var(--border)] bg-[var(--bg-base)]"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="recovering">Recovering</option>
              <option value="closed">Closed</option>
              <option value="bought_back">Bought back</option>
            </select>
            <button
              onClick={() => setShowInvestmentForm((v) => !v)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--gold)] text-black rounded hover:opacity-90"
            >
              <Plus size={14} /> New Investment
            </button>
          </div>

          {showInvestmentForm && (
            <div className="p-4 rounded border border-[var(--border)] bg-[var(--bg-surface)] space-y-3">
              <div className="grid md:grid-cols-3 gap-3">
                <select
                  value={invForm.investorId}
                  onChange={(e) => setInvForm({ ...invForm, investorId: e.target.value })}
                  className="px-3 py-2 text-sm rounded border border-[var(--border)] bg-[var(--bg-base)]"
                >
                  <option value="">Select investor…</option>
                  {investors.filter((i) => i.status === "active").map((i) => (
                    <option key={i.id} value={i.id}>{i.name} ({i.email})</option>
                  ))}
                </select>
                <input
                  value={invForm.profitSharePercentage}
                  onChange={(e) => setInvForm({ ...invForm, profitSharePercentage: e.target.value })}
                  placeholder="Profit share % (default from settings)"
                  className="px-3 py-2 text-sm rounded border border-[var(--border)] bg-[var(--bg-base)]"
                />
                <input
                  value={invForm.notes}
                  onChange={(e) => setInvForm({ ...invForm, notes: e.target.value })}
                  placeholder="Notes"
                  className="px-3 py-2 text-sm rounded border border-[var(--border)] bg-[var(--bg-base)]"
                />
              </div>

              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Allocations (funded inventory lots)</p>
              {allocRows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_100px_140px_36px] gap-2">
                  <select
                    value={row.perfumeId}
                    onChange={(e) => setAllocRows(allocRows.map((r, i) => (i === idx ? { ...r, perfumeId: e.target.value } : r)))}
                    className="px-3 py-2 text-sm rounded border border-[var(--border)] bg-[var(--bg-base)]"
                  >
                    <option value="">Select perfume…</option>
                    {perfumes.map((p) => (
                      <option key={p.id} value={p.id}>{p.brand ? `${p.brand} — ` : ""}{p.name}</option>
                    ))}
                  </select>
                  <input
                    value={row.ml}
                    onChange={(e) => setAllocRows(allocRows.map((r, i) => (i === idx ? { ...r, ml: e.target.value } : r)))}
                    placeholder="ml"
                    className="px-3 py-2 text-sm rounded border border-[var(--border)] bg-[var(--bg-base)]"
                  />
                  <input
                    value={row.costPerMl}
                    onChange={(e) => setAllocRows(allocRows.map((r, i) => (i === idx ? { ...r, costPerMl: e.target.value } : r)))}
                    placeholder="Cost/ml (BDT)"
                    className="px-3 py-2 text-sm rounded border border-[var(--border)] bg-[var(--bg-base)]"
                  />
                  <button
                    onClick={() => setAllocRows(allocRows.filter((_, i) => i !== idx))}
                    disabled={allocRows.length === 1}
                    className="text-red-400 disabled:opacity-30"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setAllocRows([...allocRows, { perfumeId: "", ml: "", costPerMl: "" }])}
                  className="text-xs text-[var(--gold)]"
                >
                  + Add lot
                </button>
                <p className="text-sm text-[var(--text-secondary)]">
                  Investment amount (derived): <span className="text-[var(--text-primary)] font-medium">{bdtMajor(investmentTotal)}</span>
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowInvestmentForm(false)} className="px-3 py-1.5 text-xs border border-[var(--border)] rounded">Cancel</button>
                <button onClick={saveInvestment} disabled={saving} className="px-3 py-1.5 text-xs bg-[var(--gold)] text-black rounded disabled:opacity-50">
                  {saving ? "Creating…" : "Create Investment"}
                </button>
              </div>
            </div>
          )}

          <div className="rounded border border-[var(--border)] bg-[var(--bg-surface)] overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="px-4 py-2.5">Investor</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Principal</th>
                  <th className="px-4 py-2.5">Recovered</th>
                  <th className="px-4 py-2.5">Recovery %</th>
                  <th className="px-4 py-2.5">Available Profit</th>
                  <th className="px-4 py-2.5">Share %</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filteredInvestments.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-[var(--text-muted)]">No investments</td></tr>
                )}
                {filteredInvestments.map((inv) => (
                  <tr key={inv.id} className="border-t border-[var(--border)] hover:bg-[var(--gold-tint)]">
                    <td className="px-4 py-2.5">{inv.investorName || investorById.get(inv.investorId)?.name || inv.investorId.slice(0, 8)}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={inv.status} /></td>
                    <td className="px-4 py-2.5">{bdt(inv.amountMinor)}</td>
                    <td className="px-4 py-2.5">{bdt(inv.recoveredCapitalMinor)}</td>
                    <td className="px-4 py-2.5">
                      {inv.amountMinor > 0 ? Math.round((inv.recoveredCapitalMinor / inv.amountMinor) * 100) : 0}%
                    </td>
                    <td className="px-4 py-2.5">{bdt(inv.availableProfitMinor)}</td>
                    <td className="px-4 py-2.5">{inv.profitSharePercentage}%</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/investments/${inv.id}`} className="text-xs text-[var(--gold)] hover:underline">Details</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Investors tab ─── */}
      {tab === "investors" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowInvestorForm((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--gold)] text-black rounded hover:opacity-90"
            >
              <Plus size={14} /> New Investor
            </button>
          </div>

          {showInvestorForm && (
            <div className="p-4 rounded border border-[var(--border)] bg-[var(--bg-surface)] grid md:grid-cols-4 gap-3">
              <input value={investorForm.name} onChange={(e) => setInvestorForm({ ...investorForm, name: e.target.value })} placeholder="Name *" className="px-3 py-2 text-sm rounded border border-[var(--border)] bg-[var(--bg-base)]" />
              <input value={investorForm.email} onChange={(e) => setInvestorForm({ ...investorForm, email: e.target.value })} placeholder="Email * (links to user account)" className="px-3 py-2 text-sm rounded border border-[var(--border)] bg-[var(--bg-base)]" />
              <input value={investorForm.phone} onChange={(e) => setInvestorForm({ ...investorForm, phone: e.target.value })} placeholder="Phone" className="px-3 py-2 text-sm rounded border border-[var(--border)] bg-[var(--bg-base)]" />
              <div className="flex gap-2">
                <input value={investorForm.notes} onChange={(e) => setInvestorForm({ ...investorForm, notes: e.target.value })} placeholder="Notes" className="flex-1 px-3 py-2 text-sm rounded border border-[var(--border)] bg-[var(--bg-base)]" />
                <button onClick={saveInvestor} disabled={saving} className="px-3 py-1.5 text-xs bg-[var(--gold)] text-black rounded disabled:opacity-50">
                  {saving ? "…" : "Save"}
                </button>
              </div>
            </div>
          )}

          <div className="rounded border border-[var(--border)] bg-[var(--bg-surface)] overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Invested</th>
                  <th className="px-4 py-2.5">Recovered</th>
                  <th className="px-4 py-2.5">Profit</th>
                  <th className="px-4 py-2.5">Withdrawn</th>
                  <th className="px-4 py-2.5">Active</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {investors.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-6 text-center text-[var(--text-muted)]">No investors</td></tr>
                )}
                {investors.map((i) => (
                  <tr key={i.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2.5">{i.name}</td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{i.email}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={i.status} /></td>
                    <td className="px-4 py-2.5">{bdt(i.totalInvestedMinor || 0)}</td>
                    <td className="px-4 py-2.5">{bdt(i.totalRecoveredCapitalMinor || 0)}</td>
                    <td className="px-4 py-2.5">{bdt(i.totalProfitMinor || 0)}</td>
                    <td className="px-4 py-2.5">{bdt(i.totalWithdrawnMinor || 0)}</td>
                    <td className="px-4 py-2.5">{i.activeInvestmentCount || 0}</td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => toggleInvestorStatus(i)} className="text-xs text-[var(--gold)] hover:underline">
                        {i.status === "active" ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Withdrawals tab ─── */}
      {tab === "withdrawals" && (
        <div className="rounded border border-[var(--border)] bg-[var(--bg-surface)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="px-4 py-2.5">Requested</th>
                <th className="px-4 py-2.5">Investor</th>
                <th className="px-4 py-2.5">Investment</th>
                <th className="px-4 py-2.5">Amount</th>
                <th className="px-4 py-2.5">Source</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-[var(--text-muted)]">No withdrawal requests</td></tr>
              )}
              {withdrawals.map((w) => (
                <tr key={w.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">{w.createdAt ? new Date(w.createdAt).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-2.5">{investorById.get(w.investorId)?.name || w.investorId.slice(0, 8)}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/investments/${w.investmentId}`} className="text-[var(--gold)] hover:underline">{w.investmentId.slice(0, 8)}</Link>
                  </td>
                  <td className="px-4 py-2.5">{bdt(w.amountMinor)}</td>
                  <td className="px-4 py-2.5">{w.paymentSource}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={w.status} />
                    {w.status === "rejected" && w.rejectReason && (
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{w.rejectReason}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 space-x-2">
                    {w.status === "pending" && (
                      <>
                        <button onClick={() => decideWithdrawal(w, "approve")} className="text-xs text-emerald-500 hover:underline">Approve</button>
                        <button onClick={() => { setRejectTarget(w); setRejectReason(""); }} className="text-xs text-red-400 hover:underline">Reject</button>
                      </>
                    )}
                    {w.status === "approved" && (
                      <button onClick={() => decideWithdrawal(w, "paid")} className="text-xs text-sky-500 hover:underline">Mark Paid</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <button
            type="button"
            aria-label="Close rejection dialog"
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={() => setRejectTarget(null)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6">
            <h2 className="font-serif text-xl font-light text-[var(--text-primary)]">Reject withdrawal</h2>
            <input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Rejection reason (required)"
              className="mt-4 w-full px-3 py-2 text-sm rounded border border-[var(--border)] bg-[var(--bg-base)]"
            />
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="rounded border border-[var(--border)] px-4 py-2 text-xs uppercase tracking-wider text-[var(--text-secondary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!rejectReason.trim()) {
                    toast("A rejection reason is required", "error");
                    return;
                  }
                  decideWithdrawal(rejectTarget, "reject", rejectReason.trim());
                  setRejectTarget(null);
                }}
                className="rounded bg-red-500 px-4 py-2 text-xs uppercase tracking-wider text-white hover:opacity-90"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
