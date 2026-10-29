import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";
import { Collections, db, serializeDoc } from "@/lib/prisma";
import { currentPaymentHolder, enidHeldMinor, orderCashAmountMinor, type PaymentCustodyState, type PaymentReceipt } from "@/lib/payment-custody";
import { normalizeOrderStatusKey } from "@/lib/orderStatusConfig";

const receiptsCollection = () => db.collection(Collections.paymentReceipts);
const actionsCollection = () => db.collection(Collections.paymentCustodyActions);
const transfersCollection = () => db.collection(Collections.paymentTransfers);
// Every assignment and transfer updates this document to serialize concurrent actions.
const stateRef = () => db.collection(Collections.settings).doc("paymentCustody");
const initialState: PaymentCustodyState = { sequence: 0, transferredThrough: 0 };

function ownerNames(settings: Record<string, unknown>) {
  return { enidName: String(settings.owner2Name || "Enid"), businessHolder: String(settings.owner1Name || "Tayeb") };
}

function canManage(settings: Record<string, unknown>, email: string) {
  return [settings.owner1Email, settings.owner2Email].some((value) =>
    Boolean(value) && String(value).trim().toLowerCase() === email.trim().toLowerCase());
}

class CashError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Transactional snapshot keeps the displayed holders and total in agreement.
  const result = await db.runTransaction(async (tx) => {
    const settings = (await tx.get(db.collection(Collections.settings).doc("default"))).data() || {};
    const state = { ...initialState, ...(await tx.get(stateRef())).data() };
    const receiptsSnap = await tx.get(receiptsCollection());
    const history = await tx.get(transfersCollection().orderBy("createdAt", "desc").limit(5));
    const receipts = receiptsSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as PaymentReceipt);
    const { enidName, businessHolder } = ownerNames(settings);
    return {
      enidName, businessHolder, canManage: canManage(settings, admin.email),
      heldMinor: enidHeldMinor(receipts, state),
      sequence: state.sequence,
      transferredThrough: state.transferredThrough,
      receipts: Object.fromEntries(receipts.map((receipt) => [receipt.id, {
        ...receipt, holderId: currentPaymentHolder(receipt, state),
      }])),
      transfers: history.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    };
  });
  return NextResponse.json(serializeDoc(result), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") throw new CashError("Invalid request");
    const { action, orderId, ownerId, revision, requestId, transferredThrough, expectedSequence, expectedAmountMinor } = body;
    if (!["receive", "transfer"].includes(action)) throw new CashError("Invalid payment action");
    if (typeof requestId !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) throw new CashError("A valid request ID is required");
    if (action === "receive" && (typeof orderId !== "string" || !orderId || orderId.includes("/"))) throw new CashError("A valid order ID is required");
    await db.runTransaction(async (tx) => {
      const settings = (await tx.get(db.collection(Collections.settings).doc("default"))).data() || {};
      if (!canManage(settings, admin.email)) throw new CashError("Only the two owners can manage payments", 403);
      const { enidName, businessHolder } = ownerNames(settings);
      const state = { ...initialState, ...(await tx.get(stateRef())).data() };
      const eventRef = actionsCollection().doc(requestId);
      const existing = await tx.get(eventRef);
      if (existing.exists) {
        const previous = existing.data()!;
        if (previous.action !== action || previous.orderId !== (orderId || null) || previous.ownerId !== (ownerId || null) || previous.recordedBy !== admin.email) {
          throw new CashError("Request ID already used for another action", 409);
        }
        return;
      }
      const now = Timestamp.now();
      let amountMinor = 0;
      if (action === "transfer") {
        if (transferredThrough !== state.transferredThrough || expectedSequence !== state.sequence) {
          throw new CashError("Payment balances changed. Refresh and check the amount before transferring.", 409);
        }
        const snap = await tx.get(receiptsCollection());
        const receipts = snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as PaymentReceipt);
        amountMinor = enidHeldMinor(receipts, state);
        if (amountMinor <= 0) throw new CashError(`There is no money held by ${enidName} to transfer`, 409);
        // A cutoff settles every current receipt without a per-order write limit.
        tx.set(stateRef(), { ...state, transferredThrough: state.sequence, updatedAt: now });
        tx.create(transfersCollection().doc(requestId), { amountMinor, fromOwner: enidName, toOwner: businessHolder, recordedBy: admin.email, createdAt: now });
      } else {
        if (transferredThrough !== state.transferredThrough) throw new CashError("A transfer was recorded. Refresh and try again.", 409);
        if (typeof ownerId !== "string" || !["", "owner1", "owner2"].includes(ownerId)) throw new CashError("Choose one of the two owners");
        const order = (await tx.get(db.collection(Collections.orders).doc(orderId))).data();
        if (!order) throw new CashError("Order not found", 404);
        const receiptRef = receiptsCollection().doc(orderId);
        const receipt = (await tx.get(receiptRef)).data();
        if (!Number.isSafeInteger(revision) || revision !== (receipt?.revision || 0)) throw new CashError("Payment changed. Refresh and try again.", 409);
        if (ownerId && normalizeOrderStatusKey(order.status, order.pickupMethod) === "cancelled") throw new CashError("Cannot record a payment for a cancelled order. Choose refunded if money was returned.");
        amountMinor = ownerId ? orderCashAmountMinor(order) : 0;
        if (ownerId && amountMinor <= 0) throw new CashError("Set the order price before recording payment");
        if (ownerId && (!Number.isSafeInteger(expectedAmountMinor) || expectedAmountMinor !== amountMinor)) {
          throw new CashError("Order amount changed. Reload Orders and check the amount before recording payment.", 409);
        }
        tx.set(receiptRef, {
          ownerId: ownerId || null, amountMinor, sequence: state.sequence + 1, revision: (receipt?.revision || 0) + 1,
          updatedAt: now, recordedBy: admin.email,
        });
        tx.set(stateRef(), { ...state, sequence: state.sequence + 1, updatedAt: now });
      }
      // Transfers are a handover of existing funds, never a second sale/profit credit.
      tx.create(eventRef, {
        action, orderId: orderId || null, ownerId: ownerId || null, amountMinor,
        ...(action === "transfer" ? { fromOwner: enidName, toOwner: businessHolder } : {}),
        recordedBy: admin.email, createdAt: now,
      });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof CashError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    console.error("Payment custody update failed", error);
    return NextResponse.json({ error: "Payment could not be saved. Refresh and try again." }, { status: 500 });
  }
}
