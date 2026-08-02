import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { toMinorUnits } from "@/lib/finance";
import { investmentAccounting } from "@/lib/investments/accountingService";

// GET all investments — admin only. Supports ?status= & ?investorId=
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const investorId = searchParams.get("investorId");

  let query: FirebaseFirestore.Query = db.collection(Collections.investments);
  if (investorId) query = query.where("investorId", "==", investorId);
  const snap = await query.get();

  let investments = snap.docs.map((d) => serializeDoc({ id: d.id, ...d.data() }));
  if (status) investments = investments.filter((i: { status?: string }) => i.status === status);
  investments.sort((a: { createdAt?: string }, b: { createdAt?: string }) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  );

  return NextResponse.json(investments);
}

// POST create investment — admin only.
// Body: {
//   investorId: string,
//   allocations: [{ perfumeId, ml, costPerMl (BDT major units) }],
//   profitSharePercentage?: number (0–100; defaults from settings),
//   notes?: string
// }
// The investment amount is DERIVED from allocations (never trusted from client).
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const investorId = String(body.investorId ?? "").trim();
    if (!investorId) {
      return NextResponse.json({ error: "investorId is required" }, { status: 400 });
    }
    const rawAllocations = Array.isArray(body.allocations) ? body.allocations : [];
    if (!rawAllocations.length) {
      return NextResponse.json(
        { error: "At least one allocation { perfumeId, ml, costPerMl } is required" },
        { status: 400 }
      );
    }

    const allocations: Array<{ perfumeId: string; ml: number; costPerMlMinor: number }> = [];
    for (const a of rawAllocations) {
      const perfumeId = String(a?.perfumeId ?? "").trim();
      const ml = Number(a?.ml);
      const costPerMl = Number(a?.costPerMl);
      if (!perfumeId || !Number.isFinite(ml) || ml <= 0 || !Number.isFinite(costPerMl) || costPerMl <= 0) {
        return NextResponse.json(
          { error: "Each allocation needs perfumeId, ml > 0 and costPerMl > 0" },
          { status: 400 }
        );
      }
      allocations.push({ perfumeId, ml: Math.round(ml), costPerMlMinor: toMinorUnits(costPerMl) });
    }

    const amountMinor = allocations.reduce((s, a) => s + a.ml * a.costPerMlMinor, 0);

    let profitSharePercentage: number | undefined;
    if (body.profitSharePercentage !== undefined && body.profitSharePercentage !== null) {
      profitSharePercentage = Number(body.profitSharePercentage);
      if (
        !Number.isFinite(profitSharePercentage) ||
        profitSharePercentage < 0 ||
        profitSharePercentage > 100
      ) {
        return NextResponse.json(
          { error: "profitSharePercentage must be between 0 and 100" },
          { status: 400 }
        );
      }
    }

    const { investmentId } = await investmentAccounting.createInvestment({
      investorId,
      allocations,
      amountMinor,
      profitSharePercentage,
      performedBy: admin.id,
      notes: String(body.notes ?? "").trim().slice(0, 1000),
    });

    const doc = await db.collection(Collections.investments).doc(investmentId).get();
    return NextResponse.json(serializeDoc({ id: investmentId, ...doc.data() }), { status: 201 });
  } catch (error) {
    console.error("Create investment failed:", error);
    const message = error instanceof Error ? error.message : "Failed to create investment";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
