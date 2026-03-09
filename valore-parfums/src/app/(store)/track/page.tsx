"use client";

import { useState } from "react";
import { useAuth } from "@/store/auth";
import { Search, Package, Clock, CheckCircle, XCircle, Copy, Check } from "lucide-react";

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
  const [showMyOrders, setShowMyOrders] = useState(false);
  const [myOrders, setMyOrders] = useState<OrderResult[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { user } = useAuth();

  const copyToClipboard = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setNotFound(false);
    setOrder(null);

    const res = await fetch("/api/orders/" + encodeURIComponent(query.trim()));
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
      <div className="flex justify-center gap-4 mb-8">
        <button
          className={!showMyOrders ? "px-4 py-2 rounded text-sm font-medium bg-[var(--gold)] text-[var(--text-primary)]" : "px-4 py-2 rounded text-sm font-medium bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border)]"}
          onClick={() => setShowMyOrders(false)}
        >
          Track by Order ID
        </button>
        {user && (
          <button
            className={showMyOrders ? "px-4 py-2 rounded text-sm font-medium bg-[var(--gold)] text-[var(--text-primary)]" : "px-4 py-2 rounded text-sm font-medium bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border)]"}
            onClick={async () => {
              setShowMyOrders(true);
              if (myOrders.length > 0) return;
              setLoading(true);
              const res = await fetch("/api/orders?user=me");
              if (res.ok) {
                setMyOrders(await res.json());
              } else {
                setMyOrders([]);
              }
              setLoading(false);
            }}
          >
            My Orders
          </button>
        )}
      </div>

      {!showMyOrders && (
        <>
          <p className="text-sm text-[var(--text-primary)] text-center mb-8">
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
              className="bg-[var(--gold)] text-[var(--text-primary)] px-5 py-3 flex items-center gap-2 text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors disabled:opacity-50"
            >
              <Search size={14} />
              {loading ? "..." : "Track"}
            </button>
          </div>

          {notFound && (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-8 text-center">
              <Package size={40} className="mx-auto text-[var(--text-primary)] mb-3" />
              <p className="text-sm text-[var(--text-primary)]">No order found with that ID.</p>
              <p className="text-xs text-[var(--text-primary)] mt-1">Please check the ID and try again.</p>
            </div>
          )}

          {order && (
            <div className="space-y-6 animate-[fadeUp_0.3s_ease]">
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-primary)] mb-0.5">Order ID</p>
                      <p className="font-mono text-[var(--gold)]">{order.id.slice(0, 8)}</p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(order.id)}
                      className="p-1.5 rounded hover:bg-[var(--bg-surface)] transition-colors text-[var(--text-primary)]"
                      title="Copy full order ID"
                    >
                      {copiedId === order.id ? (
                        <Check size={16} className="text-[var(--gold)]" />
                      ) : (
                        <Copy size={16} />
                      )}
                    </button>
                  </div>
                  <span className={`status-pill $` + `{(order.status ?? "").toLowerCase()}`}>
                    {statusIcon(order.status)} {order.status}
                  </span>
                </div>

                {order.status !== "Cancelled" && (
                  <div className="flex items-center mt-6 mb-2">
                    {statusSteps.map((step, i) => (
                      <div key={step} className="flex-1 flex items-center">
                        <div className="flex flex-col items-center flex-1">
                          <div
                            className={i <= currentStep ? "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors bg-[var(--gold)] text-[var(--text-primary)]" : "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors border border-[var(--border)] text-[var(--text-primary)]"}
                          >
                            {i + 1}
                          </div>
                          <span className={i <= currentStep ? "text-[9px] uppercase tracking-wider mt-1.5 text-[var(--gold)]" : "text-[9px] uppercase tracking-wider mt-1.5 text-[var(--text-primary)]"}>
                            {step}
                          </span>
                        </div>
                        {i < statusSteps.length - 1 && (
                          <div
                            className={i < currentStep ? "flex-1 h-px bg-[var(--gold)]" : "flex-1 h-px bg-[var(--border)]"}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-6">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-primary)] mb-4">Order Details</h3>
                <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                  <div>
                    <span className="text-[var(--text-primary)] font-semibold">Customer</span>
                    <p>{order.customerName}</p>
                  </div>
                  <div>
                    <span className="text-[var(--text-primary)] font-semibold">Placed</span>
                    <p>{order.createdAt}</p>
                  </div>
                </div>
                <div>
                  <span className="text-[var(--text-primary)] font-semibold">Items</span>
                  <ul className="mt-2">
                    {order.items.map((item, idx) => (
                      <li key={idx} className="text-xs">
                        {item.perfumeName} — {item.ml}ml × {item.quantity} @ ৳{item.unitPrice}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-4 text-sm">
                  <span className="text-[var(--text-primary)] font-semibold">Total:</span> ৳{order.finalAmount}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {showMyOrders && (
        <div>
          <h2 className="text-lg font-semibold mb-4">My Orders</h2>
          {loading ? (
            <p className="text-sm text-[var(--text-primary)]">Loading...</p>
          ) : myOrders.length === 0 ? (
            <p className="text-sm text-[var(--text-primary)]">No previous orders found.</p>
          ) : (
            <div className="space-y-4">
              {myOrders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => {
                    setQuery(o.id);
                    setShowMyOrders(false);
                    setLoading(true);
                    setNotFound(false);
                    setOrder(null);
                    fetch("/api/orders/" + encodeURIComponent(o.id))
                      .then(async (res) => {
                        if (res.ok) setOrder(await res.json());
                        else setNotFound(true);
                      })
                      .finally(() => setLoading(false));
                  }}
                  className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded p-4 text-left hover:border-[var(--gold)] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-primary)] mb-0.5">Order ID</p>
                        <p className="font-mono text-[var(--gold)] text-sm">{o.id.slice(0, 8)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[var(--text-primary)]">{o.createdAt}</span>
                      <span className={"status-pill " + (o.status ?? "").toLowerCase()}>{statusIcon(o.status)} {o.status}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-sm">
                    <span className="text-[var(--text-primary)]">{o.customerName}</span>
                    <span className="text-[var(--gold)] font-medium">৳{o.finalAmount}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
