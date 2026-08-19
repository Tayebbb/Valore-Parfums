import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { requireInvestor, normalizeEmail } from "@/lib/auth";
import type { InvestmentDoc } from "@/lib/investments/types";

/** Resolve the investor id linked to the session (userId first, then email). */
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

// GET one of the investor's OWN investments with allocations and ledger.
// Ownership is enforced server-side (session → investorId → doc.investorId).
// Supports ?type= and ?stream= ledger filters.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireInvestor();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const ownInvestorId = await resolveOwnInvestorId(user.id, user.email);
  if (!ownInvestorId) {
    return NextResponse.json({ error: "No investor profile linked to this account" }, { status: 404 });
  }

  const doc = await db.collection(Collections.investments).doc(id).get();
  if (!doc.exists) return NextResponse.json({ error: "Investment not found" }, { status: 404 });
  const investment = doc.data() as InvestmentDoc;

  // IDOR guard: 404 (not 403) so investment IDs cannot be enumerated.
  if (investment.investorId !== ownInvestorId) {
    return NextResponse.json({ error: "Investment not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const stream = searchParams.get("stream");

  const [allocSnap, ledgerSnap] = await Promise.all([
    db.collection(Collections.investmentAllocations).where("investmentId", "==", id).get(),
    db.collection(Collections.investmentTransactions).where("investmentId", "==", id).get(),
  ]);

  const allocations = allocSnap.docs.map((d) => serializeDoc({ id: d.id, ...d.data() }));
  let ledger = ledgerSnap.docs.map((d) => serializeDoc({ id: d.id, ...d.data() }));
  if (type) ledger = ledger.filter((e: { type?: string }) => e.type === type);
  if (stream) ledger = ledger.filter((e: { stream?: string }) => e.stream === stream);
  ledger.sort((a: { createdAt?: string }, b: { createdAt?: string }) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  );

  return NextResponse.json(serializeDoc({ id: doc.id, ...investment, allocations, ledger }));
}
