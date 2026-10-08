/**
 * Pure pack math + validation. No Firebase / Next imports so it is unit tested
 * by scripts/test-packs.ts and reused verbatim by the API routes and the order
 * path (the order path is authoritative — it recomputes with this on every order).
 *
 * All amounts are whole BDT, matching how decant prices are already rounded.
 */
import { PACK_MAX_COMPONENTS } from "./types";
import type { ComponentStatus, PackDiscountType, PackInput, PackPricing } from "./types";

/** Local slugify (same rules as seo-catalog.slugify; duplicated to keep this module dependency-free). */
export function slugifyPackName(value: string): string {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/['`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * Pack totals for ONE pack from the current normal component prices.
 * - percentage: round(list × pct / 100)
 * - fixed: round(value)
 * The discount is clamped to [0, list] so the final price can never be negative.
 */
export function computePackTotals(
  componentPrices: number[],
  discountType: PackDiscountType,
  discountValue: number,
): PackPricing {
  const originalPrice = componentPrices.reduce((sum, p) => sum + Math.max(0, Math.round(p)), 0);
  const value = Number.isFinite(discountValue) ? Math.max(0, discountValue) : 0;
  const raw = discountType === "percentage"
    ? Math.round((originalPrice * Math.min(100, value)) / 100)
    : Math.round(value);
  const discountAmount = Math.min(originalPrice, Math.max(0, raw));
  return { originalPrice, discountAmount, finalPrice: originalPrice - discountAmount };
}

/**
 * Distribute the final pack price across components proportionally to their
 * normal prices using largest-remainder allocation in whole BDT, so that
 * Σ allocation === finalPrice EXACTLY (no rounding drift) and every
 * allocation is ≤ that component's normal price.
 *
 * Deterministic: ties on the remainder are broken by lower index.
 */
export function allocatePackPrice(componentPrices: number[], finalPrice: number): number[] {
  const prices = componentPrices.map((p) => Math.max(0, Math.round(p)));
  const list = prices.reduce((a, b) => a + b, 0);
  const target = Math.max(0, Math.min(Math.round(finalPrice), list));
  if (list === 0 || prices.length === 0) return prices.map(() => 0);

  const base: number[] = [];
  const remainders: { index: number; rem: number }[] = [];
  let allocated = 0;
  prices.forEach((p, index) => {
    const numerator = p * target;
    const floor = Math.floor(numerator / list);
    base.push(floor);
    allocated += floor;
    remainders.push({ index, rem: numerator % list });
  });

  let leftover = target - allocated;
  remainders.sort((a, b) => b.rem - a.rem || a.index - b.index);
  for (const { index } of remainders) {
    if (leftover <= 0) break;
    base[index] += 1;
    leftover -= 1;
  }
  return base;
}

export interface ComponentStatusInput {
  exists: boolean;
  isActive: boolean;
  sizeEnabled: boolean;
  stockMl: number;
  /** ml required for the requested pack quantity (decantSizeMl × qty). */
  requiredMl: number;
  /** Whether a bottle/atomiser record exists for the size. */
  hasBottleRecord: boolean;
  bottleCount: number;
  requiredBottles: number;
  /** "Low stock" if the perfume would fall below this many ml after the sale. */
  lowStockThresholdMl: number;
}

/** Availability state of one component for a pack (precedence is intentional). */
export function evaluateComponent(input: ComponentStatusInput): ComponentStatus {
  if (!input.exists) return "missing";
  if (!input.isActive) return "inactive";
  if (!input.sizeEnabled) return "unavailable_size";
  if (input.stockMl < input.requiredMl) return "insufficient";
  if (input.hasBottleRecord && input.bottleCount < input.requiredBottles) return "insufficient";
  if (input.stockMl - input.requiredMl < input.lowStockThresholdMl) return "low_stock";
  return "available";
}

/** A component can be sold when it is available or merely low on stock. */
export function isSellable(status: ComponentStatus): boolean {
  return status === "available" || status === "low_stock";
}

export interface PackValidationResult {
  ok: boolean;
  errors: { field: string; message: string }[];
  value?: PackInput;
}

/**
 * Validate + normalise admin input. Does not touch Firestore: existence of the
 * perfumes and the decant size is checked by the route (needs DB access).
 */
export function validatePackInput(raw: unknown): PackValidationResult {
  const errors: { field: string; message: string }[] = [];
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 80) {
    errors.push({ field: "name", message: "Pack name must be 2–80 characters" });
  }

  const slugSource = typeof body.slug === "string" && body.slug.trim() ? body.slug : name;
  const slug = slugifyPackName(slugSource);
  if (!slug) errors.push({ field: "slug", message: "A valid slug is required" });

  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (description.length > 1000) {
    errors.push({ field: "description", message: "Description must be at most 1000 characters" });
  }

  if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
    errors.push({ field: "isActive", message: "isActive must be true or false" });
  }
  const isActive = body.isActive === undefined ? true : body.isActive === true;

  const sortOrderRaw = body.sortOrder === undefined || body.sortOrder === "" ? 0 : Number(body.sortOrder);
  if (!Number.isFinite(sortOrderRaw)) {
    errors.push({ field: "sortOrder", message: "Display order must be a number" });
  }
  const sortOrder = Number.isFinite(sortOrderRaw) ? Math.round(sortOrderRaw) : 0;

  const decantSizeMl = Number(body.decantSizeMl);
  if (!Number.isFinite(decantSizeMl) || decantSizeMl <= 0) {
    errors.push({ field: "decantSizeMl", message: "Choose a decant size" });
  }

  const perfumeIdsRaw = Array.isArray(body.perfumeIds)
    ? body.perfumeIds
    : Array.isArray(body.items)
      ? (body.items as unknown[]).map((i) => (i && typeof i === "object" ? (i as { perfumeId?: unknown }).perfumeId : i))
      : [];
  const perfumeIds = perfumeIdsRaw.map((id) => (typeof id === "string" ? id.trim() : ""));
  if (perfumeIds.length === 0) {
    errors.push({ field: "perfumeIds", message: "Select at least one perfume" });
  } else if (perfumeIds.length > PACK_MAX_COMPONENTS) {
    errors.push({ field: "perfumeIds", message: `A pack can contain at most ${PACK_MAX_COMPONENTS} perfumes` });
  }
  if (perfumeIds.some((id) => !id)) {
    errors.push({ field: "perfumeIds", message: "Invalid perfume selection" });
  }
  if (new Set(perfumeIds).size !== perfumeIds.length) {
    errors.push({ field: "perfumeIds", message: "The same perfume cannot be added twice" });
  }

  const discountType = body.discountType;
  const discountValue = Number(body.discountValue);
  if (discountType !== "percentage" && discountType !== "fixed") {
    errors.push({ field: "discountType", message: "Discount type must be percentage or fixed" });
  } else if (!Number.isFinite(discountValue)) {
    errors.push({ field: "discountValue", message: "Discount value must be a number" });
  } else if (discountType === "percentage" && !(discountValue > 0 && discountValue <= 100)) {
    errors.push({ field: "discountValue", message: "Percentage discount must be greater than 0 and at most 100" });
  } else if (discountType === "fixed" && !(discountValue >= 0)) {
    errors.push({ field: "discountValue", message: "Fixed discount must be 0 or more" });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors,
    value: {
      name,
      slug,
      description,
      isActive,
      sortOrder,
      decantSizeMl,
      perfumeIds,
      discountType: discountType as PackDiscountType,
      discountValue,
    },
  };
}

/** Human warnings for the admin about aggressive configurations (admin-only; uses cost data). */
export function buildPackWarnings(params: {
  pricing: PackPricing;
  totalCost: number;
  discountType: PackDiscountType;
  discountValue: number;
}): string[] {
  const { pricing, totalCost, discountType, discountValue } = params;
  const warnings: string[] = [];
  if (pricing.originalPrice > 0 && pricing.discountAmount >= pricing.originalPrice) {
    warnings.push("The discount makes this pack free.");
  } else if (pricing.finalPrice < totalCost) {
    warnings.push(
      `Pack price ৳${pricing.finalPrice} is below the total cost ৳${totalCost} — every sale loses money.`,
    );
  } else if (pricing.finalPrice === totalCost) {
    warnings.push("Pack price equals total cost — zero margin.");
  }
  if (discountType === "percentage" && discountValue >= 50) {
    warnings.push(`A ${discountValue}% discount is unusually aggressive.`);
  }
  if (discountType === "fixed" && pricing.originalPrice > 0 && discountValue > pricing.originalPrice) {
    warnings.push("The fixed discount is larger than the pack subtotal; the price is clamped to ৳0.");
  }
  return warnings;
}
