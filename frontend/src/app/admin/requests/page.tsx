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

const requestStatuses = ["Pending", "Confirmed", "Dispatched", "Cancelled"];

const normalizeRequestStatus = (status?: string) => {
  if (!status) return "Pending";
  if (status === "Approved") return "Confirmed";
  if (status === "Fulfilled") return "Dispatched";
  if (status === "Declined") return "Cancelled";
  return status;
};

const statusClass = (s: string) => `status-${s.toLowerCase().replace(/ /g, "")}`;

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<UserRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestEditingId, setRequestEditingId] = useState<string | null>(null);
  const [requestBuyingPrice, setRequestBuyingPrice] = useState("");
  const [requestSellingPrice, setRequestSellingPrice] = useState("");
  const [savingRequestPrices, setSavingRequestPrices] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/requests?all=true");
    const data = await res.json().catch(() => []);
    setRequests(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, []);

  const updateRequestStatus = async (id: string, status: string) => {
    const request = requests.find((item) => item.id === id);

    if (status === "Dispatched") {
      if ((!request?.buyingPrice && request?.buyingPrice !== 0) || (!request?.sellingPrice && request?.sellingPrice !== 0)) {
        toast("Set buying and selling price before dispatching", "error");
        setRequestEditingId(id);
        setRequestBuyingPrice(String(request?.buyingPrice ?? ""));
        setRequestSellingPrice(String(request?.sellingPrice ?? ""));
        return false;
      }
    }

    const res = await fetch(`/api/requests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast(err?.error || "Failed to update request", "error");
      return false;
    }

    toast(`Request ${status.toLowerCase()}`, "success");
    load();
    return true;
  };

  const saveRequestPrices = async (id: string) => {
    const buying = Number(requestBuyingPrice);
    const selling = Number(requestSellingPrice);

    if (!Number.isFinite(buying) || buying < 0) {
      toast("Invalid buying price", "error");
      return;
    }
    if (!Number.isFinite(selling) || selling < 0) {
      toast("Invalid selling price", "error");
      return;
    }

    setSavingRequestPrices(true);
    const res = await fetch(`/api/requests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buyingPrice: buying, sellingPrice: selling }),
    });
    setSavingRequestPrices(false);

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast(err?.error || "Failed to save prices", "error");
      return;
    }

    toast("Prices saved", "success");
    setRequestEditingId(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-light">Customer Requests</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Unified request queue with pricing and fulfillment control</p>
        <div className="gold-line mt-3" />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton h-16 rounded" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-secondary)]">No customer requests yet</div>
      ) : (
        <>
          <div className="flex items-center justify-end">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">{requests.length} requests</span>
          </div>

          <div className="space-y-3 md:hidden">
            {requests.map((request) => {
              const currentStatus = normalizeRequestStatus(request.status);
              return (
                <div key={request.id} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-serif">{request.perfumeName}</p>
                      {request.brand && <p className="text-[10px] text-[var(--text-muted)]">{request.brand}</p>}
                      {request.notes && <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 italic">{request.notes}</p>}
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${request.type === "full_bottle" ? "bg-[rgba(139,92,246,0.1)] text-purple-400" : "bg-[var(--gold-tint)] text-[var(--gold)]"}`}>
                      {request.type === "full_bottle" ? "Full Bottle" : "Decant"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-[var(--bg-card)] rounded p-3 border border-[var(--border)]">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">Customer</p>
                      <p className="text-sm">{request.userName}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">{request.userEmail}</p>
                      <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">Qty: {request.quantity}{request.ml ? ` · ${request.ml}ml` : ""}</p>
                    </div>
                    <div className="bg-[var(--bg-card)] rounded p-3 border border-[var(--border)] text-right">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">Profit</p>
                      {request.profit != null ? (
                        <span className={request.profit >= 0 ? "text-green-400" : "text-red-400"}>{request.profit >= 0 ? "+" : ""}{request.profit}</span>
                      ) : request.buyingPrice != null && request.sellingPrice != null ? (
                        <span className="text-[var(--text-muted)] text-[10px]">~{(request.sellingPrice ?? 0) - (request.buyingPrice ?? 0)}</span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </div>
                  </div>

                  <div className="bg-[var(--bg-card)] rounded p-3 border border-[var(--border)] space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Buy / Sell</p>
                    {requestEditingId === request.id ? (
                      <div className="flex flex-col gap-1.5 items-end">
                        <input
                          type="number"
                          min="0"
                          value={requestBuyingPrice}
                          onChange={(e) => setRequestBuyingPrice(e.target.value)}
                          className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs text-right focus:border-[var(--gold)] outline-none"
                          placeholder="Buy"
                        />
                        <input
                          type="number"
                          min="0"
                          value={requestSellingPrice}
                          onChange={(e) => setRequestSellingPrice(e.target.value)}
                          className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs text-right focus:border-[var(--gold)] outline-none"
                          placeholder="Sell"
                        />
                        <div className="flex gap-1">
                          <button onClick={() => saveRequestPrices(request.id)} disabled={savingRequestPrices} className="px-2 py-0.5 text-[9px] uppercase bg-[var(--gold)] text-black rounded hover:bg-[var(--gold-hover)] disabled:opacity-50">Save</button>
                          <button onClick={() => setRequestEditingId(null)} className="px-2 py-0.5 text-[9px] uppercase border border-[var(--border)] rounded hover:border-[var(--gold)]">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-mono text-xs">
                          <span className="text-[var(--text-muted)]">{request.buyingPrice ?? 0}</span>
                          <span className="text-[var(--text-muted)] mx-1">/</span>
                          <span>{request.sellingPrice ?? 0}</span>
                        </div>
                        {(currentStatus === "Pending" || currentStatus === "Confirmed") && (
                          <button
                            onClick={() => {
                              setRequestEditingId(request.id);
                              setRequestBuyingPrice(String(request.buyingPrice ?? ""));
                              setRequestSellingPrice(String(request.sellingPrice ?? ""));
                            }}
                            className="text-[9px] text-[var(--gold)] uppercase tracking-wider hover:underline"
                          >
                            edit
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${statusClass(currentStatus)}`}>{currentStatus}</span>
                    <select
                      value={currentStatus}
                      onChange={(e) => void updateRequestStatus(request.id, e.target.value)}
                      className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--gold)] outline-none"
                    >
                      {requestStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Perfume</th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Type</th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Customer</th>
                  <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Buy / Sell</th>
                  <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Profit</th>
                  <th className="text-center py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Status</th>
                  <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => {
                  const currentStatus = normalizeRequestStatus(request.status);
                  return (
                    <tr key={request.id} className="border-b border-[var(--border)] hover:bg-[var(--gold-tint)] transition-colors">
                      <td className="py-3 px-4">
                        <p className="font-serif">{request.perfumeName}</p>
                        {request.brand && <p className="text-[10px] text-[var(--text-muted)]">{request.brand}</p>}
                        {request.notes && <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 italic">{request.notes}</p>}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${request.type === "full_bottle" ? "bg-[rgba(139,92,246,0.1)] text-purple-400" : "bg-[var(--gold-tint)] text-[var(--gold)]"}`}>
                          {request.type === "full_bottle" ? "Full Bottle" : "Decant"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm">{request.userName}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">{request.userEmail}</p>
                        <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">Qty: {request.quantity}{request.ml ? ` · ${request.ml}ml` : ""}</p>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {requestEditingId === request.id ? (
                          <div className="flex flex-col gap-1.5 items-end">
                            <input
                              type="number"
                              min="0"
                              value={requestBuyingPrice}
                              onChange={(e) => setRequestBuyingPrice(e.target.value)}
                              className="w-24 bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs text-right focus:border-[var(--gold)] outline-none"
                              placeholder="Buy"
                            />
                            <input
                              type="number"
                              min="0"
                              value={requestSellingPrice}
                              onChange={(e) => setRequestSellingPrice(e.target.value)}
                              className="w-24 bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs text-right focus:border-[var(--gold)] outline-none"
                              placeholder="Sell"
                            />
                            <div className="flex gap-1">
                              <button onClick={() => saveRequestPrices(request.id)} disabled={savingRequestPrices} className="px-2 py-0.5 text-[9px] uppercase bg-[var(--gold)] text-black rounded hover:bg-[var(--gold-hover)] disabled:opacity-50">Save</button>
                              <button onClick={() => setRequestEditingId(null)} className="px-2 py-0.5 text-[9px] uppercase border border-[var(--border)] rounded hover:border-[var(--gold)]">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="font-mono text-xs">
                            <span className="text-[var(--text-muted)]">{request.buyingPrice ?? 0}</span>
                            <span className="text-[var(--text-muted)] mx-1">/</span>
                            <span>{request.sellingPrice ?? 0}</span>
                            {(currentStatus === "Pending" || currentStatus === "Confirmed") && (
                              <button
                                onClick={() => {
                                  setRequestEditingId(request.id);
                                  setRequestBuyingPrice(String(request.buyingPrice ?? ""));
                                  setRequestSellingPrice(String(request.sellingPrice ?? ""));
                                }}
                                className="ml-1.5 text-[9px] text-[var(--gold)] hover:underline"
                              >
                                edit
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">
                        {request.profit != null ? (
                          <span className={request.profit >= 0 ? "text-green-400" : "text-red-400"}>{request.profit >= 0 ? "+" : ""}{request.profit}</span>
                        ) : request.buyingPrice != null && request.sellingPrice != null ? (
                          <span className="text-[var(--text-muted)] text-[10px]">~{(request.sellingPrice ?? 0) - (request.buyingPrice ?? 0)}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${statusClass(currentStatus)}`}>{currentStatus}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <select
                          value={currentStatus}
                          onChange={(e) => void updateRequestStatus(request.id, e.target.value)}
                          className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--gold)] outline-none"
                        >
                          {requestStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
