"use client";

import { useState, useEffect } from "react";
import { useCart } from "@/store/cart";
import { toast } from "@/components/ui/Toaster";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle, X } from "lucide-react";
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
    deliveryAddress: "",
  });

  const [voucherCode, setVoucherCode] = useState("");
  const [discount, setDiscount] = useState(0);
  const [appliedVoucher, setAppliedVoucher] = useState("");
  const [placing, setPlacing] = useState(false);
  const [showPlaceOrderForm, setShowPlaceOrderForm] = useState(false);
  const [orderId, setOrderId] = useState("");

  const sub = subtotal();
  const total = Math.max(0, sub - discount);
  const hasFullBottle = items.some((item) => item.isFullBottle);

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
      body: JSON.stringify({ code: voucherCode, orderTotal: sub, hasFullBottle }),
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
    if (!form.customerName.trim()) {
      return toast("Name is required", "error");
    }

    if (hasFullBottle) {
      if (!form.customerPhone.trim()) {
        return toast("Phone number is required for full bottle requests", "error");
      }
      if (!form.deliveryAddress.trim()) {
        return toast("Delivery address is required for full bottle requests", "error");
      }

      const missingSize = items.some(
        (item) => item.isFullBottle && !String(item.fullBottleSize || "").trim(),
      );
      if (missingSize) {
        return toast("One or more full bottle items are missing bottle size", "error");
      }
    }

    if (items.length === 0) return;

    setPlacing(true);
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        voucherCode: appliedVoucher || null,
        hasFullBottle,
        items: items.map((i) => ({
          perfumeId: i.perfumeId,
          ml: i.ml,
          isFullBottle: Boolean(i.isFullBottle),
          fullBottleSize: i.fullBottleSize || "",
          quantity: i.quantity,
        })),
      }),
    });

    if (res.ok) {
      const order = await res.json();
      setOrderId(order.id);
      clearCart();
      setShowPlaceOrderForm(false);
      toast("Order placed successfully!", "success");
    } else {
      const err = await res.json().catch(() => null);
      toast(err?.error || "Failed to place order", "error");
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
        <p className="text-sm text-[var(--text-secondary)] mb-6">You can monitor updates anytime from My Orders.</p>
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
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
            <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Order Notes</h3>
            <p className="text-sm text-[var(--text-secondary)]">Client details are collected when you press Place Order.</p>
            {hasFullBottle && (
              <p className="text-xs text-[var(--text-muted)] mt-3">
                Full Bottle requests have no fixed price right now. Admin will confirm price manually later.
              </p>
            )}
          </div>

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
                  onClick={() => {
                    setAppliedVoucher("");
                    setDiscount(0);
                    setVoucherCode("");
                  }}
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

        <div>
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-6 sticky top-24">
            <h2 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Order Summary</h2>

            <div className="space-y-2 mb-4">
              {items.map((item) => (
                <div
                  key={`${item.perfumeId}-${item.ml}-${item.isFullBottle ? "full" : "decant"}-${item.fullBottleSize || ""}`}
                  className="flex justify-between text-sm text-[var(--text-secondary)]"
                >
                  <span className="truncate mr-2">
                    {item.perfumeName} {item.isFullBottle ? `Full Bottle (${item.fullBottleSize || "size pending"})` : `${item.ml}ml`} ×{item.quantity}
                  </span>
                  <span className="flex-shrink-0">
                    {item.isFullBottle ? "Pending" : (item.unitPrice * item.quantity).toLocaleString("en-BD")}
                  </span>
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
              onClick={() => setShowPlaceOrderForm(true)}
              disabled={placing}
              className="w-full bg-[var(--gold)] text-black py-3 text-xs uppercase tracking-wider font-medium hover:bg-[var(--gold-light)] transition-colors disabled:opacity-50"
            >
              Place Order
            </button>
          </div>
        </div>
      </div>

      {showPlaceOrderForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !placing && setShowPlaceOrderForm(false)} />
          <div className="relative w-full max-w-lg bg-[var(--bg-elevated)] border border-[var(--border)] rounded p-6 animate-fade-up">
            <button
              onClick={() => !placing && setShowPlaceOrderForm(false)}
              className="absolute right-3 top-3 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            <h3 className="font-serif text-2xl font-light mb-1">Place Order</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-5">Enter client details to confirm this order.</p>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Name *</label>
                <input
                  type="text"
                  value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">
                  Phone {hasFullBottle ? "*" : ""}
                </label>
                <input
                  type="text"
                  placeholder="01XXXXXXXXX"
                  value={form.customerPhone}
                  onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Email (optional)</label>
                <input
                  type="email"
                  value={form.customerEmail}
                  onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Collection Method</label>
                <div className="flex gap-2">
                  {["Pickup", "Delivery"].map((method) => (
                    <button
                      type="button"
                      key={method}
                      onClick={() => setForm({ ...form, pickupMethod: method })}
                      className={`flex-1 py-2 text-sm rounded transition-colors ${
                        form.pickupMethod === method
                          ? "bg-[var(--gold)] text-black"
                          : "border border-[var(--border)] text-[var(--text-secondary)]"
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {hasFullBottle && (
                <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Delivery Address *</label>
                  <textarea
                    placeholder="House, Road, Area, City"
                    value={form.deliveryAddress}
                    onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })}
                    rows={3}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] outline-none resize-none"
                  />
                </div>
              )}

              {hasFullBottle && (
                <div className="text-xs text-[var(--text-muted)]">
                  Full Bottle pricing is not fixed at checkout. Admin will review your requested bottle size and set pricing manually.
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowPlaceOrderForm(false)}
                disabled={placing}
                className="flex-1 border border-[var(--border)] py-2.5 text-xs uppercase tracking-wider text-[var(--text-secondary)] hover:border-[var(--gold)] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={placeOrder}
                disabled={placing}
                className="flex-1 bg-[var(--gold)] text-black py-2.5 text-xs uppercase tracking-wider font-medium hover:bg-[var(--gold-light)] transition-colors disabled:opacity-50"
              >
                {placing ? "Placing..." : "Confirm Order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
