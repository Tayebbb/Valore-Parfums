import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { requireInvestor, getSessionUser, normalizeEmail } from "@/lib/auth";
import { toMinorUnits } from "@/lib/finance";
import { investmentWithdrawals } from "@/lib/investments/withdrawalService";

/** Resolve the investor doc linked to the current session (userId or email). */
async function resolveOwnInvestorId(userId: string, email: string): Promise<string | null> {
  const byUser = await db
    .collection(Collections.investors)
    .where("userId", "==", userId)
    .limit(1)
    .get();
  if (!byUser.empty) return byUser.docs[0].id;
  const byEmail = await db
    .collection(Collections.investors)
    .where("email", "==", normalizeEmail(email))
    .limit(1)
    .get();
  return byEmail.empty ? null : byEmail.docs[0].id;
}

// GET withdrawal requests.
// Admin: all (with ?status= / ?investorId= filters). Investor: own only.
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  let investorFilter: string | null = null;
  if (user.role === "admin") {
    investorFilter = searchParams.get("investorId");
  } else if (user.role === "investor") {
    // IDOR guard: investors can ONLY see their own requests.
    investorFilter = await resolveOwnInvestorId(user.id, user.email);
    if (!investorFilter) return NextResponse.json([]);
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let query: FirebaseFirestore.Query = db.collection(Collections.investmentWithdrawals);
  if (investorFilter) query = query.where("investorId", "==", investorFilter);
  const snap = await query.get();

  let rows = snap.docs.map((d) => serializeDoc({ id: d.id, ...d.data() }));
  if (status) rows = rows.filter((r: { status?: string }) => r.status === status);
  rows.sort((a: { createdAt?: string }, b: { createdAt?: string }) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  );

  return NextResponse.json(rows);
}

// POST create withdrawal request — investor (own investments) or admin.
// Body: { investmentId, amount (BDT), paymentSource: "Bkash"|"Bank"|"Cash", notes? }
export async function POST(req: Request) {
  const user = await requireInvestor(); // passes for investor OR admin
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const investmentId = String(body.investmentId ?? "").trim();
    const amount = Number(body.amount);
    const paymentSource = String(body.paymentSource ?? "Bkash");
    if (!investmentId) {
      return NextResponse.json({ error: "investmentId is required" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount must be positive" }, { status: 400 });
    }
    if (!["Bkash", "Bank", "Cash"].includes(paymentSource)) {
      return NextResponse.json({ error: "Invalid paymentSource" }, { status: 400 });
    }

    // Investors are locked to their own investments; admin may act for anyone.
    let restrictToInvestorId: string | undefined;
    if (user.role !== "admin") {
      const ownId = await resolveOwnInvestorId(user.id, user.email);
      if (!ownId) {
        return NextResponse.json({ error: "No investor profile linked to this account" }, { status: 403 });
      }
      restrictToInvestorId = ownId;
    }

    const { withdrawalId } = await investmentWithdrawals.request({
      investmentId,
      amountMinor: toMinorUnits(amount),
      paymentSource: paymentSource as "Bkash" | "Bank" | "Cash",
      requestedBy: user.id,
      restrictToInvestorId,
      notes: String(body.notes ?? "").trim().slice(0, 500),
    });

    const doc = await db.collection(Collections.investmentWithdrawals).doc(withdrawalId).get();
    return NextResponse.json(serializeDoc({ id: withdrawalId, ...doc.data() }), { status: 201 });
  } catch (error) {
    console.error("Withdrawal request failed:", error);
    const message = error instanceof Error ? error.message : "Withdrawal request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
