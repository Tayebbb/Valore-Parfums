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
  buyingPrice: number | null;
  sellingPrice: number | null;
  profit: number | null;
  fulfilledAt: string | null;
  createdAt: string;
}

const statuses = ["Pending", "Approved", "Fulfilled", "Declined"];

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<UserRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBuyingPrice, setEditBuyingPrice] = useState("");
  const [editSellingPrice, setEditSellingPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () =>
    fetch("/api/requests?all=true")
      .then((r) => { if (!r.ok) return []; return r.json(); })
      .then((data) => { if (Array.isArray(data)) setRequests(data); })
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string) => {
    const req = requests.find((r) => r.id === id);

    // If fulfilling, ensure prices are set
    if (status === "Fulfilled") {
      if (!req?.buyingPrice && req?.buyingPrice !== 0 || !req?.sellingPrice && req?.sellingPrice !== 0) {
        toast("Set buying & selling price before fulfilling", "error");
        setEditingId(id);
        setEditBuyingPrice(String(req?.buyingPrice ?? ""));
        setEditSellingPrice(String(req?.sellingPrice ?? ""));
        return;
      }
    }

    const res = await fetch(`/api/requests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (res.ok) {
      toast(`Request ${status.toLowerCase()}`, "success");
      if (status === "Approved" && !req?.buyingPrice && !req?.sellingPrice) {
        setEditingId(id);
        setEditBuyingPrice("");
        setEditSellingPrice("");
      }
      load();
    } else {
      const err = await res.text();
      try { toast(JSON.parse(err).error || "Failed to update", "error"); }
      catch { toast("Failed to update request", "error"); }
    }
  };

  const savePrices = async (id: string) => {
    const bp = Number(editBuyingPrice);
    const sp = Number(editSellingPrice);
    if (isNaN(bp) || bp < 0) { toast("Invalid buying price", "error"); return; }
    if (isNaN(sp) || sp < 0) { toast("Invalid selling price", "error"); return; }

    setSaving(true);
    const res = await fetch(`/api/requests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buyingPrice: bp, sellingPrice: sp }),
    });

    if (res.ok) {
      toast("Prices saved", "success");
      setEditingId(null);
      load();
    } else {
      toast("Failed to save prices", "error");
    }
    setSaving(false);
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
                <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Buy / Sell</th>
                <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Profit</th>
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
                    {r.notes && <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 italic">{r.notes}</p>}
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
                  <td className="py-3 px-4 text-right">
                    {editingId === r.id ? (
                      <div className="flex flex-col gap-1.5 items-end">
                        <div className="flex items-center gap-1">
                          <label className="text-[9px] text-[var(--text-muted)] uppercase">Buy</label>
                          <input
                            type="number"
                            min="0"
                            value={editBuyingPrice}
                            onChange={(e) => setEditBuyingPrice(e.target.value)}
                            className="w-20 bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs text-right focus:border-[var(--gold)] outline-none"
                            placeholder="0"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <label className="text-[9px] text-[var(--text-muted)] uppercase">Sell</label>
                          <input
                            type="number"
                            min="0"
                            value={editSellingPrice}
                            onChange={(e) => setEditSellingPrice(e.target.value)}
                            className="w-20 bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs text-right focus:border-[var(--gold)] outline-none"
                            placeholder="0"
                          />
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => savePrices(r.id)}
                            disabled={saving}
                            className="px-2 py-0.5 text-[9px] uppercase bg-[var(--gold)] text-black rounded hover:bg-[var(--gold-hover)] disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-2 py-0.5 text-[9px] uppercase border border-[var(--border)] rounded hover:border-[var(--gold)]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {r.buyingPrice != null || r.sellingPrice != null ? (
                          <div className="font-mono text-xs">
                            <span className="text-[var(--text-muted)]">{r.buyingPrice ?? 0}</span>
                            <span className="text-[var(--text-muted)] mx-1">/</span>
                            <span>{r.sellingPrice ?? 0}</span>
                            {(r.status === "Approved" || r.status === "Pending") && (
                              <button
                                onClick={() => {
                                  setEditingId(r.id);
                                  setEditBuyingPrice(String(r.buyingPrice ?? ""));
                                  setEditSellingPrice(String(r.sellingPrice ?? ""));
                                }}
                                className="ml-1.5 text-[9px] text-[var(--gold)] hover:underline"
                              >
                                edit
                              </button>
                            )}
                          </div>
                        ) : (
                          r.status !== "Declined" && (
                            <button
                              onClick={() => {
                                setEditingId(r.id);
                                setEditBuyingPrice("");
                                setEditSellingPrice("");
                              }}
                              className="text-[10px] text-[var(--gold)] hover:underline"
                            >
                              Set prices
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono">
                    {r.profit != null ? (
                      <span className={r.profit >= 0 ? "text-green-400" : "text-red-400"}>
                        {r.profit >= 0 ? "+" : ""}{r.profit}
                      </span>
                    ) : (
                      r.buyingPrice != null && r.sellingPrice != null ? (
                        <span className="text-[var(--text-muted)] text-[10px]">
                          ~{(r.sellingPrice ?? 0) - (r.buyingPrice ?? 0)}
                        </span>
                      ) : "—"
                    )}
                  </td>
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
