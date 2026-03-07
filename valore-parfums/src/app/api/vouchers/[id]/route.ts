import { NextResponse } from "next/server";
// Updated: replaced Prisma with Firestore Admin SDK
import { db, Collections, serializeDoc } from "@/lib/prisma";

// PUT update voucher (replaces prisma.voucher.update)
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  await db.collection(Collections.vouchers).doc(id).update(body);
  const doc = await db.collection(Collections.vouchers).doc(id).get();
  return NextResponse.json(serializeDoc({ id, ...doc.data() }));
}

// DELETE voucher (replaces prisma.voucher.delete)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.collection(Collections.vouchers).doc(id).delete();
  return NextResponse.json({ success: true });
}
