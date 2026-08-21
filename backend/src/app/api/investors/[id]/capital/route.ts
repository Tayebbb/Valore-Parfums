import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { toMinorUnits } from "@/lib/finance";
import { investmentAccounting } from "@/lib/investments/accountingService";

// Domain rejections stay 400; anything else (Firestore outage etc.) is a 500.
const DOMAIN_ERROR_RE = /amount|correction|note|Investor not found|not active|exceeds/i;

// POST a cash deposit into the investor's unallocated capital pool — admin only.
// Body: { amount (BDT major; NEGATIVE = correction of a mistaken deposit),
//         notes?, idempotencyKey? (retries of the same submission are no-ops) }.
// The pool is drawn down automatically when inventory is added with this
// investor selected as the funding source.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const body = await req.json();
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      return NextResponse.json({ error: "amount must be a non-zero number" }, { status: 400 });
    }

    const { newPoolMinor, duplicate } = await investmentAccounting.addCapital({
      investorId: id,
      amountMinor: toMinorUnits(amount),
      performedBy: admin.id,
      notes: String(body.notes ?? "").trim().slice(0, 500),
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
    });

    const doc = await db.collection(Collections.investors).doc(id).get();
    return NextResponse.json(
      serializeDoc({ id, ...doc.data(), newPoolMinor, duplicate }),
      { status: duplicate ? 200 : 201 }
    );
  } catch (error) {
    console.error("Add capital failed:", error);
    const message = error instanceof Error ? error.message : "Failed to add capital";
    return NextResponse.json({ error: message }, { status: DOMAIN_ERROR_RE.test(message) ? 400 : 500 });
  }
}
