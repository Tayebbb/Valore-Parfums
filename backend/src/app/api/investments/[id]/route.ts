import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { toMinorUnits } from "@/lib/finance";
import { investmentAccounting } from "@/lib/investments/accountingService";

// GET one investment with allocations — admin only
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const doc = await db.collection(Collections.investments).doc(id).get();
  if (!doc.exists) return NextResponse.json({ error: "Investment not found" }, { status: 404 });

  const allocSnap = await db
    .collection(Collections.investmentAllocations)
    .where("investmentId", "==", id)
    .get();
  const allocations = allocSnap.docs.map((d) => serializeDoc({ id: d.id, ...d.data() }));

  return NextResponse.json(serializeDoc({ id: doc.id, ...doc.data(), allocations }));
}

// PUT — admin only. The ONLY direct mutation allowed is a ledgered adjustment.
// Balances/status are otherwise controlled exclusively by the services.
// Body: { adjustment: { stream: "capital"|"profit", amount: number (BDT, signed), reason: string } }
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const body = await req.json();
    const adjustment = body?.adjustment;
    if (!adjustment) {
      return NextResponse.json(
        { error: "Only { adjustment } is supported. Balances are ledger-controlled." },
        { status: 400 }
      );
    }
    const amount = Number(adjustment.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      return NextResponse.json({ error: "adjustment.amount must be a non-zero number" }, { status: 400 });
    }

    await investmentAccounting.recordAdjustment({
      investmentId: id,
      stream: adjustment.stream,
      amountMinor: toMinorUnits(amount),
      reason: String(adjustment.reason ?? ""),
      performedBy: admin.id,
    });

    const doc = await db.collection(Collections.investments).doc(id).get();
    return NextResponse.json(serializeDoc({ id, ...doc.data() }));
  } catch (error) {
    console.error("Investment adjustment failed:", error);
    const message = error instanceof Error ? error.message : "Adjustment failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
