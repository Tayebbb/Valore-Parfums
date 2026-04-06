"use client";

import { memo } from "react";

export interface OrderSummaryItem {
  perfumeId: string;
  perfumeName: string;
  ml: number;
  isFullBottle?: boolean;
  fullBottleSize?: string;
  quantity: number;
  unitPrice: number;
}

interface OrderSummaryPanelProps {
  items: OrderSummaryItem[];
  displaySubtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  deliveryZone?: string;
  compact?: boolean;
}

function OrderSummaryPanelBase({
  items,
  displaySubtotal,
  discount,
  deliveryFee,
  total,
  deliveryZone,
  compact = false,
}: OrderSummaryPanelProps) {
  return (
    <div>
      <div className={compact ? "space-y-2.5" : "space-y-3"}>
        {items.map((item) => (
          <div
            key={`${item.perfumeId}-${item.ml}-${item.isFullBottle ? "full" : "decant"}-${item.fullBottleSize || ""}`}
            className="rounded-xl border border-gray-700/70 bg-[var(--bg-surface)] px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-medium text-[var(--text-primary)]">{item.perfumeName}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.11em] text-[var(--text-muted)]">
                  {item.isFullBottle ? `Full Bottle (${item.fullBottleSize || "Size Pending"})` : `${item.ml}ml`} x{item.quantity}
                </p>
              </div>
              <p className="shrink-0 text-sm font-medium text-[var(--text-primary)]">
                {item.isFullBottle ? "Pending" : `${(item.unitPrice * item.quantity).toLocaleString("en-BD")} BDT`}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2.5 border-t border-gray-700/80 pt-3.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-[var(--text-secondary)]">Subtotal</span>
          <span className="text-[var(--text-primary)]">{displaySubtotal.toLocaleString("en-BD")} BDT</span>
        </div>
        {discount > 0 ? (
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">Discount</span>
            <span className="text-emerald-400">-{discount.toLocaleString("en-BD")} BDT</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between">
          <span className="text-[var(--text-secondary)]">Delivery Fee {deliveryZone ? `(${deliveryZone})` : ""}</span>
          <span className="text-[var(--text-primary)]">{deliveryFee.toLocaleString("en-BD")} BDT</span>
        </div>
      </div>

      <div className="mt-3.5 border-t border-gray-700/80 pt-3.5">
        <div className="flex items-end justify-between">
          <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Total</span>
          <span className="text-2xl font-semibold tracking-tight text-[#C9A96E]">
            {total.toLocaleString("en-BD")} BDT
          </span>
        </div>
      </div>
    </div>
  );
}

const OrderSummaryPanel = memo(OrderSummaryPanelBase);

export default OrderSummaryPanel;
