"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/ui/Toaster";

interface UserRequest {
  id: string;
  perfumeName: string;
  brand: string;
  type: "decant" | "full_bottle";
  ml: number | null;
  quantity: number;
  notes: string;
  userName: string;
  userEmail: string;
  status: string;
  adminNote: string;
  createdAt: string;
}

const statuses = ["Pending", "Approved", "Fulfilled", "Declined"];

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<UserRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = () =>
    fetch("/api/requests?all=true")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setRequests(data); })
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/requests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    toast(`Request ${status.toLowerCase()}`, "success");
    load();
  };

  const filtered = filter ? requests.filter((r) => r.status === filter) : requests;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-light">User Requests</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Decant and full bottle requests from customers</p>
        <div className="gold-line mt-3" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilter("")}
          className={`px-3 py-1.5 text-[10px] uppercase tracking-wider rounded transition-colors ${
            !filter ? "bg-[var(--gold)] text-black" : "border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)]"
          }`}
        >
          All ({requests.length})
        </button>
        {statuses.map((s) => {
          const count = requests.filter((r) => r.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 text-[10px] uppercase tracking-wider rounded transition-colors ${
                filter === s ? "bg-[var(--gold)] text-black" : "border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)]"
              }`}
            >
              {s} ({count})
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-16 rounded" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-secondary)]">No requests found</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Perfume</th>
                <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Type</th>
                <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Customer</th>
                <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Size</th>
                <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Qty</th>
                <th className="text-center py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Status</th>
                <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Date</th>
                <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)] hover:bg-[var(--gold-tint)] transition-colors">
                  <td className="py-3 px-4">
                    <p className="font-serif">{r.perfumeName}</p>
                    {r.brand && <p className="text-[10px] text-[var(--text-muted)]">{r.brand}</p>}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      r.type === "full_bottle"
                        ? "bg-[rgba(139,92,246,0.1)] text-purple-400"
                        : "bg-[var(--gold-tint)] text-[var(--gold)]"
                    }`}>
                      {r.type === "full_bottle" ? "Full Bottle" : "Decant"}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <p className="text-sm">{r.userName}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{r.userEmail}</p>
                  </td>
                  <td className="py-3 px-4 text-right font-mono">{r.ml ? `${r.ml}ml` : "—"}</td>
                  <td className="py-3 px-4 text-right font-mono">{r.quantity}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${
                      r.status === "Pending" ? "status-pending" :
                      r.status === "Approved" ? "bg-[rgba(59,130,246,0.1)] text-blue-400" :
                      r.status === "Fulfilled" ? "status-completed" : "status-cancelled"
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-[var(--text-secondary)]">{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="py-3 px-4 text-right">
                    <select
                      value={r.status}
                      onChange={(e) => updateStatus(r.id, e.target.value)}
                      className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--gold)] outline-none"
                    >
                      {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
