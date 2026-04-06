"use client";

import { useState, useEffect, useMemo, useCallback, Suspense, useRef } from "react";
import dynamic from "next/dynamic";
import { useCart } from "@/store/cart";
import { toast } from "@/components/ui/Toaster";
import { CopyOrderIdButton } from "@/components/ui/CopyOrderIdButton";
import {
  PaymentMethodSelector,
  type CheckoutPaymentMethod,
} from "@/components/checkout/PaymentMethodSelector";
import { StickyPlaceOrderBar } from "@/components/checkout/StickyPlaceOrderBar";
import { useRouter, useSearchParams } from "next/navigation";
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
type PickupMethod = "Pickup" | "Delivery";

interface CheckoutForm {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  pickupMethod: PickupMethod;
  deliveryZone: "" | DeliveryZone;
  pickupLocationId: string;
  area: string;
  city: string;
  fullAddress: string;
  addressNotes: string;
  paymentMethod: CheckoutPaymentMethod;
}

interface BkashPaymentForm {
  customerName: string;
  paidFromNumber: string;
  transactionNumber: string;
  notes: string;
}

interface BankPaymentForm {
  accountName: string;
  accountNumber: string;
  transactionNumber: string;
  notes: string;
}

interface DisplayItem {
  perfumeId: string;
  perfumeName: string;
  ml: number;
  isFullBottle?: boolean;
  fullBottleSize?: string;
  quantity: number;
  unitPrice: number;
  image?: string;
}

interface PricingRow {
  ml: number;
  sellingPrice: number;
}

interface BulkPricingRule {
  minQuantity: number;
  discountPercent: number;
}

interface PricingResponse {
  prices?: PricingRow[];
  bulkRules?: BulkPricingRule[];
}

interface PerfumeResponse {
  id: string;
  name: string;
  images?: string;
}

interface OrderErrorPayload {
  error?: string;
  fieldErrors?: Record<string, string>;
  errors?: Array<{ field?: string; message?: string }>;
}

const OrderSummaryPanel = dynamic(() => import("@/components/checkout/OrderSummaryPanel"), {
  ssr: false,
  loading: () => (
    <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
      <div className="skeleton h-4 w-2/3" />
      <div className="skeleton h-4 w-full" />
      <div className="skeleton h-4 w-5/6" />
    </div>
  ),
});


const inputBaseClass =
  "w-full rounded-xl border bg-[var(--bg-input)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-all duration-200 focus:border-[#C9A96E] focus:ring-2 focus:ring-[rgba(201,169,110,0.2)]";
const textareaBaseClass = `${inputBaseClass} resize-none`;

function getInputClass(hasError: boolean) {
  return `${inputBaseClass} ${
    hasError
      ? "border-[var(--error)] focus:border-[var(--error)] focus:ring-[rgba(248,113,113,0.18)]"
      : "border-gray-700/70"
  }`;
}

function getTextareaClass(hasError: boolean) {
  return `${textareaBaseClass} ${
    hasError
      ? "border-[var(--error)] focus:border-[var(--error)] focus:ring-[rgba(248,113,113,0.18)]"
      : "border-gray-700/70"
  }`;
}

function getDesktopPlaceOrderLabel(paymentMethod: CheckoutPaymentMethod, placing: boolean) {
  if (placing) return "Placing Order...";
  if (paymentMethod === "Bkash Manual" || paymentMethod === "Bank Manual") {
    return "Submit Payment & Place Order";
  }
  return "Place Order";
}

function CheckoutContent() {
  const { items, subtotal, clearCart } = useCart();
  const router = useRouter();
  const { user } = useAuth();
  const searchParams = useSearchParams();

  const productId = searchParams.get("productId");
  const productSlug = searchParams.get("productSlug");
  const qtyStr = searchParams.get("qty");
  const mlStr = searchParams.get("ml");
  const isBuyNow = Boolean(productId);

  const [directItem, setDirectItem] = useState<DisplayItem | null>(null);
  const [loadingDirect, setLoadingDirect] = useState(isBuyNow);

  const [form, setForm] = useState<CheckoutForm>({
    customerName: "",
    customerPhone: "",
    customerEmail: user?.email || "",
    pickupMethod: "Pickup",
    deliveryZone: "",
    pickupLocationId: "",
    area: "",
    city: "",
    fullAddress: "",
    addressNotes: "",
    paymentMethod: "Cash on Delivery",
  });

  const [bkashPayment, setBkashPayment] = useState<BkashPaymentForm>({
    customerName: "",
    paidFromNumber: "",
    transactionNumber: "",
    notes: "",
  });

  const [bankPayment, setBankPayment] = useState<BankPaymentForm>({
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
  const [placedPaymentMethod, setPlacedPaymentMethod] = useState<CheckoutPaymentMethod>("Cash on Delivery");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  const displayItems: DisplayItem[] = useMemo(
    () => (isBuyNow ? (directItem ? [directItem] : []) : (items as DisplayItem[])),
    [directItem, isBuyNow, items],
  );
  const displaySubtotal = useMemo(
    () => (isBuyNow ? (directItem ? directItem.unitPrice * directItem.quantity : 0) : subtotal()),
    [directItem, isBuyNow, subtotal],
  );
  const hasFullBottle = useMemo(() => displayItems.some((item) => item.isFullBottle), [displayItems]);

  const isDelivery = form.pickupMethod === "Delivery";
  const deliveryFee = useMemo(() => {
    if (!isDelivery || !form.deliveryZone) return 0;
    return form.deliveryZone === "Outside Dhaka"
      ? checkoutConfig.deliveryFeeOutsideDhaka
      : checkoutConfig.deliveryFeeInsideDhaka;
  }, [checkoutConfig.deliveryFeeInsideDhaka, checkoutConfig.deliveryFeeOutsideDhaka, form.deliveryZone, isDelivery]);

  const total = Math.max(0, displaySubtotal - discount) + deliveryFee;

  const selectedPickupLocation = useMemo(
    () => checkoutConfig.pickupLocations.find((loc) => loc.id === form.pickupLocationId) || null,
    [checkoutConfig.pickupLocations, form.pickupLocationId],
  );

  const deliveryAddress = useMemo(() => {
    if (!isDelivery) return "";
    const areaCity = [form.area.trim(), form.city.trim()].filter(Boolean).join(", ");
    const noteText = form.addressNotes.trim() ? `Note: ${form.addressNotes.trim()}` : "";
    return [form.fullAddress.trim(), areaCity, noteText].filter(Boolean).join(" | ");
  }, [form.addressNotes, form.area, form.city, form.fullAddress, isDelivery]);

  const scrollToSection = useCallback((sectionKey: string) => {
    const section = sectionRefs.current[sectionKey];
    if (!section) return;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const scrollToError = useCallback((fieldKey: string) => {
    const fieldWrapper = fieldRefs.current[fieldKey];
    if (!fieldWrapper) return;
    fieldWrapper.scrollIntoView({ behavior: "smooth", block: "center" });
    const input = fieldWrapper.querySelector("input, select, textarea") as HTMLElement | null;
    input?.focus();
  }, []);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;

    if (isBuyNow && productId) {
      Promise.all([
        fetch(`/api/perfumes/${productId}`).then((r) => r.json() as Promise<PerfumeResponse>),
        fetch(`/api/pricing?perfumeId=${productId}`).then((r) => r.json() as Promise<PricingResponse>),
      ])
        .then(([p, pricing]) => {
          if (!active) return;

          const ml = parseInt(mlStr || "5", 10);
          const qty = parseInt(qtyStr || "1", 10);
          const prices = Array.isArray(pricing.prices) ? pricing.prices : [];
          const priceObj = prices.find((pr) => pr.ml === ml);
          const bulkRules = Array.isArray(pricing.bulkRules) ? pricing.bulkRules : [];
          const activeBulkRule = bulkRules.reduce<BulkPricingRule | null>((best, rule) => {
            if (qty < rule.minQuantity) return best;
            if (!best || rule.minQuantity > best.minQuantity) return rule;
            return best;
          }, null);
          const bulkDiscountPercent = activeBulkRule?.discountPercent || 0;
          const decantUnitPrice = priceObj
            ? Math.ceil(priceObj.sellingPrice * (1 - bulkDiscountPercent / 100))
            : 0;

          const images = p.images ? (JSON.parse(p.images) as string[]) : [];
          setDirectItem({
            perfumeId: p.id,
            perfumeName: p.name,
            ml,
            isFullBottle: false,
            quantity: qty,
            unitPrice: decantUnitPrice,
            image: images[0],
          });
        })
        .catch(() => {
          if (active) toast("Failed to load product details", "error");
        })
        .finally(() => {
          if (active) setLoadingDirect(false);
        });
    }

    return () => {
      active = false;
    };
  }, [isBuyNow, productId, mlStr, qtyStr]);

  useEffect(() => {
    if (!orderId && displayItems.length === 0 && !isBuyNow && !loadingDirect) {
      router.push("/cart");
    }
  }, [displayItems.length, router, orderId, isBuyNow, loadingDirect]);

  useEffect(() => {
    if (user?.email) {
      setForm((prev) => ({ ...prev, customerEmail: prev.customerEmail || user.email || "" }));
    }
  }, [user?.email]);

  useEffect(() => {
    if (!user?.id) return;

    const abortController = new AbortController();

    const loadSavedProfile = async () => {
      try {
        const res = await fetch("/api/auth/profile", { signal: abortController.signal });
        if (!res.ok) return;

        const data = await res.json();
        const saved = data?.savedDeliveryInfo && typeof data.savedDeliveryInfo === "object"
          ? (data.savedDeliveryInfo as Record<string, unknown>)
          : {};

        setForm((prev) => ({
          ...prev,
          customerName: prev.customerName || String(data?.name || ""),
          customerPhone: prev.customerPhone || String(data?.phone || ""),
          customerEmail: prev.customerEmail || String(data?.email || user.email || ""),
          pickupMethod:
            prev.area || prev.city || prev.fullAddress || prev.pickupLocationId
              ? prev.pickupMethod
              : (saved.pickupMethod === "Delivery" || saved.pickupMethod === "Pickup"
                ? saved.pickupMethod
                : prev.pickupMethod),
          deliveryZone:
            prev.deliveryZone || (saved.deliveryZone === "Inside Dhaka" || saved.deliveryZone === "Outside Dhaka"
              ? saved.deliveryZone
              : ""),
          pickupLocationId: prev.pickupLocationId || String(saved.pickupLocationId || ""),
          area: prev.area || String(saved.area || ""),
          city: prev.city || String(saved.city || ""),
          fullAddress: prev.fullAddress || String(saved.fullAddress || ""),
          addressNotes: prev.addressNotes || String(saved.addressNotes || ""),
        }));
      } catch {
        // Silent fail: checkout should still work without saved profile data.
      }
    };

    void loadSavedProfile();
    return () => abortController.abort();
  }, [user?.email, user?.id]);

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
    if (form.pickupMethod !== "Pickup") return;

    setForm((prev) => {
      if (!prev.deliveryZone) return prev;
      return { ...prev, deliveryZone: "" };
    });

    setErrors((prev) => {
      if (!prev.deliveryZone && !prev.area && !prev.city && !prev.fullAddress) return prev;
      const next = { ...prev };
      delete next.deliveryZone;
      delete next.area;
      delete next.city;
      delete next.fullAddress;
      return next;
    });
  }, [form.pickupMethod]);

  const setField = useCallback(
    <K extends keyof CheckoutForm>(key: K, value: CheckoutForm[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      if (errors[key]) {
        setErrors((prev) => ({ ...prev, [key]: "" }));
      }
    },
    [errors],
  );

  const applyVoucher = useCallback(async () => {
    if (!voucherCode.trim()) return;

    try {
      const res = await fetch("/api/vouchers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: voucherCode, orderTotal: displaySubtotal, hasFullBottle }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast(data.error, "error");
        return;
      }

      setDiscount(data.discount);
      setAppliedVoucher(data.code);
      toast(`Voucher applied: -${data.discount} BDT`, "success");
    } catch {
      toast("Could not validate voucher", "error");
    }
  }, [displaySubtotal, hasFullBottle, voucherCode]);

  const placeOrder = useCallback(async () => {
    if (placing) return;

    const newErrors: Record<string, string> = {};

    if (!form.customerName.trim()) newErrors.customerName = "Name is required";
    if (!form.customerPhone.trim()) newErrors.customerPhone = "Phone is required";
    if (!form.customerEmail.trim()) {
      newErrors.customerEmail = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customerEmail.trim())) {
      newErrors.customerEmail = "Valid email is required";
    }

    if (isDelivery) {
      if (!form.deliveryZone) newErrors.deliveryZone = "Please select a zone";
      if (!form.area.trim()) newErrors.area = "Area is required";
      if (!form.city.trim()) newErrors.city = "City is required";
      if (!form.fullAddress.trim()) newErrors.fullAddress = "Address is required";
    }

    if (form.paymentMethod === "Bkash Manual") {
      if (!bkashPayment.customerName.trim()) {
        newErrors.bkashCustomerName = "bKash account name is required";
      }
      if (!/^[0-9]{11}$/.test(bkashPayment.paidFromNumber.trim())) {
        newErrors.bkashPaidFromNumber = "Must be exactly 11 digits";
      }
      if (!bkashPayment.transactionNumber.trim()) {
        newErrors.bkashTransactionNumber = "Transaction ID is required";
      } else if (
        bkashPayment.transactionNumber.trim().length < 6 ||
        bkashPayment.transactionNumber.trim().length > 40
      ) {
        newErrors.bkashTransactionNumber = "Invalid Transaction ID length";
      }
    }

    if (form.paymentMethod === "Bank Manual") {
      if (!bankPayment.accountName.trim()) {
        newErrors.bankAccountName = "Account name is required";
      }
      if (!bankPayment.accountNumber.trim()) {
        newErrors.bankAccountNumber = "Account number is required";
      } else if (bankPayment.accountNumber.trim().length < 8 || bankPayment.accountNumber.trim().length > 32) {
        newErrors.bankAccountNumber = "Invalid length";
      }
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      toast("Please complete all required fields", "info");
      scrollToError(Object.keys(newErrors)[0]);
      return;
    }

    setPlacing(true);

    try {
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
          area: form.pickupMethod === "Delivery" ? form.area.trim() : "",
          city: form.pickupMethod === "Delivery" ? form.city.trim() : "",
          fullAddress: form.pickupMethod === "Delivery" ? form.fullAddress.trim() : "",
          addressNotes: form.pickupMethod === "Delivery" ? form.addressNotes.trim() : "",
          deliveryAddress,
          deliveryFee,
          paymentMethod: form.paymentMethod,
          bkashPayment:
            form.paymentMethod === "Bkash Manual"
              ? {
                  customerName: bkashPayment.customerName.trim(),
                  paidFromNumber: bkashPayment.paidFromNumber.trim(),
                  transactionNumber: bkashPayment.transactionNumber.trim(),
                  notes: bkashPayment.notes.trim(),
                }
              : null,
          bankPayment:
            form.paymentMethod === "Bank Manual"
              ? {
                  accountName: bankPayment.accountName.trim(),
                  accountNumber: bankPayment.accountNumber.trim(),
                  transactionNumber: bankPayment.transactionNumber.trim(),
                  notes: bankPayment.notes.trim(),
                }
              : null,
          voucherCode: appliedVoucher || null,
          hasFullBottle,
          items: displayItems.map((item) => ({
            perfumeId: item.perfumeId,
            ml: item.ml,
            isFullBottle: Boolean(item.isFullBottle),
            fullBottleSize: item.fullBottleSize || "",
            quantity: item.quantity,
          })),
        }),
      });

      if (res.ok) {
        const order = await res.json();
        setOrderId(order.id);
        setPlacedPaymentMethod(form.paymentMethod);
        if (!isBuyNow) clearCart();
        toast("Order placed successfully!", "success");
        return;
      }

      // Try to parse error response for detailed error and field errors
      let errorData: OrderErrorPayload | null = null;
      try {
        errorData = (await res.json()) as OrderErrorPayload;
      } catch {
        errorData = null;
      }
      let message = "Failed to place order";
      if (errorData) {
        if (errorData.error) message = errorData.error;
        // If there are field errors, show them inline
        if (errorData.fieldErrors && typeof errorData.fieldErrors === "object") {
          setErrors((prev) => ({ ...prev, ...errorData.fieldErrors }));
          // Scroll to first field error
          const firstField = Object.keys(errorData.fieldErrors)[0];
          if (firstField) scrollToError(firstField);
        }
        // If there are batch errors (array of { field, message })
        if (errorData.errors && Array.isArray(errorData.errors)) {
          const batchFieldErrors: Record<string, string> = {};
          for (const err of errorData.errors) {
            if (err.field && err.message) batchFieldErrors[err.field] = err.message;
          }
          if (Object.keys(batchFieldErrors).length > 0) {
            setErrors((prev) => ({ ...prev, ...batchFieldErrors }));
            const firstField = Object.keys(batchFieldErrors)[0];
            if (firstField) scrollToError(firstField);
          }
        }
      } else {
        // fallback: try to get text
        const raw = await res.text().catch(() => "");
        if (raw) message = raw;
      }
      toast(message, "error");
    } catch {
      toast("Network error while placing order", "error");
    } finally {
      setPlacing(false);
    }
  }, [
    appliedVoucher,
    bankPayment.accountName,
    bankPayment.accountNumber,
    bankPayment.notes,
    bankPayment.transactionNumber,
    bkashPayment.customerName,
    bkashPayment.notes,
    bkashPayment.paidFromNumber,
    bkashPayment.transactionNumber,
    clearCart,
    deliveryAddress,
    deliveryFee,
    displayItems,
    form.customerEmail,
    form.customerName,
    form.customerPhone,
    form.area,
    form.city,
    form.fullAddress,
    form.addressNotes,
    form.deliveryZone,
    form.paymentMethod,
    form.pickupLocationId,
    form.pickupMethod,
    hasFullBottle,
    isBuyNow,
    isDelivery,
    placing,
    scrollToError,
    selectedPickupLocation?.name,
  ]);

  if (orderId) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center sm:py-16">
        <CheckCircle size={54} className="mx-auto mb-4 text-[var(--success)]" />
        <h1 className="font-serif text-3xl font-semibold text-[var(--text-primary)]">Order Submitted</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {placedPaymentMethod === "Bkash Manual"
            ? "Payment details received. We will confirm once your bKash transfer is verified."
            : placedPaymentMethod === "Bank Manual"
              ? "Payment details received. Verification is usually completed within 24-48 hours."
              : "Your order has been placed successfully."}
        </p>

        <div className="mt-5 rounded-2xl border border-gray-700/80 bg-[var(--bg-card)] p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Order ID</p>
          <div className="mt-2 flex items-center justify-center gap-2">
            <p className="break-all font-mono text-sm text-[var(--text-primary)]">{orderId}</p>
            <CopyOrderIdButton orderId={orderId} />
          </div>
        </div>

        {!user ? (
          <div className="mt-4 rounded-2xl border border-[var(--warning)]/50 bg-[rgba(251,191,36,0.09)] p-3 text-left">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--warning)]">Guest Reminder</p>
            <p className="mt-1.5 text-sm text-[var(--text-primary)]">
              Save this Order ID. It is required for tracking if you checked out without an account.
            </p>
          </div>
        ) : null}

        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-[#C9A96E] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-black transition-colors hover:bg-[#d4b67d]"
        >
          Continue Shopping
        </Link>
      </div>
    );
  }

  if (loadingDirect && isBuyNow) {
    return (
      <div className="flex h-[55vh] items-center justify-center text-sm uppercase tracking-[0.2em] text-[var(--text-muted)] animate-pulse">
        Loading Product...
      </div>
    );
  }

  if (displayItems.length === 0) {
    return null;
  }

  return (
    <div className="min-h-screen pb-28 lg:pb-8">
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-5 sm:px-6 sm:pt-8">
        <Link
          href={isBuyNow ? (productSlug ? `/products/${productSlug}` : `/perfume/${productId}`) : "/cart"}
          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] transition-colors hover:text-[#C9A96E]"
        >
          <ArrowLeft size={13} /> Back to {isBuyNow ? "Product" : "Cart"}
        </Link>

        <header className="mt-4">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            Checkout
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-[var(--text-secondary)]">
            Fast and compact checkout designed for mobile. Fill details, choose payment, and place order.
          </p>
        </header>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { key: "customer", label: "Customer" },
            { key: "address", label: form.pickupMethod === "Delivery" ? "Address" : "Pickup" },
            { key: "payment", label: "Payment" },
            { key: "summary", label: "Summary" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => scrollToSection(tab.key)}
              className="w-full min-w-0 rounded-lg border border-gray-700/80 bg-[var(--bg-surface)] px-2 py-1.5 text-[10px] uppercase tracking-[0.14em] text-[var(--text-secondary)] transition-colors hover:border-[#C9A96E]/60 hover:text-[#C9A96E]"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-5">
          <div className="space-y-4 lg:col-span-3">
            <section
              ref={(el) => {
                sectionRefs.current.customer = el as HTMLDivElement | null;
              }}
              className="scroll-mt-24 rounded-2xl border border-[#eadfc8] bg-[#fdf9f1] p-4 sm:p-5 dark:border-gray-700/80 dark:bg-[var(--bg-card)]"
            >
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#b1894c] dark:text-[#C9A96E]">Section 1</p>
              <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-[var(--text-primary)]">Customer Info</h2>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div
                  ref={(el) => {
                    fieldRefs.current.customerName = el;
                  }}
                >
                  <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Name
                  </label>
                  <input
                    ref={firstInputRef}
                    autoFocus
                    type="text"
                    value={form.customerName}
                    onChange={(e) => setField("customerName", e.target.value)}
                    className={getInputClass(Boolean(errors.customerName))}
                    placeholder="Your full name"
                  />
                  {errors.customerName ? (
                    <p className="mt-1 text-[11px] text-[var(--error)]">{errors.customerName}</p>
                  ) : null}
                </div>

                <div
                  ref={(el) => {
                    fieldRefs.current.customerPhone = el;
                  }}
                >
                  <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={form.customerPhone}
                    onChange={(e) => setField("customerPhone", e.target.value)}
                    className={getInputClass(Boolean(errors.customerPhone))}
                    placeholder="01XXXXXXXXX"
                  />
                  {errors.customerPhone ? (
                    <p className="mt-1 text-[11px] text-[var(--error)]">{errors.customerPhone}</p>
                  ) : null}
                </div>

                <div
                  className="sm:col-span-2"
                  ref={(el) => {
                    fieldRefs.current.customerEmail = el;
                  }}
                >
                  <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Email
                  </label>
                  <input
                    type="email"
                    value={form.customerEmail}
                    onChange={(e) => setField("customerEmail", e.target.value)}
                    className={getInputClass(Boolean(errors.customerEmail))}
                    placeholder="you@email.com"
                  />
                  {errors.customerEmail ? (
                    <p className="mt-1 text-[11px] text-[var(--error)]">{errors.customerEmail}</p>
                  ) : null}
                </div>
              </div>
            </section>

            <section
              ref={(el) => {
                sectionRefs.current.address = el as HTMLDivElement | null;
              }}
              className="scroll-mt-24 rounded-2xl border border-[#d7e4f2] bg-[#f2f8fd] p-4 sm:p-5 dark:border-gray-700/80 dark:bg-[var(--bg-card)]"
            >
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#4d7fa6] dark:text-[#C9A96E]">Section 2</p>
              <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-[var(--text-primary)]">Delivery Address</h2>

              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-gray-700/70 bg-[var(--bg-surface)] p-1">
                {(["Pickup", "Delivery"] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setField("pickupMethod", method)}
                    className={
                      form.pickupMethod === method
                        ? "rounded-lg bg-[#C9A96E] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-black shadow-[0_10px_20px_rgba(201,169,110,0.2)]"
                        : "rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]"
                    }
                  >
                    {method}
                  </button>
                ))}
              </div>

              {form.pickupMethod === "Pickup" ? (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Pickup Location
                    </label>
                    <div className="relative">
                      <select
                        value={form.pickupLocationId}
                        onChange={(e) => setField("pickupLocationId", e.target.value)}
                        disabled={loadingCheckoutConfig || checkoutConfig.pickupLocations.length === 0}
                        className="w-full appearance-none rounded-xl border border-gray-700/70 bg-[var(--bg-input)] px-3 py-2.5 pr-10 text-sm text-[var(--text-primary)] outline-none transition-all duration-200 focus:border-[#C9A96E] focus:ring-2 focus:ring-[rgba(201,169,110,0.2)] disabled:opacity-60"
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
                      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    </div>
                  </div>

                  {selectedPickupLocation ? (
                    <div className="rounded-xl border border-gray-700/70 bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text-secondary)]">
                      <p className="font-medium text-[var(--text-primary)]">{selectedPickupLocation.name}</p>
                      <p className="mt-1">{selectedPickupLocation.address}</p>
                      {selectedPickupLocation.phone ? <p className="mt-1">{selectedPickupLocation.phone}</p> : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <div
                    ref={(el) => {
                      fieldRefs.current.deliveryZone = el;
                    }}
                  >
                    <p className="mb-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Delivery Zone</p>
                    <div
                      className={`grid grid-cols-2 gap-2 rounded-xl border p-1 ${
                        errors.deliveryZone
                          ? "border-[var(--error)] shadow-[0_0_0_1px_rgba(248,113,113,0.2)]"
                          : "border-gray-700/70"
                      }`}
                    >
                      {(["Inside Dhaka", "Outside Dhaka"] as const).map((zone) => (
                        <button
                          type="button"
                          key={zone}
                          onClick={() => setField("deliveryZone", zone)}
                          className={
                            form.deliveryZone === zone
                              ? "rounded-lg bg-[#C9A96E] px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-black"
                              : "rounded-lg px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--text-secondary)]"
                          }
                        >
                          {zone}
                        </button>
                      ))}
                    </div>
                    {errors.deliveryZone ? (
                      <p className="mt-1 text-[11px] text-[var(--error)]">{errors.deliveryZone}</p>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div
                      ref={(el) => {
                        fieldRefs.current.area = el;
                      }}
                    >
                      <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        Area
                      </label>
                      <input
                        type="text"
                        value={form.area}
                        onChange={(e) => setField("area", e.target.value)}
                        className={getInputClass(Boolean(errors.area))}
                        placeholder="e.g. Dhanmondi"
                      />
                      {errors.area ? <p className="mt-1 text-[11px] text-[var(--error)]">{errors.area}</p> : null}
                    </div>

                    <div
                      ref={(el) => {
                        fieldRefs.current.city = el;
                      }}
                    >
                      <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        City
                      </label>
                      <input
                        type="text"
                        value={form.city}
                        onChange={(e) => setField("city", e.target.value)}
                        className={getInputClass(Boolean(errors.city))}
                        placeholder="e.g. Dhaka"
                      />
                      {errors.city ? <p className="mt-1 text-[11px] text-[var(--error)]">{errors.city}</p> : null}
                    </div>

                    <div
                      className="sm:col-span-2"
                      ref={(el) => {
                        fieldRefs.current.fullAddress = el;
                      }}
                    >
                      <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        Address
                      </label>
                      <textarea
                        rows={2}
                        value={form.fullAddress}
                        onChange={(e) => setField("fullAddress", e.target.value)}
                        className={getTextareaClass(Boolean(errors.fullAddress))}
                        placeholder="House, road, landmark"
                      />
                      {errors.fullAddress ? (
                        <p className="mt-1 text-[11px] text-[var(--error)]">{errors.fullAddress}</p>
                      ) : null}
                    </div>

                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        Delivery Note (Optional)
                      </label>
                      <textarea
                        rows={2}
                        value={form.addressNotes}
                        onChange={(e) => setField("addressNotes", e.target.value)}
                        className={getTextareaClass(false)}
                        placeholder="Landmark, preferred call timing, or gate instructions"
                      />
                    </div>
                  </div>

                  <p className="rounded-xl border border-gray-700/70 bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                    Delivery Fee: <span className="font-semibold text-[#C9A96E]">{deliveryFee.toLocaleString("en-BD")} BDT</span>
                  </p>
                </div>
              )}

              {hasFullBottle ? (
                <p className="mt-3 text-[11px] text-[var(--text-muted)]">
                  Full-bottle request prices are reviewed by admin before final confirmation.
                </p>
              ) : null}
            </section>

            <section
              ref={(el) => {
                sectionRefs.current.payment = el as HTMLDivElement | null;
              }}
              className="scroll-mt-24 rounded-2xl border border-[#e4d9f1] bg-[#f8f3fc] p-4 sm:p-5 dark:border-gray-700/80 dark:bg-[var(--bg-card)]"
            >
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#8663b2] dark:text-[#C9A96E]">Section 3</p>
              <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-[var(--text-primary)]">Payment Method</h2>

              <div className="mt-3">
                <PaymentMethodSelector value={form.paymentMethod} onChange={(method) => setField("paymentMethod", method)} />
              </div>

              {form.paymentMethod === "Bkash Manual" ? (
                <div className="mt-3 rounded-xl border border-[#C9A96E]/35 bg-[rgba(201,169,110,0.07)] p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-gray-700/70 bg-[var(--bg-card)] px-2.5 py-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Account Name</p>
                      <p className="mt-1 text-sm text-[var(--text-primary)]">{checkoutConfig.bkashAccountName || "Not set"}</p>
                    </div>
                    <div className="rounded-lg border border-gray-700/70 bg-[var(--bg-card)] px-2.5 py-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Account Number</p>
                      <p className="mt-1 text-sm text-[var(--text-primary)]">{checkoutConfig.bkashAccountNumber || "Not set"}</p>
                    </div>
                    <div className="rounded-lg border border-gray-700/70 bg-[var(--bg-card)] px-2.5 py-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Account Type</p>
                      <p className="mt-1 text-sm text-[var(--text-primary)]">{checkoutConfig.bkashAccountType || "Not set"}</p>
                    </div>
                    <div className="rounded-lg border border-gray-700/70 bg-[var(--bg-card)] px-2.5 py-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Amount to Pay</p>
                      <p className="mt-1 text-sm font-semibold text-[#C9A96E]">{total.toLocaleString("en-BD")} BDT</p>
                    </div>
                  </div>

                  <details className="mt-2 rounded-lg border border-gray-700/70 bg-[var(--bg-card)] px-3 py-2">
                    <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                      How to pay via bKash
                    </summary>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
                      <li>Send the total amount to the bKash account above.</li>
                      <li>Copy TXN ID from your receipt.</li>
                      <li>Fill the verification fields below.</li>
                    </ol>
                  </details>

                  {checkoutConfig.bkashQrImageUrl ? (
                    <div className="mt-2 rounded-lg border border-gray-700/70 bg-[var(--bg-card)] p-2.5">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        Scan bKash QR (Optional)
                      </p>
                      <img
                        src={checkoutConfig.bkashQrImageUrl}
                        alt="bKash payment QR"
                        className="mt-2 h-auto w-36 rounded border border-gray-700/70"
                      />
                    </div>
                  ) : null}

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div
                      ref={(el) => {
                        fieldRefs.current.bkashCustomerName = el;
                      }}
                    >
                      <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        bKash Name
                      </label>
                      <input
                        type="text"
                        value={bkashPayment.customerName}
                        onChange={(e) => {
                          setBkashPayment((prev) => ({ ...prev, customerName: e.target.value }));
                          if (errors.bkashCustomerName) {
                            setErrors((prev) => ({ ...prev, bkashCustomerName: "" }));
                          }
                        }}
                        className={getInputClass(Boolean(errors.bkashCustomerName))}
                      />
                      {errors.bkashCustomerName ? (
                        <p className="mt-1 text-[11px] text-[var(--error)]">{errors.bkashCustomerName}</p>
                      ) : null}
                    </div>

                    <div
                      ref={(el) => {
                        fieldRefs.current.bkashPaidFromNumber = el;
                      }}
                    >
                      <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        Paid From Number
                      </label>
                      <input
                        type="text"
                        value={bkashPayment.paidFromNumber}
                        onChange={(e) => {
                          setBkashPayment((prev) => ({ ...prev, paidFromNumber: e.target.value }));
                          if (errors.bkashPaidFromNumber) {
                            setErrors((prev) => ({ ...prev, bkashPaidFromNumber: "" }));
                          }
                        }}
                        className={getInputClass(Boolean(errors.bkashPaidFromNumber))}
                        placeholder="01XXXXXXXXX"
                      />
                      {errors.bkashPaidFromNumber ? (
                        <p className="mt-1 text-[11px] text-[var(--error)]">{errors.bkashPaidFromNumber}</p>
                      ) : null}
                    </div>

                    <div
                      className="sm:col-span-2"
                      ref={(el) => {
                        fieldRefs.current.bkashTransactionNumber = el;
                      }}
                    >
                      <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        TXN ID
                      </label>
                      <input
                        type="text"
                        value={bkashPayment.transactionNumber}
                        onChange={(e) => {
                          setBkashPayment((prev) => ({ ...prev, transactionNumber: e.target.value }));
                          if (errors.bkashTransactionNumber) {
                            setErrors((prev) => ({ ...prev, bkashTransactionNumber: "" }));
                          }
                        }}
                        className={getInputClass(Boolean(errors.bkashTransactionNumber))}
                      />
                      {errors.bkashTransactionNumber ? (
                        <p className="mt-1 text-[11px] text-[var(--error)]">{errors.bkashTransactionNumber}</p>
                      ) : null}
                    </div>

                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        Notes (Optional)
                      </label>
                      <textarea
                        rows={2}
                        value={bkashPayment.notes}
                        onChange={(e) => setBkashPayment((prev) => ({ ...prev, notes: e.target.value }))}
                        className={getTextareaClass(false)}
                        placeholder="Extra payment details"
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {form.paymentMethod === "Bank Manual" ? (
                <div className="mt-3 rounded-xl border border-[#C9A96E]/35 bg-[rgba(201,169,110,0.07)] p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-gray-700/70 bg-[var(--bg-card)] px-2.5 py-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Bank Name</p>
                      <p className="mt-1 text-sm text-[var(--text-primary)]">{checkoutConfig.bankName || "Not set"}</p>
                    </div>
                    <div className="rounded-lg border border-gray-700/70 bg-[var(--bg-card)] px-2.5 py-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Account Name</p>
                      <p className="mt-1 text-sm text-[var(--text-primary)]">{checkoutConfig.bankAccountName || "Not set"}</p>
                    </div>
                    <div className="rounded-lg border border-gray-700/70 bg-[var(--bg-card)] px-2.5 py-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Account Number</p>
                      <p className="mt-1 text-sm text-[var(--text-primary)]">{checkoutConfig.bankAccountNumber || "Not set"}</p>
                    </div>
                    <div className="rounded-lg border border-gray-700/70 bg-[var(--bg-card)] px-2.5 py-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Amount to Pay</p>
                      <p className="mt-1 text-sm font-semibold text-[#C9A96E]">{total.toLocaleString("en-BD")} BDT</p>
                    </div>
                  </div>

                  <details className="mt-2 rounded-lg border border-gray-700/70 bg-[var(--bg-card)] px-3 py-2">
                    <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                      Bank transfer instructions
                    </summary>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
                      <li>Transfer the total to the account above (NPSB only).</li>
                      <li>Keep transaction reference if available.</li>
                      <li>Submit the details below for manual verification.</li>
                    </ol>
                  </details>

                  {checkoutConfig.bankQrImageUrl ? (
                    <div className="mt-2 rounded-lg border border-gray-700/70 bg-[var(--bg-card)] p-2.5">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Bank QR (Optional)</p>
                      <img
                        src={checkoutConfig.bankQrImageUrl}
                        alt="Bank payment QR"
                        className="mt-2 h-auto w-36 rounded border border-gray-700/70"
                      />
                    </div>
                  ) : null}

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div
                      ref={(el) => {
                        fieldRefs.current.bankAccountName = el;
                      }}
                    >
                      <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        Account/Card Name
                      </label>
                      <input
                        type="text"
                        value={bankPayment.accountName}
                        onChange={(e) => {
                          setBankPayment((prev) => ({ ...prev, accountName: e.target.value }));
                          if (errors.bankAccountName) {
                            setErrors((prev) => ({ ...prev, bankAccountName: "" }));
                          }
                        }}
                        className={getInputClass(Boolean(errors.bankAccountName))}
                      />
                      {errors.bankAccountName ? (
                        <p className="mt-1 text-[11px] text-[var(--error)]">{errors.bankAccountName}</p>
                      ) : null}
                    </div>

                    <div
                      ref={(el) => {
                        fieldRefs.current.bankAccountNumber = el;
                      }}
                    >
                      <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        Account/Card Number
                      </label>
                      <input
                        type="text"
                        value={bankPayment.accountNumber}
                        onChange={(e) => {
                          setBankPayment((prev) => ({ ...prev, accountNumber: e.target.value }));
                          if (errors.bankAccountNumber) {
                            setErrors((prev) => ({ ...prev, bankAccountNumber: "" }));
                          }
                        }}
                        className={getInputClass(Boolean(errors.bankAccountNumber))}
                      />
                      {errors.bankAccountNumber ? (
                        <p className="mt-1 text-[11px] text-[var(--error)]">{errors.bankAccountNumber}</p>
                      ) : null}
                    </div>

                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        Transaction Reference (Optional)
                      </label>
                      <input
                        type="text"
                        value={bankPayment.transactionNumber}
                        onChange={(e) => setBankPayment((prev) => ({ ...prev, transactionNumber: e.target.value }))}
                        className={getInputClass(false)}
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        Notes (Optional)
                      </label>
                      <textarea
                        rows={2}
                        value={bankPayment.notes}
                        onChange={(e) => setBankPayment((prev) => ({ ...prev, notes: e.target.value }))}
                        className={getTextareaClass(false)}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-[#dce5c8] bg-[#f7fbee] p-4 sm:p-5 dark:border-gray-700/80 dark:bg-[var(--bg-card)]">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#6e8a3c] dark:text-[#C9A96E]">Voucher</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  placeholder="Enter voucher code"
                  value={voucherCode}
                  onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                  disabled={Boolean(appliedVoucher)}
                  className="flex-1 rounded-xl border border-gray-700/70 bg-[var(--bg-input)] px-3 py-2.5 text-sm font-mono text-[var(--text-primary)] outline-none transition-all duration-200 focus:border-[#C9A96E] focus:ring-2 focus:ring-[rgba(201,169,110,0.2)] disabled:opacity-60"
                />
                {appliedVoucher ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAppliedVoucher("");
                      setDiscount(0);
                      setVoucherCode("");
                    }}
                    className="rounded-xl border border-gray-700/80 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)] transition-colors hover:border-[#C9A96E]/60 hover:text-[#C9A96E]"
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={applyVoucher}
                    className="rounded-xl bg-[#C9A96E] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-black transition-colors hover:bg-[#d4b67d]"
                  >
                    Apply
                  </button>
                )}
              </div>

              {appliedVoucher ? (
                <p className="mt-2 text-sm text-emerald-400">Voucher {appliedVoucher} applied successfully.</p>
              ) : null}
            </section>

            <section
              ref={(el) => {
                sectionRefs.current.summary = el as HTMLDivElement | null;
              }}
              className="scroll-mt-24 rounded-2xl border border-[#d7dde8] bg-[#f4f6fa] p-4 dark:border-gray-700/80 dark:bg-[var(--bg-card)] lg:hidden"
            >
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#5f7897] dark:text-[#C9A96E]">Section 4</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--text-primary)]">Order Summary</h2>

              <div className="mt-3">
                <OrderSummaryPanel
                  items={displayItems}
                  displaySubtotal={displaySubtotal}
                  discount={discount}
                  deliveryFee={deliveryFee}
                  total={total}
                  deliveryZone={form.deliveryZone}
                  compact
                />
              </div>
            </section>

          </div>

          <aside
            ref={(el) => {
              sectionRefs.current.summary = el as HTMLDivElement | null;
            }}
            className="hidden lg:col-span-2 lg:block lg:self-start"
          >
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border border-[#d7dde8] bg-[#f4f6fa] p-4 shadow-xl dark:border-gray-700/80 dark:bg-[var(--bg-card)]">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#5f7897] dark:text-[#C9A96E]">Section 4</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--text-primary)]">Order Summary</h2>

              <div className="mt-3">
                <OrderSummaryPanel
                  items={displayItems}
                  displaySubtotal={displaySubtotal}
                  discount={discount}
                  deliveryFee={deliveryFee}
                  total={total}
                  deliveryZone={form.deliveryZone}
                />
              </div>

              <button
                type="button"
                onClick={placeOrder}
                disabled={placing}
                className="mt-4 w-full rounded-xl bg-[#C9A96E] py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-black shadow-[0_14px_24px_rgba(201,169,110,0.2)] transition-all hover:bg-[#d4b67d] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {getDesktopPlaceOrderLabel(form.paymentMethod, placing)}
              </button>
            </div>
          </aside>
        </div>
      </div>

      <StickyPlaceOrderBar
        total={total}
        placing={placing}
        paymentMethod={form.paymentMethod}
        onPlaceOrder={placeOrder}
      />
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-sm uppercase tracking-widest text-[var(--text-muted)] animate-pulse">
          Loading checkout...
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
