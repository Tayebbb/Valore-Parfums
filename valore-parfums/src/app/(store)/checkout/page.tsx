"use client";

import { useState, useEffect } from "react";
import { useCart } from "@/store/cart";
import { toast } from "@/components/ui/Toaster";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { useAuth } from "@/store/auth";

export default function CheckoutPage() {
  const { items, subtotal, clearCart } = useCart();
  const router = useRouter();
  const { user } = useAuth();
  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    customerEmail: user?.email || "",
    pickupMethod: "Pickup",
  });
  const [voucherCode, setVoucherCode] = useState("");
  const [discount, setDiscount] = useState(0);
  const [appliedVoucher, setAppliedVoucher] = useState("");
  const [placing, setPlacing] = useState(false);
  const [orderId, setOrderId] = useState("");

  const sub = subtotal();
  const total = Math.max(0, sub - discount);

  useEffect(() => {
    if (!orderId && items.length === 0) {
      router.push("/cart");
    }
  }, [items.length, router, orderId]);

  const applyVoucher = async () => {
    if (!voucherCode) return;
    const res = await fetch("/api/vouchers/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: voucherCode, orderTotal: sub }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error, "error");
      return;
    }
    setDiscount(data.discount);
    setAppliedVoucher(data.code);
    toast(`Voucher applied: -${data.discount} BDT`, "success");
  };

  const placeOrder = async () => {
    if (!form.customerName || !form.customerPhone) {
      return toast("Name and phone are required", "error");
    }
    if (items.length === 0) return;

    setPlacing(true);
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        voucherCode: appliedVoucher || null,
        items: items.map((i) => ({
          perfumeId: i.perfumeId,
          ml: i.ml,
          quantity: i.quantity,
        })),
      }),
    });

    if (res.ok) {
      const order = await res.json();
      setOrderId(order.id);
      clearCart();
      toast("Order placed successfully!", "success");
    } else {
      toast("Failed to place order", "error");
    }
    setPlacing(false);
  };

  if (orderId) {
    return (
      <div className="px-[5%] py-20 text-center max-w-md mx-auto">
        <CheckCircle size={56} className="mx-auto text-[var(--success)] mb-4" />
        <h1 className="font-serif text-3xl font-light mb-2">Order Confirmed!</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-4">Your order has been placed successfully.</p>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-4 mb-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">Order ID</p>
          <p className="font-mono text-lg text-[var(--gold)]">{orderId.slice(0, 8)}</p>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          You can monitor updates anytime from My Orders.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-[var(--gold)] text-black px-6 py-3 text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors"
        >
          Continue Shopping
        </Link>
      </div>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="px-[5%] py-8">
      <Link
        href="/cart"
        className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--gold)] transition-colors mb-8"
      >
        <ArrowLeft size={14} /> Back to Cart
      </Link>

      <h1 className="font-serif text-3xl font-light mb-2">Checkout</h1>
      <div className="gold-line mb-8" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
            <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Contact Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Name *</label>
                <input
                  type="text"
                  value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] focus:bg-[var(--gold-tint)] outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Phone *</label>
                <input
                  type="text"
                  value={form.customerPhone}
                  onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] focus:bg-[var(--gold-tint)] outline-none transition-colors"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Email (optional)</label>
                <input
                  type="email"
                  value={form.customerEmail}
                  onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] focus:bg-[var(--gold-tint)] outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Pickup */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
            <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Collection Method</h3>
            <div className="flex gap-3">
              {["Pickup", "Delivery"].map((method) => (
                <button
                  key={method}
                  onClick={() => setForm({ ...form, pickupMethod: method })}
                  className={`flex-1 py-3 text-sm rounded transition-colors ${
                    form.pickupMethod === method
                      ? "bg-[var(--gold)] text-black"
                      : "border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)]"
                  }`}
                >
                  {method}
                  {method === "Delivery" && (
                    <span className="block text-[9px] uppercase tracking-wider opacity-60 mt-0.5">Coming Soon</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Voucher */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
            <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Voucher Code</h3>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter voucher code"
                value={voucherCode}
                onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                disabled={!!appliedVoucher}
                className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm font-mono focus:border-[var(--gold)] outline-none disabled:opacity-50"
              />
              {appliedVoucher ? (
                <button
                  onClick={() => { setAppliedVoucher(""); setDiscount(0); setVoucherCode(""); }}
                  className="px-4 py-2 text-xs uppercase tracking-wider border border-[var(--error)] text-[var(--error)] hover:bg-[rgba(248,113,113,0.1)] transition-colors"
                >
                  Remove
                </button>
              ) : (
                <button
                  onClick={applyVoucher}
                  className="px-4 py-2 bg-[var(--gold)] text-black text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors"
                >
                  Apply
                </button>
              )}
            </div>
            {appliedVoucher && (
              <p className="text-xs text-[var(--success)] mt-2">✓ Voucher {appliedVoucher} applied — {discount} BDT off</p>
            )}
          </div>
        </div>

        {/* Order Summary */}
        <div>
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-6 sticky top-24">
            <h2 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Order Summary</h2>
            
            <div className="space-y-2 mb-4">
              {items.map((item) => (
                <div key={`${item.perfumeId}-${item.ml}`} className="flex justify-between text-sm text-[var(--text-secondary)]">
                  <span className="truncate mr-2">{item.perfumeName} {item.ml}ml ×{item.quantity}</span>
                  <span className="flex-shrink-0">{(item.unitPrice * item.quantity).toLocaleString("en-BD")}</span>
                </div>
              ))}
            </div>

            <div className="gold-line my-4" />

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-muted)]">Subtotal</span>
                <span>{sub.toLocaleString("en-BD")} BDT</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-muted)]">Discount</span>
                  <span className="text-[var(--success)]">-{discount.toLocaleString("en-BD")} BDT</span>
                </div>
              )}
            </div>

            <div className="gold-line my-4" />

            <div className="flex justify-between items-center mb-6">
              <span className="text-sm text-[var(--text-muted)]">Total</span>
              <span className="font-serif text-2xl text-[var(--gold)]">{total.toLocaleString("en-BD")} BDT</span>
            </div>

            <button
              onClick={placeOrder}
              disabled={placing}
              className="w-full bg-[var(--gold)] text-black py-3 text-xs uppercase tracking-wider font-medium hover:bg-[var(--gold-light)] transition-colors disabled:opacity-50"
            >
              {placing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="spinner" style={{ width: 14, height: 14 }} /> Placing Order...
                </span>
              ) : (
                "Place Order"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
