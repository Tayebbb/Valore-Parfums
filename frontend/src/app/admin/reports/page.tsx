"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const BarChart = dynamic(() => import("recharts").then(m => m.BarChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then(m => m.Bar), { ssr: false });
const LineChart = dynamic(() => import("recharts").then(m => m.LineChart), { ssr: false });
const Line = dynamic(() => import("recharts").then(m => m.Line), { ssr: false });
const XAxis = dynamic(() => import("recharts").then(m => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then(m => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then(m => m.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then(m => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then(m => m.ResponsiveContainer), { ssr: false });

interface DashboardData {
  totalOrders: number;
  completedOrders: number;
  totalRevenue: number;
  totalProfit: number;
  monthRevenue: number;
  monthProfit: number;
  mostSold: { perfumeName: string; _sum: { quantity: number; totalPrice: number } }[];
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
}

export default function ReportsPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetch("/api/dashboard").then((r) => r.json()).then(setData);
  }, []);

  const fmt = (n: number) => n.toLocaleString("en-BD");

  if (!data) {
    return (
      <div className="space-y-6">
        <h1 className="font-serif text-3xl font-light">Reports</h1>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-72 rounded" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-light">Reports & Analytics</h1>
        <div className="gold-line mt-3" />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Total Revenue</p>
          <p className="font-serif text-2xl mt-2 text-[var(--gold)]">{fmt(data.totalRevenue)} BDT</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Total Profit</p>
          <p className="font-serif text-2xl mt-2 text-[var(--success)]">{fmt(data.totalProfit)} BDT</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Monthly Revenue</p>
          <p className="font-serif text-2xl mt-2">{fmt(data.monthRevenue)} BDT</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Monthly Profit</p>
          <p className="font-serif text-2xl mt-2">{fmt(data.monthProfit)} BDT</p>
        </div>
      </div>

      {/* Owner Profit Split */}
      {data.owners && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-[var(--gold-tint)] border border-[var(--gold)] flex items-center justify-center">
                <span className="font-serif text-sm text-[var(--gold)]">{data.owners.owner1Name?.[0] || "O"}</span>
              </div>
              <div>
                <p className="font-serif text-base">{data.owners.owner1Name}&apos;s Share</p>
                <p className="text-[10px] text-[var(--text-muted)]">{data.owners.owner1Share}%</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Total Profit</p>
                <p className="font-serif text-xl text-[var(--gold)]">{fmt(data.owners.totalProfit.owner1)} BDT</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">This Month</p>
                <p className="font-serif text-xl text-[var(--success)]">{fmt(data.owners.monthProfit.owner1)} BDT</p>
              </div>
            </div>
          </div>
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-[rgba(74,222,128,0.08)] border border-[var(--success)] flex items-center justify-center">
                <span className="font-serif text-sm text-[var(--success)]">{data.owners.owner2Name?.[0] || "O"}</span>
              </div>
              <div>
                <p className="font-serif text-base">{data.owners.owner2Name}&apos;s Share</p>
                <p className="text-[10px] text-[var(--text-muted)]">{data.owners.owner2Share}%</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Total Profit</p>
                <p className="font-serif text-xl text-[var(--gold)]">{fmt(data.owners.totalProfit.owner2)} BDT</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">This Month</p>
                <p className="font-serif text-xl text-[var(--success)]">{fmt(data.owners.monthProfit.owner2)} BDT</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
          <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Revenue vs Profit (Daily)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.dailySales}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: "rgba(245,240,232,0.4)", fontSize: 11 }} axisLine={false} />
              <YAxis tick={{ fill: "rgba(245,240,232,0.4)", fontSize: 11 }} axisLine={false} />
              <Tooltip contentStyle={{ background: "#18181c", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, fontSize: 12 }} />
              <Bar dataKey="revenue" fill="#c9a55c" radius={[3, 3, 0, 0]} name="Revenue" />
              <Bar dataKey="profit" fill="#4ade80" radius={[3, 3, 0, 0]} name="Profit" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
          <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Monthly Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.monthlySales}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fill: "rgba(245,240,232,0.4)", fontSize: 11 }} axisLine={false} />
              <YAxis tick={{ fill: "rgba(245,240,232,0.4)", fontSize: 11 }} axisLine={false} />
              <Tooltip contentStyle={{ background: "#18181c", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, fontSize: 12 }} />
              <Line type="monotone" dataKey="revenue" stroke="#c9a55c" strokeWidth={2} name="Revenue" />
              <Line type="monotone" dataKey="profit" stroke="#4ade80" strokeWidth={2} name="Profit" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Sellers */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5 max-w-2xl">
        <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Top Selling Perfumes</h3>
        {data.mostSold.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No sales data yet</p>
        ) : (
          <div className="space-y-3">
            {data.mostSold.map((item, i) => (
              <div key={i} className="flex items-center gap-4">
                <span className="font-serif text-xl text-[var(--gold)] w-8">{i + 1}</span>
                <div className="flex-1">
                  <p className="text-sm font-serif">{item.perfumeName}</p>
                  <div className="mt-1 h-1.5 bg-[var(--bg-base)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--gold)] rounded-full transition-all"
                      style={{ width: `${Math.min(100, ((item._sum.quantity ?? 0) / (data.mostSold[0]?._sum.quantity ?? 1)) * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-serif text-sm text-[var(--gold)]">{item._sum.quantity} sold</p>
                  <p className="text-xs text-[var(--text-muted)]">{fmt(item._sum.totalPrice ?? 0)} BDT</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
