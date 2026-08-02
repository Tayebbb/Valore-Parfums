import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";

// GET one investor with their investments — admin only
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const doc = await db.collection(Collections.investors).doc(id).get();
  if (!doc.exists) return NextResponse.json({ error: "Investor not found" }, { status: 404 });

  const invSnap = await db
    .collection(Collections.investments)
    .where("investorId", "==", id)
    .get();
  const investments = invSnap.docs
    .map((d) => serializeDoc({ id: d.id, ...d.data() }))
    .sort((a: { createdAt?: string }, b: { createdAt?: string }) =>
      String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
    );

  return NextResponse.json(serializeDoc({ id: doc.id, ...doc.data(), investments }));
}

// PUT update investor profile fields — admin only.
// Financial totals are ledger-derived and NOT editable here.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const ref = db.collection(Collections.investors).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: "Investor not found" }, { status: 404 });

    const body = await req.json();
    const updates: Record<string, unknown> = { updatedAt: Timestamp.now() };
    if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
    if (typeof body.phone === "string") updates.phone = body.phone.trim();
    if (typeof body.notes === "string") updates.notes = body.notes.trim().slice(0, 1000);
    if (body.status === "active" || body.status === "inactive") updates.status = body.status;
    if (typeof body.userId === "string" || body.userId === null) updates.userId = body.userId;

    await ref.update(updates);

    await logAudit({
      action: AUDIT_ACTIONS.INVESTOR_UPDATED,
      userId: admin.id,
      userEmail: admin.email,
      userName: admin.name || "",
      resource: "investor",
      resourceId: id,
      changes: {},
      details: updates,
      status: "success",
    });

    const updated = await ref.get();
    return NextResponse.json(serializeDoc({ id, ...updated.data() }));
  } catch (error) {
    console.error("Update investor failed:", error);
    return NextResponse.json({ error: "Failed to update investor" }, { status: 500 });
  }
}
