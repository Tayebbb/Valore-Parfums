"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Package, Clock, CheckCircle, XCircle } from "lucide-react";
import { useAuth } from "@/store/auth";

interface OrderResult {
  id: string;
  status: string;
  totalAmount: number;
  discount: number;
  finalAmount: number;
  pickupMethod: string;
  customerName: string;
  createdAt: string;
  items: { perfumeName: string; ml: number; quantity: number; unitPrice: number }[];
}

const statusSteps = ["Pending", "Processing", "Out for Delivery", "Completed"];
const activeStatuses = new Set(["pending", "processing", "out for delivery", "confirmed", "ready"]);
const pastStatuses = new Set(["completed", "delivered", "cancelled"]);

const statusClass = (status: string) => {
  const normalized = (status ?? "").toLowerCase().replace(/\s+/g, "");
  return `status-${normalized}`;
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
    const currentStep = statusSteps.findIndex((step) => step.toLowerCase() === normalized);

    return (
      <div
        key={order.id}
        className={`bg-[var(--bg-card)] border rounded p-6 space-y-4 ${
          emphasize ? "border-[var(--gold)]" : "border-[var(--border)]"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-0.5">Order ID</p>
            <p className="font-mono text-[var(--gold)]">{order.id.slice(0, 8)}</p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider inline-flex items-center gap-1.5 ${statusClass(order.status)}`}>
            {statusIcon(order.status)} {order.status}
          </span>
        </div>

        {normalized !== "cancelled" && normalized !== "delivered" && (
          <div className="flex items-center mt-2 mb-1">
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
                    className={`text-[9px] uppercase tracking-wider mt-1.5 ${
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
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-[var(--text-muted)]">Placed</span>
            <p>{new Date(order.createdAt).toLocaleDateString()}</p>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Collection</span>
            <p>{order.pickupMethod}</p>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Items</span>
            <p>{order.items?.length ?? 0}</p>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Total</span>
            <p className="font-serif text-[var(--gold)]">{(order.finalAmount ?? 0).toLocaleString("en-BD")} BDT</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="px-[5%] py-12 max-w-3xl mx-auto">
      <h1 className="font-serif text-3xl font-light mb-2 text-center">My Orders</h1>
      <p className="text-sm text-[var(--text-muted)] text-center mb-8">
        Your orders are linked to your account and update automatically.
      </p>

      {!authLoading && !user && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-8 text-center">
          <Package size={40} className="mx-auto text-[var(--text-muted)] mb-3" />
          <p className="text-sm text-[var(--text-secondary)]">Log in to view orders linked to your account.</p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Link
              href="/login"
              className="bg-[var(--gold)] text-black px-4 py-2 text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors"
            >
              Log In
            </Link>
            <Link
              href="/signup"
              className="border border-[var(--border)] px-4 py-2 text-xs uppercase tracking-wider text-[var(--text-secondary)] hover:border-[var(--gold)] transition-colors"
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
