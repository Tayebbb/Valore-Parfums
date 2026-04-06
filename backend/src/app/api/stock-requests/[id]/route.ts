import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";

function mapStockRequestStatusToOrderStatus(status: string): string {
  if (status === "Fulfilled") return "Ready";
  if (status === "Declined") return "Cancelled";
  if (status === "Pending") return "Sourcing";
  return status;
}

// PUT update stock request — admin only
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  await db.collection(Collections.stockRequests).doc(id).update(body);
  if (body.status) {
    await db.collection(Collections.orders).doc(id).set({ status: mapStockRequestStatusToOrderStatus(String(body.status)), updatedAt: Timestamp.now() }, { merge: true });
  }
  const doc = await db.collection(Collections.stockRequests).doc(id).get();
  return NextResponse.json(serializeDoc({ id, ...doc.data() }));
}
