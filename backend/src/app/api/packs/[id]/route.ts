import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { db, Collections } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { invalidatePackCaches } from "@/lib/api-cache";
import { docToPack, getPublicPacks, resolvePacks, toAdminPack } from "@/lib/packs/service";
import { prepareAdminPack } from "@/lib/packs/admin";

const PACKS_CACHE_CONTROL = "public, s-maxage=20, stale-while-revalidate=60";

// GET one ACTIVE pack by id or slug — PUBLIC (served from the shared pricing pass).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const packs = await getPublicPacks();
    const pack = packs.find((p) => p.id === id || p.slug === id);
    if (!pack) return NextResponse.json({ error: "Pack not found" }, { status: 404 });
    return NextResponse.json(pack, { headers: { "Cache-Control": PACKS_CACHE_CONTROL } });
  } catch (error) {
    console.error("packs/[id] GET failed", error);
    return NextResponse.json({ error: "Failed to load pack" }, { status: 500 });
  }
}

// PUT update pack — admin only. Body fields are merged onto the stored pack
// and the whole result is re-validated, so partial updates (e.g. the active
// toggle) are safe.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ref = db.collection(Collections.packs).doc(id);
  const doc = await ref.get();
  if (!doc.exists) return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  const existing = docToPack(doc.id, doc.data() as Record<string, unknown>);

  const body = await req.json().catch(() => null);
  const prepared = await prepareAdminPack(body, existing);
  if (!prepared.ok) {
    return NextResponse.json({ error: prepared.error, errors: prepared.errors }, { status: prepared.status });
  }
  const { input } = prepared;

  const update = {
    name: input.name,
    slug: input.slug,
    description: input.description,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
    decantSizeMl: input.decantSizeMl,
    items: input.perfumeIds.map((perfumeId) => ({ perfumeId })),
    discountType: input.discountType,
    discountValue: input.discountValue,
    updatedAt: Timestamp.now(),
  };
  // Historical orders embed their own pack snapshot, so editing a pack can never alter them.
  await ref.update(update);
  invalidatePackCaches();

  const [resolved] = await resolvePacks([docToPack(id, { ...doc.data(), ...update })]);
  return NextResponse.json(toAdminPack(resolved));
}

// DELETE pack — admin only. Removes ONLY the pack document: perfumes and
// existing orders (which carry full pack snapshots) are untouched.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ref = db.collection(Collections.packs).doc(id);
  const doc = await ref.get();
  if (!doc.exists) return NextResponse.json({ error: "Pack not found" }, { status: 404 });

  await ref.delete();
  invalidatePackCaches();
  return NextResponse.json({ success: true });
}
