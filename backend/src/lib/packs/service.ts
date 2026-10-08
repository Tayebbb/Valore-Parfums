/**
 * Server-side pack resolution: turns stored pack docs into priced, availability-
 * checked structures using the CANONICAL decant pricing (lib/pricing-engine.ts).
 *
 * One batch read of every referenced perfume + the cached pricing config is
 * shared across all packs (no per-pack / per-component Firestore round trips).
 *
 * The order path (api/orders) calls resolvePack() too, so the price a customer
 * sees and the price they are charged come from the same code.
 */
import { db, Collections } from "@/lib/prisma";
import { apiCache } from "@/lib/api-cache";
import { getPricingConfig } from "@/lib/pricing-config";
import type { PricingConfig } from "@/lib/api-cache";
import { buildCanonicalProductPath } from "@/lib/seo-catalog";
import { resolvePack as resolvePackPure, toPublicPack } from "./resolve";
import type { PerfumeRecord, ResolvedPack } from "./resolve";
import type { Pack, PackPublic } from "./types";

// Re-export the pure mappers/types (resolvePack is wrapped below to inject storefront paths).
export { toAdminPack, toPublicPack } from "./resolve";
export type { PerfumeRecord, ResolvedComponent, ResolvedPack } from "./resolve";

/* eslint-disable @typescript-eslint/no-explicit-any */
const PACKS_PUBLIC_TTL = 20_000;

// ── Firestore → domain ─────────────────────────────────────────────

export function docToPack(id: string, data: Record<string, any>): Pack {
  const items = Array.isArray(data.items)
    ? data.items
      .map((i: any) => ({ perfumeId: typeof i?.perfumeId === "string" ? i.perfumeId : "" }))
      .filter((i: { perfumeId: string }) => i.perfumeId)
    : [];
  return {
    id,
    name: String(data.name || ""),
    slug: String(data.slug || ""),
    description: String(data.description || ""),
    isActive: data.isActive === true,
    sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0,
    decantSizeMl: Number(data.decantSizeMl) || 0,
    items,
    discountType: data.discountType === "fixed" ? "fixed" : "percentage",
    discountValue: Number(data.discountValue) || 0,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
}

export async function loadAllPacks(): Promise<Pack[]> {
  const snap = await db.collection(Collections.packs).get();
  return snap.docs
    .map((d) => docToPack(d.id, d.data()))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** Batch-read perfumes by id with `getAll` (chunked). Missing ids are simply absent. */
export async function fetchPerfumesByIds(ids: string[]): Promise<Map<string, PerfumeRecord>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, PerfumeRecord>();
  const CHUNK = 100;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const refs = unique.slice(i, i + CHUNK).map((id) => db.collection(Collections.perfumes).doc(id));
    const docs = await db.getAll(...refs);
    for (const doc of docs) {
      if (doc.exists) map.set(doc.id, { id: doc.id, ...doc.data() } as PerfumeRecord);
    }
  }
  return map;
}

/** Storefront path of a perfume, built with the same canonical helper the catalog uses. */
function perfumePath(perfume: PerfumeRecord): string {
  return buildCanonicalProductPath({
    name: String(perfume.name || ""),
    brand: String(perfume.brand || ""),
    slug: perfume.slug,
    brandSlug: perfume.brandSlug,
  });
}

/** resolvePack with storefront paths wired in. */
export function resolvePack(
  pack: Pack,
  perfumes: Map<string, PerfumeRecord>,
  config: PricingConfig,
  quantity = 1,
): ResolvedPack {
  return resolvePackPure(pack, perfumes, config, quantity, perfumePath);
}

/** Resolve many packs with ONE perfume batch read and ONE (cached) config read. */
export async function resolvePacks(packs: Pack[], quantities?: Map<string, number>): Promise<ResolvedPack[]> {
  const [config, perfumes] = await Promise.all([
    getPricingConfig(),
    fetchPerfumesByIds(packs.flatMap((p) => p.items.map((i) => i.perfumeId))),
  ]);
  return packs.map((p) => resolvePack(p, perfumes, config, quantities?.get(p.id) ?? 1));
}

// ── Cached public list ─────────────────────────────────────────────

/** Active packs, priced + availability-checked, sorted by display order. 20 s cache. */
export async function getPublicPacks(): Promise<PackPublic[]> {
  const cached = apiCache.packsPublic;
  if (cached && Date.now() - cached.ts < PACKS_PUBLIC_TTL) return cached.data as PackPublic[];

  const packs = (await loadAllPacks()).filter((p) => p.isActive && p.items.length > 0);
  const resolved = await resolvePacks(packs);
  const data = resolved.map(toPublicPack);
  apiCache.packsPublic = { data, ts: Date.now() };
  return data;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
