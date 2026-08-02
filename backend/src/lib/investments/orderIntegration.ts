// ─── Order ⇄ Investment integration ────────────────────
// Called from the order status workflow:
//   • Dispatched (financial recognition point — same as owner profit
//     crediting) → processInvestmentSalesForOrder
//   • Cancellation of a Dispatched/Completed order →
//     reverseInvestmentSalesForOrder
// Both are best-effort per item and NEVER throw: an investment accounting
// failure must not block the customer-facing order flow. Failures are
// logged and surface in /api/investments/reports invariant checks and
// scripts/check-investments.ts.
// Idempotency: ledger doc IDs are deterministic per order item
// (`<orderItemId>_capital_<allocationId>` / `rev_…`), written with
// tx.create — duplicate events, webhook replays and concurrent calls
// physically cannot double-post.

import { db, Collections } from "@/lib/firebase-admin";
import { toMinorUnits } from "@/lib/finance";
import { investmentAccounting } from "./accountingService";

export interface OrderInvestmentSummary {
  itemsProcessed: number;
  itemsSkipped: number;
  totalCapitalRecoveredMinor: number;
  totalInvestorProfitMinor: number;
  errors: string[];
}

/**
 * Recognise investor-funded sales for every decant item of an order.
 * Per item: revenue = item.totalPrice (delivery fee is order-level and
 * therefore excluded by construction, per §7.6); selling costs =
 * (packagingCost + bottleCost) × quantity from the item's pricingSnapshot.
 * Items on perfumes without open funded lots fall through untouched
 * ({ processed: false }); partially funded items consume only the funded
 * ml with prorated revenue/costs (allowPartial).
 */
export async function processInvestmentSalesForOrder(
  orderId: string,
  performedBy: string
): Promise<OrderInvestmentSummary> {
  const summary: OrderInvestmentSummary = {
    itemsProcessed: 0,
    itemsSkipped: 0,
    totalCapitalRecoveredMinor: 0,
    totalInvestorProfitMinor: 0,
    errors: [],
  };

  try {
    const itemsSnap = await db
      .collection(Collections.orders)
      .doc(orderId)
      .collection("items")
      .get();

    for (const itemDoc of itemsSnap.docs) {
      const item = itemDoc.data() as Record<string, unknown>;
      const isFullBottle = Boolean(item.isFullBottle);
      const perfumeId = String(item.perfumeId || "").trim();
      const ml = Number(item.ml || 0);
      const quantity = Number(item.quantity || 0);
      // Investment lots fund decant stock (perfumes.totalStockMl in ml);
      // full bottles are not stock-managed in ml → never investor-funded.
      if (isFullBottle || !perfumeId || ml <= 0 || quantity <= 0) {
        summary.itemsSkipped++;
        continue;
      }

      const snap = (item.pricingSnapshot || {}) as Record<string, unknown>;
      const packagingCost = Number(snap.packagingCost || 0);
      const bottleCost = Number(snap.bottleCost || 0);

      try {
        const result = await investmentAccounting.processInvestmentSale({
          perfumeId,
          ml: ml * quantity,
          sellingPriceMinor: toMinorUnits(Number(item.totalPrice || 0)),
          sellingCostsMinor: toMinorUnits((packagingCost + bottleCost) * quantity),
          orderId,
          orderItemId: itemDoc.id,
          performedBy,
          allowPartial: true,
        });
        if (result.processed) {
          summary.itemsProcessed++;
          summary.totalCapitalRecoveredMinor += result.totalCapitalRecoveredMinor;
          summary.totalInvestorProfitMinor += result.totalInvestorProfitMinor;
        } else {
          summary.itemsSkipped++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const normalized = message.toLowerCase();
        if (normalized.includes("already processed") || normalized.includes("already_exists") || normalized.includes("already exists")) {
          // Duplicate event / replay / concurrent call — idempotency worked as designed.
          summary.itemsSkipped++;
        } else {
          summary.errors.push(`item ${itemDoc.id}: ${message}`);
          console.error(`[INVESTMENT] Sale processing failed for order ${orderId}, item ${itemDoc.id}:`, error);
        }
      }
    }
  } catch (error) {
    summary.errors.push(error instanceof Error ? error.message : String(error));
    console.error(`[INVESTMENT] Sale processing failed for order ${orderId}:`, error);
  }

  return summary;
}

/**
 * Reverse all investment ledger activity of a cancelled order.
 * No-op when the order never touched investor-funded stock. Safe against
 * double-cancellation (deterministic `rev_…` ledger keys).
 */
export async function reverseInvestmentSalesForOrder(
  orderId: string,
  performedBy: string
): Promise<{ reversedEntries: number; errors: string[] }> {
  try {
    const { reversedEntries } = await investmentAccounting.reverseSalesForOrder({
      orderId,
      performedBy,
      reason: `Order ${orderId} cancelled`,
    });
    return { reversedEntries, errors: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();
    if (normalized.includes("already_exists") || normalized.includes("already exists")) {
      // rev_ keys already written — reversal previously completed.
      return { reversedEntries: 0, errors: [] };
    }
    console.error(`[INVESTMENT] Reversal failed for order ${orderId}:`, error);
    return { reversedEntries: 0, errors: [message] };
  }
}
