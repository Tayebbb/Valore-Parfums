import { packDiscountLabel } from "@/types/pack";
import type { PackDiscountType } from "@/types/pack";

interface PackPriceProps {
  originalPrice: number;
  discountAmount: number;
  discountType: PackDiscountType;
  discountValue: number;
  finalPrice: number;
  /** Multiplier for a cart/order line (defaults to a single pack). */
  quantity?: number;
  size?: "sm" | "lg";
}

const fmt = (n: number) => `৳${n.toLocaleString("en-BD")}`;

/** Original → discount → NOW price block. Shows only the final price when there is no discount. */
export default function PackPrice({
  originalPrice,
  discountAmount,
  discountType,
  discountValue,
  finalPrice,
  quantity = 1,
  size = "sm",
}: PackPriceProps) {
  const hasDiscount = discountAmount > 0;
  const big = size === "lg";
  return (
    <div className="font-sans">
      {hasDiscount ? (
        <>
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Original</span>
            <span className="line-through">{fmt(originalPrice * quantity)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="meta-pill meta-pill-accent">{packDiscountLabel(discountType, discountValue)}</span>
            <span className="text-emerald-400">−{fmt(discountAmount * quantity)}</span>
          </div>
        </>
      ) : null}
      <div className={`flex items-baseline justify-between ${hasDiscount ? "mt-2 border-t border-[var(--border)] pt-2" : ""}`}>
        <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Now</span>
        <span className={`font-serif font-medium text-[var(--gold-light)] ${big ? "text-3xl" : "text-xl"}`}>
          {fmt(finalPrice * quantity)}
        </span>
      </div>
    </div>
  );
}
