import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";

// GET all withdrawals — admin only
// Supports ?ownerName=Tayeb filter
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const ownerName = searchParams.get("ownerName");

  const snap = await db.collection(Collections.withdrawals).orderBy("createdAt", "desc").get();
  let withdrawals = snap.docs.map((doc) => serializeDoc({ id: doc.id, ...doc.data() }));

  if (ownerName) {
    withdrawals = withdrawals.filter((w: { ownerName?: string }) => w.ownerName === ownerName);
  }

  return NextResponse.json(withdrawals);
}

// POST create withdrawal — admin only
// Requires ownerName to specify which owner is withdrawing
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { amount, note, ownerName } = body;

  if (!amount || typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
  }
  if (!ownerName || typeof ownerName !== "string") {
    return NextResponse.json({ error: "ownerName is required" }, { status: 400 });
  }

  // Enforce: admin can only withdraw from their own account (verified by email against settings)
  const settingsDoc = await db.collection(Collections.settings).doc("default").get();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = settingsDoc.exists ? (settingsDoc.data() as any) : null;
  const ownerEmail =
    ownerName === (settings?.owner1Name ?? "Tayeb") ? settings?.owner1Email :
    ownerName === (settings?.owner2Name ?? "Enid") ? settings?.owner2Email : null;

  if (!ownerEmail) {
    return NextResponse.json({ error: "Owner account not properly configured or unrecognized" }, { status: 403 });
  }

  if (admin.email.toLowerCase() !== ownerEmail.toLowerCase()) {
    return NextResponse.json({ error: "You can only withdraw from your own account" }, { status: 403 });
  }

  // Validate available balance
  const accountDoc = await db.collection(Collections.ownerAccounts).doc(ownerName).get();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const account = accountDoc.exists ? (accountDoc.data() as any) : { totalEarned: 0, storeShareEarned: 0 };
  const totalEarned = (account.totalEarned || 0) + (account.storeShareEarned || 0);

  // Sum existing withdrawals for this owner (query only this owner's records)
  const wSnap = await db.collection(Collections.withdrawals).where("ownerName", "==", ownerName).get();
  const totalWithdrawn = wSnap.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);

  const available = totalEarned - totalWithdrawn;
  if (amount > available) {
    return NextResponse.json({ error: `Insufficient balance. Available: ${Math.round(available)} BDT` }, { status: 400 });
  }

  const id = uuid();
  const now = Timestamp.now();
  const data = {
    amount,
    ownerName: String(ownerName).slice(0, 100),
    note: String(note || "").slice(0, 500),
    withdrawnBy: admin.name,
    createdAt: now,
  };

  await db.collection(Collections.withdrawals).doc(id).set(data);

  // Record withdrawal as a profit transaction (negative)
  const txId = uuid();
  await db.collection(Collections.profitTransactions).doc(txId).set({
    orderId: null,
    ownerName,
    type: "withdrawal",
    amount: -amount,
    description: `Withdrawal by ${admin.name}${note ? `: ${String(note).slice(0, 200)}` : ""}`,
    createdAt: now,
  });

  return NextResponse.json(serializeDoc({ id, ...data }), { status: 201 });
}
