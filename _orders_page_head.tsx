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
  deliveryAddress?: string;
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
const requestStatuses = ["Pending", "Confirmed", "Dispatched", "Cancelled"];
const procurementStatuses = ["Pending", "Sourcing", "Ready", "Dispatched", "Cancelled"];
const cancellationReasonOptions = [
  "Out of Stock",
  "Supplier Delay",
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
type SortType = "newest" | "oldest" | "highest-total" | "highest-profit";
type SourceFilter = "all" | "standard_order" | "customer_request" | "stock_request";
type AdminTab = "orders" | "requests" | "procurement";
type StatusChangeKind = "order" | "request" | "procurement";

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

const getOrderSource = (order: Order): SourceFilter => {
  const source = String(order.orderSource || "standard_order") as SourceFilter;
  if (source === "customer_request" || source === "stock_request") return source;
  return "standard_order";
};

const getOrderSourceLabel = (source: SourceFilter) => {
  if (source === "customer_request") return "Request";
  if (source === "stock_request") return "Stock Request";
  return "Order";
};

const getEntryKind = (order: Order): StatusChangeKind => {
  const source = getOrderSource(order);
  if (source === "customer_request") return "request";
  if (source === "stock_request") return "procurement";
  return "order";
};

const getStatusOptionsForOrder = (order: Order): string[] => {
  const kind = getEntryKind(order);
  if (kind === "request") return requestStatuses;
  if (kind === "procurement") return procurementStatuses;
  return getAdminStatusOptions(order.pickupMethod);
};

const normalizeRequestStatus = (status?: string) => {
  if (!status) return "Pending";
  if (status === "Approved") return "Confirmed";
  if (status === "Fulfilled") return "Dispatched";
  if (status === "Declined") return "Cancelled";
  return status;
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
  const [requests, setRequests] = useState<UserRequest[]>([]);
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
  const [requestEditingId, setRequestEditingId] = useState<string | null>(null);
  const [requestBuyingPrice, setRequestBuyingPrice] = useState("");
  const [requestSellingPrice, setRequestSellingPrice] = useState("");
  const [savingRequestPrices, setSavingRequestPrices] = useState(false);
  const [verifyingBkash, setVerifyingBkash] = useState(false);
  const [editingPrepTime, setEditingPrepTime] = useState("");
  const [savingPrepTime, setSavingPrepTime] = useState(false);
  const [pendingCancellationChange, setPendingCancellationChange] = useState<PendingStatusChange | null>(null);
  const [selectedCancellationReason, setSelectedCancellationReason] = useState("");
  const [customCancellationReason, setCustomCancellationReason] = useState("");
  const [cancellationNote, setCancellationNote] = useState("");
  const [submittingCancellation, setSubmittingCancellation] = useState(false);

  // Order edit mode state
  const [isEditingOrder, setIsEditingOrder] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editDeliveryAddress, setEditDeliveryAddress] = useState("");
  const [editDeliveryArea, setEditDeliveryArea] = useState("");
  const [editDeliveryCity, setEditDeliveryCity] = useState("");
  const [editDeliveryNote, setEditDeliveryNote] = useState("");
  const [editDeliveryFee, setEditDeliveryFee] = useState("");
  const [itemsMarkedForRemoval, setItemsMarkedForRemoval] = useState<Set<string>>(new Set());
  const [newItemDrafts, setNewItemDrafts] = useState<{ perfumeName: string; ml: string; quantity: string; unitPrice: string; costPrice: string }[]>([]);
  const [savingOrderEdit, setSavingOrderEdit] = useState(false);

  const load = async () => {
    setLoading(true);
    const [ordersRes, requestsRes, procurementRes] = await Promise.all([
      fetch("/api/orders"),
      fetch("/api/requests?all=true"),
      fetch("/api/stock-requests"),
    ]);

    const ordersData = await ordersRes.json().catch(() => []);
    const requestsData = await requestsRes.json().catch(() => []);
    const procurementData = await procurementRes.json().catch(() => []);

    setOrders(Array.isArray(ordersData) ? ordersData : []);
    setRequests(Array.isArray(requestsData) ? requestsData : []);
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

  const openEditOrder = () => {
    if (!selectedOrder) return;
    setEditName(selectedOrder.customerName);
    setEditPhone(selectedOrder.customerPhone);
    if (selectedOrder.deliveryAddress) {
      const parts = selectedOrder.deliveryAddress.split(" | ");
      const addressLine = parts[0] || "";
      const notePart = parts.find((p) => p.startsWith("Note: "));
      const note = notePart ? notePart.replace(/^Note: /, "") : "";
      const areaCity = parts.find((p, i) => i > 0 && !p.startsWith("Note: ")) || "";
      const [area, ...cityParts] = areaCity.split(", ");
      setEditDeliveryAddress(addressLine);
      setEditDeliveryArea(area || "");
      setEditDeliveryCity(cityParts.join(", "));
      setEditDeliveryNote(note);
    } else {
      setEditDeliveryAddress("");
      setEditDeliveryArea("");
      setEditDeliveryCity("");
      setEditDeliveryNote("");
    }
    setEditDeliveryFee(String(selectedOrder.deliveryFee ?? ""));
    setItemsMarkedForRemoval(new Set());
    setNewItemDrafts([]);
    setIsEditingOrder(true);
  };

  const saveOrderEdit = async () => {
    if (!selectedOrder) return;
    const areaCity = [editDeliveryArea.trim(), editDeliveryCity.trim()].filter(Boolean).join(", ");
    const noteText = editDeliveryNote.trim() ? `Note: ${editDeliveryNote.trim()}` : "";
    const deliveryAddress = [editDeliveryAddress.trim(), areaCity, noteText].filter(Boolean).join(" | ");

    const validNewItems = newItemDrafts
      .filter((d) => d.perfumeName.trim() && Number(d.ml) > 0)
      .map((d) => ({
        perfumeName: d.perfumeName.trim(),
        ml: Number(d.ml),
        quantity: Math.max(1, Math.floor(Number(d.quantity) || 1)),
        unitPrice: Math.max(0, Math.round(Number(d.unitPrice) || 0)),
        costPrice: Math.max(0, Math.round(Number(d.costPrice) || 0)),
      }));

    const toRemove = Array.from(itemsMarkedForRemoval);

    const payload: Record<string, unknown> = {
      customerName: editName.trim() || selectedOrder.customerName,
      customerPhone: editPhone.trim() || selectedOrder.customerPhone,
    };
    if (selectedOrder.pickupMethod === "Delivery") {
      if (deliveryAddress) payload.deliveryAddress = deliveryAddress;
      const parsedFee = Number(editDeliveryFee);
      if (Number.isFinite(parsedFee) && parsedFee >= 0) payload.deliveryFee = parsedFee;
    }
    if (toRemove.length > 0) payload.removeItemIds = toRemove;
    if (validNewItems.length > 0) payload.addItems = validNewItems;

    setSavingOrderEdit(true);
    const res = await fetch(`/api/orders/${selectedOrder.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSavingOrderEdit(false);

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast(err?.error || "Failed to save order changes", "error");
      return;
    }

    const updated = await res.json();
    updateOrderInState(updated);
    setIsEditingOrder(false);
    toast("Order updated", "success");
  };

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
    } else if (change.kind === "request") {
      return updateRequestStatus(change.id, change.toStatus);
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
      : byPaymentMethod.filter((o) => getOrderSource(o) === sourceFilter);

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
      if (sortBy === "highest-profit") return (b.profit ?? 0) - (a.profit ?? 0);

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
            { key: "customer_request", label: "Requests" },
            { key: "stock_request", label: "Stock Requests" },
          ].map((entry) => {
            const key = entry.key as SourceFilter;
            const count = key === "all" ? orders.length : orders.filter((o) => getOrderSource(o) === key).length;
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
        <>
          <div className="space-y-3 md:hidden">
            {filtered.map((o) => {
              const orderType = getOrderSizeType(o);
              const currentStatus = getAdminStatusLabel(o.status, o.pickupMethod);
              const voucherPending = hasPendingVoucherForFullBottle(o);
              const orderTypeLabel = orderType === "full-bottle" ? "Full Bottle" : orderType === "mixed" ? "Mixed" : "Decant";
              const orderTypeClass = orderType === "full-bottle"
                ? "bg-[rgba(250,204,21,0.18)] text-[var(--gold)]"
                : orderType === "mixed"
                  ? "bg-[rgba(96,165,250,0.14)] text-[rgb(125,176,255)]"
                  : "bg-[rgba(148,163,184,0.16)] text-[var(--text-secondary)]";

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
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">Type</p>
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border border-[var(--border-gold)] text-[var(--gold)] bg-[var(--gold-tint)]">
                          {getOrderSourceLabel(getOrderSource(o))}
                        </span>
                        <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${orderTypeClass}`}>
                          {orderTypeLabel}
                        </span>
                        {voucherPending && (
                          <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-[rgba(251,191,36,0.2)] text-[rgb(251,191,36)]">
                            Voucher Pending
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="bg-[var(--bg-card)] rounded p-3 border border-[var(--border)] text-right">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">Profit</p>
                      <p className="font-serif text-[var(--success)]">{fmt(o.profit ?? 0)}</p>
                    </div>
                    <div className="bg-[var(--bg-card)] rounded p-3 border border-[var(--border)] col-span-2">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">Items</p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {o.items?.map((i) => `${i.perfumeName} ${i.isFullBottle ? `Full Bottle (${i.fullBottleSize || "Custom"})` : `${i.ml}ml`}├ù${i.quantity}`).join(", ") || "-"}
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
                        kind: getEntryKind(o),
                        targetName: o.customerName,
                        fromStatus: currentStatus,
                        toStatus: e.target.value,
                      })}
                      className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-2 text-xs focus:border-[var(--gold)] outline-none"
                    >
                      {getStatusOptionsForOrder(o).map((s) => (
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
                  const currentStatus = getAdminStatusLabel(o.status, o.pickupMethod);
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
                        {o.items?.map((i) => `${i.perfumeName} ${i.isFullBottle ? `Full Bottle (${i.fullBottleSize || "Custom"})` : `${i.ml}ml`}├ù${i.quantity}`).join(", ") || "-"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border border-[var(--border-gold)] text-[var(--gold)] bg-[var(--gold-tint)]">
                            {getOrderSourceLabel(getOrderSource(o))}
                          </span>
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
                            kind: getEntryKind(o),
                            targetName: o.customerName,
                            fromStatus: currentStatus,
                            toStatus: e.target.value,
                          })}
                          className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--gold)] outline-none"
                        >
                          {getStatusOptionsForOrder(o).map((s) => (
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
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setSelectedOrder(null); setIsEditingOrder(false); }} />
          <div className="relative bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg w-full max-w-lg p-6 animate-fade-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-xl font-light">{isEditingOrder ? "Edit Order" : "Order Details"}</h2>
              <div className="flex items-center gap-2">
                {!isEditingOrder && !["Dispatched", "Delivered", "Cancelled"].includes(selectedOrder.status) && (
                  <button
                    onClick={openEditOrder}
                    className="px-3 py-1 text-[10px] uppercase tracking-wider border border-[var(--gold)] text-[var(--gold)] rounded hover:bg-[var(--gold-tint)] transition-colors"
                  >
                    Edit
                  </button>
                )}
                <button onClick={() => { setSelectedOrder(null); setIsEditingOrder(false); }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              {isEditingOrder ? (
                /* ── Edit Mode ── */
                <div className="space-y-5">
                  {/* Customer Info */}
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">Customer Info</p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-[var(--text-muted)] w-16 shrink-0">Name</span>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={120}
                          className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--gold)] outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-[var(--text-muted)] w-16 shrink-0">Phone</span>
                        <input
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          maxLength={20}
                          className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--gold)] outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Delivery Address */}
                  {selectedOrder.pickupMethod === "Delivery" && (
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">Delivery Address</p>
                      <div className="space-y-2">
                        {[
                          { label: "Address", value: editDeliveryAddress, setter: setEditDeliveryAddress, placeholder: "Road, block, sector…", max: 200 },
                          { label: "Area", value: editDeliveryArea, setter: setEditDeliveryArea, placeholder: "Gulshan, Dhanmondi…", max: 80 },
                          { label: "City", value: editDeliveryCity, setter: setEditDeliveryCity, placeholder: "Dhaka", max: 80 },
                          { label: "Note", value: editDeliveryNote, setter: setEditDeliveryNote, placeholder: "Timing, landmark…", max: 200 },
                        ].map(({ label, value, setter, placeholder, max }) => (
                          <div key={label} className="flex items-center gap-3">
                            <span className="text-xs text-[var(--text-muted)] w-16 shrink-0">{label}</span>
                            <input
                              value={value}
                              onChange={(e) => setter(e.target.value)}
                              placeholder={placeholder}
                              maxLength={max}
                              className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--gold)] outline-none"
                            />
                          </div>
                        ))}
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-[var(--text-muted)] w-16 shrink-0">Fee (BDT)</span>
                          <input
                            type="number"
                            min={0}
                            value={editDeliveryFee}
                            onChange={(e) => setEditDeliveryFee(e.target.value)}
                            className="w-28 bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--gold)] outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Items */}
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">Items</p>
                    <div className="space-y-1">
                      {selectedOrder.items?.map((item) => (
                        <div
                          key={item.id}
                          className={`flex items-center justify-between gap-2 py-1.5 px-2 rounded border ${itemsMarkedForRemoval.has(item.id) ? "border-[var(--error)] opacity-50 line-through" : "border-[var(--border)]"}`}
                        >
                          <span className="text-xs flex-1 min-w-0 truncate">
                            {item.perfumeName} – {item.isFullBottle ? `Full Bottle (${item.fullBottleSize || "Custom"})` : `${item.ml}ml`} ×{item.quantity}
                          </span>
                          <span className="text-xs text-[var(--gold)] whitespace-nowrap">{fmt(item.totalPrice)} BDT</span>
                          {itemsMarkedForRemoval.has(item.id) ? (
                            <button
                              onClick={() => setItemsMarkedForRemoval((prev) => { const n = new Set(prev); n.delete(item.id); return n; })}
                              className="text-[9px] text-[var(--text-muted)] uppercase hover:text-[var(--text-primary)] whitespace-nowrap"
                            >
                              Restore
                            </button>
                          ) : (
                            <button
                              onClick={() => setItemsMarkedForRemoval((prev) => new Set([...prev, item.id]))}
                              className="text-[9px] text-[var(--error)] uppercase hover:opacity-70 whitespace-nowrap"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Add new items */}
                    <div className="mt-3 space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Add Items</p>
                      {newItemDrafts.map((draft, idx) => (
                        <div key={idx} className="border border-[var(--border)] rounded p-2 space-y-1.5 bg-[var(--bg-surface)]">
                          <div className="flex items-center gap-2">
                            <input
                              placeholder="Perfume name"
                              value={draft.perfumeName}
                              onChange={(e) => setNewItemDrafts((prev) => prev.map((d, i) => i === idx ? { ...d, perfumeName: e.target.value } : d))}
                              maxLength={120}
                              className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--gold)] outline-none"
                            />
                            <button
                              onClick={() => setNewItemDrafts((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-[var(--error)] text-xs px-1 hover:opacity-70"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="grid grid-cols-4 gap-1.5">
                            {[
                              { key: "ml" as const, placeholder: "ML", type: "number" },
                              { key: "quantity" as const, placeholder: "Qty", type: "number" },
                              { key: "unitPrice" as const, placeholder: "Sell (BDT)", type: "number" },
                              { key: "costPrice" as const, placeholder: "Cost (BDT)", type: "number" },
                            ].map(({ key, placeholder, type }) => (
                              <input
                                key={key}
                                type={type}
                                min={0}
                                placeholder={placeholder}
                                value={draft[key]}
                                onChange={(e) => setNewItemDrafts((prev) => prev.map((d, i) => i === idx ? { ...d, [key]: e.target.value } : d))}
                                className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-[var(--gold)] outline-none w-full"
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                      <button
                        onClick={() => setNewItemDrafts((prev) => [...prev, { perfumeName: "", ml: "", quantity: "1", unitPrice: "", costPrice: "" }])}
                        className="w-full py-1.5 text-[10px] uppercase tracking-wider border border-dashed border-[var(--border)] text-[var(--text-muted)] rounded hover:border-[var(--gold)] hover:text-[var(--gold)] transition-colors"
                      >
                        + Add Item
                      </button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={saveOrderEdit}
                      disabled={savingOrderEdit}
                      className="flex-1 py-2 text-[10px] uppercase tracking-wider bg-[var(--gold)] text-black rounded hover:bg-[var(--gold-light)] transition-colors disabled:opacity-50"
                    >
                      {savingOrderEdit ? "Saving…" : "Save Changes"}
                    </button>
                    <button
                      onClick={() => setIsEditingOrder(false)}
                      disabled={savingOrderEdit}
                      className="px-4 py-2 text-[10px] uppercase tracking-wider border border-[var(--border)] rounded hover:border-[var(--gold)] transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
              /* ── View Mode ── */
              <>
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
              {selectedOrder.pickupMethod === "Delivery" && (selectedOrder.deliveryFee ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Delivery Fee</span>
                  <span>+{fmt(selectedOrder.deliveryFee ?? 0)} BDT</span>
                </div>
              )}
              <div className="flex justify-between text-base">
                <span className="text-[var(--text-muted)]">Total</span>
                <span className="font-serif text-[var(--gold)]">{fmt(selectedOrder.total ?? 0)} BDT</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Profit</span>
                <span className="font-serif text-[var(--success)]">{fmt(selectedOrder.profit ?? 0)} BDT</span>
              </div>
              </>
              )} {/* end ternary */}
            </div>
          </div>
        </div>
      )}

      <div className={activeTab === "requests" ? "space-y-4" : "hidden"}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-2xl font-light">Customer Requests</h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">Unified request queue with pricing and fulfillment control</p>
          </div>
          <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">{requests.length} requests</span>
        </div>

        {requests.length === 0 ? (
          <div className="text-center py-12 text-[var(--text-secondary)]">No customer requests yet</div>
        ) : (
          <>
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
                        <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">Qty: {request.quantity}{request.ml ? ` ┬╖ ${request.ml}ml` : ""}</p>
                      </div>
                      <div className="bg-[var(--bg-card)] rounded p-3 border border-[var(--border)] text-right">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">Profit</p>
                        {request.profit != null ? (
                          <span className={request.profit >= 0 ? "text-green-400" : "text-red-400"}>{request.profit >= 0 ? "+" : ""}{request.profit}</span>
                        ) : request.buyingPrice != null && request.sellingPrice != null ? (
                          <span className="text-[var(--text-muted)] text-[10px]">~{(request.sellingPrice ?? 0) - (request.buyingPrice ?? 0)}</span>
                        ) : (
                          <span className="text-[var(--text-muted)]">ΓÇö</span>
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
                        onChange={(e) => queueStatusChange({
                          id: request.id,
                          kind: "request",
                          targetName: request.userName,
                          fromStatus: currentStatus,
                          toStatus: e.target.value,
                        })}
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
                          <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">Qty: {request.quantity}{request.ml ? ` ┬╖ ${request.ml}ml` : ""}</p>
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
                            "ΓÇö"
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${statusClass(currentStatus)}`}>{currentStatus}</span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <select
                            value={currentStatus}
                            onChange={(e) => queueStatusChange({
                              id: request.id,
                              kind: "request",
                              targetName: request.userName,
                              fromStatus: currentStatus,
                              toStatus: e.target.value,
                            })}
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
                Order {pendingCancellationChange.id.slice(0, 8)} ΓÇó {pendingCancellationChange.targetName}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Reason <span className="text-red-400">*</span></label>
              <select
                value={selectedCancellationReason}
                onChange={(e) => setSelectedCancellationReason(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
              >
                <option value="">ΓÇö Select a reason ΓÇö</option>
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
