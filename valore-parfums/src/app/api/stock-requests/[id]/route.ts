import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// PUT update stock request — admin only
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  await db.collection(Collections.stockRequests).doc(id).update(body);
  const doc = await db.collection(Collections.stockRequests).doc(id).get();
  return NextResponse.json(serializeDoc({ id, ...doc.data() }));
}
