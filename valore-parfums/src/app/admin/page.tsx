"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  TrendingUp, DollarSign, ShoppingCart, Package, AlertTriangle, Inbox, Wallet
} from "lucide-react";
import { toast } from "@/components/ui/Toaster";
import { useAuth } from "@/store/auth";

const BarChart = dynamic(() => import("recharts").then(m => m.BarChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then(m => m.Bar), { ssr: false });
const LineChart = dynamic(() => import("recharts").then(m => m.LineChart), { ssr: false });
const Line = dynamic(() => import("recharts").then(m => m.Line), { ssr: false });
const XAxis = dynamic(() => import("recharts").then(m => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then(m => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then(m => m.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then(m => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then(m => m.ResponsiveContainer), { ssr: false });
const AreaChart = dynamic(() => import("recharts").then(m => m.AreaChart), { ssr: false });
const Area = dynamic(() => import("recharts").then(m => m.Area), { ssr: false });

interface OwnerAccount {
  name: string;
  email: string;
  totalEarned: number;
  storeShareEarned: number;
  totalWithdrawn: number;
  availableBalance: number;
}

interface DashboardData {
  totalOrders: number;
  completedOrders: number;
  pendingOrders: number;
  totalRevenue: number;
  totalProfit: number;
  todayOrders: number;
  todayRevenue: number;
  todayProfit: number;
  monthRevenue: number;
  monthProfit: number;
  lowStockPerfumes: { id: string; name: string; totalStockMl: number }[];
  lowStockBottles: { id: string; ml: number; availableCount: number }[];
  mostSold: { perfumeName: string; _sum: { quantity: number; totalPrice: number } }[];
  mostRequested: { perfumeName: string; _count: number }[];
  stockRequests: number;
  recentOrders: { id: string; customerName: string; total: number; status: string; createdAt: string }[];
  dailySales: { date: string; revenue: number; profit: number; orders: number }[];
  monthlySales: { month: string; revenue: number; profit: number; orders: number }[];
  owners: {
    owner1Name: string;
    owner2Name: string;
    owner1Share: number;
    owner2Share: number;
    totalProfit: { owner1: number; owner2: number };
    todayProfit: { owner1: number; owner2: number };
    monthProfit: { owner1: number; owner2: number };
  };
  ownerAccounts: OwnerAccount[];
}

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5 animate-fade-up">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded bg-[var(--gold-tint)]">
          <Icon size={18} className="text-[var(--gold)]" />
        </div>
        <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">{label}</span>
      </div>
      <p className="font-serif text-2xl font-light text-[var(--text-primary)]">{value}</p>
      {sub && <p className="text-xs text-[var(--text-secondary)] mt-1">{sub}</p>}
    </div>
  );
}

const statusClass = (s: string) => `status-${s.toLowerCase().replace(/ /g, "")}`;

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading, fetchUser } = useAuth();

  const loadDashboard = () =>
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData);

  useEffect(() => {
    if (authLoading) fetchUser();
  }, [authLoading, fetchUser]);

  useEffect(() => {
    loadDashboard().finally(() => setLoading(false));
  }, []);

  if (loading || authLoading) {
    return (
      <div className="space-y-6">
        <h1 className="font-serif text-3xl font-light">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="skeleton h-28 rounded" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="skeleton h-72 rounded" />
          <div className="skeleton h-72 rounded" />
        </div>
      </div>
    );
  }

  if (!data) return <p>Failed to load dashboard</p>;

  const fmt = (n: number) => n.toLocaleString("en-BD");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-light">Dashboard</h1>
        <div className="gold-line mt-3" />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={DollarSign} label="Total Revenue" value={`${fmt(data.totalRevenue)} BDT`} sub={`Today: ${fmt(data.todayRevenue)} BDT`} />
        <StatCard icon={TrendingUp} label="Total Profit" value={`${fmt(data.totalProfit)} BDT`} sub={`Today: ${fmt(data.todayProfit)} BDT`} />
        <StatCard icon={ShoppingCart} label="Total Orders" value={fmt(data.totalOrders)} sub={`Today: ${data.todayOrders}`} />
        <StatCard icon={Package} label="Pending Orders" value={fmt(data.pendingOrders)} sub={`Completed: ${data.completedOrders}`} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={DollarSign} label="Monthly Revenue" value={`${fmt(data.monthRevenue)} BDT`} />
        <StatCard icon={TrendingUp} label="Monthly Profit" value={`${fmt(data.monthProfit)} BDT`} />
        <StatCard icon={AlertTriangle} label="Low Stock Alerts" value={`${data.lowStockPerfumes.length}`} sub="Perfumes below threshold" />
        <StatCard icon={Inbox} label="Stock Requests" value={`${data.stockRequests}`} sub="Pending requests" />
      </div>

      {/* Owner Profit Breakdown — Per Owner */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-5">Owner Profit Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Owner 1 */}
          <div className="space-y-3">
            <h4 className="font-serif text-lg text-[var(--gold)]">{data.owners.owner1Name}</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[var(--bg-surface)] rounded p-3">
                <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Total</p>
                <p className="font-serif text-lg text-[var(--gold)]">{fmt(data.owners.totalProfit.owner1)} BDT</p>
              </div>
              <div className="bg-[var(--bg-surface)] rounded p-3">
                <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Month</p>
                <p className="font-serif text-lg text-[var(--success)]">{fmt(data.owners.monthProfit.owner1)} BDT</p>
              </div>
              <div className="bg-[var(--bg-surface)] rounded p-3">
                <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Today</p>
                <p className="font-serif text-lg">{fmt(data.owners.todayProfit.owner1)} BDT</p>
              </div>
            </div>
          </div>
          {/* Owner 2 */}
          <div className="space-y-3">
            <h4 className="font-serif text-lg text-[var(--gold)]">{data.owners.owner2Name}</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[var(--bg-surface)] rounded p-3">
                <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Total</p>
                <p className="font-serif text-lg text-[var(--gold)]">{fmt(data.owners.totalProfit.owner2)} BDT</p>
              </div>
              <div className="bg-[var(--bg-surface)] rounded p-3">
                <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Month</p>
                <p className="font-serif text-lg text-[var(--success)]">{fmt(data.owners.monthProfit.owner2)} BDT</p>
              </div>
              <div className="bg-[var(--bg-surface)] rounded p-3">
                <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Today</p>
                <p className="font-serif text-lg">{fmt(data.owners.todayProfit.owner2)} BDT</p>
              </div>
            </div>
          </div>
        </div>
        {/* Store Profit Split Info */}
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            Store profit split: {data.owners.owner1Name} {data.owners.owner1Share}% / {data.owners.owner2Name} {data.owners.owner2Share}%
          </p>
        </div>
      </div>

      {/* Owner Account Balances */}
      {data.ownerAccounts && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
          <div className="flex items-center gap-3 mb-5">
            <Wallet size={18} className="text-[var(--gold)]" />
            <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Owner Accounts</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {data.ownerAccounts.map((acct) => (
              <div key={acct.name} className="space-y-3">
                <h4 className="font-serif text-lg text-[var(--gold)]">{acct.name}</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[var(--bg-surface)] rounded p-3">
                    <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Owner Stock Profit</p>
                    <p className="font-serif text-lg text-[var(--gold)]">{fmt(acct.totalEarned)} BDT</p>
                  </div>
                  <div className="bg-[var(--bg-surface)] rounded p-3">
                    <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Store Share</p>
                    <p className="font-serif text-lg text-[var(--gold)]">{fmt(acct.storeShareEarned)} BDT</p>
                  </div>
                  <div className="bg-[var(--bg-surface)] rounded p-3">
                    <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Withdrawn</p>
                    <p className="font-serif text-lg text-[var(--error)]">{fmt(acct.totalWithdrawn)} BDT</p>
                  </div>
                  <div className="bg-[var(--bg-surface)] rounded p-3">
                    <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Available</p>
                    <p className={`font-serif text-lg ${acct.availableBalance >= 0 ? "text-[var(--success)]" : "text-[var(--error)]"}`}>{fmt(acct.availableBalance)} BDT</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Withdrawal — only for the logged-in owner (matched by email, fallback to name) */}
      {data.ownerAccounts && (() => {
        const myAccount = data.ownerAccounts.find((acct) =>
          (acct.email && user?.email && acct.email.toLowerCase() === user.email.toLowerCase()) ||
          (!acct.email && user?.name && user.name.toLowerCase().includes(acct.name.toLowerCase()))
        );
        return myAccount ? (
          <WithdrawalsSection key={myAccount.name} ownerName={myAccount.name} availableBalance={myAccount.availableBalance} canWithdraw onWithdraw={loadDashboard} />
        ) : null;
      })()}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Sales */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
          <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Daily Sales (7 Days)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={data.dailySales}>
              <defs>
                <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#c9a55c" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#c9a55c" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: "rgba(245,240,232,0.4)", fontSize: 11 }} axisLine={false} />
              <YAxis tick={{ fill: "rgba(245,240,232,0.4)", fontSize: 11 }} axisLine={false} />
              <Tooltip contentStyle={{ background: "#18181c", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, fontSize: 12 }} />
              <Area type="monotone" dataKey="revenue" stroke="#c9a55c" fill="url(#goldGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly Sales */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
          <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Monthly Sales</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.monthlySales}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fill: "rgba(245,240,232,0.4)", fontSize: 11 }} axisLine={false} />
              <YAxis tick={{ fill: "rgba(245,240,232,0.4)", fontSize: 11 }} axisLine={false} />
              <Tooltip contentStyle={{ background: "#18181c", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, fontSize: 12 }} />
              <Bar dataKey="revenue" fill="#c9a55c" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Profit Graph */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
          <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Profit Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data.dailySales}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: "rgba(245,240,232,0.4)", fontSize: 11 }} axisLine={false} />
              <YAxis tick={{ fill: "rgba(245,240,232,0.4)", fontSize: 11 }} axisLine={false} />
              <Tooltip contentStyle={{ background: "#18181c", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, fontSize: 12 }} />
              <Line type="monotone" dataKey="profit" stroke="#4ade80" strokeWidth={2} dot={{ r: 3, fill: "#4ade80" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Most Sold */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
          <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Most Sold Perfumes</h3>
          <div className="space-y-3">
            {data.mostSold.length === 0 && <p className="text-sm text-[var(--text-secondary)]">No sales yet</p>}
            {data.mostSold.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0">
                <div className="flex items-center gap-3">
                  <span className="font-serif text-lg text-[var(--gold)] w-6">{i + 1}</span>
                  <span className="text-sm">{item.perfumeName}</span>
                </div>
                <div className="text-right">
                  <span className="font-serif text-sm text-[var(--gold)]">{item._sum.quantity} sold</span>
                  <p className="text-xs text-[var(--text-muted)]">{fmt(item._sum.totalPrice ?? 0)} BDT</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Low Stock Alerts */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
          <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Low Stock Alerts</h3>
          <div className="space-y-2">
            {data.lowStockPerfumes.length === 0 && <p className="text-sm text-[var(--text-secondary)]">All stock levels healthy</p>}
            {data.lowStockPerfumes.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded bg-[rgba(248,113,113,0.06)] border border-[rgba(248,113,113,0.15)]">
                <span className="text-sm">{p.name}</span>
                <span className="text-xs font-mono text-[var(--error)]">{p.totalStockMl}ml left</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottle Alerts */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
          <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Bottle Availability</h3>
          <div className="space-y-2">
            {data.lowStockBottles.length === 0 && <p className="text-sm text-[var(--text-secondary)]">All bottles in stock</p>}
            {data.lowStockBottles.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-2 px-3 rounded bg-[rgba(251,191,36,0.06)] border border-[rgba(251,191,36,0.15)]">
                <span className="text-sm">{b.ml}ml bottle</span>
                <span className="text-xs font-mono text-[var(--warning)]">{b.availableCount} left</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Orders */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
          <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Recent Orders</h3>
          <div className="space-y-2">
            {data.recentOrders.length === 0 && <p className="text-sm text-[var(--text-secondary)]">No orders yet</p>}
            {data.recentOrders.map((o) => (
              <div key={o.id} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0">
                <div>
                  <p className="text-sm">{o.customerName}</p>
                  <p className="text-[10px] font-mono text-[var(--text-muted)]">{o.id.slice(0, 8)}</p>
                </div>
                <div className="text-right">
                  <span className="font-serif text-sm text-[var(--gold)]">{fmt(o.total)} BDT</span>
                  <div className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full mt-1 inline-block ${statusClass(o.status)}`}>
                    {o.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Most Requested */}
      {data.mostRequested.length > 0 && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5 max-w-md">
          <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Most Requested Perfumes</h3>
          <div className="space-y-2">
            {data.mostRequested.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0">
                <span className="text-sm">{item.perfumeName}</span>
                <span className="font-serif text-sm text-[var(--gold)]">{item._count} requests</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Withdrawals Section (Per Owner) ───────────────────────────────
interface Withdrawal {
  id: string;
  amount: number;
  ownerName: string;
  note: string;
  withdrawnBy: string;
  createdAt: string;
}

function WithdrawalsSection({ ownerName, availableBalance, canWithdraw, onWithdraw }: { ownerName: string; availableBalance: number; canWithdraw: boolean; onWithdraw?: () => void }) {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = () =>
    fetch(`/api/withdrawals?ownerName=${encodeURIComponent(ownerName)}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setWithdrawals(data); })
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, [ownerName]);

  const totalWithdrawn = withdrawals.reduce((s, w) => s + w.amount, 0);
  const fmt = (n: number) => n.toLocaleString("en-BD");

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast("Enter a valid amount", "error"); return; }
    if (amt > availableBalance) { toast(`Amount exceeds ${ownerName}'s available balance`, "error"); return; }

    setSubmitting(true);
    const res = await fetch("/api/withdrawals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amt, note, ownerName }),
    });
    if (res.ok) {
      toast(`Withdrawal for ${ownerName} recorded`, "success");
      setAmount("");
      setNote("");
      load();
      onWithdraw?.();
    } else {
      const err = await res.json().catch(() => ({}));
      toast(err.error || "Failed to record withdrawal", "error");
    }
    setSubmitting(false);
  };

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
      <div className="flex items-center gap-3 mb-5">
        <Wallet size={18} className="text-[var(--gold)]" />
        <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">{ownerName}&apos;s Withdrawals</h3>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-[var(--bg-surface)] rounded p-3">
          <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Total Withdrawn</p>
          <p className="font-serif text-lg text-[var(--error)]">{fmt(totalWithdrawn)} BDT</p>
        </div>
        <div className="bg-[var(--bg-surface)] rounded p-3">
          <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Available Balance</p>
          <p className={`font-serif text-lg ${availableBalance >= 0 ? "text-[var(--success)]" : "text-[var(--error)]"}`}>{fmt(availableBalance)} BDT</p>
        </div>
      </div>

      {/* Withdraw Form — only rendered for the logged-in owner's own account */}
      {canWithdraw ? (
        <form onSubmit={handleWithdraw} className="flex flex-col sm:flex-row items-start sm:items-end gap-3 mb-6">
          <div className="flex-1 w-full">
            <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Amount (BDT)</label>
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
              placeholder="Enter amount"
            />
          </div>
          <div className="flex-1 w-full">
            <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
              placeholder="e.g. Cash withdrawal"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 bg-[var(--gold)] text-black text-[10px] uppercase tracking-wider rounded hover:bg-[var(--gold-hover)] transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {submitting ? "Processing..." : "Withdraw"}
          </button>
        </form>
      ) : (
        <p className="text-xs text-[var(--text-muted)] mb-6 italic">Only {ownerName} can withdraw from this account</p>
      )}

      {/* History */}
      {loading ? (
        <div className="skeleton h-20 rounded" />
      ) : withdrawals.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)] text-center py-4">No withdrawals yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-2 px-3 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Date</th>
                <th className="text-right py-2 px-3 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Amount</th>
                <th className="text-left py-2 px-3 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">By</th>
                <th className="text-left py-2 px-3 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Note</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((w) => (
                <tr key={w.id} className="border-b border-[var(--border)]">
                  <td className="py-2 px-3 text-xs text-[var(--text-secondary)]">{new Date(w.createdAt).toLocaleDateString()}</td>
                  <td className="py-2 px-3 text-right font-serif text-[var(--error)]">{fmt(w.amount)} BDT</td>
                  <td className="py-2 px-3 text-xs">{w.withdrawnBy}</td>
                  <td className="py-2 px-3 text-xs text-[var(--text-secondary)]">{w.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
