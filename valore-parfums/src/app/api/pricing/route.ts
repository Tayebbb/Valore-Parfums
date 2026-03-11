import { NextResponse } from "next/server";
import { db, Collections } from "@/lib/prisma";
import { calculateSellingPrice, calculateProfit, getBrandTier, getTierProfitMargin, parseTierMargins, splitProfit } from "@/lib/utils";
import type { OwnerType, TierMargins } from "@/lib/utils";

// ── In-memory cache for rarely-changing config (sizes, bottles, settings, bulk rules) ──
const CACHE_TTL = 60_000; // 60 seconds
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let configCache: { sizes: any[]; bottles: any[]; packagingCost: number; margins: TierMargins; bulkRules: any[]; ts: number } | null = null;

async function getPricingConfig() {
  if (configCache && Date.now() - configCache.ts < CACHE_TTL) return configCache;

  const [sizesSnap, bottlesSnap, settingsDoc, bulkSnap] = await Promise.all([
    db.collection(Collections.decantSizes).get(),
    db.collection(Collections.bottles).get(),
    db.collection(Collections.settings).doc("default").get(),
    db.collection(Collections.bulkPricingRules).get(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sizes = sizesSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s: any) => s.enabled === true).sort((a: any, b: any) => a.ml - b.ml) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bottles = bottlesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = settingsDoc.exists ? settingsDoc.data() as any : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bulkRules = bulkSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r: any) => r.isActive === true).sort((a: any, b: any) => a.minQuantity - b.minQuantity) as any[];

  configCache = {
    sizes,
    bottles,
    packagingCost: settings?.packagingCost ?? 20,
    margins: parseTierMargins(settings?.tierMargins),
    bulkRules,
    ts: Date.now(),
  };
  return configCache;
}

/** Invalidate the config cache (called when admin updates settings/sizes/bottles/bulk rules) */
export function invalidatePricingCache() { configCache = null; }

// Get prices for a specific perfume across all enabled decant sizes
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const perfumeId = searchParams.get("perfumeId");

  if (!perfumeId) return NextResponse.json({ error: "perfumeId required" }, { status: 400 });

  // Only the perfume itself needs a fresh read; config is cached
  const [perfumeDoc, config] = await Promise.all([
    db.collection(Collections.perfumes).doc(perfumeId).get(),
    getPricingConfig(),
  ]);

  if (!perfumeDoc.exists) return NextResponse.json({ error: "Perfume not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const perfume = { id: perfumeDoc.id, ...perfumeDoc.data() } as any;
  const { sizes, bottles, packagingCost, margins, bulkRules } = config;

  // Personal collection: market price = purchase price
  const effectiveMarketPricePerMl = perfume.isPersonalCollection
    ? perfume.purchasePricePerMl
    : perfume.marketPricePerMl;

  const fullBottlePrice = effectiveMarketPricePerMl * 100;
  const tier = getBrandTier(fullBottlePrice);
  const owner = (perfume.owner || "Store") as OwnerType;

  const prices = sizes.map((size) => {
    const bottle = bottles.find((b) => b.ml === size.ml);
    const bottleCost = bottle?.costPerBottle ?? 0;
    const profitMargin = getTierProfitMargin(tier, size.ml, margins);
    const sellingPrice = calculateSellingPrice(
      effectiveMarketPricePerMl,
      size.ml,
      bottleCost,
      packagingCost,
      profitMargin,
    );
    const profit = calculateProfit(sellingPrice, perfume.purchasePricePerMl, size.ml, bottleCost, packagingCost);
    const ownerProfitPercent = config!.settings?.ownerProfitPercent ?? 85;
    const { ownerProfit, otherOwnerProfit } = splitProfit(profit, owner, ownerProfitPercent);
    const totalCost = perfume.purchasePricePerMl * size.ml + bottleCost + packagingCost;
    const inStock = perfume.totalStockMl >= size.ml;
    const bottleAvailable = bottle ? bottle.availableCount > 0 : false;

    return {
      ml: size.ml,
      sellingPrice,
      totalCost: Math.ceil(totalCost),
      profit,
      ownerProfit,
      otherOwnerProfit,
      ownerName: owner,
      bottleCost,
      packagingCost,
      profitMargin,
      tier,
      inStock,
      bottleAvailable,
      available: inStock && bottleAvailable,
    };
  });

  return NextResponse.json({
    perfumeId: perfume.id,
    perfumeName: perfume.name,
    tier,
    owner,
    isPersonalCollection: perfume.isPersonalCollection,
    prices,
    bulkRules: bulkRules.map((r) => ({ minQuantity: r.minQuantity, discountPercent: r.discountPercent })),
  });
}

// ── Batch pricing: POST { perfumeIds: string[] } → { [perfumeId]: { prices } } ──
export async function POST(req: Request) {
  const body = await req.json();
  const ids: string[] = body.perfumeIds;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "perfumeIds array required" }, { status: 400 });
  }
  // Cap to 50 to avoid abuse
  const uniqueIds = [...new Set(ids)].slice(0, 50);

  // Fetch config (cached) and all perfumes in parallel
  const [config, ...perfumeDocs] = await Promise.all([
    getPricingConfig(),
    ...uniqueIds.map((id) => db.collection(Collections.perfumes).doc(id).get()),
  ]);

  const { sizes, bottles, packagingCost, margins } = config;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = {};
  for (let i = 0; i < uniqueIds.length; i++) {
    const doc = perfumeDocs[i];
    if (!doc.exists) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const perfume = { id: doc.id, ...doc.data() } as any;
    const effectiveMarketPricePerMl = perfume.isPersonalCollection
      ? perfume.purchasePricePerMl
      : perfume.marketPricePerMl;
    const fullBottlePrice = effectiveMarketPricePerMl * 100;
    const tier = getBrandTier(fullBottlePrice);

    const prices = sizes.map((size) => {
      const bottle = bottles.find((b) => b.ml === size.ml);
      const bottleCost = bottle?.costPerBottle ?? 0;
      const profitMargin = getTierProfitMargin(tier, size.ml, margins);
      const sellingPrice = calculateSellingPrice(
        effectiveMarketPricePerMl,
        size.ml,
        bottleCost,
        packagingCost,
        profitMargin,
      );
      const inStock = perfume.totalStockMl >= size.ml;
      const bottleAvailable = bottle ? bottle.availableCount > 0 : false;
      return { ml: size.ml, sellingPrice, available: inStock && bottleAvailable };
    });

    result[perfume.id] = { prices };
  }

  return NextResponse.json(result);
}
