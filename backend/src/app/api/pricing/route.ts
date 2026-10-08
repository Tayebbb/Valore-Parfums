import { NextResponse } from "next/server";
import { db, Collections } from "@/lib/prisma";
import { getBrandTier, splitProfit } from "@/lib/utils";
import type { OwnerType } from "@/lib/utils";
import { computeDecantPrice } from "@/lib/pricing-engine";
import { getPricingConfig } from "@/lib/pricing-config";
import { FieldPath } from "firebase-admin/firestore";
import { apiCache } from "@/lib/api-cache";
import { requireAdmin } from "@/lib/auth";

// Short shared-cache window so admin price changes reach CDN-cached responses fast.
const CACHE_CONTROL = "public, s-maxage=15, stale-while-revalidate=30";

// Config (sizes, bottles, settings, bulk rules — see lib/pricing-config.ts) and
// batch results live in the shared api-cache store so admin mutations can
// invalidate them instantly; the TTL below is only a fallback for direct
// Firestore edits.
const PRICE_RESULT_CACHE_TTL = 30_000;

type PricingPerfume = {
  id: string;
  isPersonalCollection?: boolean;
  partialDealType?: "decant" | "full_bottle" | "";
  partialSellingPrice?: number;
  partialSellingPricePerMl?: number;
  purchasePricePerMl: number;
  marketPricePerMl: number;
  totalStockMl: number;
};

function calcPartialDealCost(
  purchasePricePerMl: number,
  ml: number,
): number {
  const baseBuying = purchasePricePerMl * ml;
  return Math.ceil(baseBuying * (ml / 100));
}

async function getPerfumesByIds(ids: string[]): Promise<PricingPerfume[]> {
  const chunkSize = 10;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }

  const snapshots = await Promise.all(
    chunks.map((chunk) =>
      db
        .collection(Collections.perfumes)
        .where(FieldPath.documentId(), "in", chunk)
        .get(),
    ),
  );

  const map = new Map<string, unknown>();
  for (const snap of snapshots) {
    for (const doc of snap.docs) {
      map.set(doc.id, { id: doc.id, ...doc.data() });
    }
  }

  return ids.map((id) => map.get(id)).filter(Boolean) as PricingPerfume[];
}

// Get prices for a specific perfume across all enabled decant sizes
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const perfumeId = searchParams.get("perfumeId");

  if (!perfumeId) return NextResponse.json({ error: "perfumeId required" }, { status: 400 });

  // Only the perfume itself needs a fresh read; config is cached
  const [perfumeDoc, config, admin] = await Promise.all([
    db.collection(Collections.perfumes).doc(perfumeId).get(),
    getPricingConfig(),
    requireAdmin(),
  ]);

  if (!perfumeDoc.exists) return NextResponse.json({ error: "Perfume not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const perfume = { id: perfumeDoc.id, ...perfumeDoc.data() } as any;
  const { sizes, bottles, packagingCost, margins, bulkRules } = config;

  const owner = (perfume.owner || "Store") as OwnerType;
  // Personal collection: market price = purchase price
  const tier = getBrandTier((perfume.isPersonalCollection ? perfume.purchasePricePerMl : perfume.marketPricePerMl) * 100);

  const prices = sizes.map((size) => {
    const bottle = bottles.find((b) => b.ml === size.ml);
    const bottleCost = bottle?.costPerBottle ?? 0;
    const decant = computeDecantPrice(perfume, size.ml, { packagingCost, margins, bottleCost });
    const { sellingPrice, profitMargin, isPartialDeal } = decant;
    const partialType = decant.partialDealType ?? "";
    const totalCost = isPartialDeal
      ? calcPartialDealCost(perfume.purchasePricePerMl, size.ml)
      : Math.ceil(perfume.purchasePricePerMl * size.ml + packagingCost);
    const profit = sellingPrice - totalCost;
    const ownerProfitPercent = config.ownerProfitPercent;
    const { ownerProfit, otherOwnerProfit } = splitProfit(profit, owner, ownerProfitPercent);
    const inStock = perfume.totalStockMl >= size.ml;
    // If no bottle record exists for this ml size, assume available (only an explicit availableCount: 0 should gate it)
    const bottleAvailable = !bottle || bottle.availableCount > 0;

    if (!admin) {
      return {
        ml: size.ml,
        sellingPrice,
        inStock,
        bottleAvailable,
        available: inStock && bottleAvailable,
        isPartialDeal,
        partialDealType: isPartialDeal ? partialType : null,
      };
    }

    return {
      ml: size.ml,
      sellingPrice,
      totalCost,
      profit,
      ownerProfit,
      otherOwnerProfit,
      ownerName: owner,
      bottleCost,
      packagingCost,
      profitMargin,
      tier,
      isPartialDeal,
      partialDealType: isPartialDeal ? partialType : null,
      inStock,
      bottleAvailable,
      available: inStock && bottleAvailable,
    };
  });

  if (!admin) {
    return NextResponse.json({
      perfumeId: perfume.id,
      perfumeName: perfume.name,
      prices,
      bulkRules: bulkRules.map((r) => ({ minQuantity: r.minQuantity, discountPercent: r.discountPercent })),
    }, { headers: { "Cache-Control": CACHE_CONTROL } });
  }

  return NextResponse.json({
    perfumeId: perfume.id,
    perfumeName: perfume.name,
    tier,
    owner,
    isPersonalCollection: perfume.isPersonalCollection,
    prices,
    bulkRules: bulkRules.map((r) => ({ minQuantity: r.minQuantity, discountPercent: r.discountPercent })),
  }, { headers: { "Cache-Control": "private, no-cache" } });
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
  const cacheKey = [...uniqueIds].sort().join("|");
  const cached = apiCache.batchPriceResults.get(cacheKey);
  if (cached && Date.now() - cached.ts < PRICE_RESULT_CACHE_TTL) {
    return NextResponse.json(cached.data, { headers: { "Cache-Control": CACHE_CONTROL } });
  }

  // Fetch config and all requested perfumes with batched IN queries
  const [config, perfumes] = await Promise.all([
    getPricingConfig(),
    getPerfumesByIds(uniqueIds),
  ]);

  const { sizes, bottles, packagingCost, margins } = config;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = {};
  for (const perfume of perfumes) {
    const prices = sizes.map((size) => {
      const bottle = bottles.find((b) => b.ml === size.ml);
      const bottleCost = bottle?.costPerBottle ?? 0;
      const { sellingPrice } = computeDecantPrice(perfume, size.ml, { packagingCost, margins, bottleCost });
      const inStock = perfume.totalStockMl >= size.ml;
      // If no bottle record exists for this ml size, assume available (only an explicit availableCount: 0 should gate it)
      const bottleAvailable = !bottle || bottle.availableCount > 0;
      return { ml: size.ml, sellingPrice, available: inStock && bottleAvailable };
    });

    result[perfume.id] = { prices };
  }

  apiCache.batchPriceResults.set(cacheKey, { data: result, ts: Date.now() });
  if (apiCache.batchPriceResults.size > 100) {
    const firstKey = apiCache.batchPriceResults.keys().next().value;
    if (firstKey) apiCache.batchPriceResults.delete(firstKey);
  }

  return NextResponse.json(result, { headers: { "Cache-Control": CACHE_CONTROL } });
}
