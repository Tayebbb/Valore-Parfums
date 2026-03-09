import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";

// GET all bottles — Firestore query ordered by ml (replaces prisma.bottleInventory.findMany)
export async function GET() {
  const snap = await db.collection(Collections.bottles).orderBy("ml", "asc").get();
  const bottles = snap.docs.map((d) => serializeDoc({ id: d.id, ...d.data() }));
  return NextResponse.json(bottles);
}

// POST create bottle — admin only
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const id = uuid();
  const now = Timestamp.now();
  const data = { ...body, createdAt: now, updatedAt: now };
  await db.collection(Collections.bottles).doc(id).set(data);
  return NextResponse.json(serializeDoc({ id, ...data }), { status: 201 });
}
