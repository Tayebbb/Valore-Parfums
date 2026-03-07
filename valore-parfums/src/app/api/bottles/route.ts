import { NextResponse } from "next/server";
// Updated: replaced Prisma with Firestore Admin SDK
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";

// GET all bottles — Firestore query ordered by ml (replaces prisma.bottleInventory.findMany)
export async function GET() {
  const snap = await db.collection(Collections.bottles).orderBy("ml", "asc").get();
  const bottles = snap.docs.map((d) => serializeDoc({ id: d.id, ...d.data() }));
  return NextResponse.json(bottles);
}

// POST create bottle — Firestore doc set (replaces prisma.bottleInventory.create)
export async function POST(req: Request) {
  const body = await req.json();
  const id = uuid();
  const now = Timestamp.now();
  const data = { ...body, createdAt: now, updatedAt: now };
  await db.collection(Collections.bottles).doc(id).set(data);
  return NextResponse.json(serializeDoc({ id, ...data }), { status: 201 });
}
