/**
 * Canonical decant pricing — the single source of truth for "what does this
 * perfume cost at N ml". Pure (imports only ./utils) so it can be unit tested
 * without Firebase and shared by /api/pricing and the pack pricing layer.
 *
 * This is an exact lift of the calculation that used to live inline in
 * /api/pricing; its outputs must not change (pinned by scripts/test-packs.ts).
 */
import { calculateSellingPrice, getBrandTier, getTierProfitMargin } from "./utils";
import type { BrandTier, TierMargins } from "./utils";

export interface PricingPerfume {
  isPersonalCollection?: boolean;
  marketPricePerMl: number;
  purchasePricePerMl: number;
  partialDealType?: string | null;
  partialSellingPrice?: number;
  partialSellingPricePerMl?: number;
}

export interface DecantPriceContext {
  packagingCost: number;
  margins: TierMargins;
  /** Cost of the atomiser/bottle for this ml size (0 when no bottle record exists). */
  bottleCost: number;
}

export interface DecantPrice {
  ml: number;
  sellingPrice: number;
  tier: BrandTier;
  profitMargin: number;
  effectiveMarketPricePerMl: number;
  isPartialDeal: boolean;
  partialDealType: "decant" | "full_bottle" | null;
  partialSellingPrice: number;
}

/** Effective selling price of one decant of `ml` for a perfume (before any bulk/pack discount). */
export function computeDecantPrice(
  perfume: PricingPerfume,
  ml: number,
  ctx: DecantPriceContext,
): DecantPrice {
  // Personal collection: market price = purchase price
  const effectiveMarketPricePerMl = perfume.isPersonalCollection
    ? perfume.purchasePricePerMl
    : perfume.marketPricePerMl;

  const tier = getBrandTier(effectiveMarketPricePerMl * 100);
  const profitMargin = getTierProfitMargin(tier, ml, ctx.margins);
  const partialType = String(perfume.partialDealType || "").toLowerCase();
  const isPartialDeal = partialType === "decant" || partialType === "full_bottle";
  const partialSellingPrice = Number(perfume.partialSellingPrice ?? perfume.partialSellingPricePerMl ?? 0);

  const sellingPrice = isPartialDeal
    ? Math.ceil(Math.max(0, partialSellingPrice))
    : calculateSellingPrice(
      effectiveMarketPricePerMl,
      ml,
      ctx.bottleCost,
      ctx.packagingCost,
      profitMargin,
    );

  return {
    ml,
    sellingPrice,
    tier,
    profitMargin,
    effectiveMarketPricePerMl,
    isPartialDeal,
    partialDealType: isPartialDeal ? (partialType as "decant" | "full_bottle") : null,
    partialSellingPrice,
  };
}
