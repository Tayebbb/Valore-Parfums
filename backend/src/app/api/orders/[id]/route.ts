import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { v4 as uuid } from "uuid";
import { splitProfit } from "@/lib/utils";
import type { OwnerType } from "@/lib/utils";
import { buildOrderPricingSnapshot, computeItemBreakdown, distributeOrderProfit, fromMinorUnits, toMinorUnits } from "@/lib/finance";
import {
  generateOrderCancelledEmail,
  generateOrderConfirmationEmail,
  generateOrderConfirmedEmail,
  generateOrderDeliveredEmail,
  generateOrderDispatchedEmail,
  generatePickupConfirmationEmail,
  generatePickupReadyEmail,
  sendEmail,
} from "@/lib/email";
import { validateString } from "@/lib/validation";
import {
  STATUS_CONFIG,
  getDbValueForStatusKey,
  isStatusAllowedForFulfillment,
  isValidTransition,
  normalizePickupMethod,
  normalizeOrderStatus,
  normalizeOrderStatusKey,
  resolveStatusKey,
} from "@/lib/orderStatusConfig";

function hasPaidLikeStatus(status?: string): boolean {
  const normalized = String(status || "").trim().toLowerCase();
  return [
    "confirmed",
    "paid",
    "processing",
    "ready for pickup",
    "out for delivery",
    "ready",
    "dispatched",
    "completed",
    "delivered",
    "shipped",
  ].includes(normalized);
}

function isOrderPaymentReceived(orderData: Record<string, unknown>, statusHint?: string): boolean {
  const paymentMethod = String(orderData.paymentMethod || "").trim();
  if (paymentMethod !== "Bkash Manual" && paymentMethod !== "Bank Manual") return false;

  const bkashPayment = (orderData.bkashPayment as Record<string, unknown> | null) || null;
  const bankPayment = (orderData.bankPayment as Record<string, unknown> | null) || null;
  const hasBkashTxn = Boolean(String(bkashPayment?.transactionNumber || "").trim());
  const hasBankTxn = Boolean(String(bankPayment?.transactionNumber || "").trim());

  return hasBkashTxn || hasBankTxn || hasPaidLikeStatus(String(orderData.status || "")) || hasPaidLikeStatus(statusHint);
}

type EmailPayload = Parameters<typeof sendEmail>[0];

async function sendEmailOrThrow(
  orderId: string,
  templateName: string,
  customerEmail: string,
  emailPayload: EmailPayload,
): Promise<void> {
  console.log(`[EMAIL] Sending ${templateName} to ${customerEmail}`);
  const result = await sendEmail(emailPayload);
  if (!result.success) {
    console.error(`[EMAIL ERROR] Failed for ${orderId}:`, result.error || "Unknown error");
    throw new Error(result.error || "Email send failed");
  }
}

// GET single order by ID (replaces prisma.order.findUnique with include: items)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  
  const orderRef = db.collection(Collections.orders).doc(id);

  // Fetch order doc and items in parallel
  const [doc, itemsSnap] = await Promise.all([
    orderRef.get(),
    orderRef.collection("items").get(),
  ]);
  if (!doc.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = doc.data()!;
  
  // Security: Verify user ownership (admin can view any order, users can only view their own)
  const admin = await requireAdmin();
  if (!admin) {
    // Non-admin user: verify they own this order
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userEmail = String(user.email || "").trim().toLowerCase();
    const orderOwnerEmail = String(data.placedByEmail || "").trim().toLowerCase();
    const recipientEmail = String(data.customerEmail || data.recipientEmail || "").trim().toLowerCase();
    const hasExplicitOwner = Boolean(String(data.userId || "").trim() || orderOwnerEmail);
    const ownsOrder = String(data.userId || "").trim() === user.id || orderOwnerEmail === userEmail || (!hasExplicitOwner && recipientEmail === userEmail);
    if (!ownsOrder) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const items = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

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
    itemPriceUpdates?: { itemId: string; unitPrice: number; buyingPrice?: number }[];
    removeVoucher?: boolean;
    status?: string;
    [key: string]: unknown;
  };

  const orderDoc = await db.collection(Collections.orders).doc(id).get();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = orderDoc.exists ? (orderDoc.data() as any) : null;
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const previousStatusDb = normalizeOrderStatus(order.status || "Pending", order.pickupMethod);
  const previousStatusKey = normalizeOrderStatusKey(order.status || "Pending", order.pickupMethod);
  const requestedStatus = typeof orderPatch.status === "string" ? String(orderPatch.status).trim() : undefined;
  const pickupMethod = normalizePickupMethod(
    typeof orderPatch.pickupMethod === "string"
      ? String(orderPatch.pickupMethod).trim()
      : String(order.pickupMethod || "Delivery").trim(),
  );

  let newStatusKey: ReturnType<typeof resolveStatusKey> = null;
  let newStatusDb: string | undefined;
  let statusChanged = false;

  if (requestedStatus) {
    newStatusKey = resolveStatusKey(requestedStatus, pickupMethod);
    if (!newStatusKey) {
      console.log(`[ORDER] ${id} invalid status: ${requestedStatus}`);
      return NextResponse.json({ error: `Invalid status: ${requestedStatus}` }, { status: 400 });
    }

    if (!isStatusAllowedForFulfillment(newStatusKey, pickupMethod)) {
      console.log(`[ORDER] ${id} invalid status for fulfillment ${pickupMethod}: ${requestedStatus}`);
      return NextResponse.json(
        { error: `Status ${requestedStatus} is invalid for ${pickupMethod} orders` },
        { status: 400 },
      );
    }

    newStatusDb = getDbValueForStatusKey(newStatusKey);

    if (previousStatusKey === newStatusKey) {
      console.log(`[ORDER] ${id} status unchanged (${previousStatusDb}); skipping status update`);
      delete orderPatch.status;
    } else {
      if (!isValidTransition(previousStatusDb, newStatusDb, pickupMethod)) {
        console.log(`[ORDER] ${id} invalid transition: ${previousStatusDb} → ${newStatusDb}`);
        return NextResponse.json(
          { error: `Invalid status transition from ${previousStatusDb} to ${newStatusDb}` },
          { status: 400 },
        );
      }
      orderPatch.status = newStatusDb;
      statusChanged = true;
      console.log(`[ORDER] ${id} status: ${previousStatusDb} → ${newStatusDb}`);
    }
  }

  if (statusChanged && newStatusKey === "cancelled") {
    const reasonValidation = validateString(orderPatch.cancelReason, "cancelReason", {
      minLength: 5,
      maxLength: 500,
    });
    if (!reasonValidation.valid) {
      return NextResponse.json({ error: "Cancellation reason is required", errors: reasonValidation.errors }, { status: 400 });
    }
    // Sanitize optional cancellationNote (not required)
    if (orderPatch.cancellationNote !== undefined && orderPatch.cancellationNote !== null) {
      const note = String(orderPatch.cancellationNote).trim().slice(0, 1000);
      orderPatch.cancellationNote = note || null;
    }
    orderPatch.cancelledAt = Timestamp.now();
  }

  // Fetch settings once (needed for profit crediting & reversal)
  const settingsDoc = await db.collection(Collections.settings).doc("default").get();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = settingsDoc.exists ? (settingsDoc.data() as any) : null;
  const owner1Name = settings?.owner1Name ?? "Tayeb";
  const owner2Name = settings?.owner2Name ?? "Enid";
  const owner1Share = settings?.owner1Share ?? 60;
  const owner2Share = settings?.owner2Share ?? 40;
  const ownerProfitPercent = settings?.ownerProfitPercent ?? 85;
  const immutableFinancialStatuses = new Set(["Dispatched", "Delivered", "Cancelled"]);

  if (immutableFinancialStatuses.has(previousStatusDb) && (Boolean(removeVoucher) || (Array.isArray(itemPriceUpdates) && itemPriceUpdates.length > 0))) {
    return NextResponse.json({ error: `Financial fields are locked for ${previousStatusDb} orders` }, { status: 409 });
  }
  const now = Timestamp.now();

  // Apply admin manual unit price updates for Full Bottle items, then recompute order totals/profit.
  if (Array.isArray(itemPriceUpdates) && itemPriceUpdates.length > 0) {
    const updatesMap = new Map<string, { unitPrice: number; buyingPrice?: number }>();
    for (const update of itemPriceUpdates) {
      const itemId = String(update.itemId || "").trim();
      const unitPrice = Number(update.unitPrice);
      const hasBuyingPrice = update.buyingPrice !== undefined && update.buyingPrice !== null;
      const buyingPrice = hasBuyingPrice ? Number(update.buyingPrice) : undefined;
      if (!itemId) continue;
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return NextResponse.json({ error: "Invalid full bottle price input" }, { status: 400 });
      }
      if (hasBuyingPrice && (!Number.isFinite(buyingPrice) || (buyingPrice as number) < 0)) {
        return NextResponse.json({ error: "Invalid full bottle buying price input" }, { status: 400 });
      }
      updatesMap.set(itemId, {
        unitPrice: Math.round(unitPrice),
        ...(hasBuyingPrice ? { buyingPrice: Math.round(buyingPrice as number) } : {}),
      });
    }

    if (updatesMap.size > 0) {
      const itemsRef = db.collection(Collections.orders).doc(id).collection("items");
      const itemsSnap = await itemsRef.get();

      for (const itemDoc of itemsSnap.docs) {
        const itemUpdate = updatesMap.get(itemDoc.id);
        if (!itemUpdate) continue;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item = itemDoc.data() as any;
        if (!item.isFullBottle) {
          return NextResponse.json({ error: "Manual pricing updates are allowed only for Full Bottle items" }, { status: 400 });
        }

        const quantity = Number(item.quantity ?? 0);
        const nextUnitPrice = itemUpdate.unitPrice;
        const unitCost = itemUpdate.buyingPrice !== undefined
          ? itemUpdate.buyingPrice
          : Number(
              item?.pricingSnapshot?.unitCost
                ?? (
                  item?.financialBreakdown?.unitCostMinor !== undefined
                    ? fromMinorUnits(Number(item.financialBreakdown.unitCostMinor || 0))
                    : (quantity > 0 ? Number(item.costPrice ?? 0) / quantity : 0)
                ),
            );
        const breakdown = computeItemBreakdown({
          unitCostMinor: toMinorUnits(unitCost),
          unitSellingPriceMinor: toMinorUnits(nextUnitPrice),
          quantity,
        });
        const nextTotalPrice = fromMinorUnits(breakdown.totalRevenueMinor);
        const costPrice = fromMinorUnits(breakdown.totalCostMinor);
        const itemProfit = nextTotalPrice - costPrice;
        const ownerName = (item.ownerName || "Store") as OwnerType;
        const { ownerProfit, otherOwnerProfit } = splitProfit(itemProfit, ownerName, ownerProfitPercent);

        await itemDoc.ref.update({
          unitPrice: nextUnitPrice,
          totalPrice: nextTotalPrice,
          costPrice,
          ownerProfit,
          otherOwnerProfit,
          financialBreakdown: breakdown,
          pricingSnapshot: {
            ...(item.pricingSnapshot || {}),
            unitCost,
            unitSellingPrice: nextUnitPrice,
          },
          updatedAt: now,
        });
      }

      // Recompute order-level totals from all item rows after updates.
      const refreshedItemsSnap = await itemsRef.get();
      let subtotalMinor = 0;
      let totalCostMinor = 0;
      for (const itemDoc of refreshedItemsSnap.docs) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item = itemDoc.data() as any;
        const itemBreakdown = item.financialBreakdown;
        if (itemBreakdown && Number.isFinite(itemBreakdown.totalRevenueMinor) && Number.isFinite(itemBreakdown.totalCostMinor)) {
          subtotalMinor += Number(itemBreakdown.totalRevenueMinor || 0);
          totalCostMinor += Number(itemBreakdown.totalCostMinor || 0);
        } else {
          subtotalMinor += toMinorUnits(Number(item.totalPrice ?? 0));
          totalCostMinor += toMinorUnits(Number(item.costPrice ?? 0));
        }
      }

      let discountMinor = Boolean(removeVoucher) ? 0 : toMinorUnits(Number(order.discount ?? 0));
      let voucherAppliedAt = Boolean(removeVoucher) ? null : (order.voucherAppliedAt ?? null);

      const voucherCode = Boolean(removeVoucher) ? "" : String(order.voucherCode || "").trim();
      if (voucherCode) {
        const voucherSnap = await db.collection(Collections.vouchers).where("code", "==", voucherCode).limit(1).get();
        if (!voucherSnap.empty) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const voucher = voucherSnap.docs[0].data() as any;
          if (voucher.isActive) {
            // Enforce the same rules as /api/vouchers/validate: expiry, usage limit, minOrderValue.
            const voucherExpiry = voucher.expiresAt || voucher.expiryDate || null;
            let isExpired = false;
            if (voucherExpiry) {
              // Prefer Firestore Timestamp semantics if available, otherwise fall back to Date.
              if (typeof voucherExpiry.toMillis === "function" && typeof now.toMillis === "function") {
                isExpired = voucherExpiry.toMillis() < now.toMillis();
              } else {
                const expiryDate = new Date(voucherExpiry);
                const nowDate = new Date();
                if (!isNaN(expiryDate.getTime())) {
                  isExpired = expiryDate.getTime() < nowDate.getTime();
                }
              }
            }

            const usageLimit = Number(voucher.usageLimit ?? 0);
            const currentUsedCount = Number(voucher.usedCount ?? 0);
            const overUsageLimit = usageLimit > 0 && currentUsedCount >= usageLimit;

            const minOrderValue = Number(voucher.minOrderValue ?? 0);
            const belowMinOrderValue = minOrderValue > 0 && subtotalMinor < toMinorUnits(minOrderValue);

            if (!isExpired && !overUsageLimit && !belowMinOrderValue) {
              discountMinor = voucher.discountType === "percentage"
                ? Math.round(subtotalMinor * (Number(voucher.discountValue || 0) / 100))
                : toMinorUnits(Number(voucher.discountValue || 0));
              discountMinor = Math.max(0, Math.min(discountMinor, subtotalMinor));

              if (!voucherAppliedAt && discountMinor > 0) {
                await db.collection(Collections.vouchers).doc(voucherSnap.docs[0].id).update({
                  usedCount: FieldValue.increment(1),
                });
                voucherAppliedAt = now;
              }
            } else {
              discountMinor = 0;
            }
          } else {
            discountMinor = 0;
          }
        } else {
          discountMinor = 0;
        }
      }

      const snapshot = buildOrderPricingSnapshot({
        subtotalMinor,
        discountMinor,
        deliveryFeeMinor: toMinorUnits(Number(order.deliveryFee ?? 0)),
        totalCostMinor,
      });
      const subtotal = fromMinorUnits(snapshot.subtotalMinor);
      const discount = fromMinorUnits(snapshot.discountMinor);
      const total = fromMinorUnits(snapshot.totalMinor);
      const profit = fromMinorUnits(snapshot.totalProfitMinor);
      const distribution = distributeOrderProfit({
        items: refreshedItemsSnap.docs.map((itemDoc) => {
          const item = itemDoc.data() as Record<string, unknown>;
          const breakdown = (item.financialBreakdown || {}) as { computedProfitMinor?: number };
          return {
            ownerName: String(item.ownerName || "Store"),
            computedProfitMinor: Number(breakdown.computedProfitMinor ?? toMinorUnits(Number(item.totalPrice || 0) - Number(item.costPrice || 0))),
            ownerProfitMinor: toMinorUnits(Number(item.ownerProfit || 0)),
            otherOwnerProfitMinor: toMinorUnits(Number(item.otherOwnerProfit || 0)),
          };
        }),
        owner1Name,
        owner2Name,
        owner1Share,
      });

      await db.collection(Collections.orders).doc(id).update({
        subtotal,
        total,
        profit,
        voucherCode: Boolean(removeVoucher) ? null : order.voucherCode || null,
        discount,
        voucherAppliedAt,
        pricingSnapshot: { ...snapshot, generatedAt: now },
        financialsMinor: {
          subtotalMinor: snapshot.subtotalMinor,
          discountMinor: snapshot.discountMinor,
          deliveryFeeMinor: snapshot.deliveryFeeMinor,
          totalMinor: snapshot.totalMinor,
          totalCostMinor: snapshot.totalCostMinor,
          totalProfitMinor: snapshot.totalProfitMinor,
        },
        profitDistribution: distribution,
        updatedAt: now,
      });
    }
  }

  // Explicit voucher cancellation by admin for this order.
  if (Boolean(removeVoucher)) {
    const orderRef = db.collection(Collections.orders).doc(id);
    const itemsSnap = await orderRef.collection("items").get();
    let subtotalMinor = 0;
    let totalCostMinor = 0;
    for (const itemDoc of itemsSnap.docs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = itemDoc.data() as any;
      const itemBreakdown = item.financialBreakdown;
      if (itemBreakdown && Number.isFinite(itemBreakdown.totalRevenueMinor) && Number.isFinite(itemBreakdown.totalCostMinor)) {
        subtotalMinor += Number(itemBreakdown.totalRevenueMinor || 0);
        totalCostMinor += Number(itemBreakdown.totalCostMinor || 0);
      } else {
        subtotalMinor += toMinorUnits(Number(item.totalPrice ?? 0));
        totalCostMinor += toMinorUnits(Number(item.costPrice ?? 0));
      }
    }
    const snapshot = buildOrderPricingSnapshot({
      subtotalMinor,
      discountMinor: 0,
      deliveryFeeMinor: toMinorUnits(Number(order.deliveryFee ?? 0)),
      totalCostMinor,
    });
    const subtotal = fromMinorUnits(snapshot.subtotalMinor);
    const total = fromMinorUnits(snapshot.totalMinor);
    const profit = fromMinorUnits(snapshot.totalProfitMinor);

    // If a voucher was previously applied and counted, decrement its usedCount (but not below zero).
    if (order.voucherCode && order.voucherAppliedAt) {
      const voucherRef = db.collection(Collections.vouchers).doc(order.voucherCode as string);
      const voucherSnap = await voucherRef.get();
      if (voucherSnap.exists) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const voucher = voucherSnap.data() as any;
        const currentUsedCount = typeof voucher.usedCount === "number" ? voucher.usedCount : 0;
        if (currentUsedCount > 0) {
          await voucherRef.update({
            usedCount: FieldValue.increment(-1),
            updatedAt: now,
          });
        }
      }
    }

    await orderRef.update({
      voucherCode: null,
      discount: 0,
      voucherAppliedAt: null,
      subtotal,
      total,
      profit,
      pricingSnapshot: { ...snapshot, generatedAt: now },
      financialsMinor: {
        subtotalMinor: snapshot.subtotalMinor,
        discountMinor: snapshot.discountMinor,
        deliveryFeeMinor: snapshot.deliveryFeeMinor,
        totalMinor: snapshot.totalMinor,
        totalCostMinor: snapshot.totalCostMinor,
        totalProfitMinor: snapshot.totalProfitMinor,
      },
      updatedAt: now,
    });
  }

  // ── Credit profit when status changes to "Dispatched" (only if not already dispatched) ──
  if (newStatusDb === "Dispatched" && previousStatusDb !== "Dispatched") {
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
  if (newStatusDb === "Cancelled" && previousStatusDb !== "Cancelled") {
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

    // Only reverse profit if profit was previously credited (order was Dispatched)
    if (previousStatusDb === "Dispatched") {
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
    if (immutableFinancialStatuses.has(previousStatusDb)) {
      delete orderPatchWithoutComputed.discount;
      delete orderPatchWithoutComputed.subtotal;
      delete orderPatchWithoutComputed.total;
      delete orderPatchWithoutComputed.profit;
      delete orderPatchWithoutComputed.pricingSnapshot;
      delete orderPatchWithoutComputed.financialsMinor;
      delete orderPatchWithoutComputed.profitDistribution;
    }
    await db.collection(Collections.orders).doc(id).update({
      ...orderPatchWithoutComputed,
      financialsLocked: immutableFinancialStatuses.has(String(orderPatchWithoutComputed.status || previousStatusDb)),
      updatedAt: Timestamp.now(),
    });
  }

  // Return updated order with items
  const updatedDoc = await db.collection(Collections.orders).doc(id).get();
  const itemsSnap = await db.collection(Collections.orders).doc(id).collection("items").get();
  const items = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const updatedData = updatedDoc.data()!;
  const emailItems = items.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      perfumeName: String(row.perfumeName || "Perfume"),
      quantity: Number(row.quantity || 0),
      ml: Number(row.ml || 0),
      unitPrice: Number(row.unitPrice || 0),
    };
  });

  const customerEmail = String(updatedData.customerEmail || "").trim();
  const isPickupOrder = normalizePickupMethod(updatedData.pickupMethod) === "Pickup";
  const pickupLocationId = String(updatedData.pickupLocationId || "").trim();
  let pickupLocationName = String(updatedData.pickupLocationName || "").trim();
  let pickupLocationAddress = String(updatedData.pickupLocationAddress || "").trim();
  let pickupContactNumber = String(updatedData.pickupContactNumber || "").trim();

  if (isPickupOrder && pickupLocationId && (!pickupLocationName || !pickupLocationAddress || !pickupContactNumber)) {
    const pickupLocDoc = await db.collection(Collections.pickupLocations).doc(pickupLocationId).get();
    if (pickupLocDoc.exists) {
      const pickupData = pickupLocDoc.data() || {};
      pickupLocationName = pickupLocationName || String(pickupData.name || "").trim();
      pickupLocationAddress = pickupLocationAddress || String(pickupData.address || "").trim();
      pickupContactNumber = pickupContactNumber || String(pickupData.phone || pickupData.contactNumber || "").trim();
    }
  }

  // Send updated pickup confirmation email when admin sets/updates estimatedPrepTime on a pickup order
  const prepTimeUpdated = typeof orderPatch.estimatedPrepTime === "string" && String(orderPatch.estimatedPrepTime).trim().length > 0;
  if (prepTimeUpdated && isPickupOrder) {
    const estimatedPrepTime = String(updatedData.estimatedPrepTime || "").trim();
    if (!customerEmail) {
      console.log(`[EMAIL] Skipping pickup confirmation for ${id}: missing customer email`);
    } else if (!pickupContactNumber || !estimatedPrepTime) {
      console.log(`[EMAIL] Skipping pickup confirmation for ${id}: missing pickup details`);
    } else {
      try {
        await sendEmailOrThrow(
          id,
          "generatePickupConfirmationEmail",
          customerEmail,
          generatePickupConfirmationEmail({
            orderId: id,
            customerName: String(updatedData.customerName || "Customer"),
            customerEmail,
            items: emailItems,
            total: Number(updatedData.total ?? updatedData.subtotal ?? 0),
            pickupContactNumber,
            estimatedPrepTime,
            pickupLocationName,
            pickupLocationAddress,
          }),
        );
      } catch (error) {
        console.error(`[EMAIL ERROR] Failed for ${id}:`, error);
        return NextResponse.json(
          { error: "Failed to send pickup confirmation email" },
          { status: 500 },
        );
      }
    }
  }

  if (statusChanged && newStatusKey) {
    const templateKey = STATUS_CONFIG[newStatusKey]?.emailTemplate;
    if (!templateKey) {
      console.log(`[EMAIL] Missing template mapping for status ${newStatusKey}`);
    } else if (!customerEmail) {
      console.log(`[EMAIL] Skipping ${templateKey} for ${id}: missing customer email`);
    } else {
      try {
        switch (templateKey) {
          case "orderPlaced":
            await sendEmailOrThrow(
              id,
              "generateOrderConfirmationEmail",
              customerEmail,
              generateOrderConfirmationEmail({
                orderId: id,
                customerName: String(updatedData.customerName || "Customer"),
                customerEmail,
                items: emailItems,
                subtotal: Number(updatedData.subtotal ?? 0),
                discount: Number(updatedData.discount ?? 0),
                deliveryFee: Number(updatedData.deliveryFee ?? 0),
                total: Number(updatedData.total ?? updatedData.subtotal ?? 0),
                paymentMethod: String(updatedData.paymentMethod || "Cash on Delivery"),
              }),
            );
            break;
          case "orderConfirmed":
            await sendEmailOrThrow(
              id,
              "generateOrderConfirmedEmail",
              customerEmail,
              generateOrderConfirmedEmail({
                customerName: String(updatedData.customerName || "Customer"),
                customerEmail,
                orderId: id,
                items: emailItems,
                total: Number(updatedData.total ?? updatedData.subtotal ?? 0),
              }),
            );
            break;
          case "readyForPickup":
            if (!isPickupOrder) {
              console.log(`[EMAIL] Skipping ready-for-pickup email for ${id}: delivery order`);
              break;
            }
            await sendEmailOrThrow(
              id,
              "generatePickupReadyEmail",
              customerEmail,
              generatePickupReadyEmail({
                customerName: String(updatedData.customerName || "Customer"),
                customerEmail,
                orderId: id,
                items: emailItems,
                pickupContactNumber: String(updatedData.pickupContactNumber || "").trim(),
                pickupLocationName,
                pickupLocationAddress,
              }),
            );
            break;
          case "outForDelivery":
            if (isPickupOrder) {
              console.log(`[EMAIL] Skipping out-for-delivery email for ${id}: pickup order`);
              break;
            }
            await sendEmailOrThrow(
              id,
              "generateOrderDispatchedEmail",
              customerEmail,
              generateOrderDispatchedEmail({
                customerName: String(updatedData.customerName || "Customer"),
                customerEmail,
                orderId: id,
                items: emailItems,
                trackingNumber: String(updatedData.trackingNumber || "").trim() || undefined,
                estimatedDelivery: String(updatedData.estimatedDelivery || "").trim() || undefined,
              }),
            );
            break;
          case "completed":
            await sendEmailOrThrow(
              id,
              "generateOrderDeliveredEmail",
              customerEmail,
              generateOrderDeliveredEmail({
                customerName: String(updatedData.customerName || "Customer"),
                customerEmail,
                orderId: id,
                items: emailItems,
              }),
            );
            break;
          case "cancelled": {
            const wasPaid = isOrderPaymentReceived(updatedData as Record<string, unknown>, previousStatusDb);
            const cancelledItems = items.map((item) => {
              const row = item as Record<string, unknown>;
              const quantity = Number(row.quantity || 0);
              const unitPrice = Number(row.unitPrice || 0);
              return {
                perfumeName: String(row.perfumeName || "Perfume"),
                quantity,
                ml: Number(row.ml || 0),
                totalPrice: Number(row.totalPrice || quantity * unitPrice),
              };
            });
            await sendEmailOrThrow(
              id,
              "generateOrderCancelledEmail",
              customerEmail,
              generateOrderCancelledEmail({
                customerName: String(updatedData.customerName || "Customer"),
                customerEmail,
                orderId: id,
                cancelReason: String(updatedData.cancelReason || "Order cancelled by admin").trim(),
                refundAmount: wasPaid ? Number(updatedData.refundAmount || updatedData.total || 0) : 0,
                isPaid: wasPaid,
                items: cancelledItems,
              }),
            );
            break;
          }
          default:
            console.log(`[EMAIL] Missing template mapping for status ${newStatusKey}`);
        }
      } catch (error) {
        console.error(`[EMAIL ERROR] Failed for ${id}:`, error);
        return NextResponse.json(
          { error: `Failed to send ${templateKey} email` },
          { status: 500 },
        );
      }
    }
  }

  return NextResponse.json(serializeDoc({
    id: updatedDoc.id,
    ...updatedData,
    status: updatedData.status || "Pending",
    totalAmount: updatedData.totalAmount ?? updatedData.subtotal ?? 0,
    finalAmount: updatedData.finalAmount ?? updatedData.total ?? 0,
    items,
  }));
}
