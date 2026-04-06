import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";

// GET all vouchers — admin only
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const snap = await db.collection(Collections.vouchers).orderBy("createdAt", "desc").get();
  const vouchers = snap.docs.map((d) => serializeDoc({ id: d.id, ...d.data() }));
  return NextResponse.json(vouchers);
}

// POST create voucher — admin only
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
