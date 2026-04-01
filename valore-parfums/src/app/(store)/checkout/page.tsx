"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useCart } from "@/store/cart";
import { toast } from "@/components/ui/Toaster";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle, ChevronDown } from "lucide-react";
import { useAuth } from "@/store/auth";

interface PickupLocation {
  id: string;
  name: string;
  address: string;
  phone?: string;
  notes?: string;
  active?: boolean;
}

interface CheckoutConfig {
  deliveryFeeInsideDhaka: number;
  deliveryFeeOutsideDhaka: number;
  bkashAccountName: string;
  bkashAccountNumber: string;
  bkashAccountType: string;
  bkashQrImageUrl: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankAccountType: string;
  bankDistrict: string;
  bankBranch: string;
  bankQrImageUrl: string;
  pickupLocations: PickupLocation[];
}

type DeliveryZone = "Inside Dhaka" | "Outside Dhaka";

export default function CheckoutPage() {
  const { items, subtotal, clearCart } = useCart();
  const router = useRouter();
  const { user } = useAuth();

  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    customerEmail: user?.email || "",
    pickupMethod: "Pickup" as "Pickup" | "Delivery",
    deliveryZone: "" as "" | DeliveryZone,
    pickupLocationId: "",
    area: "",
    city: "",
    fullAddress: "",
    paymentMethod: "Cash on Delivery" as "Cash on Delivery" | "Bkash Manual" | "Bank Manual",
  });

  const [bkashPayment, setBkashPayment] = useState({
    customerName: "",
    paidFromNumber: "",
    transactionNumber: "",
    notes: "",
  });

  const [bankPayment, setBankPayment] = useState({
    accountName: "",
    accountNumber: "",
    transactionNumber: "",
    notes: "",
  });

  const [checkoutConfig, setCheckoutConfig] = useState<CheckoutConfig>({
    deliveryFeeInsideDhaka: 0,
    deliveryFeeOutsideDhaka: 0,
    bkashAccountName: "",
    bkashAccountNumber: "",
    bkashAccountType: "",
    bkashQrImageUrl: "",
    bankName: "",
    bankAccountName: "",
    bankAccountNumber: "",
    bankAccountType: "",
    bankDistrict: "",
    bankBranch: "",
    bankQrImageUrl: "",
    pickupLocations: [],
  });
  const [loadingCheckoutConfig, setLoadingCheckoutConfig] = useState(true);
  const [voucherCode, setVoucherCode] = useState("");
  const [discount, setDiscount] = useState(0);
  const [appliedVoucher, setAppliedVoucher] = useState("");
  const [placing, setPlacing] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [placedPaymentMethod, setPlacedPaymentMethod] = useState<"Cash on Delivery" | "Bkash Manual" | "Bank Manual">("Cash on Delivery");

  const sub = subtotal();
  const hasFullBottle = items.some((item) => item.isFullBottle);
  const isDelivery = form.pickupMethod === "Delivery";
  const deliveryFee = useMemo(() => {
    if (!isDelivery || !form.deliveryZone) return 0;
    return form.deliveryZone === "Outside Dhaka"
      ? checkoutConfig.deliveryFeeOutsideDhaka
      : checkoutConfig.deliveryFeeInsideDhaka;
  }, [checkoutConfig.deliveryFeeInsideDhaka, checkoutConfig.deliveryFeeOutsideDhaka, form.deliveryZone, isDelivery]);
  const total = Math.max(0, sub - discount) + deliveryFee;
  const selectedPickupLocation = useMemo(
    () => checkoutConfig.pickupLocations.find((loc) => loc.id === form.pickupLocationId) || null,
    [checkoutConfig.pickupLocations, form.pickupLocationId],
  );

  const deliveryAddress = useMemo(() => {
    if (!isDelivery) return "";
    return [form.fullAddress.trim(), `${form.area.trim()}, ${form.city.trim()}`.trim()].filter(Boolean).join(" | ");
  }, [form.area, form.city, form.fullAddress, isDelivery]);

  useEffect(() => {
    if (!orderId && items.length === 0) {
      router.push("/cart");
    }
  }, [items.length, router, orderId]);

  useEffect(() => {
    if (user?.email) {
      setForm((prev) => ({ ...prev, customerEmail: prev.customerEmail || user.email || "" }));
    }
  }, [user?.email]);

  useEffect(() => {
    const abortController = new AbortController();
    const loadCheckoutConfig = async () => {
      try {
        const res = await fetch("/api/checkout-config", { signal: abortController.signal });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Failed to load checkout settings");
        }
        setCheckoutConfig({
          deliveryFeeInsideDhaka: Number(data.deliveryFeeInsideDhaka || 0),
          deliveryFeeOutsideDhaka: Number(data.deliveryFeeOutsideDhaka || 0),
          bkashAccountName: String(data.bkashAccountName || ""),
          bkashAccountNumber: String(data.bkashAccountNumber || ""),
          bkashAccountType: String(data.bkashAccountType || ""),
          bkashQrImageUrl: String(data.bkashQrImageUrl || ""),
          bankName: String(data.bankName || ""),
          bankAccountName: String(data.bankAccountName || ""),
          bankAccountNumber: String(data.bankAccountNumber || ""),
          bankAccountType: String(data.bankAccountType || ""),
          bankDistrict: String(data.bankDistrict || ""),
          bankBranch: String(data.bankBranch || ""),
          bankQrImageUrl: String(data.bankQrImageUrl || ""),
          pickupLocations: Array.isArray(data.pickupLocations) ? data.pickupLocations : [],
        });
      } catch {
        if (!abortController.signal.aborted) {
          toast("Could not load checkout configuration", "error");
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoadingCheckoutConfig(false);
        }
      }
    };

    loadCheckoutConfig();
    return () => abortController.abort();
  }, []);

  useEffect(() => {
    if (form.pickupMethod === "Pickup" && !form.pickupLocationId && checkoutConfig.pickupLocations.length > 0) {
      setForm((prev) => ({ ...prev, pickupLocationId: checkoutConfig.pickupLocations[0].id }));
    }
  }, [checkoutConfig.pickupLocations, form.pickupLocationId, form.pickupMethod]);

  useEffect(() => {
    if (form.pickupMethod === "Pickup" && form.deliveryZone) {
      setForm((prev) => ({ ...prev, deliveryZone: "" }));
    }
  }, [form.deliveryZone, form.pickupMethod]);

  const setField = useCallback(
    <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

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

  const canPlaceOrder = useMemo(() => {
    const email = form.customerEmail.trim();
    const emailValid = email.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const contactComplete =
      form.customerName.trim().length > 1 &&
      form.customerPhone.trim().length >= 7 &&
      emailValid;

    const pickupComplete = form.pickupMethod === "Pickup" && Boolean(form.pickupLocationId);
    const deliveryComplete =
      form.pickupMethod === "Delivery" &&
      Boolean(form.deliveryZone) &&
      form.area.trim().length > 1 &&
      form.city.trim().length > 1 &&
      form.fullAddress.trim().length > 8;

    const missingSize = items.some((item) => item.isFullBottle && !String(item.fullBottleSize || "").trim());

    const bkashComplete =
      form.paymentMethod !== "Bkash Manual" ||
      (bkashPayment.customerName.trim().length > 1 &&
        bkashPayment.paidFromNumber.trim().length === 11 &&
        bkashPayment.transactionNumber.trim().length >= 6 &&
        bkashPayment.transactionNumber.trim().length <= 40);

    const bankComplete =
      form.paymentMethod !== "Bank Manual" ||
      (bankPayment.accountName.trim().length > 1 &&
        bankPayment.accountNumber.trim().length >= 8 &&
        bankPayment.accountNumber.trim().length <= 32);

    return items.length > 0 && contactComplete && (pickupComplete || deliveryComplete) && !missingSize && bkashComplete && bankComplete;
  }, [bankPayment, bkashPayment, form, items]);

  const placeOrder = async () => {
    if (!form.customerName.trim()) {
      return toast("Name is required", "error");
    }
    if (!form.customerPhone.trim()) {
      return toast("Phone is required", "error");
    }
    if (form.customerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customerEmail.trim())) {
      return toast("Please enter a valid email address", "error");
    }
    if (isDelivery && !form.deliveryZone) {
      return toast("Please select a delivery zone", "error");
    }
    if (isDelivery && !form.area.trim()) {
      return toast("Area is required for delivery", "error");
    }
    if (isDelivery && !form.city.trim()) {
      return toast("City is required for delivery", "error");
    }
    if (isDelivery && !form.fullAddress.trim()) {
      return toast("Full address is required for delivery", "error");
    }
    if (!canPlaceOrder) {
      return toast("Please complete all required checkout fields", "error");
    }
    if (form.paymentMethod === "Bkash Manual") {
      if (!bkashPayment.customerName.trim()) {
        return toast("bKash customer name is required", "error");
      }
      if (!/^[0-9]{11}$/.test(bkashPayment.paidFromNumber.trim())) {
        return toast("Paid from number must be exactly 11 digits", "error");
      }
      if (!bkashPayment.transactionNumber.trim()) {
        return toast("Transaction number is required", "error");
      }
      if (bkashPayment.transactionNumber.trim().length < 6 || bkashPayment.transactionNumber.trim().length > 40) {
        return toast("Transaction number must be 6-40 characters", "error");
      }
    }
    if (form.paymentMethod === "Bank Manual") {
      if (!bankPayment.accountName.trim()) {
        return toast("Account/Card name is required", "error");
      }
      if (!bankPayment.accountNumber.trim()) {
        return toast("Account/Card number is required", "error");
      }
      if (bankPayment.accountNumber.trim().length < 8 || bankPayment.accountNumber.trim().length > 32) {
        return toast("Account/Card number must be 8-32 characters", "error");
      }
      if (bankPayment.transactionNumber.trim() && (bankPayment.transactionNumber.trim().length < 6 || bankPayment.transactionNumber.trim().length > 40)) {
        return toast("Transaction number/reference must be 6-40 characters", "error");
      }
    }

    setPlacing(true);
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        customerEmail: form.customerEmail.trim(),
        pickupMethod: form.pickupMethod,
        deliveryZone: form.pickupMethod === "Delivery" ? form.deliveryZone : "",
        pickupLocationId: form.pickupMethod === "Pickup" ? form.pickupLocationId : "",
        pickupLocationName: form.pickupMethod === "Pickup" ? selectedPickupLocation?.name || "" : "",
        deliveryAddress,
        deliveryFee,
        paymentMethod: form.paymentMethod,
        bkashPayment: form.paymentMethod === "Bkash Manual" ? {
          customerName: bkashPayment.customerName.trim(),
          paidFromNumber: bkashPayment.paidFromNumber.trim(),
          transactionNumber: bkashPayment.transactionNumber.trim(),
          notes: bkashPayment.notes.trim(),
        } : null,
        bankPayment: form.paymentMethod === "Bank Manual" ? {
          accountName: bankPayment.accountName.trim(),
          accountNumber: bankPayment.accountNumber.trim(),
          transactionNumber: bankPayment.transactionNumber.trim(),
          notes: bankPayment.notes.trim(),
        } : null,
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
      setPlacedPaymentMethod(form.paymentMethod);
      clearCart();
      toast("Order placed successfully!", "success");
    } else {
      const raw = await res.text().catch(() => "");
      let message = "Failed to place order";
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { error?: string };
          message = parsed?.error || message;
        } catch {
          message = raw;
        }
      }
      toast(message, "error");
    }
    setPlacing(false);
  };

  if (orderId) {
    return (
      <div className="px-[5%] py-20 text-center max-w-md mx-auto">
        <CheckCircle size={56} className="mx-auto text-[var(--success)] mb-4" />
        <h1 className="font-serif text-3xl font-light mb-2">Order Submitted!</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          {placedPaymentMethod === "Bkash Manual"
            ? "Payment info saved. Your order will be confirmed once your bKash payment is verified."
            : placedPaymentMethod === "Bank Manual"
              ? "Payment info saved. Our team will verify your payment manually within 24-48 hours."
            : "Your order has been placed successfully."}
        </p>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 mb-6 shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">Order ID</p>
          <p className="font-mono text-sm break-all text-[var(--text-primary)]">{orderId}</p>
        </div>
        {!user && (
          <div className="bg-[rgba(251,191,36,0.1)] border border-[var(--warning)]/50 rounded-2xl p-4 mb-6 text-left">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--warning)] mb-1">Guest Order Notice</p>
            <p className="text-sm text-[var(--text-primary)]">
              Save your full Order ID now. Without an account, this ID is required to track your order later on the Track Order page.
            </p>
          </div>
        )}
        <p className="text-sm text-[var(--text-secondary)] mb-6">You can monitor updates anytime from My Orders.</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-[var(--gold)] text-black px-6 py-3 text-xs uppercase tracking-wider rounded-xl hover:bg-[var(--gold-light)] transition-colors"
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
    <div className="bg-[var(--bg-base)] min-h-screen pb-28 lg:pb-12">
      <div className="max-w-7xl mx-auto px-5 md:px-10 lg:px-14 py-10 lg:py-14">
      <Link
        href="/cart"
          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] hover:text-[var(--gold)] transition-colors mb-10"
      >
        <ArrowLeft size={14} /> Back to Cart
      </Link>

        <h1 className="text-4xl lg:text-5xl font-semibold tracking-tight text-[var(--text-primary)]">Checkout</h1>
        <p className="mt-3 text-[var(--text-secondary)] max-w-2xl">
          A fast, secure checkout flow. Review your details and place your order in seconds.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 xl:gap-12 mt-10">
          <div className="lg:col-span-3 space-y-6">
            <section className="bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl p-6 md:p-8 shadow-[0_12px_40px_var(--shadow-color)] transition-all duration-300">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)] mb-4">Step 1</p>
              <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] mb-6">Contact Information</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block md:col-span-2">
                  <span className="block text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-2">Full Name</span>
                  <input
                    type="text"
                    value={form.customerName}
                    onChange={(e) => setField("customerName", e.target.value)}
                    className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-all duration-200 focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold-glow)]"
                    placeholder="Your full name"
                  />
                </label>

                <label className="block">
                  <span className="block text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-2">Phone</span>
                  <input
                    type="text"
                    value={form.customerPhone}
                    onChange={(e) => setField("customerPhone", e.target.value)}
                    className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-all duration-200 focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold-glow)]"
                    placeholder="01XXXXXXXXX"
                  />
                </label>

                <label className="block">
                  <span className="block text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-2">Email</span>
                  <input
                    type="email"
                    value={form.customerEmail}
                    onChange={(e) => setField("customerEmail", e.target.value)}
                    className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-all duration-200 focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold-glow)]"
                    placeholder="you@email.com"
                  />
                </label>
              </div>
            </section>

            <section className="bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl p-6 md:p-8 shadow-[0_12px_40px_var(--shadow-color)] transition-all duration-300">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)] mb-4">Step 2</p>
              <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] mb-6">Delivery Method</h2>

              <div className="inline-flex bg-[var(--bg-surface)] rounded-2xl p-1 mb-6 border border-[var(--border)]">
                {(["Pickup", "Delivery"] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, pickupMethod: method }))}
                    className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                      form.pickupMethod === method
                        ? "bg-[var(--gold)] text-black shadow-[0_2px_12px_var(--gold-glow)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    form.pickupMethod === "Pickup" ? "max-h-[260px] opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  <label className="block">
                    <span className="block text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-2">Pickup Location</span>
                    <div className="relative">
                      <select
                        value={form.pickupLocationId}
                        onChange={(e) => setField("pickupLocationId", e.target.value)}
                        disabled={loadingCheckoutConfig || checkoutConfig.pickupLocations.length === 0}
                        className="w-full appearance-none rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3.5 pr-10 text-[var(--text-primary)] outline-none transition-all duration-200 focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold-glow)] disabled:opacity-60"
                      >
                        {checkoutConfig.pickupLocations.length === 0 ? (
                          <option value="">No locations available</option>
                        ) : null}
                        {checkoutConfig.pickupLocations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    </div>
                  </label>

                  {selectedPickupLocation && (
                    <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                      <p className="font-medium text-[var(--text-primary)]">{selectedPickupLocation.name}</p>
                      <p className="mt-1">{selectedPickupLocation.address}</p>
                      {selectedPickupLocation.phone ? <p className="mt-1">{selectedPickupLocation.phone}</p> : null}
                    </div>
                  )}
                </div>

                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    form.pickupMethod === "Delivery" ? "max-h-[480px] opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  <div className="mb-4">
                    <span className="block text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-2">Delivery Zone</span>
                    <div className="inline-flex bg-[var(--bg-surface)] rounded-2xl p-1 border border-[var(--border)]">
                      {(["Inside Dhaka", "Outside Dhaka"] as const).map((zone) => (
                        <button
                          type="button"
                          key={zone}
                          onClick={() => setField("deliveryZone", zone)}
                          className={`px-4 py-2 text-xs uppercase tracking-[0.12em] rounded-xl transition-all ${
                            form.deliveryZone === zone
                              ? "bg-[var(--gold)] text-black"
                              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          }`}
                        >
                          {zone}
                        </button>
                      ))}
                    </div>
                  </div>

                  {form.deliveryZone ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="block">
                        <span className="block text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-2">Area</span>
                        <input
                          type="text"
                          value={form.area}
                          onChange={(e) => setField("area", e.target.value)}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3.5 text-[var(--text-primary)] outline-none transition-all duration-200 focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold-glow)]"
                          placeholder="e.g. Dhanmondi"
                        />
                      </label>
                      <label className="block">
                        <span className="block text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-2">City</span>
                        <input
                          type="text"
                          value={form.city}
                          onChange={(e) => setField("city", e.target.value)}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3.5 text-[var(--text-primary)] outline-none transition-all duration-200 focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold-glow)]"
                          placeholder="e.g. Dhaka"
                        />
                      </label>
                      <label className="block md:col-span-2">
                        <span className="block text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-2">Full Address</span>
                        <textarea
                          value={form.fullAddress}
                          onChange={(e) => setField("fullAddress", e.target.value)}
                          rows={3}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3.5 text-[var(--text-primary)] outline-none transition-all duration-200 focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold-glow)] resize-none"
                          placeholder="House, road, landmark"
                        />
                      </label>
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-secondary)]">Choose a delivery zone to continue with address details.</p>
                  )}

                  <p className="mt-3 text-sm text-[var(--text-secondary)]">
                    Delivery fee: <span className="font-semibold text-[var(--text-primary)]">{deliveryFee.toLocaleString("en-BD")} BDT</span>
                  </p>
                </div>
              </div>

              {hasFullBottle ? (
                <p className="text-xs text-[var(--text-muted)] mt-4">
                  Full bottle request prices are reviewed by admin before final confirmation.
                </p>
              ) : null}
            </section>

            <section className="bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl p-6 md:p-8 shadow-[0_12px_40px_var(--shadow-color)] transition-all duration-300">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)] mb-4">Step 3</p>
              <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] mb-6">Payment Method</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                {([
                  { key: "Cash on Delivery", label: "Cash on Delivery", logoSrc: "/cod.png", logoAlt: "Cash on Delivery" },
                  { key: "Bkash Manual", label: "bKash Payment", logoSrc: "/bkash.png?v=4", logoAlt: "bKash" },
                  { key: "Bank Manual", label: "Bank Transfer", logoSrc: "/banktransfer.svg?v=4", logoAlt: "Bank Transfer" },
                ] as const).map((method) => (
                  <button
                    type="button"
                    key={method.key}
                    onClick={() => setField("paymentMethod", method.key)}
                    className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                      form.paymentMethod === method.key
                        ? "border-[var(--gold)] bg-[var(--gold-tint)]"
                        : "border-[var(--border)] bg-[var(--bg-surface)] hover:border-[var(--gold)]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <img src={method.logoSrc} alt={method.logoAlt} className="h-6 w-auto" />
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{method.label}</p>
                    </div>
                  </button>
                ))}
              </div>

              {form.paymentMethod === "Bkash Manual" ? (
                <div className="rounded-2xl border border-[rgba(227,35,132,0.45)] bg-[rgba(227,35,132,0.06)] p-4 md:p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <img src="/bkash.png?v=4" alt="bKash" className="h-7 w-auto" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">bKash Payment Instructions</p>
                  </div>

                  <ol className="list-decimal pl-5 space-y-1.5 text-sm text-[var(--text-secondary)]">
                    <li>Send the required payment amount to our bKash account.</li>
                    <li>Scan the QR code from the bKash app using the QR Scan option, or pay from your bKash app or pay using <span className="font-semibold text-[var(--text-primary)]">*247#</span>.</li>
                    <li>Copy the transaction number (TXN ID) from your payment receipt.</li>
                    <li>Fill in the form below with your payment details.</li>
                  </ol>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Account Name</p>
                      <p className="text-sm text-[var(--text-primary)] mt-1">{checkoutConfig.bkashAccountName || "Not set"}</p>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Account Number</p>
                      <p className="text-sm text-[var(--text-primary)] mt-1">{checkoutConfig.bkashAccountNumber || "Not set"}</p>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Account Type</p>
                      <p className="text-sm text-[var(--text-primary)] mt-1">{checkoutConfig.bkashAccountType || "Not set"}</p>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Amount to Pay</p>
                      <p className="text-sm font-semibold text-[var(--gold)] mt-1">{total.toLocaleString("en-BD")} BDT</p>
                    </div>
                  </div>

                  {checkoutConfig.bkashQrImageUrl ? (
                    <div className="mt-4 rounded-2xl border border-[rgba(227,35,132,0.45)] bg-[var(--bg-card)] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-2">Scan this QR from the bKash app QR Scan option</p>
                      <img
                        src={checkoutConfig.bkashQrImageUrl}
                        alt="bKash payment QR"
                        className="w-48 max-w-full h-auto rounded border border-[var(--border)]"
                      />
                    </div>
                  ) : null}

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="block text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-2">Customer Name</span>
                      <input
                        type="text"
                        value={bkashPayment.customerName}
                        onChange={(e) => setBkashPayment((prev) => ({ ...prev, customerName: e.target.value }))}
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--gold)]"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-2">Paid From Number</span>
                      <input
                        type="text"
                        value={bkashPayment.paidFromNumber}
                        onChange={(e) => setBkashPayment((prev) => ({ ...prev, paidFromNumber: e.target.value }))}
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--gold)]"
                        placeholder="01XXXXXXXXX"
                      />
                    </label>
                    <label className="block md:col-span-2">
                      <span className="block text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-2">Transaction Number (TXN ID)</span>
                      <input
                        type="text"
                        value={bkashPayment.transactionNumber}
                        onChange={(e) => setBkashPayment((prev) => ({ ...prev, transactionNumber: e.target.value }))}
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--gold)]"
                      />
                    </label>
                    <label className="block md:col-span-2">
                      <span className="block text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-2">Notes / Description</span>
                      <textarea
                        value={bkashPayment.notes}
                        onChange={(e) => setBkashPayment((prev) => ({ ...prev, notes: e.target.value }))}
                        rows={3}
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--gold)] resize-none"
                        placeholder="Add sender details or timing of payment"
                      />
                    </label>
                  </div>

                  <p className="text-sm text-[var(--text-secondary)] mt-3">Your order will be confirmed once your payment is verified.</p>
                </div>
              ) : null}

              {form.paymentMethod === "Bank Manual" ? (
                <div className="rounded-2xl border border-[rgba(59,130,246,0.45)] bg-[rgba(59,130,246,0.06)] p-4 md:p-5 mt-4">
                  <div className="flex items-center gap-2 mb-4">
                    <img src="/banktransfer.svg?v=4" alt="Bank Transfer" className="h-7 w-auto" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Bank Transfer Instructions</p>
                  </div>

                  <ol className="list-decimal pl-5 space-y-1.5 text-sm text-[var(--text-secondary)]">
                    <li>Transfer the required payment amount to our bank account using NPSB only (no BEFTN allowed).</li>
                    <li>If available, copy the transaction number/reference from your payment receipt.</li>
                    <li>Fill in the form below with your payment details.</li>
                  </ol>

                  <p className="mt-3 text-xs text-[var(--text-muted)]">Fields marked (Required) must be filled. Others are optional.</p>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Bank Name</p>
                      <p className="text-sm text-[var(--text-primary)] mt-1">{checkoutConfig.bankName || "Not set"}</p>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Account Name</p>
                      <p className="text-sm text-[var(--text-primary)] mt-1">{checkoutConfig.bankAccountName || "Not set"}</p>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Account Number</p>
                      <p className="text-sm text-[var(--text-primary)] mt-1">{checkoutConfig.bankAccountNumber || "Not set"}</p>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Account Type</p>
                      <p className="text-sm text-[var(--text-primary)] mt-1">{checkoutConfig.bankAccountType || "Not set"}</p>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">District</p>
                      <p className="text-sm text-[var(--text-primary)] mt-1">{checkoutConfig.bankDistrict || "Not set"}</p>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Branch</p>
                      <p className="text-sm text-[var(--text-primary)] mt-1">{checkoutConfig.bankBranch || "Not set"}</p>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 sm:col-span-2">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Amount to Pay</p>
                      <p className="text-sm font-semibold text-[var(--gold)] mt-1">{total.toLocaleString("en-BD")} BDT</p>
                    </div>
                  </div>

                  {checkoutConfig.bankQrImageUrl ? (
                    <div className="mt-4 rounded-2xl border border-[rgba(59,130,246,0.45)] bg-[var(--bg-card)] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-2">Optional Bank QR</p>
                      <img
                        src={checkoutConfig.bankQrImageUrl}
                        alt="Bank payment QR"
                        className="w-48 max-w-full h-auto rounded border border-[var(--border)]"
                      />
                    </div>
                  ) : null}

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="block text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-2">Account/Card Name (Required)</span>
                      <input
                        type="text"
                        value={bankPayment.accountName}
                        onChange={(e) => setBankPayment((prev) => ({ ...prev, accountName: e.target.value }))}
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--gold)]"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-2">Account/Card Number (Required)</span>
                      <input
                        type="text"
                        value={bankPayment.accountNumber}
                        onChange={(e) => setBankPayment((prev) => ({ ...prev, accountNumber: e.target.value }))}
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--gold)]"
                      />
                    </label>
                    <label className="block md:col-span-2">
                      <span className="block text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-2">Transaction Number / Reference (Optional)</span>
                      <input
                        type="text"
                        value={bankPayment.transactionNumber}
                        onChange={(e) => setBankPayment((prev) => ({ ...prev, transactionNumber: e.target.value }))}
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--gold)]"
                      />
                    </label>
                    <label className="block md:col-span-2">
                      <span className="block text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-2">Notes / Description (Optional)</span>
                      <textarea
                        value={bankPayment.notes}
                        onChange={(e) => setBankPayment((prev) => ({ ...prev, notes: e.target.value }))}
                        rows={3}
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--gold)] resize-none"
                      />
                    </label>
                  </div>

                  <p className="text-sm text-[var(--text-secondary)] mt-3">Our team will verify your payment manually within 24-48 hours.</p>
                </div>
              ) : null}
            </section>

            <section className="bg-[var(--bg-card)] border border-[var(--border)] rounded-3xl p-6 md:p-8 shadow-[0_12px_40px_var(--shadow-color)] transition-all duration-300">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)] mb-4">Step 4</p>
              <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)] mb-4">Voucher</h2>

              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="Enter voucher code"
                  value={voucherCode}
                  onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                  disabled={!!appliedVoucher}
                  className="flex-1 rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-sm font-mono text-[var(--text-primary)] outline-none transition-all duration-200 focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold-glow)] disabled:opacity-60"
                />
                {appliedVoucher ? (
                  <button
                    onClick={() => {
                      setAppliedVoucher("");
                      setDiscount(0);
                      setVoucherCode("");
                    }}
                    className="rounded-2xl border border-[var(--border)] px-5 py-3 text-xs uppercase tracking-[0.16em] text-[var(--text-secondary)] hover:border-[var(--gold)] transition-colors"
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    onClick={applyVoucher}
                    className="rounded-2xl bg-[var(--gold)] px-5 py-3 text-xs uppercase tracking-[0.16em] text-black hover:bg-[var(--gold-light)] transition-colors"
                  >
                    Apply
                  </button>
                )}
              </div>

              {appliedVoucher ? (
                <p className="text-sm text-[var(--success)] mt-3">Voucher {appliedVoucher} applied successfully.</p>
              ) : null}
            </section>
          </div>

          <aside className="lg:col-span-2">
            <div className="lg:sticky lg:top-24 rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-6 md:p-8 shadow-[0_18px_48px_var(--shadow-color)]">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)] mb-3">Order Summary</p>
              <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] mb-6">Your Items</h2>

              <div className="space-y-3 max-h-[360px] overflow-auto pr-1">
                {items.map((item) => (
                  <div
                    key={`${item.perfumeId}-${item.ml}-${item.isFullBottle ? "full" : "decant"}-${item.fullBottleSize || ""}`}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)] leading-snug">{item.perfumeName}</p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                          {item.isFullBottle ? `Full Bottle (${item.fullBottleSize || "size pending"})` : `${item.ml}ml`} x{item.quantity}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {item.isFullBottle ? "Pending" : `${(item.unitPrice * item.quantity).toLocaleString("en-BD")} BDT`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 space-y-3 border-t border-[var(--border)] pt-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Subtotal</span>
                  <span className="text-[var(--text-primary)]">{sub.toLocaleString("en-BD")} BDT</span>
                </div>
                {discount > 0 ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Discount</span>
                    <span className="text-emerald-600">-{discount.toLocaleString("en-BD")} BDT</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Delivery Fee {form.deliveryZone ? `(${form.deliveryZone})` : ""}</span>
                  <span className="text-[var(--text-primary)]">{deliveryFee.toLocaleString("en-BD")} BDT</span>
                </div>
              </div>

              <div className="mt-5 border-t border-[var(--border)] pt-5">
                <div className="flex items-end justify-between">
                  <span className="text-sm uppercase tracking-[0.2em] text-[var(--text-secondary)]">Total</span>
                  <span className="text-3xl md:text-4xl font-semibold tracking-tight text-[var(--gold)]">{total.toLocaleString("en-BD")} BDT</span>
                </div>
              </div>

              <button
                onClick={placeOrder}
                disabled={!canPlaceOrder || placing}
                className="hidden lg:block w-full mt-6 rounded-2xl bg-[var(--gold)] text-black py-4 text-sm uppercase tracking-[0.16em] font-medium transition-all duration-200 hover:bg-[var(--gold-light)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              >
                {placing
                  ? "Submitting..."
                  : form.paymentMethod === "Bkash Manual" || form.paymentMethod === "Bank Manual"
                    ? "Submit Payment & Place Order"
                    : "Place Order"}
              </button>

              {!canPlaceOrder ? (
                <p className="mt-3 text-xs text-[var(--text-muted)]">Complete contact and fulfillment details to place the order.</p>
              ) : null}
            </div>
          </aside>
        </div>

        <div className="lg:hidden fixed bottom-0 inset-x-0 border-t border-[var(--border)] bg-[var(--bg-elevated)]/95 backdrop-blur-sm px-4 py-3 z-30">
          <div className="max-w-7xl mx-auto flex items-center gap-3">
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">Total</p>
              <p className="text-xl font-semibold tracking-tight text-[var(--gold)]">{total.toLocaleString("en-BD")} BDT</p>
            </div>
            <button
              onClick={placeOrder}
              disabled={!canPlaceOrder || placing}
              className="rounded-2xl bg-[var(--gold)] text-black px-5 py-3 text-xs uppercase tracking-[0.16em] font-medium transition-colors hover:bg-[var(--gold-light)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {placing
                ? "Submitting..."
                : form.paymentMethod === "Bkash Manual" || form.paymentMethod === "Bank Manual"
                  ? "Submit Payment"
                  : "Place Order"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
