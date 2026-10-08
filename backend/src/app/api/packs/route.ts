import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";
import { db, Collections } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { invalidatePackCaches } from "@/lib/api-cache";
import { getPublicPacks, docToPack, resolvePacks, toAdminPack } from "@/lib/packs/service";
import { prepareAdminPack } from "@/lib/packs/admin";

const PACKS_CACHE_CONTROL = "public, s-maxage=20, stale-while-revalidate=60";

// GET active packs — PUBLIC. Prices and availability are computed server-side
// from the current perfume prices; no stock levels / costs are exposed.
export async function GET() {
  try {
    const packs = await getPublicPacks();
    return NextResponse.json(packs, { headers: { "Cache-Control": PACKS_CACHE_CONTROL } });
  } catch (error) {
    console.error("packs GET failed", error);
    return NextResponse.json([], { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

// POST create pack — admin only
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const prepared = await prepareAdminPack(body);
  if (!prepared.ok) {
    return NextResponse.json({ error: prepared.error, errors: prepared.errors }, { status: prepared.status });
  }
  const { input } = prepared;

  const id = uuid();
  const now = Timestamp.now();
  const data = {
    name: input.name,
    slug: input.slug,
    description: input.description,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
    decantSizeMl: input.decantSizeMl,
    items: input.perfumeIds.map((perfumeId) => ({ perfumeId })),
    discountType: input.discountType,
    discountValue: input.discountValue,
    createdAt: now,
    updatedAt: now,
  };
  await db.collection(Collections.packs).doc(id).set(data);
  invalidatePackCaches();

  const [resolved] = await resolvePacks([docToPack(id, data)]);
  return NextResponse.json(toAdminPack(resolved), { status: 201 });
}
