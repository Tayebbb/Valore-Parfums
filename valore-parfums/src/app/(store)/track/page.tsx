"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Package, Clock, CheckCircle, XCircle } from "lucide-react";
import { useAuth } from "@/store/auth";
import { CopyOrderIdButton } from "@/components/ui/CopyOrderIdButton";

interface OrderResult {
  id: string;
  status: string;
  paymentMethod?: string;
  bkashPayment?: {
    transactionNumber?: string;
    paidFromNumber?: string;
  } | null;
  bankPayment?: {
    transactionNumber?: string;
    accountNumber?: string;
  } | null;
  totalAmount: number;
  discount: number;
  voucherCode?: string | null;
  finalAmount: number;
  pickupMethod: string;
  deliveryZone?: string;
  deliveryAddress?: string;
  customerName: string;
  createdAt: string;
  items: {
    perfumeId?: string;
    perfumeName: string;
    perfumeImage?: string;
    ml: number;
    isFullBottle?: boolean;
    fullBottleSize?: string;
    quantity: number;
    unitPrice: number;
  }[];
}

const standardStatusSteps = ["Pending", "Processing", "Out for Delivery", "Completed"];
const bkashStatusSteps = ["Pending Bkash Verification", "Confirmed", "Out for Delivery", "Completed"];
const bankStatusSteps = ["Pending Bank Verification", "Paid", "Out for Delivery", "Completed"];
const activeStatuses = new Set(["pending", "processing", "out for delivery", "confirmed", "ready", "pending bkash verification", "bkash paid", "pending bank verification", "paid"]);
const pastStatuses = new Set(["completed", "delivered", "cancelled"]);

const statusClass = (status: string) => {
  const normalized = (status ?? "").toLowerCase().replace(/\s+/g, "");
  return `status-${normalized}`;
};

const productPlaceholderImage = "/images/perfume-placeholder.svg";

const resolveImageSrc = (value?: string) => {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return productPlaceholderImage;
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("/")) {
    return raw;
  }
  return `/${raw}`;
};

const statusIcon = (status: string) => {
  const normalized = status.toLowerCase();
  switch (normalized) {
    case "completed":
    case "delivered":
      return <CheckCircle size={18} />;
    case "cancelled":
      return <XCircle size={18} />;
    default:
      return <Clock size={18} />;
  }
};

export default function TrackOrderPage() {
  const { user, loading: authLoading, fetchUser } = useAuth();
  const [orderIdInput, setOrderIdInput] = useState("");
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackedOrder, setTrackedOrder] = useState<OrderResult | null>(null);
  const [trackError, setTrackError] = useState("");
  const [orders, setOrders] = useState<OrderResult[]>([]);
  const [initialLoading, setInitialLoading] = useState(false);
  const [error, setError] = useState("");
  const lastSnapshot = useRef("");

  const loadOrders = async (isInitial = false) => {
    if (isInitial) {
      setInitialLoading(true);
      setError("");
    }

    try {
      const res = await fetch("/api/orders/my", { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 401) {
          if (lastSnapshot.current !== "[]") {
            setOrders([]);
            lastSnapshot.current = "[]";
          }
          return;
        }
        throw new Error("Failed to fetch orders");
      }

      const parsed = await res.json();
      const nextOrders = Array.isArray(parsed) ? parsed : [];
      const nextSnapshot = JSON.stringify(nextOrders);

      // Avoid unnecessary re-renders when no data has changed.
      if (nextSnapshot !== lastSnapshot.current) {
        lastSnapshot.current = nextSnapshot;
        setOrders(nextOrders);
      }

      setError("");
    } catch {
      if (isInitial) {
        setError("Unable to load your orders right now.");
      }
    }

    if (isInitial) {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    if (!user && authLoading) {
      fetchUser();
    }
  }, [user, authLoading, fetchUser]);

  useEffect(() => {
    if (!user?.id) return;

    loadOrders(true);

    const intervalId = setInterval(() => {
      loadOrders(false);
    }, 10000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadOrders(false);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [user?.id]);

  const activeOrders = useMemo(
    () => orders.filter((o) => activeStatuses.has((o.status ?? "").toLowerCase())),
    [orders],
  );

  const pastOrders = useMemo(
    () => orders.filter((o) => pastStatuses.has((o.status ?? "").toLowerCase())),
    [orders],
  );

  const renderOrderCard = (order: OrderResult, emphasize = false) => {
    const normalized = (order.status ?? "").toLowerCase();
    const statusSteps = order.paymentMethod === "Bkash Manual"
      ? bkashStatusSteps
      : order.paymentMethod === "Bank Manual"
        ? bankStatusSteps
        : standardStatusSteps;
    const effectiveNormalized = normalized === "bkash paid" ? "confirmed" : normalized;
    const currentStep = statusSteps.findIndex((step) => step.toLowerCase() === effectiveNormalized);

    return (
      <div
        key={order.id}
        className={`bg-[var(--bg-card)] border rounded p-4 sm:p-6 space-y-4 ${
          emphasize ? "border-[var(--gold)]" : "border-[var(--border)]"
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-0.5">Order ID</p>
            <div className="flex items-center gap-2">
              <p className="font-mono text-[var(--gold)] break-all">{order.id}</p>
              <CopyOrderIdButton orderId={order.id} />
            </div>
          </div>
          <span className={`w-fit px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider inline-flex items-center gap-1.5 ${statusClass(order.status)}`}>
            {statusIcon(order.status)} {order.status}
          </span>
        </div>

        {normalized !== "cancelled" && normalized !== "delivered" && (
          <>
            <div className="hidden sm:flex items-center mt-2 mb-1">
              {statusSteps.map((step, i) => (
                <div key={step} className="flex-1 flex items-center">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                        i <= currentStep
                          ? "bg-[var(--gold)] text-black"
                          : "border border-[var(--border)] text-[var(--text-muted)]"
                      }`}
                    >
                      {i + 1}
                    </div>
                    <span
                      className={`text-[9px] uppercase tracking-wider mt-1.5 text-center ${
                        i <= currentStep ? "text-[var(--gold)]" : "text-[var(--text-muted)]"
                      }`}
                    >
                      {step}
                    </span>
                  </div>
                  {i < statusSteps.length - 1 && (
                    <div className={`flex-1 h-px ${i < currentStep ? "bg-[var(--gold)]" : "bg-[var(--border)]"}`} />
                  )}
                </div>
              ))}
            </div>

            <div className="sm:hidden space-y-2 mt-2 mb-1">
              {statusSteps.map((step, i) => (
                <div key={`${order.id}-${step}`} className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors flex-shrink-0 ${
                      i <= currentStep
                        ? "bg-[var(--gold)] text-black"
                        : "border border-[var(--border)] text-[var(--text-muted)]"
                    }`}
                  >
                    {i + 1}
                  </div>
                  <span
                    className={`text-[10px] uppercase tracking-wider ${
                      i <= currentStep ? "text-[var(--gold)]" : "text-[var(--text-muted)]"
                    }`}
                  >
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-[var(--text-muted)]">Placed</span>
            <p>{new Date(order.createdAt).toLocaleDateString()}</p>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Collection</span>
            <p>{order.pickupMethod}</p>
          </div>
          {order.pickupMethod === "Delivery" && (
            <div>
              <span className="text-[var(--text-muted)]">Delivery Zone</span>
              <p>{order.deliveryZone || "N/A"}</p>
            </div>
          )}
          <div>
            <span className="text-[var(--text-muted)]">Items</span>
            <p>{order.items?.length ?? 0}</p>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Total</span>
            <p className="font-serif text-[var(--gold)]">{(order.finalAmount ?? 0).toLocaleString("en-BD")} BDT</p>
            {Boolean(order.voucherCode) && (order.discount ?? 0) > 0 && (
              <p className="text-[10px] text-[var(--success)]">-{(order.discount ?? 0).toLocaleString("en-BD")} via {order.voucherCode}</p>
            )}
            {Boolean(order.voucherCode) && (order.discount ?? 0) <= 0 && (
              <p className="text-[10px] text-[var(--text-muted)]">Voucher {order.voucherCode} will apply after pricing confirmation</p>
            )}
          </div>
        </div>

        {(order.items?.length ?? 0) > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">Products</p>
            <div className="space-y-2">
              {order.items.map((item, idx) => {
                const sizeLabel = item.isFullBottle
                  ? `Full Bottle (${item.fullBottleSize || "Custom"})`
                  : `${item.ml}ml`;
                const imageSrc = resolveImageSrc(item.perfumeImage);
                const productHref = item.perfumeId ? `/perfume/${item.perfumeId}` : "";

                return (
                  <div
                    key={`${order.id}-${item.perfumeName}-${idx}`}
                    className="flex items-center gap-3 p-2.5 rounded border border-[var(--border)] bg-[var(--bg-surface)]"
                  >
                    {productHref ? (
                      <Link href={productHref} className="flex items-center gap-3 min-w-0 flex-1 group">
                        <div className="w-12 h-12 rounded overflow-hidden bg-[var(--bg-card)] border border-[var(--border)] flex-shrink-0">
                          <img
                            src={imageSrc}
                            alt={item.perfumeName}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              const target = e.currentTarget;
                              if (target.src.endsWith(productPlaceholderImage)) return;
                              target.src = productPlaceholderImage;
                            }}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate group-hover:text-[var(--gold)] transition-colors">{item.perfumeName}</p>
                          <p className="text-xs text-[var(--text-muted)]">{sizeLabel} × {item.quantity}</p>
                        </div>
                      </Link>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded overflow-hidden bg-[var(--bg-card)] border border-[var(--border)] flex-shrink-0">
                          <img
                            src={imageSrc}
                            alt={item.perfumeName}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              const target = e.currentTarget;
                              if (target.src.endsWith(productPlaceholderImage)) return;
                              target.src = productPlaceholderImage;
                            }}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{item.perfumeName}</p>
                          <p className="text-xs text-[var(--text-muted)]">{sizeLabel} × {item.quantity}</p>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {order.paymentMethod === "Bkash Manual" ? (
          <div className="rounded border border-[rgba(227,35,132,0.35)] bg-[rgba(227,35,132,0.08)] px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Payment</p>
            <p className="text-sm text-[var(--text-primary)] mt-1">bKash Manual</p>
            {normalized === "pending bkash verification" ? (
              <p className="text-xs text-[var(--warning)] mt-1">Pending payment confirmation by admin. Your order will be confirmed once your payment is verified.</p>
            ) : null}
            {order.bkashPayment?.transactionNumber ? (
              <p className="text-xs text-[var(--text-secondary)] mt-1">TXN: {order.bkashPayment.transactionNumber}</p>
            ) : null}
          </div>
        ) : null}

        {order.paymentMethod === "Bank Manual" ? (
          <div className="rounded border border-[rgba(59,130,246,0.35)] bg-[rgba(59,130,246,0.08)] px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Payment</p>
            <p className="text-sm text-[var(--text-primary)] mt-1">Bank Manual</p>
            {normalized === "pending bank verification" ? (
              <p className="text-xs text-[var(--warning)] mt-1">Our team will verify your payment manually within 24-48 hours.</p>
            ) : null}
            {order.bankPayment?.transactionNumber ? (
              <p className="text-xs text-[var(--text-secondary)] mt-1">Ref: {order.bankPayment.transactionNumber}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const trackByOrderId = async () => {
    const value = orderIdInput.trim();
    if (!value) {
      setTrackError("Please enter an Order ID");
      setTrackedOrder(null);
      return;
    }

    setTrackLoading(true);
    setTrackError("");
    setTrackedOrder(null);

    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(value)}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setTrackError(data?.error || "Order not found");
        return;
      }

      setTrackedOrder(data as OrderResult);
    } catch {
      setTrackError("Unable to track order right now. Please try again.");
    } finally {
      setTrackLoading(false);
    }
  };

  return (
    <div className="px-4 sm:px-6 md:px-[5%] py-8 sm:py-12 max-w-3xl mx-auto">
      <h1 className="font-serif text-2xl sm:text-3xl font-light mb-2 text-center">Track Order</h1>
      <p className="text-sm text-[var(--text-muted)] text-center mb-8">
        Enter your Order ID to check real-time order status. Sign in users can also see account-linked history below.
      </p>

      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5 mb-8">
        <label className="block text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">Order ID</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder="Paste full Order ID"
            value={orderIdInput}
            onChange={(e) => setOrderIdInput(e.target.value)}
            className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm outline-none focus:border-[var(--gold)]"
          />
          <button
            onClick={trackByOrderId}
            disabled={trackLoading}
            className="bg-[var(--gold)] text-black px-4 py-2.5 rounded text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors disabled:opacity-50 sm:w-auto w-full"
          >
            {trackLoading ? "Checking..." : "Track"}
          </button>
        </div>
        {trackError && <p className="text-sm text-[var(--error)] mt-2">{trackError}</p>}
      </div>

      {trackedOrder && (
        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-[0.2em] text-[var(--gold)] mb-3">Tracked Result</h2>
          {renderOrderCard(trackedOrder, true)}
        </section>
      )}

      {!authLoading && !user && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-8 text-center">
          <Package size={40} className="mx-auto text-[var(--text-muted)] mb-3" />
          <p className="text-sm text-[var(--text-secondary)]">Guest tracking works with Order ID. Log in to view your full account-linked order history.</p>
          <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2">
            <Link
              href="/login"
              className="text-center bg-[var(--gold)] text-black px-4 py-2 text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors"
            >
              Log In
            </Link>
            <Link
              href="/signup"
              className="text-center border border-[var(--border)] px-4 py-2 text-xs uppercase tracking-wider text-[var(--text-secondary)] hover:border-[var(--gold)] transition-colors"
            >
              Create Account
            </Link>
          </div>
        </div>
      )}

      {user && (
        <div className="space-y-8 animate-[fadeUp_0.3s_ease]">
          <section>
            <div className="flex items-end justify-between mb-3">
              <h2 className="text-xs uppercase tracking-[0.2em] text-[var(--gold)]">Active Orders</h2>
              <span className="text-xs text-[var(--text-muted)]">{activeOrders.length}</span>
            </div>
            <div className="space-y-4">
              {initialLoading && <div className="skeleton h-32 rounded" />}
              {!initialLoading && activeOrders.length === 0 && (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-6 text-sm text-[var(--text-secondary)]">
                  You have no active orders right now.
                </div>
              )}
              {!initialLoading && activeOrders.map((order) => renderOrderCard(order, true))}
            </div>
          </section>

          <section>
            <div className="flex items-end justify-between mb-3">
              <h2 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Past Orders</h2>
              <span className="text-xs text-[var(--text-muted)]">{pastOrders.length}</span>
            </div>
            <div className="space-y-4">
              {!initialLoading && pastOrders.length === 0 && (
                <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-6 text-sm text-[var(--text-secondary)]">
                  No past orders yet.
                </div>
              )}
              {!initialLoading && pastOrders.map((order) => renderOrderCard(order))}
            </div>
          </section>

          {error && (
            <div className="bg-[var(--bg-card)] border border-[var(--error)] rounded p-4 text-sm text-[var(--error)]">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
