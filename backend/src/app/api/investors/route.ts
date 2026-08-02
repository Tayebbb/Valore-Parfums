import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { requireAdmin, normalizeEmail } from "@/lib/auth";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";
import type { InvestorDoc } from "@/lib/investments/types";

// GET all investors — admin only. Supports ?status=active|inactive
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const snap = await db.collection(Collections.investors).get();
  let investors = snap.docs.map((d) => serializeDoc({ id: d.id, ...d.data() }));
  if (status) investors = investors.filter((i: { status?: string }) => i.status === status);
  investors.sort((a: { name?: string }, b: { name?: string }) =>
    String(a.name || "").localeCompare(String(b.name || ""))
  );

  return NextResponse.json(investors);
}

// POST create investor — admin only
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const email = normalizeEmail(String(body.email ?? ""));
    const phone = String(body.phone ?? "").trim();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

    // Reject duplicate emails.
    const dup = await db
      .collection(Collections.investors)
      .where("email", "==", email)
      .limit(1)
      .get();
    if (!dup.empty) {
      return NextResponse.json(
        { error: "An investor with this email already exists" },
        { status: 400 }
      );
    }

    // Optional link to an existing user account (enables investor dashboard).
    let userId: string | null = null;
    const userSnap = await db
      .collection(Collections.users)
      .where("email", "==", email)
      .limit(1)
      .get();
    if (!userSnap.empty) userId = userSnap.docs[0].id;

    const now = Timestamp.now();
    const investor: InvestorDoc = {
      name,
      email,
      phone,
      userId,
      status: "active",
      notes: String(body.notes ?? "").trim().slice(0, 1000),
      totalInvestedMinor: 0,
      totalRecoveredCapitalMinor: 0,
      totalProfitMinor: 0,
      totalWithdrawnMinor: 0,
      activeInvestmentCount: 0,
      completedInvestmentCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    const ref = await db.collection(Collections.investors).add(investor);

    await logAudit({
      action: AUDIT_ACTIONS.INVESTOR_CREATED,
      userId: admin.id,
      userEmail: admin.email,
      userName: admin.name || "",
      resource: "investor",
      resourceId: ref.id,
      changes: {},
      details: { name, email, linkedUserId: userId },
      status: "success",
    });

    return NextResponse.json(serializeDoc({ id: ref.id, ...investor }), { status: 201 });
  } catch (error) {
    console.error("Create investor failed:", error);
    return NextResponse.json({ error: "Failed to create investor" }, { status: 500 });
  }
}
