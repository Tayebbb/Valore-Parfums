"use client";

import { memo } from "react";

export type CheckoutPaymentMethod = "Cash on Delivery" | "Bkash Manual" | "Bank Manual";

interface PaymentMethodOption {
  key: CheckoutPaymentMethod;
  label: string;
  iconSrc: string;
  iconAlt: string;
}

const PAYMENT_OPTIONS: PaymentMethodOption[] = [
  { key: "Cash on Delivery", label: "COD", iconSrc: "/cod.png", iconAlt: "Cash on Delivery" },
  { key: "Bkash Manual", label: "bKash", iconSrc: "/bkash.png?v=4", iconAlt: "bKash" },
  { key: "Bank Manual", label: "Bank", iconSrc: "/banktransfer.svg?v=4", iconAlt: "Bank Transfer" },
];

interface PaymentMethodSelectorProps {
  value: CheckoutPaymentMethod;
  onChange: (method: CheckoutPaymentMethod) => void;
}

function PaymentMethodSelectorBase({ value, onChange }: PaymentMethodSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {PAYMENT_OPTIONS.map((method) => {
        const selected = value === method.key;

        return (
          <button
            key={method.key}
            type="button"
            onClick={() => onChange(method.key)}
            className={[
              "min-w-0 rounded-xl border px-2 py-2.5 text-center transition-all duration-200",
              selected
                ? "border-[#C9A96E] bg-[rgba(201,169,110,0.12)] shadow-[0_0_0_1px_rgba(201,169,110,0.55),0_12px_24px_rgba(201,169,110,0.14)]"
                : "border-[var(--border)] bg-[var(--bg-surface)] hover:border-[#C9A96E]/60",
            ].join(" ")}
            aria-pressed={selected}
          >
            <div className="flex flex-col items-center gap-1.5">
              <img src={method.iconSrc} alt={method.iconAlt} className="h-4 w-auto object-contain sm:h-5" loading="lazy" />
              <span className={selected ? "text-xs font-semibold uppercase tracking-[0.14em] text-[#C9A96E]" : "text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-primary)]"}>
                {method.label}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export const PaymentMethodSelector = memo(PaymentMethodSelectorBase);
