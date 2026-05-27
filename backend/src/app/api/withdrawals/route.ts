import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";
import { fromMinorUnits, toMinorUnits } from "@/lib/finance";
import { normalizeOrderStatus } from "@/lib/orderStatusConfig";

// GET all withdrawals — admin only
// Supports ?ownerName=Tayeb filter
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const ownerName = searchParams.get("ownerName");
  const withdrawalType = searchParams.get("withdrawalType");

  const snap = await db.collection(Collections.withdrawals).orderBy("createdAt", "desc").get();
  let withdrawals = snap.docs.map((doc) => serializeDoc({ id: doc.id, ...doc.data() }));

  if (ownerName) {
    withdrawals = withdrawals.filter((w: { ownerName?: string }) => w.ownerName === ownerName);
  }
  if (withdrawalType) {
    withdrawals = withdrawals.filter((w: { withdrawalType?: string }) => (w.withdrawalType ?? "profit") === withdrawalType);
  }

  return NextResponse.json(withdrawals);
}

// POST create withdrawal — admin only
// Requires ownerName to specify which owner is withdrawing
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const amount = Number(body.amount);
  const note = String(body.note ?? body.purpose ?? "").trim().slice(0, 500);
  const ownerName = String(body.ownerName ?? "").trim();
  const requestedWithdrawFrom = String(body.withdrawFrom ?? "");
  const withdrawFrom = requestedWithdrawFrom === "Store Revenue" || body.withdrawalType === "revenue"
    ? "Store Revenue"
    : requestedWithdrawFrom === "COD Balance" || body.withdrawalType === "cod"
      ? "COD Balance"
      : "Owner's Profit";
  const paymentSource = body.paymentSource === "Bank" ? "Bank" : body.paymentSource === "Bkash" ? "Bkash" : withdrawFrom === "COD Balance" ? "COD" : "";
  const action = body.action === "approve" ? "approve" : "request";
  const withdrawalId = typeof body.withdrawalId === "string" ? body.withdrawalId : "";

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
  }
  if (!ownerName || typeof ownerName !== "string") {
    return NextResponse.json({ error: "ownerName is required" }, { status: 400 });
  }
  if (withdrawFrom !== "COD Balance" && !paymentSource) {
    return NextResponse.json({ error: "paymentSource is required" }, { status: 400 });
  }

  const settingsDoc = await db.collection(Collections.settings).doc("default").get();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = settingsDoc.exists ? (settingsDoc.data() as any) : null;
  const owner1Name = settings?.owner1Name ?? "Tayeb";
  const owner2Name = settings?.owner2Name ?? "Enid";
  const owner1Email = String(settings?.owner1Email ?? "").toLowerCase();
  const owner2Email = String(settings?.owner2Email ?? "").toLowerCase();
  const isOwnerAdmin = admin.email.toLowerCase() === owner1Email || admin.email.toLowerCase() === owner2Email;

  if (!isOwnerAdmin) {
    return NextResponse.json({ error: "Only the two admins can manage withdrawals" }, { status: 403 });
  }

  const ordersSnap = await db.collection(Collections.orders).get();
  const completedOrders = ordersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((order: any) => normalizeOrderStatus(order.status, order.pickupMethod) !== "Cancelled");
  const sourceTotalsMinor = {
    Bkash: completedOrders.filter((order: any) => String(order.paymentMethod || "") === "Bkash Manual").reduce((sum: number, order: any) => sum + Number(order?.financialsMinor?.totalMinor ?? toMinorUnits(order.total ?? 0)), 0),
    Bank: completedOrders.filter((order: any) => String(order.paymentMethod || "") === "Bank Manual").reduce((sum: number, order: any) => sum + Number(order?.financialsMinor?.totalMinor ?? toMinorUnits(order.total ?? 0)), 0),
  };

  const revenueWithdrawalsSnap = await db.collection(Collections.withdrawals).get();
  type WithdrawalDoc = {
    id: string;
    amount?: number;
    status?: string;
    paymentSource?: string;
    withdrawFrom?: string;
    withdrawalType?: string;
  };
  const completedWithdrawals = revenueWithdrawalsSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as Omit<WithdrawalDoc, "id">) }))
    .filter((w) => (w.status ?? "Completed") === "Completed");
  const completedRevenueWithdrawals = completedWithdrawals.filter(
    (w) => (w.withdrawFrom ?? (w.withdrawalType === "revenue" ? "Store Revenue" : "Owner's Profit")) === "Store Revenue",
  );
  const completedCodWithdrawals = completedWithdrawals.filter(
    (w) => (w.withdrawFrom ?? (w.withdrawalType === "cod" ? "COD Balance" : "Owner's Profit")) === "COD Balance",
  );
  const sourceWithdrawnMinor = {
    Bkash: completedRevenueWithdrawals.filter((w) => String(w.paymentSource || "") === "Bkash").reduce((sum: number, w) => sum + toMinorUnits(Number(w.amount || 0)), 0),
    Bank: completedRevenueWithdrawals.filter((w) => String(w.paymentSource || "") === "Bank").reduce((sum: number, w) => sum + toMinorUnits(Number(w.amount || 0)), 0),
  };

  const codWithdrawnMinor = completedCodWithdrawals.reduce((sum: number, w) => sum + toMinorUnits(Number(w.amount || 0)), 0);

  const sourceBalanceMinor = {
    Bkash: Math.max(0, sourceTotalsMinor.Bkash - sourceWithdrawnMinor.Bkash),
    Bank: Math.max(0, sourceTotalsMinor.Bank - sourceWithdrawnMinor.Bank),
  };

  const paymentSourceBalance = sourceBalanceMinor[paymentSource as keyof typeof sourceBalanceMinor] || 0;

  if (withdrawFrom === "COD Balance") {
    const codOrdersSnap = await db.collection(Collections.orders).get();
    const codTotalMinor = codOrdersSnap.docs.reduce((sum, doc) => {
      const order = doc.data() as { paymentMethod?: string; status?: string; pickupMethod?: string; financialsMinor?: { totalMinor?: number }; total?: number };
      if (normalizeOrderStatus(order.status, order.pickupMethod) !== "Dispatched") return sum;
      if (String(order.paymentMethod || "") !== "Cash on Delivery") return sum;
      return sum + Number(order?.financialsMinor?.totalMinor ?? toMinorUnits(order.total ?? 0));
    }, 0);
    const codBalanceMinor = Math.max(0, codTotalMinor - codWithdrawnMinor);
    if (amount > fromMinorUnits(codBalanceMinor)) {
      return NextResponse.json({ error: `Insufficient COD balance. Available: ${Math.round(fromMinorUnits(codBalanceMinor))} BDT` }, { status: 400 });
    }

    if (action === "approve") {
      if (!withdrawalId) return NextResponse.json({ error: "withdrawalId is required" }, { status: 400 });
      const docRef = db.collection(Collections.withdrawals).doc(withdrawalId);
      const doc = await docRef.get();
      if (!doc.exists) return NextResponse.json({ error: "Withdrawal request not found" }, { status: 404 });

      const existing = doc.data() as { withdrawFrom?: string; withdrawalType?: string; paymentSource?: string; approvals?: Array<{ name?: string; email?: string }>; amount?: number; note?: string; completedAt?: unknown; processedBy?: string; balanceAfter?: number };
      if ((existing.withdrawFrom ?? "COD Balance") !== "COD Balance") {
        return NextResponse.json({ error: "Not a COD balance withdrawal request" }, { status: 400 });
      }

      const approvals = Array.isArray(existing.approvals) ? [...existing.approvals] : [];
      if (approvals.some((approval) => String(approval.email || "").toLowerCase() === admin.email.toLowerCase())) {
        return NextResponse.json({ error: "You have already approved this request" }, { status: 400 });
      }

      const now = Timestamp.now();
      approvals.push({ name: admin.name, email: admin.email, approvedAt: now });
      const completed = approvals.length >= 2;
      const remainingBalance = fromMinorUnits(Math.max(0, codBalanceMinor - toMinorUnits(Number(existing.amount || amount))));
      await docRef.set(
        {
          ...existing,
          withdrawFrom: "COD Balance",
          withdrawalType: "cod",
          paymentSource: "COD",
          approvals,
          approvedBy: approvals.map((approval) => approval.name),
          status: completed ? "Completed" : "Pending Approval",
          updatedAt: now,
          completedAt: completed ? now : existing.completedAt ?? null,
          processedBy: completed ? admin.name : existing.processedBy ?? null,
          balanceAfter: completed ? remainingBalance : existing.balanceAfter ?? null,
        },
        { merge: true },
      );

      if (completed) {
        const txId = uuid();
        await db.collection(Collections.profitTransactions).doc(txId).set({
          orderId: null,
          ownerName: "Store",
          type: "cod-withdrawal",
          amount: -Number(existing.amount || amount),
          paymentSource: "COD",
          withdrawFrom: "COD Balance",
          description: `COD balance withdrawal for ${String(existing.note || note || "business expense").slice(0, 200)}`,
          createdAt: now,
        });
      }

      return NextResponse.json(serializeDoc({ id: withdrawalId, ...(await docRef.get()).data() }), { status: 200 });
    }

    const pendingSnap = await db.collection(Collections.withdrawals)
      .where("withdrawFrom", "==", "COD Balance")
      .where("status", "==", "Pending Approval")
      .get();
    if (!pendingSnap.empty) {
      return NextResponse.json({ error: "There is already a pending COD balance withdrawal" }, { status: 400 });
    }

    const id = uuid();
    const now = Timestamp.now();
    const data = {
      amount,
      ownerName: "Store",
      withdrawFrom: "COD Balance",
      withdrawalType: "cod",
      paymentSource: "COD",
      note,
      requestedBy: admin.name,
      requestedByEmail: admin.email,
      withdrawnBy: admin.name,
      approvals: [{ name: admin.name, email: admin.email, approvedAt: now }],
      approvedBy: [admin.name],
      status: "Pending Approval",
      balanceBefore: fromMinorUnits(codBalanceMinor),
      balanceAfter: fromMinorUnits(Math.max(0, codBalanceMinor - toMinorUnits(amount))),
      createdAt: now,
      updatedAt: now,
    };

    await db.collection(Collections.withdrawals).doc(id).set(data);
    return NextResponse.json(serializeDoc({ id, ...data }), { status: 201 });
  }

  if (withdrawFrom === "Store Revenue") {
    if (amount > fromMinorUnits(paymentSourceBalance)) {
      return NextResponse.json({ error: `Insufficient ${paymentSource} balance. Available: ${Math.round(fromMinorUnits(paymentSourceBalance))} BDT` }, { status: 400 });
    }

    if (action === "approve") {
      if (!withdrawalId) return NextResponse.json({ error: "withdrawalId is required" }, { status: 400 });
      const docRef = db.collection(Collections.withdrawals).doc(withdrawalId);
      const doc = await docRef.get();
      if (!doc.exists) return NextResponse.json({ error: "Withdrawal request not found" }, { status: 404 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = doc.data() as any;
      if ((existing.withdrawFrom ?? "Store Revenue") !== "Store Revenue" || String(existing.paymentSource || "") !== paymentSource) {
        return NextResponse.json({ error: "Not a store revenue withdrawal request for this payment source" }, { status: 400 });
      }

      const approvals = Array.isArray(existing.approvals) ? [...existing.approvals] : [];
      if (approvals.some((approval: any) => String(approval.email || "").toLowerCase() === admin.email.toLowerCase())) {
        return NextResponse.json({ error: "You have already approved this request" }, { status: 400 });
      }

      const now = Timestamp.now();
      approvals.push({ name: admin.name, email: admin.email, approvedAt: now });
      const completed = approvals.length >= 2;
      const remainingBalance = fromMinorUnits(Math.max(0, paymentSourceBalance - toMinorUnits(Number(existing.amount || amount))));
      await docRef.set(
        {
          ...existing,
          withdrawFrom: "Store Revenue",
          paymentSource,
          approvals,
          approvedBy: approvals.map((approval: any) => approval.name),
          status: completed ? "Completed" : "Pending Approval",
          updatedAt: now,
          completedAt: completed ? now : existing.completedAt ?? null,
          processedBy: completed ? admin.name : existing.processedBy ?? null,
          balanceAfter: completed ? remainingBalance : existing.balanceAfter ?? null,
        },
        { merge: true },
      );

      if (completed) {
        const txId = uuid();
        await db.collection(Collections.profitTransactions).doc(txId).set({
          orderId: null,
          ownerName: "Store",
          type: "revenue-withdrawal",
          amount: -Number(existing.amount || amount),
          paymentSource,
          withdrawFrom: "Store Revenue",
          description: `Store revenue withdrawal for ${String(existing.note || note || "business expense").slice(0, 200)}`,
          createdAt: now,
        });
      }

      return NextResponse.json(serializeDoc({ id: withdrawalId, ...(await docRef.get()).data() }), { status: 200 });
    }

    const pendingSnap = await db.collection(Collections.withdrawals)
      .where("withdrawFrom", "==", "Store Revenue")
      .where("paymentSource", "==", paymentSource)
      .where("status", "==", "Pending Approval")
      .get();
    if (!pendingSnap.empty) {
      return NextResponse.json({ error: `There is already a pending ${paymentSource} revenue withdrawal` }, { status: 400 });
    }

    const id = uuid();
    const now = Timestamp.now();
    const data = {
      amount,
      ownerName: "Store",
      withdrawFrom: "Store Revenue",
      paymentSource,
      note,
      requestedBy: admin.name,
      requestedByEmail: admin.email,
      withdrawnBy: admin.name,
      approvals: [{ name: admin.name, email: admin.email, approvedAt: now }],
      approvedBy: [admin.name],
      status: "Pending Approval",
      balanceBefore: fromMinorUnits(paymentSourceBalance),
      balanceAfter: fromMinorUnits(Math.max(0, paymentSourceBalance - toMinorUnits(amount))),
      createdAt: now,
      updatedAt: now,
    };

    await db.collection(Collections.withdrawals).doc(id).set(data);
    return NextResponse.json(serializeDoc({ id, ...data }), { status: 201 });
  }

  if (ownerName !== owner1Name && ownerName !== owner2Name) {
    return NextResponse.json({ error: "Owner account not properly configured or unrecognized" }, { status: 403 });
  }

  const ownerEmail = ownerName === owner1Name ? owner1Email : owner2Email;
  if (!ownerEmail || admin.email.toLowerCase() !== ownerEmail.toLowerCase()) {
    return NextResponse.json({ error: "You can only withdraw from your own account" }, { status: 403 });
  }

  const accountDoc = await db.collection(Collections.ownerAccounts).doc(ownerName).get();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const account = accountDoc.exists ? (accountDoc.data() as any) : { totalEarned: 0 };
  const wSnap = await db.collection(Collections.withdrawals).where("ownerName", "==", ownerName).get();
  const totalWithdrawn = wSnap.docs.reduce((sum, doc) => {
    const withdrawal = doc.data() as any;
    if ((withdrawal.withdrawFrom ?? "Owner's Profit") !== "Owner's Profit") return sum;
    return sum + Number(withdrawal.amount || 0);
  }, 0);
  const available = Number(account.totalEarned || 0) - totalWithdrawn;
  if (amount > available) {
    return NextResponse.json({ error: `Insufficient balance. Available: ${Math.round(available)} BDT` }, { status: 400 });
  }

  const id = uuid();
  const now = Timestamp.now();
  const balanceAfter = Math.max(0, available - amount);
  const data = {
    amount,
    ownerName,
    withdrawFrom: "Owner's Profit",
    paymentSource,
    note,
    withdrawnBy: admin.name,
    approvals: [{ name: admin.name, email: admin.email, approvedAt: now }],
    approvedBy: [admin.name],
    status: "Completed",
    balanceBefore: available,
    balanceAfter,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  };

  await db.collection(Collections.withdrawals).doc(id).set(data);

  const txId = uuid();
  await db.collection(Collections.profitTransactions).doc(txId).set({
    orderId: null,
    ownerName,
    type: "withdrawal-profit",
    amount: -amount,
    paymentSource,
    withdrawFrom: "Owner's Profit",
    description: `Withdrawal by ${admin.name}${note ? `: ${note.slice(0, 200)}` : ""}`,
    createdAt: now,
  });

  return NextResponse.json(serializeDoc({ id, ...data }), { status: 201 });
}
