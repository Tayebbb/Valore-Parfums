import { db, Collections } from "@/lib/prisma";
import { apiCache } from "@/lib/api-cache";
import type { PricingConfig } from "@/lib/api-cache";
import { parseTierMargins } from "@/lib/utils";

// Fallback TTL only — admin mutations invalidate this cache explicitly
// (invalidatePricingConfigCache in api-cache.ts).
const CACHE_TTL = 60_000;

/**
 * Enabled decant sizes + bottles + settings margins + active bulk rules.
 * Shared by /api/pricing, the pack pricing layer and order creation so every
 * consumer prices from the same inputs.
 */
export async function getPricingConfig(opts: { fresh?: boolean } = {}): Promise<PricingConfig> {
  const cached = apiCache.pricingConfig;
  // `fresh` bypasses the cache read (order creation must price from current data); the result still warms the cache.
  if (!opts.fresh && cached && Date.now() - cached.ts < CACHE_TTL) return cached;

  const [sizesSnap, bottlesSnap, settingsDoc, bulkSnap] = await Promise.all([
    db.collection(Collections.decantSizes).get(),
    db.collection(Collections.bottles).get(),
    db.collection(Collections.settings).doc("default").get(),
    db.collection(Collections.bulkPricingRules).get(),
  ]);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const sizes = sizesSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s: any) => s.enabled === true).sort((a: any, b: any) => a.ml - b.ml) as any[];
  const bottles = bottlesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
  const settings = settingsDoc.exists ? settingsDoc.data() as any : null;
  const bulkRules = bulkSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r: any) => r.isActive === true).sort((a: any, b: any) => a.minQuantity - b.minQuantity) as any[];
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const fresh: PricingConfig = {
    sizes,
    bottles,
    packagingCost: settings?.packagingCost ?? 20,
    ownerProfitPercent: settings?.ownerProfitPercent ?? 85,
    margins: parseTierMargins(settings?.tierMargins),
    bulkRules,
    lowStockAlertMl: Number(settings?.lowStockAlertMl ?? 20),
    ts: Date.now(),
  };
  apiCache.pricingConfig = fresh;
  return fresh;
}
