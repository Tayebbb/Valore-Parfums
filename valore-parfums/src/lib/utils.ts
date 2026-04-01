/* ── helpers shared between server & client ── */

export function formatCurrency(amount: number, currency = "BDT"): string {
  return `${amount.toLocaleString("en-BD", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

// ─── Brand Tier Engine ─────────────────────────────────
// Determines tier based on full bottle market price
export type BrandTier = "Budget" | "Premium" | "Luxury";

// Tier margins type: { Budget: { "3": 37, "10": 27, ... }, Premium: {...}, Luxury: {...} }
export type TierMargins = Record<BrandTier, Record<string, number>>;

export const DEFAULT_TIER_MARGINS: TierMargins = {
  Budget:  { "3": 37, "5": 37, "6": 37, "10": 27, "15": 22, "30": 17 },
  Premium: { "3": 32, "5": 32, "6": 32, "10": 22, "15": 17, "30": 12 },
  Luxury:  { "3": 45, "5": 45, "6": 45, "10": 35, "15": 27, "30": 27 },
};

export function getBrandTier(fullBottlePrice: number): BrandTier {
  if (fullBottlePrice > 8000) return "Luxury";
  if (fullBottlePrice >= 3000) return "Premium";
  return "Budget";
}

// Returns the profit margin % for the given tier and ml size using stored margins
export function getTierProfitMargin(tier: BrandTier, ml: number, margins?: TierMargins): number {
  const m = margins ?? DEFAULT_TIER_MARGINS;
  const tierMargins = m[tier];
  if (!tierMargins) return 20;

  // Exact match first
  const exact = tierMargins[String(ml)];
  if (exact !== undefined) return exact;

  // Fallback: find the closest size bucket
  const sizes = Object.keys(tierMargins).map(Number).sort((a, b) => a - b);
  for (const size of sizes) {
    if (ml <= size) return tierMargins[String(size)];
  }
  // If ml is larger than all defined sizes, use the largest
  return tierMargins[String(sizes[sizes.length - 1])] ?? 20;
}

export function parseTierMargins(json: string | null | undefined): TierMargins {
  if (!json) return DEFAULT_TIER_MARGINS;
  try {
    return JSON.parse(json) as TierMargins;
  } catch {
    return DEFAULT_TIER_MARGINS;
  }
}

// Psychological rounding: round to nearest number ending in 9
export function psychologicalRound(price: number): number {
  const rounded = Math.ceil(price);
  const mod = rounded % 10;
  if (mod <= 9) {
    // round up to next ..9
    return rounded + (9 - mod);
  }
  return rounded;
}

export function calculateSellingPrice(
  marketPricePerMl: number,
  ml: number,
  bottleCost: number,
  packagingCost: number,
  profitMarginPercent: number,
): number {
  const baseValue = marketPricePerMl * ml;
  const profit = baseValue * (profitMarginPercent / 100);
  const raw = baseValue + profit + bottleCost + packagingCost;
  return psychologicalRound(raw);
}

export function calculateProfit(
  sellingPrice: number,
  purchasePricePerMl: number,
  ml: number,
  bottleCost: number,
  packagingCost: number,
): number {
  const cost = purchasePricePerMl * ml + bottleCost + packagingCost;
  return sellingPrice - cost;
}

// ─── Ownership Profit Split ────────────────────────────
export type OwnerType = "Store" | "Tayeb" | "Enid";

export function splitProfit(profit: number, owner: OwnerType, ownerPercent = 85): { ownerProfit: number; otherOwnerProfit: number } {
  if (profit <= 0) return { ownerProfit: 0, otherOwnerProfit: 0 };
  if (owner === "Store") {
    // Store-owned: entire profit goes to store pool (split later by owner shares)
    return { ownerProfit: 0, otherOwnerProfit: 0 };
  }
  // Owner (Tayeb or Enid): configurable split — owner gets ownerPercent, the other owner gets the rest
  const ownerShare = Math.round(profit * (ownerPercent / 100));
  return {
    ownerProfit: ownerShare,
    otherOwnerProfit: profit - ownerShare,
  };
}

export function statusColor(status: string): string {
  switch (status) {
    case "Pending": return "amber";
    case "Confirmed": return "blue";
    case "Ready": return "gold";
    case "Completed": return "green";
    case "Cancelled": return "red";
    default: return "gray";
  }
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function normalizeOrderImagePath(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("/")) {
    return trimmed;
  }
  return `/${trimmed}`;
}
