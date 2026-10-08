/**
 * Order-time pack handling (server-authoritative).
 *
 * The client only says WHICH pack and HOW MANY. Everything else — current
 * perfume prices, discount, allocation, availability — is recomputed here from
 * Firestore on every order. `expectedUnitPrice` is only used to detect that the
 * customer is looking at a stale price (→ 409 PRICE_CHANGED); it never sets a price.
 *
 * Each purchased pack line expands into ORDINARY decant order items (one per
 * component perfume, quantity = pack quantity) carrying pack metadata, so stock,
 * owner/investor profit, cancel/restore and ledgers keep working per perfume.
 * The component unit prices are the proportional allocation of the pack price
 * (allocatePackPrice), so Σ component revenue === pack revenue exactly.
 */
import { v4 as uuid } from "uuid";
import { db, Collections } from "@/lib/prisma";
import { getPricingConfig } from "@/lib/pricing-config";
import { docToPack, fetchPerfumesByIds, resolvePack, toPublicPack } from "./service";
import { PACK_MAX_QUANTITY } from "./types";
import type { PackOrderSnapshot, PackPublic } from "./types";

export interface PackOrderRequest {
  packId: string;
  quantity: number;
  expectedUnitPrice?: number;
}

export function parsePackRequests(raw: unknown): { ok: true; requests: PackOrderRequest[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, requests: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "packs must be an array" };
  if (raw.length > 10) return { ok: false, error: "Too many packs in one order" };

  const merged = new Map<string, PackOrderRequest>();
  for (const entry of raw) {
    const packId = typeof entry?.packId === "string" ? entry.packId.trim() : "";
    const quantity = Math.floor(Number(entry?.quantity));
    if (!packId) return { ok: false, error: "Each pack needs a packId" };
    if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, error: "Pack quantity must be at least 1" };
    const expected = Number(entry?.expectedUnitPrice);
    const existing = merged.get(packId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      merged.set(packId, {
        packId,
        quantity,
        ...(Number.isFinite(expected) ? { expectedUnitPrice: Math.round(expected) } : {}),
      });
    }
  }
  const requests = [...merged.values()];
  if (requests.some((r) => r.quantity > PACK_MAX_QUANTITY)) {
    return { ok: false, error: `You can order at most ${PACK_MAX_QUANTITY} of the same pack` };
  }
  return { ok: true, requests };
}

/** Per-component data the order loop needs on top of an ordinary decant item. */
export interface PackComponentMeta {
  /** Allocated (pack-discounted) unit price — overrides the normal price. */
  allocatedUnitPrice: number;
  /** Fields merged into the order item document. */
  itemFields: Record<string, unknown>;
}

export interface PackOrderComponent {
  /** Shaped like a client cart item so it can run through the existing item loop. */
  item: { perfumeId: string; ml: number; quantity: number; isFullBottle: false };
  meta: PackComponentMeta;
}

export interface PackOrderLine {
  packGroupId: string;
  quantity: number;
  snapshot: PackOrderSnapshot;
  components: PackOrderComponent[];
}

export type PreparePacksResult =
  | { ok: true; lines: PackOrderLine[] }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Load, verify and price every requested pack. Pure reads — nothing is mutated,
 * so any failure here leaves inventory untouched.
 */
export async function preparePackOrderLines(requests: PackOrderRequest[]): Promise<PreparePacksResult> {
  if (requests.length === 0) return { ok: true, lines: [] };

  const packDocs = await db.getAll(...requests.map((r) => db.collection(Collections.packs).doc(r.packId)));
  const packs = new Map(
    packDocs.filter((d) => d.exists).map((d) => [d.id, docToPack(d.id, d.data() as Record<string, unknown>)] as const),
  );

  // Fresh config (not the 60 s cache) — an order must be priced from current data.
  const [config, perfumes] = await Promise.all([
    getPricingConfig({ fresh: true }),
    fetchPerfumesByIds([...packs.values()].flatMap((p) => p.items.map((i) => i.perfumeId))),
  ]);

  const lines: PackOrderLine[] = [];
  const freshPacks: PackPublic[] = [];
  const priceChanged: { packId: string; packName: string; expected: number; actual: number }[] = [];

  for (const request of requests) {
    const pack = packs.get(request.packId);
    if (!pack || !pack.isActive || pack.items.length === 0) {
      return {
        ok: false,
        status: 409,
        body: {
          code: "PACK_UNAVAILABLE",
          error: `${pack?.name ? `"${pack.name}"` : "A pack in your cart"} is no longer available. Please remove it from your cart.`,
          packId: request.packId,
        },
      };
    }

    const resolved = resolvePack(pack, perfumes, config, request.quantity);
    if (!resolved.available) {
      return {
        ok: false,
        status: 409,
        body: {
          code: "PACK_UNAVAILABLE",
          error: `"${pack.name}" is currently unavailable in the requested quantity.`,
          packId: pack.id,
        },
      };
    }

    freshPacks.push(toPublicPack(resolved));
    if (request.expectedUnitPrice !== undefined && request.expectedUnitPrice !== resolved.pricing.finalPrice) {
      priceChanged.push({
        packId: pack.id,
        packName: pack.name,
        expected: request.expectedUnitPrice,
        actual: resolved.pricing.finalPrice,
      });
    }

    const packGroupId = uuid();
    const { pricing, allocation } = resolved;
    const qty = request.quantity;
    const snapshot: PackOrderSnapshot = {
      packGroupId,
      packId: pack.id,
      packName: pack.name,
      packSlug: pack.slug,
      decantSizeMl: pack.decantSizeMl,
      quantity: qty,
      discountType: pack.discountType,
      discountValue: pack.discountValue,
      originalUnitPrice: pricing.originalPrice,
      discountUnitAmount: pricing.discountAmount,
      finalUnitPrice: pricing.finalPrice,
      originalTotal: pricing.originalPrice * qty,
      discountTotal: pricing.discountAmount * qty,
      finalTotal: pricing.finalPrice * qty,
      items: resolved.components.map((c, idx) => ({
        perfumeId: c.perfumeId,
        perfumeName: c.name,
        brand: c.brand,
        ml: c.ml,
        unitPrice: allocation[idx],
        listUnitPrice: c.listPrice,
      })),
    };

    const components: PackOrderComponent[] = resolved.components.map((c, idx) => ({
      item: { perfumeId: c.perfumeId, ml: c.ml, quantity: qty, isFullBottle: false },
      meta: {
        allocatedUnitPrice: allocation[idx],
        itemFields: {
          itemType: "pack_component",
          packId: pack.id,
          packName: pack.name,
          packGroupId,
          packQuantity: qty,
          packDecantSizeMl: pack.decantSizeMl,
          // Group-level figures (whole purchased line, i.e. × quantity). They repeat on every
          // component of the group — aggregate by packGroupId, never sum across components.
          packOriginalSubtotal: snapshot.originalTotal,
          packDiscountType: pack.discountType,
          packDiscountValue: pack.discountValue,
          packDiscountAmount: snapshot.discountTotal,
          packFinalPrice: snapshot.finalTotal,
          // Component-level figures (per unit).
          packListUnitPrice: c.listPrice,
          packDiscountShare: c.listPrice - allocation[idx],
        },
      },
    }));

    lines.push({ packGroupId, quantity: qty, snapshot, components });
  }

  if (priceChanged.length > 0) {
    return {
      ok: false,
      status: 409,
      body: {
        code: "PRICE_CHANGED",
        error: "The price of one of the items in your pack has changed. Your order total has been updated.",
        changes: priceChanged,
        packs: freshPacks,
      },
    };
  }

  return { ok: true, lines };
}
