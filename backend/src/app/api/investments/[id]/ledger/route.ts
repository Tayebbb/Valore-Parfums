import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// GET immutable ledger for one investment — admin only.
// Supports ?stream=capital|profit|none and ?type=<LedgerEntryType>.
// Sorted in memory (newest first) to avoid a composite Firestore index.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { searchParams } = new URL(req.url);
  const stream = searchParams.get("stream");
  const type = searchParams.get("type");

  const snap = await db
    .collection(Collections.investmentTransactions)
    .where("investmentId", "==", id)
    .get();

  let entries = snap.docs.map((d) => serializeDoc({ id: d.id, ...d.data() }));
  if (stream) entries = entries.filter((e: { stream?: string }) => e.stream === stream);
  if (type) entries = entries.filter((e: { type?: string }) => e.type === type);
  entries.sort((a: { createdAt?: string }, b: { createdAt?: string }) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  );

  return NextResponse.json(entries);
}
