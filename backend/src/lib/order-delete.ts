import { db, Collections } from "@/lib/prisma";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { normalizeOrderStatus } from "@/lib/orderStatusConfig";
import { reverseInvestmentSalesForOrder } from "@/lib/investments/orderIntegration";

export type DeleteOrderResult =
  | { ok: true; reversedProfit: boolean; restoredStock: boolean }
  | { ok: false; status: number; error: string };

/**
 * Permanently removes an order and everything it contributed to: owner profit
 * balances (if the order was completed and not yet reversed), consumed stock
 * (if not already restored), the voucher use, its profit rows, items and the
 * order document. Revenue / dashboard / withdrawable figures are recomputed
 * from orders on read, so they drop automatically once the order is gone.
 */
export async function deleteOrderCompletely(id: string, adminId: string): Promise<DeleteOrderResult> {
  const orderRef = db.collection(Collections.orders).doc(id);
  const orderDoc = await orderRef.get();
  if (!orderDoc.exists) return { ok: false, status: 404, error: "Order not found" };

  const order = orderDoc.data() || {};
  const status = normalizeOrderStatus(order.status || "Pending", order.pickupMethod);
  const itemsSnap = await orderRef.collection("items").get();
  const now = Timestamp.now();

  // Stock: restore unless a cancellation already did.
  let restoredStock = false;
  if (status !== "Cancelled") {
    restoredStock = await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists || snap.data()?.stockRestoredAt) return false;
      const bottleRefs: Array<{ ref: FirebaseFirestore.DocumentReference; quantity: number }> = [];
      for (const itemDoc of itemsSnap.docs) {
        const item = itemDoc.data();
        if (item.isFullBottle || !item.perfumeId) continue;
        const bottleSnap = await tx.get(db.collection(Collections.bottles).where("ml", "==", item.ml).limit(1));
        if (!bottleSnap.empty) bottleRefs.push({ ref: bottleSnap.docs[0].ref, quantity: Number(item.quantity || 0) });
      }
      const perfumeSnaps = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      for (const itemDoc of itemsSnap.docs) {
        const item = itemDoc.data();
        if (item.isFullBottle || !item.perfumeId || perfumeSnaps.has(item.perfumeId)) continue;
        perfumeSnaps.set(item.perfumeId, await tx.get(db.collection(Collections.perfumes).doc(item.perfumeId)));
      }
      for (const itemDoc of itemsSnap.docs) {
        const item = itemDoc.data();
        if (item.isFullBottle || !item.perfumeId) continue;
        const pSnap = perfumeSnaps.get(item.perfumeId);
        if (!pSnap?.exists) continue;
        tx.update(pSnap.ref, {
          totalStockMl: FieldValue.increment(Number(item.ml || 0) * Number(item.quantity || 0)),
        });
      }
      for (const b of bottleRefs) tx.update(b.ref, { availableCount: FieldValue.increment(b.quantity) });
      tx.update(orderRef, { stockRestoredAt: now });
      return true;
    });
  }

  // Owner profit: reverse balances once if the order was completed and never reversed.
  const profitSnap = await db.collection(Collections.profitTransactions).where("orderId", "==", id).get();
  let reversedProfit = false;
  const profitRows = profitSnap.docs.map((d) => ({ ref: d.ref, data: d.data() }));
  const liveRows = profitRows.filter((r) => !r.data.reversed);
  if (liveRows.length > 0) {
    const aggregated = new Map<string, { totalEarned: number; storeShareEarned: number }>();
    for (const { data: profit } of liveRows) {
      if (!profit.ownerName) continue;
      const acc = aggregated.get(profit.ownerName) || { totalEarned: 0, storeShareEarned: 0 };
      if (profit.type === "sale" || profit.type === "owner-revenue-base") acc.totalEarned -= profit.amount || 0;
      else if (profit.type === "store-share" || profit.type === "cross-owner-share") acc.storeShareEarned -= profit.amount || 0;
      aggregated.set(profit.ownerName, acc);
    }
    reversedProfit = await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists || snap.data()?.profitReversedAt) return false;
      for (const [ownerName, sums] of aggregated) {
        const increments: Record<string, FieldValue> = {};
        if (sums.totalEarned !== 0) increments.totalEarned = FieldValue.increment(sums.totalEarned);
        if (sums.storeShareEarned !== 0) increments.storeShareEarned = FieldValue.increment(sums.storeShareEarned);
        if (Object.keys(increments).length > 0) {
          tx.set(db.collection(Collections.ownerAccounts).doc(ownerName), increments, { merge: true });
        }
      }
      tx.update(orderRef, { profitReversedAt: now });
      return true;
    });
  }

  if (status === "Dispatched") {
    const investmentReversal = await reverseInvestmentSalesForOrder(id, adminId);
    if (investmentReversal.errors.length > 0) {
      console.error(`[ORDER DELETE] ${id} investment reversal errors: ${investmentReversal.errors.join("; ")}`);
    }
  }

  // Voucher use (a cancelled order already released it).
  if (status !== "Cancelled" && order.voucherCode && order.voucherAppliedAt) {
    const voucherSnap = await db.collection(Collections.vouchers).where("code", "==", order.voucherCode).limit(1).get();
    if (!voucherSnap.empty && Number(voucherSnap.docs[0].data().usedCount || 0) > 0) {
      await voucherSnap.docs[0].ref.update({ usedCount: FieldValue.increment(-1), updatedAt: now });
    }
  }

  // Erase the order, its items and its profit rows (Firestore batches cap at 500 writes).
  const refs = [...itemsSnap.docs.map((d) => d.ref), ...profitRows.map((r) => r.ref), orderRef];
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }

  return { ok: true, reversedProfit, restoredStock };
}
