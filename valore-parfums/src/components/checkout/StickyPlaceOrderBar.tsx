"use client";

import { memo } from "react";
import type { CheckoutPaymentMethod } from "@/components/checkout/PaymentMethodSelector";

interface StickyPlaceOrderBarProps {
  total: number;
  placing: boolean;
  paymentMethod: CheckoutPaymentMethod;
  onPlaceOrder: () => void;
  disabled?: boolean;
}

function getButtonLabel(paymentMethod: CheckoutPaymentMethod, placing: boolean) {
  if (placing) return "Placing...";
  if (paymentMethod === "Bkash Manual" || paymentMethod === "Bank Manual") {
    return "Submit Payment";
  }
  return "Place Order";
}

function StickyPlaceOrderBarBase({
  total,
  placing,
  paymentMethod,
  onPlaceOrder,
  disabled,
}: StickyPlaceOrderBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-700/80 bg-[rgba(10,10,12,0.94)] px-4 py-3 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Total</p>
          <p className="truncate text-lg font-semibold tracking-tight text-[#C9A96E]">{total.toLocaleString("en-BD")} BDT</p>
        </div>
        <button
          type="button"
          onClick={onPlaceOrder}
          disabled={Boolean(disabled) || placing}
          className="rounded-xl bg-[#C9A96E] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-black shadow-[0_10px_22px_rgba(201,169,110,0.2)] transition-all hover:bg-[#d4b67d] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {getButtonLabel(paymentMethod, placing)}
        </button>
      </div>
    </div>
  );
}

export const StickyPlaceOrderBar = memo(StickyPlaceOrderBarBase);
