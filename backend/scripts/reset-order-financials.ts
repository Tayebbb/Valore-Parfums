// ─── reset-order-financials.ts ─────────────────────────
// Zero out order financial fields and owner revenue totals.
//
// Usage: npx tsx scripts/reset-order-financials.ts          (dry-run)
//        npx tsx scripts/reset-order-financials.ts --apply  (save)
// ────────────────────────────────────────────────────────

import { initializeApp, cert, getApps, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { config } from "dotenv";

config({ path: ".env.local" });

const serviceAccount: ServiceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID!,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};

if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

type FirestoreRecord = Record<string, unknown>;

function asRecord(value: unknown): FirestoreRecord {
  return value && typeof value === "object" ? (value as FirestoreRecord) : {};
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function buildZeroPricingSnapshot(now: Timestamp) {
  return {
    pricingVersion: 1,
    currency: "BDT" as const,
    subtotalMinor: 0,
    discountMinor: 0,
    deliveryFeeMinor: 0,
    totalMinor: 0,
    totalCostMinor: 0,
    totalProfitMinor: 0,
    generatedAt: now,
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log("═══════════════════════════════════════");
  console.log("  Reset Order Financials");
  console.log(`  Mode: ${apply ? "APPLY" : "DRY-RUN (pass --apply to save)"}`);
  console.log("═══════════════════════════════════════\n");

  const ordersSnap = await db.collection("orders").get();
  const ownerAccountsSnap = await db.collection("ownerAccounts").get();

  console.log(`Orders found: ${ordersSnap.size}`);
  console.log(`Owner accounts found: ${ownerAccountsSnap.size}\n`);

  const ownerAccountUpdates: Array<{ id: string }> = [];
  for (const doc of ownerAccountsSnap.docs) {
    ownerAccountUpdates.push({ id: doc.id });
  }

  let totalOrderDocs = 0;
  let totalItemDocs = 0;
  let observedOrderProfit = 0;
  let observedOrderRevenue = 0;

  for (const orderDoc of ordersSnap.docs) {
    const orderData = asRecord(orderDoc.data());
    const itemsSnap = await orderDoc.ref.collection("items").get();
    const now = Timestamp.now();

    totalOrderDocs += 1;
    totalItemDocs += itemsSnap.size;
    observedOrderProfit += Math.max(0, toNumber(orderData.profit));
    observedOrderRevenue += Math.max(0, toNumber(orderData.total));

    if (!apply) continue;

    const batch = db.batch();

    batch.update(orderDoc.ref, {
      subtotal: 0,
      discount: 0,
      total: 0,
      profit: 0,
      pricingSnapshot: buildZeroPricingSnapshot(now),
      financialsMinor: {
        subtotalMinor: 0,
        discountMinor: 0,
        deliveryFeeMinor: 0,
        totalMinor: 0,
        totalCostMinor: 0,
        totalProfitMinor: 0,
      },
      profitDistribution: [],
      financialsLocked: false,
      updatedAt: now,
    });

    for (const itemDoc of itemsSnap.docs) {
      const item = asRecord(itemDoc.data());
      const quantity = Math.max(0, Math.floor(toNumber(item.quantity)));
      batch.update(itemDoc.ref, {
        unitPrice: 0,
        totalPrice: 0,
        costPrice: 0,
        ownerProfit: 0,
        otherOwnerProfit: 0,
        financialBreakdown: {
          unitCostMinor: 0,
          unitSellingPriceMinor: 0,
          quantity,
          totalCostMinor: 0,
          totalRevenueMinor: 0,
          computedProfitMinor: 0,
        },
      });
    }

    await batch.commit();
  }

  console.log(`Order docs to reset: ${totalOrderDocs}`);
  console.log(`Order item docs to reset: ${totalItemDocs}`);
  console.log(`Owner revenue docs to reset: ${ownerAccountUpdates.length}\n`);

  if (!apply) {
    console.log("Dry run summary:");
    console.log("- Order subtotal, total, profit, pricing snapshot, and financial breakdowns would be set to zero.");
    console.log("- Item-level selling price, cost, and profit fields would be set to zero.");
    console.log("- Owner account revenue totals would be set to zero.");
    console.log(`- Existing order profit observed: ${observedOrderProfit}`);
    console.log(`- Existing order revenue observed: ${observedOrderRevenue}`);
    console.log("\nRe-run with --apply to write changes.");
    return;
  }

  const ownerBatch = db.batch();
  for (const owner of ownerAccountUpdates) {
    ownerBatch.set(
      db.collection("ownerAccounts").doc(owner.id),
      {
        totalEarned: 0,
        storeShareEarned: 0,
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
  }
  await ownerBatch.commit();

  console.log("\n✓ Order financials reset.");
  console.log("✓ Owner revenue totals reset.");
  console.log("Done.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});