import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";

function mapRequestStatusToOrderStatus(status: string): string {
  if (status === "Approved") return "Confirmed";
  if (status === "Fulfilled") return "Dispatched";
  if (status === "Declined") return "Cancelled";
  if (status === "Pending") return "Pending";
  return status;
}

// PUT update request status — admin only
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const docRef = db.collection(Collections.requests).doc(id);
  const existing = await docRef.get();
  if (!existing.exists) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const existingData = existing.data()!;
  const updates: Record<string, unknown> = {};

  if (body.status) updates.status = String(body.status);
  if (body.adminNote !== undefined) updates.adminNote = String(body.adminNote).slice(0, 500);

  // When approving, allow setting buying and selling prices
  if (body.buyingPrice !== undefined) {
    const bp = Number(body.buyingPrice);
    if (isNaN(bp) || bp < 0) return NextResponse.json({ error: "Invalid buying price" }, { status: 400 });
    updates.buyingPrice = bp;
  }
  if (body.sellingPrice !== undefined) {
    const sp = Number(body.sellingPrice);
    if (isNaN(sp) || sp < 0) return NextResponse.json({ error: "Invalid selling price" }, { status: 400 });
    updates.sellingPrice = sp;
  }

  // When marking as fulfilled, calculate profit and distribute to owners.
  // Treat both "Fulfilled" and "Dispatched" as the same terminal state to avoid
  // double-crediting when a legacy "Fulfilled" record is later updated to "Dispatched".
  const TERMINAL_REQUEST_STATUSES = ["Fulfilled", "Dispatched"];
  const isNewTerminal = TERMINAL_REQUEST_STATUSES.includes(body.status);
  const wasAlreadyTerminal = TERMINAL_REQUEST_STATUSES.includes(existingData.status);
  if (isNewTerminal && !wasAlreadyTerminal) {
    const buyingPrice = updates.buyingPrice ?? existingData.buyingPrice;
    const sellingPrice = updates.sellingPrice ?? existingData.sellingPrice;

    if (buyingPrice == null || sellingPrice == null) {
      return NextResponse.json(
        { error: "Buying price and selling price must be set before fulfilling" },
        { status: 400 },
      );
    }

    const profit = Number(sellingPrice) - Number(buyingPrice);
    updates.profit = profit;
    updates.fulfilledAt = Timestamp.now();

    // Distribute profit to owner accounts based on configured split
    if (profit > 0) {
      const settingsDoc = await db.collection(Collections.settings).doc("default").get();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const settings = settingsDoc.exists ? (settingsDoc.data() as any) : null;
      const owner1Name = settings?.owner1Name ?? "Tayeb";
      const owner2Name = settings?.owner2Name ?? "Enid";
      const owner1Share = settings?.owner1Share ?? 60;
      const owner2Share = settings?.owner2Share ?? 40;

      const owner1Amount = Math.round((profit * owner1Share) / 100);
      const owner2Amount = profit - owner1Amount; // remainder to avoid rounding loss

      const now = Timestamp.now();

      // Credit owner accounts
      const batch = db.batch();

      batch.set(
        db.collection(Collections.ownerAccounts).doc(owner1Name),
        { totalEarned: FieldValue.increment(owner1Amount) },
        { merge: true },
      );
      batch.set(
        db.collection(Collections.ownerAccounts).doc(owner2Name),
        { totalEarned: FieldValue.increment(owner2Amount) },
        { merge: true },
      );

      // Record profit transactions for each owner
      const tx1Id = uuid();
      batch.set(db.collection(Collections.profitTransactions).doc(tx1Id), {
        requestId: id,
        ownerName: owner1Name,
        type: "request_profit",
        amount: owner1Amount,
        description: `Request fulfilled: ${existingData.perfumeName} (${owner1Share}% of ${profit} BDT)`,
        createdAt: now,
      });

      const tx2Id = uuid();
      batch.set(db.collection(Collections.profitTransactions).doc(tx2Id), {
        requestId: id,
        ownerName: owner2Name,
        type: "request_profit",
        amount: owner2Amount,
        description: `Request fulfilled: ${existingData.perfumeName} (${owner2Share}% of ${profit} BDT)`,
        createdAt: now,
      });

      await batch.commit();
    }
  }

  const orderRef = db.collection(Collections.orders).doc(id);
  const orderStatus = body.status ? mapRequestStatusToOrderStatus(String(body.status)) : null;

  if (orderStatus) {
    await orderRef.set({ status: orderStatus, updatedAt: Timestamp.now() }, { merge: true });
  }

  await docRef.update(updates);
  const doc = await docRef.get();
  return NextResponse.json(serializeDoc({ id, ...doc.data() }));
}
