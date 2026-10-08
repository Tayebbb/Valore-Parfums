/**
 * Server-side validation for admin pack writes (needs Firestore: perfume
 * existence, enabled decant size, slug uniqueness). The pure shape checks live
 * in ./pricing.ts#validatePackInput.
 */
import { db, Collections } from "@/lib/prisma";
import { getPricingConfig } from "@/lib/pricing-config";
import { fetchPerfumesByIds } from "./service";
import { validatePackInput } from "./pricing";
import type { Pack, PackInput } from "./types";

export type PrepareResult =
  | { ok: true; input: PackInput }
  | { ok: false; status: number; error: string; errors?: { field: string; message: string }[] };

/** Fields an admin may write. Anything else in the request body is ignored. */
export const PACK_WRITABLE_FIELDS = [
  "name",
  "slug",
  "description",
  "isActive",
  "sortOrder",
  "decantSizeMl",
  "perfumeIds",
  "discountType",
  "discountValue",
] as const;

/** Existing pack → the input shape (used to merge partial PUT bodies onto the stored pack). */
export function packToInput(pack: Pack): Record<string, unknown> {
  return {
    name: pack.name,
    slug: pack.slug,
    description: pack.description,
    isActive: pack.isActive,
    sortOrder: pack.sortOrder,
    decantSizeMl: pack.decantSizeMl,
    perfumeIds: pack.items.map((i) => i.perfumeId),
    discountType: pack.discountType,
    discountValue: pack.discountValue,
  };
}

export function pickWritable(body: unknown): Record<string, unknown> {
  const src = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of PACK_WRITABLE_FIELDS) {
    if (src[key] !== undefined) out[key] = src[key];
  }
  // Accept `items: [{perfumeId}]` as an alias of perfumeIds.
  if (out.perfumeIds === undefined && Array.isArray(src.items)) {
    out.perfumeIds = src.items.map((i: unknown) => (i && typeof i === "object" ? (i as { perfumeId?: unknown }).perfumeId : i));
  }
  return out;
}

export async function prepareAdminPack(body: unknown, existing?: Pack): Promise<PrepareResult> {
  const merged = { ...(existing ? packToInput(existing) : {}), ...pickWritable(body) };

  const validation = validatePackInput(merged);
  if (!validation.ok || !validation.value) {
    return {
      ok: false,
      status: 400,
      error: validation.errors[0]?.message || "Invalid pack",
      errors: validation.errors,
    };
  }
  const input = validation.value;

  const existingIds = new Set(existing?.items.map((i) => i.perfumeId) ?? []);
  const [perfumes, config] = await Promise.all([fetchPerfumesByIds(input.perfumeIds), getPricingConfig()]);

  const missing = input.perfumeIds.filter((id) => !perfumes.has(id));
  if (missing.length > 0) {
    return {
      ok: false,
      status: 400,
      error: "One or more selected perfumes do not exist",
      errors: [{ field: "perfumeIds", message: "One or more selected perfumes do not exist" }],
    };
  }
  const inactive = input.perfumeIds.filter((id) => !existingIds.has(id) && perfumes.get(id)?.isActive !== true);
  if (inactive.length > 0) {
    const names = inactive.map((id) => perfumes.get(id)?.name || id).join(", ");
    return {
      ok: false,
      status: 400,
      error: `Only active perfumes can be added to a pack (inactive: ${names})`,
      errors: [{ field: "perfumeIds", message: `Only active perfumes can be added to a pack (inactive: ${names})` }],
    };
  }

  const sizeEnabled = config.sizes.some((s: { ml: number }) => s.ml === input.decantSizeMl);
  if (!sizeEnabled && !(existing && existing.decantSizeMl === input.decantSizeMl)) {
    return {
      ok: false,
      status: 400,
      error: "The chosen decant size is not enabled",
      errors: [{ field: "decantSizeMl", message: "The chosen decant size is not enabled" }],
    };
  }

  const slugSnap = await db.collection(Collections.packs).where("slug", "==", input.slug).get();
  if (slugSnap.docs.some((d) => d.id !== existing?.id)) {
    return {
      ok: false,
      status: 409,
      error: "Another pack already uses this slug",
      errors: [{ field: "slug", message: "Another pack already uses this slug" }],
    };
  }

  return { ok: true, input };
}
