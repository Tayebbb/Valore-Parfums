"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/ui/Toaster";

interface OrderItem {
  id: string;
  perfumeName: string;
  ml: number;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  pickupMethod: string;
  status: string;
  voucherCode: string | null;
  discount: number;
  subtotal: number;
  total: number;
  profit: number;
  createdAt: string;
  items: OrderItem[];
}

const statuses = ["Pending", "Confirmed", "Ready", "Completed", "Cancelled"];

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const load = () =>
    fetch("/api/orders")
      .then((r) => r.json())
      .then(setOrders)
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    toast(`Order ${status.toLowerCase()}`, "success");
    load();
    if (selectedOrder?.id === id) {
      setSelectedOrder({ ...selectedOrder, status });
    }
  };

  const filtered = filter
    ? orders.filter((o) => o.status === filter)
    : orders;

  const fmt = (n: number) => n.toLocaleString("en-BD");
  const statusClass = (s: string) => `status-${s.toLowerCase().replace(/ /g, "")}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-light">Orders</h1>
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
          All ({orders.length})
        </button>
        {statuses.map((s) => {
          const count = orders.filter((o) => o.status === s).length;
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
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-16 rounded" />)}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Order ID</th>
                <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Customer</th>
                <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Items</th>
                <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Total</th>
                <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Profit</th>
                <th className="text-center py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Status</th>
                <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Date</th>
                <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr
                  key={o.id}
                  className="border-b border-[var(--border)] hover:bg-[var(--gold-tint)] transition-colors cursor-pointer"
                  onClick={() => setSelectedOrder(o)}
                >
                  <td className="py-3 px-4 font-mono text-xs text-[var(--text-secondary)]">{o.id.slice(0, 8)}</td>
                  <td className="py-3 px-4">
                    <p className="text-sm">{o.customerName}</p>
                    <p className="text-xs text-[var(--text-muted)]">{o.customerPhone}</p>
                  </td>
                  <td className="py-3 px-4 text-xs text-[var(--text-secondary)]">
                    {o.items?.map((i) => `${i.perfumeName} ${i.ml}ml×${i.quantity}`).join(", ") || "—"}
                  </td>
                  <td className="py-3 px-4 text-right font-serif text-[var(--gold)]">{fmt(o.total ?? 0)}</td>
                  <td className="py-3 px-4 text-right font-serif text-[var(--success)]">{fmt(o.profit ?? 0)}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${statusClass(o.status || "Pending")}`}>
                      {o.status || "Pending"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-[var(--text-secondary)]">
                    {new Date(o.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={o.status}
                      onChange={(e) => updateStatus(o.id, e.target.value)}
                      className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--gold)] outline-none"
                    >
                      {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-[var(--text-secondary)]">No orders found</div>
          )}
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedOrder(null)} />
          <div className="relative bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg w-full max-w-lg p-6 animate-fade-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-xl font-light">Order Details</h2>
              <button onClick={() => setSelectedOrder(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Order ID</span>
                <span className="font-mono">{selectedOrder.id.slice(0, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Customer</span>
                <span>{selectedOrder.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Phone</span>
                <span>{selectedOrder.customerPhone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Pickup</span>
                <span>{selectedOrder.pickupMethod}</span>
              </div>
              <div className="gold-line my-3" />
              <h4 className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Items</h4>
              {selectedOrder.items?.map((item) => (
                <div key={item.id} className="flex justify-between py-1">
                  <span>{item.perfumeName} — {item.ml}ml × {item.quantity}</span>
                  <span className="font-serif text-[var(--gold)]">{fmt(item.totalPrice ?? 0)} BDT</span>
                </div>
              ))}
              <div className="gold-line my-3" />
              {(selectedOrder.discount ?? 0) > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Subtotal</span>
                    <span>{fmt(selectedOrder.subtotal ?? 0)} BDT</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Discount ({selectedOrder.voucherCode})</span>
                    <span className="text-[var(--success)]">-{fmt(selectedOrder.discount ?? 0)} BDT</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-base">
                <span className="text-[var(--text-muted)]">Total</span>
                <span className="font-serif text-[var(--gold)]">{fmt(selectedOrder.total ?? 0)} BDT</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Profit</span>
                <span className="font-serif text-[var(--success)]">{fmt(selectedOrder.profit ?? 0)} BDT</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
