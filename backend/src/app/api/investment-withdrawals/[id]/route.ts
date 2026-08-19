import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { investmentWithdrawals } from "@/lib/investments/withdrawalService";

// PUT decide a withdrawal request — admin only.
// Body: { action: "approve" | "reject" | "paid", reason? }
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const body = await req.json();
    const action = String(body.action ?? "");

    if (action === "approve") {
      await investmentWithdrawals.approve({ withdrawalId: id, decidedBy: admin.id });
    } else if (action === "reject") {
      await investmentWithdrawals.reject({
        withdrawalId: id,
        decidedBy: admin.id,
        reason: String(body.reason ?? ""),
      });
    } else if (action === "paid") {
      await investmentWithdrawals.markPaid({ withdrawalId: id, decidedBy: admin.id });
    } else {
      return NextResponse.json(
        { error: "action must be approve, reject, or paid" },
        { status: 400 }
      );
    }

    const doc = await db.collection(Collections.investmentWithdrawals).doc(id).get();
    return NextResponse.json(serializeDoc({ id, ...doc.data() }));
  } catch (error) {
    console.error("Withdrawal decision failed:", error);
    const message = error instanceof Error ? error.message : "Decision failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
