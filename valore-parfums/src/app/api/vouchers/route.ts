import { NextResponse } from "next/server";
// Updated: replaced Prisma with Firestore Admin SDK
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";

// GET all vouchers (replaces prisma.voucher.findMany)
export async function GET() {
  const snap = await db.collection(Collections.vouchers).orderBy("createdAt", "desc").get();
  const vouchers = snap.docs.map((d) => serializeDoc({ id: d.id, ...d.data() }));
  return NextResponse.json(vouchers);
}

// POST create voucher (replaces prisma.voucher.create)
export async function POST(req: Request) {
  const body = await req.json();
  const id = uuid();
  const data = {
    ...body,
    expiresAt: body.expiresAt ? Timestamp.fromDate(new Date(body.expiresAt)) : null,
    createdAt: Timestamp.now(),
  };
  await db.collection(Collections.vouchers).doc(id).set(data);
  return NextResponse.json(serializeDoc({ id, ...data }), { status: 201 });
}
