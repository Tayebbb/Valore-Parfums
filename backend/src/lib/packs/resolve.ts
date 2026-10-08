/**
 * Pure pack resolution (no Firestore): prices each component with the canonical decant price,
 * evaluates availability, applies the pack discount and maps to public/admin shapes.
 * Kept free of `firebase-admin` imports so it is unit-testable (scripts/test-packs.ts).
 */
import type { PricingConfig } from "@/lib/api-cache";
import { computeDecantPrice } from "@/lib/pricing-engine";
import { parseImageList } from "@/lib/image-utils";
import { normalizeOrderImagePath } from "@/lib/utils";
import {
  allocatePackPrice,
  buildPackWarnings,
  computePackTotals,
  evaluateComponent,
  isSellable,
} from "./pricing";
import type {
  ComponentStatus,
  Pack,
  PackAdmin,
  PackPricing,
  PackPublic,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type PerfumeRecord = Record<string, any> & { id: string };

export interface ResolvedComponent {
  perfumeId: string;
  perfume: PerfumeRecord | null;
  name: string;
  brand: string;
  image: string;
  path: string;
  ml: number;
  /** Current normal decant price (before any pack discount). */
  listPrice: number;
  /** Unit cost as used by order creation: purchase + packaging + bottle. */
  unitCost: number;
  bottleCost: number;
  status: ComponentStatus;
  stockMl: number;
}

export interface ResolvedPack {
  pack: Pack;
  components: ResolvedComponent[];
  pricing: PackPricing;
  /** Allocated (discounted) unit price per component; Σ === pricing.finalPrice. */
  allocation: number[];
  /** True when the pack's decant size has too few atomisers for `quantity` packs. */
  bottleShortage: boolean;
  /** Pack can be sold (every component sellable, atomisers available, price > 0 data). */
  available: boolean;
  totalCost: number;
}

/**
 * Resolve one pack against already-loaded perfumes + pricing config.
 * `quantity` only affects availability (stock needed = ml × quantity per component).
 */
export function resolvePack(
  pack: Pack,
  perfumes: Map<string, PerfumeRecord>,
  config: PricingConfig,
  quantity = 1,
  /** Storefront path builder for a perfume (injected so this module stays free of server-only imports). */
  pathFor: (perfume: PerfumeRecord) => string = () => "",
): ResolvedPack {
  const ml = pack.decantSizeMl;
  const sizeEnabled = config.sizes.some((s: any) => s.ml === ml);
  const bottle = config.bottles.find((b: any) => b.ml === ml);
  const bottleCost = Number(bottle?.costPerBottle ?? 0);
  const lowStockThresholdMl = Number(config.lowStockAlertMl ?? 20);
  const qty = Math.max(1, Math.floor(quantity));

  const components: ResolvedComponent[] = pack.items.map(({ perfumeId }) => {
    const perfume = perfumes.get(perfumeId) ?? null;
    const stockMl = Number(perfume?.totalStockMl ?? 0);
    const price = perfume
      ? computeDecantPrice(perfume as any, ml, { packagingCost: config.packagingCost, margins: config.margins, bottleCost })
      : null;
    const name = String(perfume?.name || "Unavailable perfume");
    const brand = String(perfume?.brand || "");
    const image = perfume ? normalizeOrderImagePath(parseImageList(perfume.images as string | undefined)[0]) : "";
    const path = perfume ? pathFor(perfume) : "";
    return {
      perfumeId,
      perfume,
      name,
      brand,
      image,
      path,
      ml,
      listPrice: price?.sellingPrice ?? 0,
      unitCost: perfume ? Number(perfume.purchasePricePerMl || 0) * ml + config.packagingCost + bottleCost : 0,
      bottleCost,
      stockMl,
      status: evaluateComponent({
        exists: Boolean(perfume),
        isActive: perfume?.isActive === true,
        sizeEnabled,
        stockMl,
        requiredMl: ml * qty,
        // Atomisers are checked once per pack below (every component uses one).
        hasBottleRecord: false,
        bottleCount: 0,
        requiredBottles: 0,
        lowStockThresholdMl,
      }),
    };
  });

  const pricing = computePackTotals(components.map((c) => c.listPrice), pack.discountType, pack.discountValue);
  const allocation = allocatePackPrice(components.map((c) => c.listPrice), pricing.finalPrice);
  const bottleShortage = Boolean(bottle) && Number(bottle.availableCount ?? 0) < components.length * qty;
  const available = components.length > 0 && components.every((c) => isSellable(c.status)) && !bottleShortage;

  return {
    pack,
    components,
    pricing,
    allocation,
    bottleShortage,
    available,
    totalCost: components.reduce((sum, c) => sum + c.unitCost, 0),
  };
}

// ── Output mappers ─────────────────────────────────────────────────

/** Public payload: prices + availability booleans only. No stock levels, costs or margins. */
export function toPublicPack(r: ResolvedPack): PackPublic {
  const { pack } = r;
  return {
    id: pack.id,
    name: pack.name,
    slug: pack.slug,
    description: pack.description,
    sortOrder: pack.sortOrder,
    decantSizeMl: pack.decantSizeMl,
    discountType: pack.discountType,
    discountValue: pack.discountValue,
    originalPrice: r.pricing.originalPrice,
    discountAmount: r.pricing.discountAmount,
    finalPrice: r.pricing.finalPrice,
    available: r.available,
    items: r.components.map((c) => ({
      perfumeId: c.perfumeId,
      name: c.name,
      brand: c.brand,
      image: c.image,
      path: c.path,
      unitPrice: c.listPrice,
      available: isSellable(c.status),
    })),
  };
}

function isoOrNull(value: unknown): string | null {
  if (value && typeof value === "object" && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return typeof value === "string" ? value : null;
}

/** Admin payload: everything in the public payload plus stock, cost and warnings. */
export function toAdminPack(r: ResolvedPack): PackAdmin {
  const { pack } = r;
  const warnings = buildPackWarnings({
    pricing: r.pricing,
    totalCost: r.totalCost,
    discountType: pack.discountType,
    discountValue: pack.discountValue,
  });
  if (r.bottleShortage) {
    warnings.push(`Not enough ${pack.decantSizeMl}ml atomisers in stock for this pack.`);
  }
  return {
    id: pack.id,
    name: pack.name,
    slug: pack.slug,
    description: pack.description,
    isActive: pack.isActive,
    sortOrder: pack.sortOrder,
    decantSizeMl: pack.decantSizeMl,
    discountType: pack.discountType,
    discountValue: pack.discountValue,
    originalPrice: r.pricing.originalPrice,
    discountAmount: r.pricing.discountAmount,
    finalPrice: r.pricing.finalPrice,
    available: r.available,
    totalCost: r.totalCost,
    warnings,
    createdAt: isoOrNull(pack.createdAt),
    updatedAt: isoOrNull(pack.updatedAt),
    items: r.components.map((c) => ({
      perfumeId: c.perfumeId,
      name: c.name,
      brand: c.brand,
      image: c.image,
      path: c.path,
      unitPrice: c.listPrice,
      available: isSellable(c.status),
      status: c.status,
      stockMl: c.stockMl,
      unitCost: c.unitCost,
    })),
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
