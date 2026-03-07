import { NextResponse } from "next/server";
// Updated: replaced Prisma with Firestore Admin SDK
import { db, Collections, serializeDoc } from "@/lib/prisma";

// PUT update stock request (replaces prisma.stockRequest.update)
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  await db.collection(Collections.stockRequests).doc(id).update(body);
  const doc = await db.collection(Collections.stockRequests).doc(id).get();
  return NextResponse.json(serializeDoc({ id, ...doc.data() }));
}
