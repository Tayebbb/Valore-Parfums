"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/Toaster";
import { CopyOrderIdButton } from "@/components/ui/CopyOrderIdButton";
import {
  ADMIN_STATUS_ORDER,
  getStatusLabel,
  getStatusLabelFromValue,
  isStatusAllowedForFulfillment,
} from "@/lib/orderStatusConfig";

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
  orderSource?: "standard_order" | "customer_request" | "stock_request";
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  pickupMethod: string;
  pickupLocationId?: string;
  pickupLocationName?: string;
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
  estimatedPrepTime?: string;
  pickupContactNumber?: string;
  status: string;
  voucherCode: string | null;
  discount: number;
  subtotal: number;
  total: number;
  profit: number;
  createdAt: string;
  items: OrderItem[];
}

interface StockRequest {
  id: string;
  perfumeName: string;
  customerName: string;
  customerPhone: string;
  desiredMl: number;
  quantity: number;
  status: string;
  createdAt: string;
}

const getAdminStatusOptions = (pickupMethod?: string): string[] => {
  if (!pickupMethod) {
    return ADMIN_STATUS_ORDER.map((key) => getStatusLabel(key, "admin"));
  }

  return ADMIN_STATUS_ORDER
    .filter((key) => isStatusAllowedForFulfillment(key, pickupMethod))
    .map((key) => getStatusLabel(key, "admin"));
};

const cancelledStatusLabel = getStatusLabel("cancelled", "admin");
const pendingBankStatusLabel = getStatusLabel("pending_bank_verification", "admin");
const procurementStatuses = ["Pending", "Sourcing", "Ready", "Dispatched", "Cancelled"];
const cancellationReasonOptions = [
  "Product Damaged",
  "Pricing Error",
  "Payment Verification Failed",
  "Duplicate Order",
  "Customer Request",
  "Delivery Area Unavailable",
  "Technical Issue",
  "Other",
];
type SizeTypeFilter = "all" | "decant" | "full-bottle" | "mixed";
type SortType = "newest" | "oldest" | "highest-total";
type SourceFilter = "all" | "standard_order";
type AdminTab = "orders" | "procurement";
type StatusChangeKind = "order" | "procurement";

interface PendingStatusChange {
  id: string;
  kind: StatusChangeKind;
  targetName: string;
  fromStatus: string;
  toStatus: string;
  cancelReason?: string;
  cancellationNote?: string;
}

const getAdminStatusLabel = (status?: string, pickupMethod?: string) =>
  getStatusLabelFromValue(status, pickupMethod, "admin");

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

const getOrderSource = (): SourceFilter => "standard_order";

const getPaymentLabel = (method?: string) => {
  const value = String(method || "Cash on Delivery");
  if (value === "Bkash Manual") return "BKASH";
  if (value === "Bank Manual") return "BANK";
  return "COD";
};

const getPaymentClass = (label: string) => {
  if (label === "BKASH") return "bg-[rgba(244,114,182,0.14)] text-[rgb(244,114,182)]";
  if (label === "BANK") return "bg-[rgba(59,130,246,0.14)] text-[rgb(96,165,250)]";
  return "bg-[rgba(148,163,184,0.16)] text-[var(--text-secondary)]";
};

const normalizeProcurementStatus = (status?: string) => {
  if (!status) return "Pending";
  if (status === "Approved") return "Sourcing";
  if (status === "Fulfilled") return "Dispatched";
  if (status === "Declined") return "Cancelled";
  return status;
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [procurementRequests, setProcurementRequests] = useState<StockRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>("orders");
  const [statusFilter, setStatusFilter] = useState("");
  const [sizeTypeFilter, setSizeTypeFilter] = useState<SizeTypeFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<"all" | "Cash on Delivery" | "Bkash Manual" | "Bank Manual">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<SortType>("newest");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [manualPrices, setManualPrices] = useState<Record<string, string>>({});
  const [manualBuyingPrices, setManualBuyingPrices] = useState<Record<string, string>>({});
  const [savingPrices, setSavingPrices] = useState(false);
  const [verifyingBkash, setVerifyingBkash] = useState(false);
  const [editingPrepTime, setEditingPrepTime] = useState("");
  const [savingPrepTime, setSavingPrepTime] = useState(false);
  const [pendingCancellationChange, setPendingCancellationChange] = useState<PendingStatusChange | null>(null);
  const [selectedCancellationReason, setSelectedCancellationReason] = useState("");
  const [customCancellationReason, setCustomCancellationReason] = useState("");
  const [cancellationNote, setCancellationNote] = useState("");
  const [submittingCancellation, setSubmittingCancellation] = useState(false);

  const load = async () => {
    setLoading(true);
    const [ordersRes, procurementRes] = await Promise.all([
      fetch("/api/orders"),
      fetch("/api/stock-requests"),
    ]);

    const ordersData = await ordersRes.json().catch(() => []);
    const procurementData = await procurementRes.json().catch(() => []);

    setOrders(Array.isArray(ordersData) ? ordersData : []);
    setProcurementRequests(Array.isArray(procurementData) ? procurementData : []);
    setLoading(false);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
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
    setStatusFilter((prev) => (prev === pendingBankStatusLabel ? "" : pendingBankStatusLabel));
    setSortBy("newest");
  };

  const updateStatus = async (id: string, status: string, cancelReason?: string, cancellationNoteVal?: string) => {
    const payload: { status: string; cancelReason?: string; cancellationNote?: string } = { status };
    if (status === cancelledStatusLabel) {
      const selectedReason = String(cancelReason || "").trim();
      payload.cancelReason = selectedReason.length >= 5 ? selectedReason.slice(0, 500) : "Cancelled by admin";
      const note = String(cancellationNoteVal || "").trim();
      if (note) payload.cancellationNote = note.slice(0, 1000);
    }

    const res = await fetch(`/api/orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast(err?.error || "Failed to update order status", "error");
      return false;
    }

    const updated = await res.json();
    updateOrderInState(updated);
    toast(`Order ${status.toLowerCase()}`, "success");
    return true;
  };

  const savePrepTime = async () => {
    if (!selectedOrder) return;
    const value = editingPrepTime.trim();
    if (!value) return;
    setSavingPrepTime(true);
    const res = await fetch(`/api/orders/${selectedOrder.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estimatedPrepTime: value }),
    });
    setSavingPrepTime(false);
    if (!res.ok) {
      toast("Failed to update prep time", "error");
      return;
    }
    const updated = await res.json();
    updateOrderInState(updated);
    setSelectedOrder((prev) => prev ? { ...prev, estimatedPrepTime: value } : prev);
    toast("Prep time updated", "success");
    setEditingPrepTime("");
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
        const sellingDraft = manualPrices[item.id];
        const buyingDraft = manualBuyingPrices[item.id];
        if (sellingDraft === undefined && buyingDraft === undefined) return null;

        const quantity = Math.max(1, Number(item.quantity ?? 1));
        const currentSelling = Math.round(Number(item.unitPrice ?? 0));
        const currentBuying = Math.round(Number(item.costPrice ?? 0) / quantity);

        const parsedSelling = sellingDraft === undefined ? currentSelling : Number(sellingDraft);
        const parsedBuying = buyingDraft === undefined ? currentBuying : Number(buyingDraft);

        if (!Number.isFinite(parsedSelling) || parsedSelling < 0 || !Number.isFinite(parsedBuying) || parsedBuying < 0) {
          return { invalid: true };
        }

        const roundedSelling = Math.round(parsedSelling);
        const roundedBuying = Math.round(parsedBuying);
        if (roundedSelling === currentSelling && roundedBuying === currentBuying) return null;

        return { itemId: item.id, unitPrice: roundedSelling, buyingPrice: roundedBuying };
      })
      .filter(Boolean);

    if (updates.some((u) => "invalid" in (u as { invalid?: boolean }))) {
      toast("Enter valid non-negative buying and selling prices", "error");
      return;
    }

    const payload = updates as { itemId: string; unitPrice: number; buyingPrice: number }[];
    if (payload.length === 0) {
      toast("No full bottle buying/selling changes to save", "error");
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
    setManualBuyingPrices({});
    toast("Full bottle buying/selling updated", "success");
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

  const updateProcurementStatus = async (id: string, status: string) => {
    const res = await fetch(`/api/stock-requests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast(err?.error || "Failed to update procurement request", "error");
      return false;
    }

    toast(`Procurement ${status.toLowerCase()}`, "success");
    load();
    return true;
  };

  const queueStatusChange = async (change: PendingStatusChange) => {
    if (change.fromStatus === change.toStatus) return false;
    if (change.kind === "order") {
      if (change.toStatus === cancelledStatusLabel && !change.cancelReason) {
        setPendingCancellationChange(change);
        setSelectedCancellationReason("");
        setCustomCancellationReason("");
        setCancellationNote("");
        return false;
      }
      return updateStatus(change.id, change.toStatus, change.cancelReason, change.cancellationNote);
    } else {
      return updateProcurementStatus(change.id, change.toStatus);
    }
  };

  const closeCancellationPicker = () => {
    if (submittingCancellation) return;
    setPendingCancellationChange(null);
    setSelectedCancellationReason("");
    setCustomCancellationReason("");
    setCancellationNote("");
  };

  const submitCancellationReason = async () => {
    if (!pendingCancellationChange) return;

    if (!selectedCancellationReason) {
      toast("Please select a cancellation reason", "error");
      return;
    }

    const reason = selectedCancellationReason === "Other"
      ? customCancellationReason.trim()
      : selectedCancellationReason;

    if (reason.length < 5) {
      toast("Please provide a valid cancellation reason", "error");
      return;
    }

    setSubmittingCancellation(true);
    const success = await queueStatusChange({ ...pendingCancellationChange, cancelReason: reason, cancellationNote: cancellationNote.trim() || undefined });
    setSubmittingCancellation(false);

    if (success) {
      setPendingCancellationChange(null);
      setSelectedCancellationReason("");
      setCustomCancellationReason("");
      setCancellationNote("");
    }
  };

  const filtered = useMemo(() => {
    const byStatus = statusFilter
      ? orders.filter((o) => getAdminStatusLabel(o.status, o.pickupMethod) === statusFilter)
      : orders;
    const bySize = sizeTypeFilter === "all"
      ? byStatus
      : byStatus.filter((o) => getOrderSizeType(o) === sizeTypeFilter);
    const byPaymentMethod = paymentMethodFilter === "all"
      ? bySize
      : bySize.filter((o) => (o.paymentMethod || "Cash on Delivery") === paymentMethodFilter);
    const bySource = sourceFilter === "all"
      ? byPaymentMethod
      : byPaymentMethod.filter(() => getOrderSource() === sourceFilter);

    const byDateRange = bySource.filter((o) => {
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

      const da = new Date(a.createdAt).getTime();
      const db2 = new Date(b.createdAt).getTime();
      return sortBy === "oldest" ? da - db2 : db2 - da;
    });

    return sorted;
  }, [orders, statusFilter, sizeTypeFilter, sourceFilter, paymentMethodFilter, dateFrom, dateTo, sortBy]);

  const openOrderDetails = (order: Order) => {
    setSelectedOrder(order);
    setEditingPrepTime("");
    const initialSellingDrafts = (order.items || []).reduce<Record<string, string>>((acc, item) => {
      if (item.isFullBottle) {
        acc[item.id] = String(item.unitPrice ?? 0);
      }
      return acc;
    }, {});

    const initialBuyingDrafts = (order.items || []).reduce<Record<string, string>>((acc, item) => {
      if (item.isFullBottle) {
        const quantity = Math.max(1, Number(item.quantity ?? 1));
        acc[item.id] = String(Math.round(Number(item.costPrice ?? 0) / quantity));
      }
      return acc;
    }, {});

    setManualPrices(initialSellingDrafts);
    setManualBuyingPrices(initialBuyingDrafts);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-light">Order Management</h1>
        {selectedOrder && (
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[10px] font-mono text-[var(--text-muted)] break-all">{selectedOrder.id}</p>
            <CopyOrderIdButton
              orderId={selectedOrder.id}
              className="h-8 w-8 min-w-8"
              stopPropagation
            />
          </div>
        )}
        <div className="gold-line mt-3" />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key: "orders", label: "Orders" },
          { key: "procurement", label: "Procurement" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as AdminTab)}
            className={`px-3 py-1.5 text-[10px] uppercase tracking-wider rounded transition-colors ${
              activeTab === tab.key
                ? "bg-[var(--gold)] text-black"
                : "border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={activeTab === "orders" ? "space-y-2" : "hidden"}>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={showPendingBankPayments}
            className={`px-3 py-1.5 text-[10px] uppercase tracking-wider rounded transition-colors ${
              statusFilter === pendingBankStatusLabel
                ? "bg-[rgb(59,130,246)] text-white"
                : "border border-[rgba(59,130,246,0.45)] text-[rgb(96,165,250)] hover:bg-[rgba(59,130,246,0.12)]"
            }`}
          >
            Pending Bank Payments ({orders.filter((o) => getAdminStatusLabel(o.status, o.pickupMethod) === pendingBankStatusLabel).length})
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
          {getAdminStatusOptions().map((s) => {
            const count = orders.filter((o) => getAdminStatusLabel(o.status, o.pickupMethod) === s).length;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter((prev) => (prev === s ? "" : s))}
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
            { key: "all", label: "All Sources" },
            { key: "standard_order", label: "Orders" },
          ].map((entry) => {
            const key = entry.key as SourceFilter;
            const count = key === "all" ? orders.length : orders.filter(() => getOrderSource() === key).length;
            return (
              <button
                key={key}
                onClick={() => setSourceFilter((prev) => (prev === key ? "all" : key))}
                className={`px-3 py-1.5 text-[10px] uppercase tracking-wider rounded transition-colors ${
                  sourceFilter === key
                    ? "bg-[var(--gold)] text-black"
                    : "border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)]"
                }`}
              >
                {entry.label} ({count})
              </button>
            );
          })}

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
                onClick={() => setSizeTypeFilter((prev) => (prev === key ? "all" : key))}
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
        <>
          <div className="space-y-3 md:hidden">
            {filtered.map((o) => {
              const currentStatus = getAdminStatusLabel(o.status, o.pickupMethod);
              const voucherPending = hasPendingVoucherForFullBottle(o);
              const paymentLabel = getPaymentLabel(o.paymentMethod);
              const paymentClass = getPaymentClass(paymentLabel);

              return (
                <div
                  key={o.id}
                  onClick={() => openOrderDetails(o)}
                  className="bg-[var(--bg-surface)] border border-[var(--border)] rounded p-4 space-y-3 cursor-pointer hover:bg-[var(--gold-tint)] transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-mono text-xs text-[var(--text-secondary)]">{o.id.slice(0, 8)}</p>
                      <p className="text-sm mt-1">{o.customerName}</p>
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
                    </div>
                    <div className="text-right">
                      <p className="font-serif text-[var(--gold)]">{fmt(o.total ?? 0)}</p>
                      {o.voucherCode && (o.discount ?? 0) > 0 && (
                        <p className="text-[10px] text-[var(--success)]">-{fmt(o.discount ?? 0)}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-[var(--bg-card)] rounded p-3 border border-[var(--border)]">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">Payment</p>
                      <div className="flex flex-col items-start gap-1">
                        <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${paymentClass}`}>
                          {paymentLabel}
                        </span>
                        {voucherPending && (
                          <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-[rgba(251,191,36,0.2)] text-[rgb(251,191,36)]">
                            Voucher Pending
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="bg-[var(--bg-card)] rounded p-3 border border-[var(--border)] text-right">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">Order Type</p>
                      <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${String(o.pickupMethod || "Delivery") === "Pickup"
                        ? "bg-[rgba(74,222,128,0.16)] text-[rgb(74,222,128)]"
                        : "bg-[rgba(59,130,246,0.16)] text-[rgb(59,130,246)]"}`}>
                        {String(o.pickupMethod || "Delivery")}
                      </span>
                    </div>
                    <div className="bg-[var(--bg-card)] rounded p-3 border border-[var(--border)] col-span-2">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">Items</p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {o.items?.map((i) => `${i.perfumeName} ${i.isFullBottle ? `Full Bottle (${i.fullBottleSize || "Custom"})` : `${i.ml}ml`}×${i.quantity}`).join(", ") || "-"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">Date</p>
                      <p className="text-xs text-[var(--text-secondary)]">{new Date(o.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${statusClass(currentStatus)}`}>
                      {currentStatus}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => openOrderDetails(o)}
                      className="text-[10px] uppercase tracking-wider border border-[var(--border)] text-[var(--text-secondary)] px-3 py-2 rounded hover:border-[var(--gold)] transition-colors"
                    >
                      View Details
                    </button>
                    <select
                      value={currentStatus}
                      onChange={(e) => queueStatusChange({
                        id: o.id,
                        kind: "order",
                        targetName: o.customerName,
                        fromStatus: currentStatus,
                        toStatus: e.target.value,
                      })}
                      className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-2 text-xs focus:border-[var(--gold)] outline-none"
                    >
                      {getAdminStatusOptions(o.pickupMethod).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
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
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Order ID</th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Customer</th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Items</th>
                  <th className="text-center py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Payment</th>
                  <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Total</th>
                  <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Order Type</th>
                  <th className="text-center py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Status</th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Date</th>
                  <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const currentStatus = getAdminStatusLabel(o.status, o.pickupMethod);
                  const voucherPending = hasPendingVoucherForFullBottle(o);
                  const paymentLabel = getPaymentLabel(o.paymentMethod);
                  const paymentClass = getPaymentClass(paymentLabel);

                  return (
                    <tr
                      key={o.id}
                      className="border-b border-[var(--border)] hover:bg-[var(--gold-tint)] transition-colors cursor-pointer"
                      onClick={() => openOrderDetails(o)}
                    >
                      <td className="py-3 px-4 font-mono text-xs text-[var(--text-secondary)]">
                        <div className="inline-flex items-center gap-2">
                          <span>{o.id}</span>
                          <CopyOrderIdButton orderId={o.id} className="h-8 w-8 min-w-8" stopPropagation />
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm">{o.customerName}</p>
                        <p className="text-xs text-[var(--text-muted)]">{o.customerPhone}</p>
                        {o.voucherCode && (
                          <p className="text-[10px] text-[var(--success)] mt-1 uppercase tracking-wider">Voucher: {o.voucherCode}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-[var(--text-secondary)]">
                        {o.items?.map((i) => `${i.perfumeName} ${i.isFullBottle ? `Full Bottle (${i.fullBottleSize || "Custom"})` : `${i.ml}ml`}×${i.quantity}`).join(", ") || "-"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${paymentClass}`}>
                            {paymentLabel}
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
                      <td className="py-3 px-4 text-right">
                        <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${String(o.pickupMethod || "Delivery") === "Pickup"
                          ? "bg-[rgba(74,222,128,0.16)] text-[rgb(74,222,128)]"
                          : "bg-[rgba(59,130,246,0.16)] text-[rgb(59,130,246)]"}`}>
                          {String(o.pickupMethod || "Delivery")}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${statusClass(currentStatus)}`}>
                          {currentStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-[var(--text-secondary)]">{new Date(o.createdAt).toLocaleDateString()}</td>
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={currentStatus}
                          onChange={(e) => queueStatusChange({
                            id: o.id,
                            kind: "order",
                            targetName: o.customerName,
                            fromStatus: currentStatus,
                            toStatus: e.target.value,
                          })}
                          className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--gold)] outline-none"
                        >
                          {getAdminStatusOptions(o.pickupMethod).map((s) => (
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
          {filtered.length === 0 && (
            <div className="text-center py-12 text-[var(--text-secondary)] md:hidden">No orders found</div>
          )}
        </>
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
                <span className="inline-flex items-center gap-2">
                  <span className="font-mono break-all">{selectedOrder.id}</span>
                  <CopyOrderIdButton orderId={selectedOrder.id} className="h-8 w-8 min-w-8" />
                </span>
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
              {selectedOrder.pickupMethod === "Pickup" && (
                <div className="flex justify-between gap-3">
                  <span className="text-[var(--text-muted)]">Pickup Location</span>
                  <span className="max-w-[65%] text-right">
                    {selectedOrder.pickupLocationName || selectedOrder.pickupLocationId || "-"}
                  </span>
                </div>
              )}
              {selectedOrder.pickupMethod === "Pickup" && (
                <div className="flex flex-col gap-2 border border-[var(--border)] rounded p-3 bg-[var(--bg-surface)]">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Pickup Prep Time</p>
                  {selectedOrder.estimatedPrepTime && !editingPrepTime && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm">{selectedOrder.estimatedPrepTime}</span>
                      <button
                        onClick={() => setEditingPrepTime(selectedOrder.estimatedPrepTime || "")}
                        className="text-[10px] text-[var(--gold)] uppercase tracking-wider hover:underline"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                  {(!selectedOrder.estimatedPrepTime || editingPrepTime) && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editingPrepTime}
                        onChange={(e) => setEditingPrepTime(e.target.value)}
                        placeholder="e.g. 30 minutes, 2 hours"
                        maxLength={100}
                        className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--gold)] outline-none"
                      />
                      <button
                        onClick={savePrepTime}
                        disabled={savingPrepTime || !editingPrepTime.trim()}
                        className="px-2 py-1 text-[9px] uppercase bg-[var(--gold)] text-black rounded hover:bg-[var(--gold-hover)] disabled:opacity-50"
                      >
                        {savingPrepTime ? "Saving..." : "Save"}
                      </button>
                      {selectedOrder.estimatedPrepTime && (
                        <button
                          onClick={() => setEditingPrepTime("")}
                          className="px-2 py-1 text-[9px] uppercase border border-[var(--border)] rounded hover:border-[var(--gold)]"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
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
                  {getAdminStatusLabel(selectedOrder.status, selectedOrder.pickupMethod) === pendingBankStatusLabel && (
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
                      <div key={item.id} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                        <div className="text-xs text-[var(--text-secondary)]">
                          {item.perfumeName} ({item.fullBottleSize || "Custom"}) x {item.quantity}
                          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                            Profit: {fmt(Math.round((
                              (Number(manualPrices[item.id] ?? String(item.unitPrice ?? 0)) || 0)
                              - (Number(manualBuyingPrices[item.id] ?? String(Math.round(Number(item.costPrice ?? 0) / Math.max(1, Number(item.quantity ?? 1))))) || 0)
                            ) * Math.max(1, Number(item.quantity ?? 1))))} BDT
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">Buy</span>
                          <input
                            type="number"
                            min={0}
                            value={manualBuyingPrices[item.id] ?? String(Math.round(Number(item.costPrice ?? 0) / Math.max(1, Number(item.quantity ?? 1))))}
                            onChange={(e) => setManualBuyingPrices((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            className="w-24 bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs text-right focus:border-[var(--gold)] outline-none"
                          />
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">Sell</span>
                          <input
                            type="number"
                            min={0}
                            value={manualPrices[item.id] ?? String(item.unitPrice ?? 0)}
                            onChange={(e) => setManualPrices((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            className="w-24 bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs text-right focus:border-[var(--gold)] outline-none"
                          />
                        </div>
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
                <span className="text-[var(--text-muted)]">Order Type</span>
                <span className="font-serif text-[var(--gold)]">{String(selectedOrder.pickupMethod || "Delivery")}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={activeTab === "procurement" ? "space-y-4" : "hidden"}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-2xl font-light">Procurement</h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">Out-of-stock sourcing requests handled in the same workflow</p>
          </div>
          <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">{procurementRequests.length} requests</span>
        </div>

        {procurementRequests.length === 0 ? (
          <div className="text-center py-12 text-[var(--text-secondary)]">No procurement requests yet</div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {procurementRequests.map((request) => {
                const currentStatus = normalizeProcurementStatus(request.status);
                return (
                  <div key={request.id} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded p-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-serif">{request.perfumeName}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">{request.customerName}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">{request.customerPhone}</p>
                      </div>
                      <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${statusClass(currentStatus)}`}>{currentStatus}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-[var(--bg-card)] rounded p-3 border border-[var(--border)] text-right">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">ML</p>
                        <p className="font-mono">{request.desiredMl}</p>
                      </div>
                      <div className="bg-[var(--bg-card)] rounded p-3 border border-[var(--border)] text-right">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">Qty</p>
                        <p className="font-mono">{request.quantity}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-end border-t border-[var(--border)] pt-3">
                      <select
                        value={currentStatus}
                        onChange={(e) => queueStatusChange({
                          id: request.id,
                          kind: "procurement",
                          targetName: request.customerName,
                          fromStatus: currentStatus,
                          toStatus: e.target.value,
                        })}
                        className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--gold)] outline-none"
                      >
                        {procurementStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
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
                    <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Customer</th>
                    <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">ML</th>
                    <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Qty</th>
                    <th className="text-center py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Status</th>
                    <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {procurementRequests.map((request) => {
                    const currentStatus = normalizeProcurementStatus(request.status);
                    return (
                      <tr key={request.id} className="border-b border-[var(--border)] hover:bg-[var(--gold-tint)] transition-colors">
                        <td className="py-3 px-4 font-serif">{request.perfumeName}</td>
                        <td className="py-3 px-4">{request.customerName}<p className="text-[10px] text-[var(--text-muted)]">{request.customerPhone}</p></td>
                        <td className="py-3 px-4 text-right font-mono">{request.desiredMl}</td>
                        <td className="py-3 px-4 text-right font-mono">{request.quantity}</td>
                        <td className="py-3 px-4 text-center"><span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${statusClass(currentStatus)}`}>{currentStatus}</span></td>
                        <td className="py-3 px-4 text-right">
                          <select
                            value={currentStatus}
                            onChange={(e) => queueStatusChange({
                              id: request.id,
                              kind: "procurement",
                              targetName: request.customerName,
                              fromStatus: currentStatus,
                              toStatus: e.target.value,
                            })}
                            className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--gold)] outline-none"
                          >
                            {procurementStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
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

      {pendingCancellationChange && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeCancellationPicker} />
          <div className="relative w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-5 space-y-4 animate-fade-up">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Cancellation Reason</p>
              <h3 className="font-serif text-xl font-light mt-1">Select a reason to cancel this order</h3>
              <p className="text-xs text-[var(--text-secondary)] mt-2">
                Order {pendingCancellationChange.id.slice(0, 8)} • {pendingCancellationChange.targetName}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Reason <span className="text-red-400">*</span></label>
              <select
                value={selectedCancellationReason}
                onChange={(e) => setSelectedCancellationReason(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
              >
                <option value="">— Select a reason —</option>
                {cancellationReasonOptions.map((reason) => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
              {selectedCancellationReason === "Other" && (
                <input
                  type="text"
                  maxLength={500}
                  value={customCancellationReason}
                  onChange={(e) => setCustomCancellationReason(e.target.value)}
                  placeholder="Write cancellation reason"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
                />
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Admin Note <span className="text-[var(--text-muted)]">(Optional)</span></label>
              <textarea
                maxLength={1000}
                rows={2}
                value={cancellationNote}
                onChange={(e) => setCancellationNote(e.target.value)}
                placeholder="Internal note (not shown to customer)"
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none resize-none"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCancellationPicker}
                disabled={submittingCancellation}
                className="px-3 py-2 text-[10px] uppercase tracking-wider border border-[var(--border)] text-[var(--text-secondary)] rounded hover:border-[var(--gold)] transition-colors disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={submitCancellationReason}
                disabled={submittingCancellation || !selectedCancellationReason || (selectedCancellationReason === "Other" && customCancellationReason.trim().length < 5)}
                className="px-3 py-2 text-[10px] uppercase tracking-wider bg-[var(--gold)] text-black rounded hover:bg-[var(--gold-hover)] transition-colors disabled:opacity-50"
              >
                {submittingCancellation ? "Cancelling..." : "Cancel Order"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
