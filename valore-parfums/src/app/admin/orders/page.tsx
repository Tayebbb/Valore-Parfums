"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/Toaster";

interface OrderItem {
  id: string;
  perfumeId?: string;
  perfumeName: string;
  ml: number;
  isFullBottle?: boolean;
  fullBottleSize?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  costPrice?: number;
}

interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  pickupMethod: string;
  paymentMethod?: string;
  bkashPayment?: {
    customerName?: string;
    paidFromNumber?: string;
    transactionNumber?: string;
    notes?: string;
    submittedAt?: string;
    amount?: number;
  } | null;
  bankPayment?: {
    accountName?: string;
    accountNumber?: string;
    transactionNumber?: string;
    notes?: string;
    submittedAt?: string;
    amount?: number;
  } | null;
  deliveryZone?: string;
  deliveryFee?: number;
  status: string;
  voucherCode: string | null;
  discount: number;
  subtotal: number;
  total: number;
  profit: number;
  createdAt: string;
  items: OrderItem[];
}

const statuses = ["Pending", "Pending Bkash Verification", "Pending Bank Verification", "Confirmed", "Out for Delivery", "Completed", "Cancelled"];
type SizeTypeFilter = "all" | "decant" | "full-bottle" | "mixed";
type SortType = "newest" | "oldest" | "highest-total" | "highest-profit";

const getOrderSizeType = (order: Order): Exclude<SizeTypeFilter, "all"> => {
  const hasFullBottle = order.items?.some((i) => Boolean(i.isFullBottle)) ?? false;
  const hasDecant = order.items?.some((i) => !i.isFullBottle) ?? false;

  if (hasFullBottle && hasDecant) return "mixed";
  if (hasFullBottle) return "full-bottle";
  return "decant";
};

const hasPendingVoucherForFullBottle = (order: Order) => {
  if (!order.voucherCode) return false;
  return (order.items || []).some((item) => Boolean(item.isFullBottle) && Number(item.unitPrice ?? 0) <= 0);
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [sizeTypeFilter, setSizeTypeFilter] = useState<SizeTypeFilter>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<"all" | "Cash on Delivery" | "Bkash Manual" | "Bank Manual">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<SortType>("newest");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [manualPrices, setManualPrices] = useState<Record<string, string>>({});
  const [savingPrices, setSavingPrices] = useState(false);
  const [verifyingBkash, setVerifyingBkash] = useState(false);

  const load = () =>
    fetch("/api/orders")
      .then((r) => r.json())
      .then(setOrders)
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const fmt = (n: number) => n.toLocaleString("en-BD");
  const statusClass = (s: string) => `status-${s.toLowerCase().replace(/ /g, "")}`;

  const updateOrderInState = (nextOrder: Order) => {
    setOrders((prev) => prev.map((o) => (o.id === nextOrder.id ? nextOrder : o)));
    setSelectedOrder((prev) => {
      if (!prev || prev.id !== nextOrder.id) return prev;
      return nextOrder;
    });
  };

  const showPendingBankPayments = () => {
    setStatusFilter("Pending Bank Verification");
    setSortBy("newest");
  };

  const updateStatus = async (id: string, status: string) => {
    const res = await fetch(`/api/orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast(err?.error || "Failed to update order status", "error");
      return;
    }

    const updated = await res.json();
    updateOrderInState(updated);
    toast(`Order ${status.toLowerCase()}`, "success");
  };

  const verifyBkashAndConfirm = async () => {
    if (!selectedOrder) return;
    setVerifyingBkash(true);
    const res = await fetch(`/api/orders/${selectedOrder.id}/verify-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "Verified via admin quick action" }),
    });
    setVerifyingBkash(false);

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast(err?.error || "Failed to verify bKash payment", "error");
      return;
    }

    const updated = await res.json();
    updateOrderInState(updated);
    toast("bKash payment verified and order confirmed", "success");
  };

  const verifyBankAndMarkPaid = async () => {
    if (!selectedOrder) return;
    setVerifyingBkash(true);
    const res = await fetch(`/api/orders/${selectedOrder.id}/verify-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "Verified via admin quick action" }),
    });
    setVerifyingBkash(false);

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast(err?.error || "Failed to verify bank payment", "error");
      return;
    }

    const updated = await res.json();
    updateOrderInState(updated);
    toast("Bank payment verified and marked as paid", "success");
  };

  const saveFullBottlePrices = async () => {
    if (!selectedOrder) return;

    const fullBottleItems = selectedOrder.items?.filter((item) => item.isFullBottle) || [];
    const updates = fullBottleItems
      .map((item) => {
        const draft = manualPrices[item.id];
        if (draft === undefined) return null;

        const parsed = Number(draft);
        if (!Number.isFinite(parsed) || parsed < 0) {
          return { invalid: true };
        }

        const rounded = Math.round(parsed);
        if (rounded === (item.unitPrice ?? 0)) return null;

        return { itemId: item.id, unitPrice: rounded };
      })
      .filter(Boolean);

    if (updates.some((u) => "invalid" in (u as { invalid?: boolean }))) {
      toast("Enter valid non-negative price values", "error");
      return;
    }

    const payload = updates as { itemId: string; unitPrice: number }[];
    if (payload.length === 0) {
      toast("No full bottle price changes to save", "error");
      return;
    }

    setSavingPrices(true);
    const res = await fetch(`/api/orders/${selectedOrder.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemPriceUpdates: payload }),
    });
    setSavingPrices(false);

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast(err?.error || "Failed to update full bottle prices", "error");
      return;
    }

    const updated = await res.json();
    updateOrderInState(updated);
    setManualPrices({});
    toast("Full bottle pricing updated", "success");
  };

  const cancelVoucherForOrder = async () => {
    if (!selectedOrder?.voucherCode) return;

    const res = await fetch(`/api/orders/${selectedOrder.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeVoucher: true }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast(err?.error || "Failed to cancel voucher", "error");
      return;
    }

    const updated = await res.json();
    updateOrderInState(updated);
    toast("Voucher removed for this order", "success");
  };

  const filtered = useMemo(() => {
    const byStatus = statusFilter ? orders.filter((o) => o.status === statusFilter) : orders;
    const bySize = sizeTypeFilter === "all"
      ? byStatus
      : byStatus.filter((o) => getOrderSizeType(o) === sizeTypeFilter);
    const byPaymentMethod = paymentMethodFilter === "all"
      ? bySize
      : bySize.filter((o) => (o.paymentMethod || "Cash on Delivery") === paymentMethodFilter);

    const byDateRange = byPaymentMethod.filter((o) => {
      if (!dateFrom && !dateTo) return true;
      const createdAt = new Date(o.createdAt);
      if (Number.isNaN(createdAt.getTime())) return false;
      const start = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
      const end = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
      if (start && createdAt < start) return false;
      if (end && createdAt > end) return false;
      return true;
    });

    const sorted = [...byDateRange];
    sorted.sort((a, b) => {
      if (sortBy === "highest-total") return (b.total ?? 0) - (a.total ?? 0);
      if (sortBy === "highest-profit") return (b.profit ?? 0) - (a.profit ?? 0);

      const da = new Date(a.createdAt).getTime();
      const db2 = new Date(b.createdAt).getTime();
      return sortBy === "oldest" ? da - db2 : db2 - da;
    });

    return sorted;
  }, [orders, statusFilter, sizeTypeFilter, paymentMethodFilter, dateFrom, dateTo, sortBy]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-light">Orders</h1>
        <div className="gold-line mt-3" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={showPendingBankPayments}
            className={`px-3 py-1.5 text-[10px] uppercase tracking-wider rounded transition-colors ${
              statusFilter === "Pending Bank Verification"
                ? "bg-[rgb(59,130,246)] text-white"
                : "border border-[rgba(59,130,246,0.45)] text-[rgb(96,165,250)] hover:bg-[rgba(59,130,246,0.12)]"
            }`}
          >
            Pending Bank Payments ({orders.filter((o) => o.status === "Pending Bank Verification").length})
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setStatusFilter("")}
            className={`px-3 py-1.5 text-[10px] uppercase tracking-wider rounded transition-colors ${
              !statusFilter
                ? "bg-[var(--gold)] text-black"
                : "border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)]"
            }`}
          >
            All ({orders.length})
          </button>
          {statuses.map((s) => {
            const count = orders.filter((o) => o.status === s).length;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-[10px] uppercase tracking-wider rounded transition-colors ${
                  statusFilter === s
                    ? "bg-[var(--gold)] text-black"
                    : "border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)]"
                }`}
              >
                {s} ({count})
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Payment</span>
            <select
              value={paymentMethodFilter}
              onChange={(e) => setPaymentMethodFilter(e.target.value as "all" | "Cash on Delivery" | "Bkash Manual" | "Bank Manual")}
              className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--gold)] outline-none"
            >
              <option value="all">All</option>
              <option value="Cash on Delivery">Cash on Delivery</option>
              <option value="Bkash Manual">bKash Manual</option>
              <option value="Bank Manual">Bank Manual</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--gold)] outline-none"
            />
            <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">To</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--gold)] outline-none"
            />
          </div>

          {[
            { key: "all", label: "All Types" },
            { key: "decant", label: "Decants" },
            { key: "full-bottle", label: "Full Bottle" },
            { key: "mixed", label: "Mixed" },
          ].map((entry) => {
            const key = entry.key as SizeTypeFilter;
            const count = key === "all" ? orders.length : orders.filter((o) => getOrderSizeType(o) === key).length;
            return (
              <button
                key={key}
                onClick={() => setSizeTypeFilter(key)}
                className={`px-3 py-1.5 text-[10px] uppercase tracking-wider rounded transition-colors ${
                  sizeTypeFilter === key
                    ? "bg-[var(--gold)] text-black"
                    : "border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)]"
                }`}
              >
                {entry.label} ({count})
              </button>
            );
          })}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Sort</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortType)}
              className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--gold)] outline-none"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="highest-total">Highest Total</option>
              <option value="highest-profit">Highest Profit</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton h-16 rounded" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Order ID</th>
                <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Customer</th>
                <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Items</th>
                <th className="text-center py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Type</th>
                <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Total</th>
                <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Profit</th>
                <th className="text-center py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Status</th>
                <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Date</th>
                <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const orderType = getOrderSizeType(o);
                const voucherPending = hasPendingVoucherForFullBottle(o);
                const orderTypeLabel = orderType === "full-bottle" ? "Full Bottle" : orderType === "mixed" ? "Mixed" : "Decant";
                const orderTypeClass = orderType === "full-bottle"
                  ? "bg-[rgba(250,204,21,0.18)] text-[var(--gold)]"
                  : orderType === "mixed"
                    ? "bg-[rgba(96,165,250,0.14)] text-[rgb(125,176,255)]"
                    : "bg-[rgba(148,163,184,0.16)] text-[var(--text-secondary)]";

                return (
                  <tr
                    key={o.id}
                    className="border-b border-[var(--border)] hover:bg-[var(--gold-tint)] transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedOrder(o);
                      const initialDrafts = (o.items || []).reduce<Record<string, string>>((acc, item) => {
                        if (item.isFullBottle) {
                          acc[item.id] = String(item.unitPrice ?? 0);
                        }
                        return acc;
                      }, {});
                      setManualPrices(initialDrafts);
                    }}
                  >
                    <td className="py-3 px-4 font-mono text-xs text-[var(--text-secondary)]">{o.id.slice(0, 8)}</td>
                    <td className="py-3 px-4">
                      <p className="text-sm">{o.customerName}</p>
                      <p className="text-xs text-[var(--text-muted)]">{o.customerPhone}</p>
                      {o.paymentMethod === "Bkash Manual" && (
                        <p className="text-[10px] text-[rgb(227,35,132)] mt-1 uppercase tracking-wider">bKash Manual</p>
                      )}
                      {o.paymentMethod === "Bank Manual" && (
                        <p className="text-[10px] text-[rgb(59,130,246)] mt-1 uppercase tracking-wider">Bank Manual</p>
                      )}
                      {o.voucherCode && (
                        <p className="text-[10px] text-[var(--success)] mt-1 uppercase tracking-wider">Voucher: {o.voucherCode}</p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-[var(--text-secondary)]">
                      {o.items?.map((i) => `${i.perfumeName} ${i.isFullBottle ? `Full Bottle (${i.fullBottleSize || "Custom"})` : `${i.ml}ml`}×${i.quantity}`).join(", ") || "-"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${orderTypeClass}`}>
                          {orderTypeLabel}
                        </span>
                        {voucherPending && (
                          <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-[rgba(251,191,36,0.2)] text-[rgb(251,191,36)]">
                            Voucher Pending
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <p className="font-serif text-[var(--gold)]">{fmt(o.total ?? 0)}</p>
                      {o.voucherCode && (o.discount ?? 0) > 0 && (
                        <p className="text-[10px] text-[var(--success)]">-{fmt(o.discount ?? 0)} via {o.voucherCode}</p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-serif text-[var(--success)]">{fmt(o.profit ?? 0)}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${statusClass(o.status || "Pending")}`}>
                        {o.status || "Pending"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-[var(--text-secondary)]">{new Date(o.createdAt).toLocaleDateString()}</td>
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={o.status}
                        onChange={(e) => updateStatus(o.id, e.target.value)}
                        className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--gold)] outline-none"
                      >
                        {statuses.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="text-center py-12 text-[var(--text-secondary)]">No orders found</div>
          )}
        </div>
      )}

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedOrder(null)} />
          <div className="relative bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg w-full max-w-lg p-6 animate-fade-up max-h-[90vh] overflow-y-auto">
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
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Payment Method</span>
                <span>{selectedOrder.paymentMethod || "Cash on Delivery"}</span>
              </div>
              {selectedOrder.pickupMethod === "Delivery" && (
                <>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Delivery Zone</span>
                    <span>{selectedOrder.deliveryZone || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Delivery Fee</span>
                    <span>{fmt(selectedOrder.deliveryFee ?? 0)} BDT</span>
                  </div>
                </>
              )}

              {selectedOrder.paymentMethod === "Bkash Manual" && selectedOrder.bkashPayment && (
                <>
                  <div className="gold-line my-3" />
                  <h4 className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">bKash Payment Details</h4>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Sender Name</span>
                    <span>{selectedOrder.bkashPayment.customerName || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Paid From</span>
                    <span>{selectedOrder.bkashPayment.paidFromNumber || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Transaction ID</span>
                    <span className="font-mono">{selectedOrder.bkashPayment.transactionNumber || "-"}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-[var(--text-muted)]">Notes</span>
                    <span className="text-right">{selectedOrder.bkashPayment.notes || "-"}</span>
                  </div>
                  {(selectedOrder.status === "Pending Bkash Verification" || selectedOrder.status === "Bkash Paid") && (
                    <div className="pt-2">
                      <button
                        onClick={verifyBkashAndConfirm}
                        disabled={verifyingBkash}
                        className="px-3 py-1.5 text-[10px] uppercase tracking-wider bg-[rgb(227,35,132)] text-white rounded hover:bg-[rgb(205,28,118)] transition-colors disabled:opacity-50"
                      >
                        {verifyingBkash ? "Verifying..." : "Verify bKash & Confirm Order"}
                      </button>
                    </div>
                  )}
                </>
              )}

              {selectedOrder.paymentMethod === "Bank Manual" && selectedOrder.bankPayment && (
                <>
                  <div className="gold-line my-3" />
                  <h4 className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Bank Payment Details</h4>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Account/Card Name</span>
                    <span>{selectedOrder.bankPayment.accountName || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Account/Card Number</span>
                    <span>{selectedOrder.bankPayment.accountNumber || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Transaction Ref</span>
                    <span className="font-mono">{selectedOrder.bankPayment.transactionNumber || "-"}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-[var(--text-muted)]">Notes</span>
                    <span className="text-right">{selectedOrder.bankPayment.notes || "-"}</span>
                  </div>
                  {selectedOrder.status === "Pending Bank Verification" && (
                    <div className="pt-2">
                      <button
                        onClick={verifyBankAndMarkPaid}
                        disabled={verifyingBkash}
                        className="px-3 py-1.5 text-[10px] uppercase tracking-wider bg-[rgb(59,130,246)] text-white rounded hover:bg-[rgb(37,99,235)] transition-colors disabled:opacity-50"
                      >
                        {verifyingBkash ? "Verifying..." : "Verify Bank & Mark Paid"}
                      </button>
                    </div>
                  )}
                </>
              )}

              <div className="gold-line my-3" />
              <h4 className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Items</h4>
              {selectedOrder.items?.map((item) => (
                <div key={item.id} className="flex justify-between py-1 gap-3">
                  <span>
                    {item.perfumeName} - {item.isFullBottle ? `Full Bottle (${item.fullBottleSize || "Custom"})` : `${item.ml}ml`} x {item.quantity}
                  </span>
                  <span className="font-serif text-[var(--gold)] whitespace-nowrap">{fmt(item.totalPrice ?? 0)} BDT</span>
                </div>
              ))}

              {(selectedOrder.items?.some((item) => item.isFullBottle) ?? false) && (
                <>
                  <div className="gold-line my-3" />
                  <h4 className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Full Bottle Manual Pricing</h4>
                  {hasPendingVoucherForFullBottle(selectedOrder) && (
                    <p className="text-xs text-[rgb(251,191,36)]">Voucher Pending: apply prices to activate voucher discount.</p>
                  )}
                  {selectedOrder.voucherCode && (
                    <p className="text-xs text-[var(--text-muted)]">
                      Voucher <span className="text-[var(--success)]">{selectedOrder.voucherCode}</span> will be applied after saving full bottle prices.
                    </p>
                  )}
                  <div className="space-y-2">
                    {selectedOrder.items.filter((item) => item.isFullBottle).map((item) => (
                      <div key={item.id} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                        <div className="text-xs text-[var(--text-secondary)]">
                          {item.perfumeName} ({item.fullBottleSize || "Custom"}) x {item.quantity}
                        </div>
                        <input
                          type="number"
                          min={0}
                          value={manualPrices[item.id] ?? String(item.unitPrice ?? 0)}
                          onChange={(e) => setManualPrices((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          className="w-28 bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs text-right focus:border-[var(--gold)] outline-none"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end mt-3">
                    {selectedOrder.voucherCode && (
                      <button
                        onClick={cancelVoucherForOrder}
                        className="px-3 py-1.5 text-[10px] uppercase tracking-wider border border-[var(--error)] text-[var(--error)] rounded hover:bg-[rgba(248,113,113,0.1)] transition-colors mr-2"
                      >
                        Cancel Voucher
                      </button>
                    )}
                    <button
                      onClick={saveFullBottlePrices}
                      disabled={savingPrices}
                      className="px-3 py-1.5 text-[10px] uppercase tracking-wider bg-[var(--gold)] text-black rounded hover:bg-[var(--gold-light)] transition-colors disabled:opacity-50"
                    >
                      {savingPrices ? "Saving..." : "Save Full Bottle Prices"}
                    </button>
                  </div>
                </>
              )}

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
