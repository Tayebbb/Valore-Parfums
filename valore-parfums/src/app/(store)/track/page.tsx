"use client";

import { useState } from "react";
import { Search, Package, Clock, CheckCircle, XCircle } from "lucide-react";

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

const statusSteps = ["Pending", "Confirmed", "Ready", "Completed"];

const statusIcon = (status: string) => {
  switch (status) {
    case "Completed": return <CheckCircle size={18} />;
    case "Cancelled": return <XCircle size={18} />;
    default: return <Clock size={18} />;
  }
};

export default function TrackOrderPage() {
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setNotFound(false);
    setOrder(null);

    // Only search by exact order ID — never expose full order list
    const res = await fetch(`/api/orders/${encodeURIComponent(query.trim())}`);
    if (res.ok) {
      setOrder(await res.json());
    } else {
      setNotFound(true);
    }
    setLoading(false);
  };

  const currentStep = order ? statusSteps.indexOf(order.status) : -1;

  return (
    <div className="px-[5%] py-12 max-w-2xl mx-auto">
      <h1 className="font-serif text-3xl font-light mb-2 text-center">Track Your Order</h1>
      <p className="text-sm text-[var(--text-muted)] text-center mb-8">
        Enter your Order ID to check the current status
      </p>

      <div className="flex gap-2 mb-8">
        <input
          type="text"
          placeholder="Enter Order ID..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          className="flex-1 bg-[var(--bg-card)] border border-[var(--border)] rounded px-4 py-3 text-sm font-mono focus:border-[var(--gold)] focus:bg-[var(--gold-tint)] outline-none transition-colors"
        />
        <button
          onClick={search}
          disabled={loading}
          className="bg-[var(--gold)] text-black px-5 py-3 flex items-center gap-2 text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors disabled:opacity-50"
        >
          <Search size={14} />
          {loading ? "..." : "Track"}
        </button>
      </div>

      {notFound && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-8 text-center">
          <Package size={40} className="mx-auto text-[var(--text-muted)] mb-3" />
          <p className="text-sm text-[var(--text-secondary)]">No order found with that ID.</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Please check the ID and try again.</p>
        </div>
      )}

      {order && (
        <div className="space-y-6 animate-[fadeUp_0.3s_ease]">
          {/* Status */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-0.5">Order ID</p>
                <p className="font-mono text-[var(--gold)]">{order.id.slice(0, 8)}</p>
              </div>
              <span className={`status-pill ${(order.status ?? "").toLowerCase()}`}>
                {statusIcon(order.status)} {order.status}
              </span>
            </div>

            {order.status !== "Cancelled" && (
              <div className="flex items-center mt-6 mb-2">
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
                      <span className={`text-[9px] uppercase tracking-wider mt-1.5 ${
                        i <= currentStep ? "text-[var(--gold)]" : "text-[var(--text-muted)]"
                      }`}>
                        {step}
                      </span>
                    </div>
                    {i < statusSteps.length - 1 && (
                      <div
                        className={`flex-1 h-px ${
                          i < currentStep ? "bg-[var(--gold)]" : "bg-[var(--border)]"
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-6">
            <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Order Details</h3>
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div>
                <span className="text-[var(--text-muted)]">Customer</span>
                <p>{order.customerName}</p>
              </div>
              <div>
                <span className="text-[var(--text-muted)]">Collection</span>
                <p>{order.pickupMethod}</p>
              </div>
              <div>
                <span className="text-[var(--text-muted)]">Date</span>
                <p>{new Date(order.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <span className="text-[var(--text-muted)]">Items</span>
                <p>{order.items?.length ?? 0}</p>
              </div>
            </div>

            <div className="gold-line my-4" />

            <div className="space-y-2">
              {(order.items ?? []).map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">
                    {item.perfumeName} — {item.ml}ml × {item.quantity}
                  </span>
                  <span>{((item.unitPrice ?? 0) * (item.quantity ?? 0)).toLocaleString("en-BD")} BDT</span>
                </div>
              ))}
            </div>

            <div className="gold-line my-4" />

            {(order.discount ?? 0) > 0 && (
              <div className="flex justify-between text-sm mb-1">
                <span className="text-[var(--text-muted)]">Discount</span>
                <span className="text-[var(--success)]">-{order.discount} BDT</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-sm text-[var(--text-muted)]">Total</span>
              <span className="font-serif text-xl text-[var(--gold)]">{(order.finalAmount ?? 0).toLocaleString("en-BD")} BDT</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
