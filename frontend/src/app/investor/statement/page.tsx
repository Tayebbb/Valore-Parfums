"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Printer, RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/Toaster";

interface StatementInvestor {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  memberSince?: string;
}

interface StatementPosition {
  originalCapital: number;
  additionalCapital: number;
  totalCapitalInvested: number;
  recoveredCapital: number;
  remainingInventoryCost: number;
  realizedProfit: number;
  profitWithdrawn: number;
  availableProfit: number;
  currentAccountValue: number;
  buybackValueToday: number;
  roiPercent: number;
  activeInvestmentCount: number;
  completedInvestmentCount: number;
}

interface StatementInvestment {
  id: string;
  label: string;
  status: string;
  profitSharePercentage: number;
  amount: number;
  recoveredCapital: number;
  remainingInventoryCost: number;
  availableProfit: number;
  withdrawnProfit: number;
  realizedProfit: number;
  createdAt?: string;
}

interface StatementTransaction {
  id: string;
  type: string;
  stream: string;
  investmentId: string;
  amount: number;
  balanceAfter: number;
  mlSold: number | null;
  notes: string;
  createdAt?: string;
}

interface Statement {
  investor: StatementInvestor;
  position: StatementPosition;
  investments: StatementInvestment[];
  monthlyBreakdown: Array<{ month: string; capitalRecovered: number; profit: number }>;
  transactions: StatementTransaction[];
  generatedAt: string;
}

const bdt = (v: number) => `৳${v.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");

const TYPE_LABEL: Record<string, string> = {
  investment_created: "Capital contribution",
  inventory_purchased: "Inventory purchase",
  capital_recovery: "Capital recovery",
  profit_generated: "Profit earned",
  profit_withdrawal: "Profit withdrawal",
  buyback: "Buyback",
  adjustment: "Adjustment",
  investment_closed: "Investment closed",
};

function StatementContent() {
  const searchParams = useSearchParams();
  const investorId = searchParams.get("investorId");
  const [statement, setStatement] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = investorId
        ? `/api/investor/statement?investorId=${encodeURIComponent(investorId)}`
        : "/api/investor/statement";
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 404) setNotLinked(true);
        else toast(data.error || "Failed to load statement", "error");
        setStatement(null);
      } else {
        setNotLinked(false);
        setStatement(data);
      }
    } catch {
      toast("Failed to load statement", "error");
    } finally {
      setLoading(false);
    }
  }, [investorId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="py-12 text-center text-[var(--text-muted)]">Preparing your statement…</div>;

  if (notLinked) {
    return (
      <div className="py-12 text-center space-y-2">
        <p className="text-[var(--text-primary)]">No investor profile is linked to this account yet.</p>
        <p className="text-sm text-[var(--text-muted)]">Contact Valore Parfums to have your investor profile connected to this email.</p>
      </div>
    );
  }

  if (!statement) return null;

  const { investor, position, investments, monthlyBreakdown, transactions } = statement;

  const positionRows: Array<{ label: string; value: string; highlight?: boolean }> = [
    { label: "Original Capital", value: bdt(position.originalCapital) },
    { label: "Additional Capital", value: bdt(position.additionalCapital) },
    { label: "Total Capital Invested", value: bdt(position.totalCapitalInvested), highlight: true },
    { label: "Recovered Capital", value: bdt(position.recoveredCapital) },
    { label: "Remaining Inventory Cost", value: bdt(position.remainingInventoryCost) },
    { label: "Realized Profit", value: bdt(position.realizedProfit) },
    { label: "Profit Withdrawn", value: bdt(position.profitWithdrawn) },
    { label: "Available Profit", value: bdt(position.availableProfit), highlight: true },
    { label: "Current Account Value", value: bdt(position.currentAccountValue), highlight: true },
    { label: "Buyback Value Today", value: bdt(position.buybackValueToday) },
    { label: "Return on Investment", value: `${position.roiPercent}%` },
  ];

  return (
    <div className="space-y-6 print:text-black">
      {/* Actions (hidden when printing) */}
      <div className="flex items-center justify-between print:hidden">
        <Link href="/investor" className="text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--gold)]">
          ← Dashboard
        </Link>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]" title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--gold)] text-black rounded hover:opacity-90"
          >
            <Printer size={14} /> Print / Save PDF
          </button>
        </div>
      </div>

      {/* Statement header */}
      <div className="rounded border border-[var(--border)] bg-[var(--bg-surface)] p-5 print:border-black/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl font-light text-[var(--gold)] print:text-black">Valore Parfums</h2>
            <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Investor Account Statement</p>
          </div>
          <div className="text-right text-xs text-[var(--text-secondary)]">
            <p>Generated {fmtDate(statement.generatedAt)}</p>
            <p className="mt-0.5 uppercase tracking-wider">Status: {investor.status}</p>
          </div>
        </div>
        <div className="mt-4 grid sm:grid-cols-3 gap-2 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Investor</p>
            <p className="text-[var(--text-primary)]">{investor.name}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Email</p>
            <p className="text-[var(--text-secondary)] break-all">{investor.email}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Member since</p>
            <p className="text-[var(--text-secondary)]">{fmtDate(investor.memberSince)}</p>
          </div>
        </div>
      </div>

      {/* Account position */}
      <div className="rounded border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden print:border-black/20">
        <p className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Account position</p>
        <table className="w-full text-sm">
          <tbody>
            {positionRows.map((r) => (
              <tr key={r.label} className="border-t border-[var(--border)]">
                <td className="px-4 py-2 text-[var(--text-secondary)]">{r.label}</td>
                <td className={`px-4 py-2 text-right ${r.highlight ? "font-medium text-[var(--gold)] print:text-black" : "text-[var(--text-primary)]"}`}>
                  {r.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Capital contributions */}
      <div className="rounded border border-[var(--border)] bg-[var(--bg-surface)] overflow-x-auto print:border-black/20">
        <p className="px-4 pt-3 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Capital contributions</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Contribution</th>
              <th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">Recovered</th>
              <th className="px-4 py-2">Remaining</th>
              <th className="px-4 py-2">Realized Profit</th>
              <th className="px-4 py-2">Share</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {investments.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-[var(--text-muted)]">No investments yet</td></tr>
            )}
            {investments.map((inv) => (
              <tr key={inv.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-2 whitespace-nowrap">{fmtDate(inv.createdAt)}</td>
                <td className="px-4 py-2">{inv.label}</td>
                <td className="px-4 py-2">{bdt(inv.amount)}</td>
                <td className="px-4 py-2">{bdt(inv.recoveredCapital)}</td>
                <td className="px-4 py-2">{bdt(inv.remainingInventoryCost)}</td>
                <td className="px-4 py-2">{bdt(inv.realizedProfit)}</td>
                <td className="px-4 py-2">{inv.profitSharePercentage}%</td>
                <td className="px-4 py-2 uppercase text-xs tracking-wider">{inv.status.replace(/_/g, " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Monthly performance */}
      {monthlyBreakdown.length > 0 && (
        <div className="rounded border border-[var(--border)] bg-[var(--bg-surface)] overflow-x-auto print:border-black/20">
          <p className="px-4 pt-3 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Monthly performance</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="px-4 py-2">Month</th>
                <th className="px-4 py-2">Capital Recovered</th>
                <th className="px-4 py-2">Profit Earned</th>
              </tr>
            </thead>
            <tbody>
              {monthlyBreakdown.map((m) => (
                <tr key={m.month} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2">{m.month}</td>
                  <td className="px-4 py-2">{bdt(m.capitalRecovered)}</td>
                  <td className="px-4 py-2">{bdt(m.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Transaction history */}
      <div className="rounded border border-[var(--border)] bg-[var(--bg-surface)] overflow-x-auto print:border-black/20">
        <p className="px-4 pt-3 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Transaction history</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">Balance After</th>
              <th className="px-4 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-[var(--text-muted)]">No transactions yet</td></tr>
            )}
            {transactions.map((t) => (
              <tr key={t.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-2 whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                <td className="px-4 py-2">{TYPE_LABEL[t.type] || t.type}</td>
                <td className={`px-4 py-2 ${t.amount < 0 ? "text-red-500 print:text-black" : ""}`}>{bdt(t.amount)}</td>
                <td className="px-4 py-2">{bdt(t.balanceAfter)}</td>
                <td className="px-4 py-2 text-xs text-[var(--text-muted)] max-w-[260px] truncate" title={t.notes}>{t.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-[var(--text-muted)] text-center pb-4">
        This statement is generated from the immutable investment ledger. Capital recovery is a return of invested
        capital, not profit. Only realized profit is withdrawable.
      </p>
    </div>
  );
}

export default function InvestorStatementPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-[var(--text-muted)]">Preparing your statement…</div>}>
      <StatementContent />
    </Suspense>
  );
}
