import { NextResponse } from "next/server";
import { db, Collections } from "@/lib/prisma";
import { docToPack, resolvePacks, toPublicPack } from "@/lib/packs/service";
import { PACK_MAX_QUANTITY } from "@/lib/packs/types";
import type { PackPublic } from "@/lib/packs/types";

export interface PackQuote {
  id: string;
  /** false when the pack was deleted, deactivated, or cannot be fulfilled right now. */
  available: boolean;
  /** Present only while the pack exists and is active. */
  pack?: PackPublic;
}

// POST { packs: [{ id, quantity }] } — PUBLIC. Fresh (uncached) authoritative
// pricing + availability for the packs sitting in a customer's cart, so the cart
// and checkout never rely on stale localStorage prices. Checkout still
// recomputes everything again server-side in POST /api/orders.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const requested: { id: string; quantity: number }[] = Array.isArray(body?.packs)
    ? body.packs
      .filter((p: unknown): p is { id: string; quantity?: unknown } => Boolean(p) && typeof (p as { id?: unknown }).id === "string")
      .map((p: { id: string; quantity?: unknown }) => ({
        id: p.id,
        quantity: Math.min(PACK_MAX_QUANTITY, Math.max(1, Math.floor(Number(p.quantity) || 1))),
      }))
    : [];
  if (requested.length === 0 || requested.length > 20) {
    return NextResponse.json({ error: "packs must be a list of 1–20 { id, quantity }" }, { status: 400 });
  }

  const ids = [...new Set(requested.map((p) => p.id))];
  const docs = await db.getAll(...ids.map((id) => db.collection(Collections.packs).doc(id)));
  const packs = docs
    .filter((d) => d.exists)
    .map((d) => docToPack(d.id, d.data() as Record<string, unknown>))
    .filter((p) => p.isActive && p.items.length > 0);

  const quantities = new Map(requested.map((p) => [p.id, p.quantity]));
  const resolved = await resolvePacks(packs, quantities);
  const byId = new Map(resolved.map((r) => [r.pack.id, toPublicPack(r)]));

  const quotes: PackQuote[] = ids.map((id) => {
    const pack = byId.get(id);
    return pack ? { id, available: pack.available, pack } : { id, available: false };
  });
  return NextResponse.json(quotes, { headers: { "Cache-Control": "no-store" } });
}
