import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { toMinorUnits } from "@/lib/finance";
import { investmentAccounting } from "@/lib/investments/accountingService";

// POST a cash deposit into the investor's unallocated capital pool — admin only.
// Body: { amount (BDT major), notes? }. The pool is drawn down automatically
// when inventory is added with this investor selected as the funding source.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const body = await req.json();
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount must be positive" }, { status: 400 });
    }

    const { newPoolMinor } = await investmentAccounting.addCapital({
      investorId: id,
      amountMinor: toMinorUnits(amount),
      performedBy: admin.id,
      notes: String(body.notes ?? "").trim().slice(0, 500),
    });

    const doc = await db.collection(Collections.investors).doc(id).get();
    return NextResponse.json(
      serializeDoc({ id, ...doc.data(), newPoolMinor }),
      { status: 201 }
    );
  } catch (error) {
    console.error("Add capital failed:", error);
    const message = error instanceof Error ? error.message : "Failed to add capital";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
