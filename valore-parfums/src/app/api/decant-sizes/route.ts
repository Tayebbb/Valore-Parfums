import { NextResponse } from "next/server";
// Updated: replaced Prisma with Firestore Admin SDK
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";

// GET all decant sizes — Firestore query ordered by ml (replaces prisma.decantSize.findMany)
export async function GET() {
  const snap = await db.collection(Collections.decantSizes).orderBy("ml", "asc").get();
  const sizes = snap.docs.map((d) => serializeDoc({ id: d.id, ...d.data() }));
  return NextResponse.json(sizes);
}

// POST create decant size — Firestore doc set (replaces prisma.decantSize.create)
export async function POST(req: Request) {
  const body = await req.json();
  const id = uuid();
  const data = { ...body, createdAt: Timestamp.now() };
  await db.collection(Collections.decantSizes).doc(id).set(data);
  return NextResponse.json(serializeDoc({ id, ...data }), { status: 201 });
}
