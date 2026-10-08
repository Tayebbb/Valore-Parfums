/**
 * Shared in-process caches for the public catalog/pricing endpoints, plus the
 * invalidation hooks the admin mutation routes call.
 *
 * Next.js route modules may only export HTTP handlers, so this mutable state
 * lives here where both the reader route (pricing / perfumes / checkout-config)
 * and every mutating route (perfumes, settings, decant-sizes, bottles,
 * bulk-pricing) can import it. Without these hooks an admin price change kept
 * serving stale prices until the TTLs expired.
 *
 * Per-process only — same accepted semantics as rate-limit.ts.
 */
import type { TierMargins } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PricingConfig {
  sizes: any[];
  bottles: any[];
  packagingCost: number;
  ownerProfitPercent: number;
  margins: TierMargins;
  bulkRules: any[];
  /** settings.lowStockAlertMl — "low stock" threshold used by pack availability. */
  lowStockAlertMl?: number;
  ts: number;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface BatchPriceEntry {
  data: Record<string, { prices: { ml: number; sellingPrice: number; available: boolean }[] }>;
  ts: number;
}

interface ApiCacheStore {
  /** /api/pricing: decant sizes + bottles + settings margins + bulk rules. */
  pricingConfig: PricingConfig | null;
  /** /api/pricing POST: computed batch price results keyed by sorted perfume ids. */
  batchPriceResults: Map<string, BatchPriceEntry>;
  /** /api/perfumes GET: serialized list payloads keyed by "active:*". */
  perfumesList: Map<string, { data: unknown[]; ts: number }>;
  /** /api/checkout-config GET payload. */
  checkoutConfig: { data: unknown; ts: number } | null;
  /** /api/packs GET: enriched public pack list (pack prices derive from perfume + pricing data). */
  packsPublic: { data: unknown[]; ts: number } | null;
}

// Anchored on globalThis so every route entrypoint shares ONE instance even
// when the bundler (or dev HMR) instantiates this module once per route graph —
// otherwise a mutation route would clear a different Map than the reader uses.
const globalStore = globalThis as unknown as { __vpApiCache?: ApiCacheStore };

export const apiCache: ApiCacheStore = (globalStore.__vpApiCache ??= {
  pricingConfig: null,
  batchPriceResults: new Map(),
  perfumesList: new Map(),
  checkoutConfig: null,
  packsPublic: null,
});

/** A perfume doc changed (price/stock/flags/delete) — lists and computed prices are stale. */
export function invalidatePerfumeCaches(): void {
  apiCache.perfumesList.clear();
  apiCache.batchPriceResults.clear();
  apiCache.packsPublic = null;
}

/** Pricing inputs changed (settings margins/packaging, decant sizes, bottles, bulk rules). */
export function invalidatePricingConfigCache(): void {
  apiCache.pricingConfig = null;
  apiCache.batchPriceResults.clear();
  apiCache.packsPublic = null;
}

/** Settings fields feeding /api/checkout-config changed. */
export function invalidateCheckoutConfigCache(): void {
  apiCache.checkoutConfig = null;
}

/** A pack doc changed (create/update/delete/reorder) — the public pack list is stale. */
export function invalidatePackCaches(): void {
  apiCache.packsPublic = null;
}
