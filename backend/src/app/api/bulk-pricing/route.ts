import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";

// GET all bulk pricing rules — Firestore query (replaces prisma.bulkPricingRule.findMany)
export async function GET() {
  const snap = await db.collection(Collections.bulkPricingRules).orderBy("minQuantity", "asc").get();
  const rules = snap.docs.map((d) => serializeDoc({ id: d.id, ...d.data() }));
  return NextResponse.json(rules);
}

// POST create rule — admin only
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const id = uuid();
  const data = {
    minQuantity: body.minQuantity || 2,
    discountPercent: body.discountPercent || 0,
    isActive: body.isActive ?? true,
    createdAt: Timestamp.now(),
  };
  await db.collection(Collections.bulkPricingRules).doc(id).set(data);
  return NextResponse.json(serializeDoc({ id, ...data }), { status: 201 });
}

// PUT update rule — admin only
export async function PUT(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { id, ...data } = body;
  await db.collection(Collections.bulkPricingRules).doc(id).update(data);
  const doc = await db.collection(Collections.bulkPricingRules).doc(id).get();
  return NextResponse.json(serializeDoc({ id, ...doc.data() }));
}

// DELETE rule — admin only
export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.collection(Collections.bulkPricingRules).doc(id).delete();
  return NextResponse.json({ success: true });
}
