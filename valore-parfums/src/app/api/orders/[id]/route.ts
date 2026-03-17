import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";
import { v4 as uuid } from "uuid";
import { splitProfit } from "@/lib/utils";
import type { OwnerType } from "@/lib/utils";

// GET single order by ID (replaces prisma.order.findUnique with include: items)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orderRef = db.collection(Collections.orders).doc(id);

  // Fetch order doc and items in parallel
  const [doc, itemsSnap] = await Promise.all([
    orderRef.get(),
    orderRef.collection("items").get(),
  ]);
  if (!doc.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const items = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const data = doc.data()!;
  return NextResponse.json(serializeDoc({
    id: doc.id,
    ...data,
    status: data.status || "Pending",
    totalAmount: data.totalAmount ?? data.subtotal ?? 0,
    finalAmount: data.finalAmount ?? data.total ?? 0,
    items,
  }));
}

// PUT update order — admin only (handles status changes including profit crediting & cancellation)
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const { itemPriceUpdates, removeVoucher, ...orderPatch } = body as {
    itemPriceUpdates?: { itemId: string; unitPrice: number }[];
    removeVoucher?: boolean;
    status?: string;
    [key: string]: unknown;
  };

  const orderDoc = await db.collection(Collections.orders).doc(id).get();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = orderDoc.exists ? (orderDoc.data() as any) : null;
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const previousStatus = order.status || "Pending";
  const newStatus = typeof orderPatch.status === "string" ? orderPatch.status : undefined;

  // Fetch settings once (needed for profit crediting & reversal)
  const settingsDoc = await db.collection(Collections.settings).doc("default").get();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = settingsDoc.exists ? (settingsDoc.data() as any) : null;
  const owner1Name = settings?.owner1Name ?? "Tayeb";
  const owner2Name = settings?.owner2Name ?? "Enid";
  const owner1Share = settings?.owner1Share ?? 60;
  const owner2Share = settings?.owner2Share ?? 40;
  const ownerProfitPercent = settings?.ownerProfitPercent ?? 85;
  const now = Timestamp.now();

  // Apply admin manual unit price updates for Full Bottle items, then recompute order totals/profit.
  if (Array.isArray(itemPriceUpdates) && itemPriceUpdates.length > 0) {
    const updatesMap = new Map<string, number>();
    for (const update of itemPriceUpdates) {
      const itemId = String(update.itemId || "").trim();
      const unitPrice = Number(update.unitPrice);
      if (!itemId) continue;
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return NextResponse.json({ error: "Invalid full bottle price input" }, { status: 400 });
      }
      updatesMap.set(itemId, Math.round(unitPrice));
    }

    if (updatesMap.size > 0) {
      const itemsRef = db.collection(Collections.orders).doc(id).collection("items");
      const itemsSnap = await itemsRef.get();

      for (const itemDoc of itemsSnap.docs) {
        if (!updatesMap.has(itemDoc.id)) continue;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item = itemDoc.data() as any;
        if (!item.isFullBottle) {
          return NextResponse.json({ error: "Manual pricing updates are allowed only for Full Bottle items" }, { status: 400 });
        }

        const quantity = Number(item.quantity ?? 0);
        const nextUnitPrice = updatesMap.get(itemDoc.id) ?? 0;
        const nextTotalPrice = Math.max(0, quantity) * nextUnitPrice;
        const costPrice = Number(item.costPrice ?? 0);
        const itemProfit = nextTotalPrice - costPrice;
        const ownerName = (item.ownerName || "Store") as OwnerType;
        const { ownerProfit, otherOwnerProfit } = splitProfit(itemProfit, ownerName, ownerProfitPercent);

        await itemDoc.ref.update({
          unitPrice: nextUnitPrice,
          totalPrice: nextTotalPrice,
          ownerProfit,
          otherOwnerProfit,
          updatedAt: now,
        });
      }

      // Recompute order-level totals from all item rows after updates.
      const refreshedItemsSnap = await itemsRef.get();
      let subtotal = 0;
      let totalCost = 0;
      for (const itemDoc of refreshedItemsSnap.docs) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item = itemDoc.data() as any;
        subtotal += Number(item.totalPrice ?? 0);
        totalCost += Number(item.costPrice ?? 0);
      }

      let discount = Boolean(removeVoucher) ? 0 : Number(order.discount ?? 0);
      let voucherAppliedAt = Boolean(removeVoucher) ? null : (order.voucherAppliedAt ?? null);

      const voucherCode = Boolean(removeVoucher) ? "" : String(order.voucherCode || "").trim();
      if (voucherCode) {
        const voucherSnap = await db.collection(Collections.vouchers).where("code", "==", voucherCode).limit(1).get();
        if (!voucherSnap.empty) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const voucher = voucherSnap.docs[0].data() as any;
          if (voucher.isActive) {
            discount = voucher.discountType === "percentage"
              ? Math.round((subtotal * Number(voucher.discountValue || 0)) / 100)
              : Number(voucher.discountValue || 0);
            discount = Math.max(0, Math.min(discount, subtotal));

            if (!voucherAppliedAt && discount > 0) {
              await db.collection(Collections.vouchers).doc(voucherSnap.docs[0].id).update({
                usedCount: FieldValue.increment(1),
              });
              voucherAppliedAt = now;
            }
          } else {
            discount = 0;
          }
        } else {
          discount = 0;
        }
      }

      const total = Math.max(0, subtotal - discount);
      const profit = total - totalCost;

      await db.collection(Collections.orders).doc(id).update({
        subtotal,
        total,
        profit,
        voucherCode: Boolean(removeVoucher) ? null : order.voucherCode || null,
        discount,
        voucherAppliedAt,
        updatedAt: now,
      });
    }
  }

  // Explicit voucher cancellation by admin for this order.
  if (Boolean(removeVoucher)) {
    const itemsSnap = await db.collection(Collections.orders).doc(id).collection("items").get();
    let subtotal = 0;
    let totalCost = 0;
    for (const itemDoc of itemsSnap.docs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = itemDoc.data() as any;
      subtotal += Number(item.totalPrice ?? 0);
      totalCost += Number(item.costPrice ?? 0);
    }
    const total = subtotal;
    const profit = total - totalCost;

    await db.collection(Collections.orders).doc(id).update({
      voucherCode: null,
      discount: 0,
      voucherAppliedAt: null,
      subtotal,
      total,
      profit,
      updatedAt: now,
    });
  }

  // ── Credit profit when status changes to "Completed" (only if not already Completed) ──
  if (newStatus === "Completed" && previousStatus !== "Completed") {
    const itemsSnap = await db.collection(Collections.orders).doc(id).collection("items").get();

    const profitByOwner: Record<string, { ownerProfit: number; otherOwnerProfit: number }> = {};
    for (const itemDoc of itemsSnap.docs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = itemDoc.data() as any;
      const name = item.ownerName || "Store";
      if (!profitByOwner[name]) profitByOwner[name] = { ownerProfit: 0, otherOwnerProfit: 0 };
      profitByOwner[name].ownerProfit += item.ownerProfit ?? 0;
      profitByOwner[name].otherOwnerProfit += item.otherOwnerProfit ?? 0;
    }

    for (const [ownerName, profits] of Object.entries(profitByOwner)) {
      if (ownerName === "Store") continue;

      // Credit bottle owner's direct profit
      if (profits.ownerProfit > 0) {
        const txId = uuid();
        await db.collection(Collections.profitTransactions).doc(txId).set({
          orderId: id,
          ownerName,
          type: "sale",
          amount: profits.ownerProfit,
          description: `Profit from order ${id.slice(0, 8)} (bottle owner ${Math.round(settings?.ownerProfitPercent ?? 85)}%)`,
          createdAt: now,
        });
        await db.collection(Collections.ownerAccounts).doc(ownerName).set(
          { totalEarned: FieldValue.increment(profits.ownerProfit) },
          { merge: true },
        );
      }

      // Credit the OTHER owner with their share directly
      if (profits.otherOwnerProfit > 0) {
        const otherOwner = ownerName === owner1Name ? owner2Name : owner1Name;
        const txId = uuid();
        await db.collection(Collections.profitTransactions).doc(txId).set({
          orderId: id,
          ownerName: otherOwner,
          type: "cross-owner-share",
          amount: profits.otherOwnerProfit,
          description: `Share from ${ownerName}'s sale in order ${id.slice(0, 8)} (${100 - Math.round(settings?.ownerProfitPercent ?? 85)}%)`,
          createdAt: now,
        });
        await db.collection(Collections.ownerAccounts).doc(otherOwner).set(
          { storeShareEarned: FieldValue.increment(profits.otherOwnerProfit) },
          { merge: true },
        );
      }
    }

    // Handle Store-owned items: distribute by owner1Share / owner2Share
    let totalStoreProfit = 0;
    for (const itemDoc of itemsSnap.docs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = itemDoc.data() as any;
      if ((item.ownerName || "Store") === "Store") {
        const itemProfit = (item.totalPrice ?? 0) - (item.costPrice ?? 0);
        if (itemProfit > 0) totalStoreProfit += itemProfit;
      }
    }

    if (totalStoreProfit > 0) {
      const owner1StoreShare = Math.round(totalStoreProfit * (owner1Share / 100));
      const owner2StoreShare = totalStoreProfit - owner1StoreShare;

      if (owner1StoreShare > 0) {
        const txId = uuid();
        await db.collection(Collections.profitTransactions).doc(txId).set({
          orderId: id,
          ownerName: owner1Name,
          type: "store-share",
          amount: owner1StoreShare,
          description: `Store profit share (${owner1Share}%) from order ${id.slice(0, 8)}`,
          createdAt: now,
        });
        await db.collection(Collections.ownerAccounts).doc(owner1Name).set(
          { storeShareEarned: FieldValue.increment(owner1StoreShare) },
          { merge: true },
        );
      }
      if (owner2StoreShare > 0) {
        const txId = uuid();
        await db.collection(Collections.profitTransactions).doc(txId).set({
          orderId: id,
          ownerName: owner2Name,
          type: "store-share",
          amount: owner2StoreShare,
          description: `Store profit share (${owner2Share}%) from order ${id.slice(0, 8)}`,
          createdAt: now,
        });
        await db.collection(Collections.ownerAccounts).doc(owner2Name).set(
          { storeShareEarned: FieldValue.increment(owner2StoreShare) },
          { merge: true },
        );
      }
    }
  }

  // ── Reverse profit & restore stock when cancelling a Completed order ──
  if (newStatus === "Cancelled" && previousStatus !== "Cancelled") {
    const itemsSnap = await db.collection(Collections.orders).doc(id).collection("items").get();

    // Restore stock regardless of previous status
    for (const itemDoc of itemsSnap.docs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = itemDoc.data() as any;
      if (item.isFullBottle) continue;
      await db.collection(Collections.perfumes).doc(item.perfumeId).update({
        totalStockMl: FieldValue.increment(item.ml * item.quantity),
      });
      const bottleSnap = await db.collection(Collections.bottles).where("ml", "==", item.ml).limit(1).get();
      if (!bottleSnap.empty) {
        await db.collection(Collections.bottles).doc(bottleSnap.docs[0].id).update({
          availableCount: FieldValue.increment(item.quantity),
        });
      }
    }

    // Only reverse profit if profit was previously credited (order was Completed)
    if (previousStatus === "Completed") {
      const profitByOwner: Record<string, { ownerProfit: number; otherOwnerProfit: number }> = {};
      for (const itemDoc of itemsSnap.docs) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item = itemDoc.data() as any;
        const name = item.ownerName || "Store";
        if (!profitByOwner[name]) profitByOwner[name] = { ownerProfit: 0, otherOwnerProfit: 0 };
        profitByOwner[name].ownerProfit += item.ownerProfit ?? 0;
        profitByOwner[name].otherOwnerProfit += item.otherOwnerProfit ?? 0;
      }

      for (const [ownerName, profits] of Object.entries(profitByOwner)) {
        if (ownerName === "Store") continue;

        if (profits.ownerProfit > 0) {
          const txId = uuid();
          await db.collection(Collections.profitTransactions).doc(txId).set({
            orderId: id,
            ownerName,
            type: "cancellation",
            amount: -profits.ownerProfit,
            description: `Reversed profit from cancelled order ${id.slice(0, 8)}`,
            createdAt: now,
          });
          await db.collection(Collections.ownerAccounts).doc(ownerName).set(
            { totalEarned: FieldValue.increment(-profits.ownerProfit) },
            { merge: true },
          );
        }

        if (profits.otherOwnerProfit > 0) {
          const otherOwner = ownerName === owner1Name ? owner2Name : owner1Name;
          const txId = uuid();
          await db.collection(Collections.profitTransactions).doc(txId).set({
            orderId: id,
            ownerName: otherOwner,
            type: "cancellation",
            amount: -profits.otherOwnerProfit,
            description: `Reversed cross-owner share from cancelled order ${id.slice(0, 8)}`,
            createdAt: now,
          });
          await db.collection(Collections.ownerAccounts).doc(otherOwner).set(
            { storeShareEarned: FieldValue.increment(-profits.otherOwnerProfit) },
            { merge: true },
          );
        }
      }

      // Reverse store-owned item profit distribution
      let totalStoreProfitToReverse = 0;
      for (const itemDoc of itemsSnap.docs) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item = itemDoc.data() as any;
        if ((item.ownerName || "Store") === "Store") {
          const itemProfit = (item.totalPrice ?? 0) - (item.costPrice ?? 0);
          if (itemProfit > 0) totalStoreProfitToReverse += itemProfit;
        }
      }

      if (totalStoreProfitToReverse > 0) {
        const owner1StoreReverse = Math.round(totalStoreProfitToReverse * (owner1Share / 100));
        const owner2StoreReverse = totalStoreProfitToReverse - owner1StoreReverse;

        if (owner1StoreReverse > 0) {
          const txId = uuid();
          await db.collection(Collections.profitTransactions).doc(txId).set({
            orderId: id,
            ownerName: owner1Name,
            type: "cancellation",
            amount: -owner1StoreReverse,
            description: `Reversed store share from cancelled order ${id.slice(0, 8)}`,
            createdAt: now,
          });
          await db.collection(Collections.ownerAccounts).doc(owner1Name).set(
            { storeShareEarned: FieldValue.increment(-owner1StoreReverse) },
            { merge: true },
          );
        }
        if (owner2StoreReverse > 0) {
          const txId = uuid();
          await db.collection(Collections.profitTransactions).doc(txId).set({
            orderId: id,
            ownerName: owner2Name,
            type: "cancellation",
            amount: -owner2StoreReverse,
            description: `Reversed store share from cancelled order ${id.slice(0, 8)}`,
            createdAt: now,
          });
          await db.collection(Collections.ownerAccounts).doc(owner2Name).set(
            { storeShareEarned: FieldValue.increment(-owner2StoreReverse) },
            { merge: true },
          );
        }
      }
    }
  }

  // Update order document (replaces prisma.order.update)
  const orderPatchWithoutComputed = { ...orderPatch } as Record<string, unknown>;
  delete orderPatchWithoutComputed.itemPriceUpdates;
  delete orderPatchWithoutComputed.removeVoucher;

  if (Object.keys(orderPatchWithoutComputed).length > 0) {
    await db.collection(Collections.orders).doc(id).update({
      ...orderPatchWithoutComputed,
      updatedAt: Timestamp.now(),
    });
  }

  // Return updated order with items
  const updatedDoc = await db.collection(Collections.orders).doc(id).get();
  const itemsSnap = await db.collection(Collections.orders).doc(id).collection("items").get();
  const items = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const updatedData = updatedDoc.data()!;
  return NextResponse.json(serializeDoc({
    id: updatedDoc.id,
    ...updatedData,
    status: updatedData.status || "Pending",
    totalAmount: updatedData.totalAmount ?? updatedData.subtotal ?? 0,
    finalAmount: updatedData.finalAmount ?? updatedData.total ?? 0,
    items,
  }));
}
