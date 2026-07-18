// ─── backfill-personal-collection-earnings.ts ────────────
// Recompute ownerProfit / otherOwnerProfit on personal-collection order items
// using the corrected productCost derivation:
//
//   productCost = item.costPrice − (packagingCost + bottleCost) × qty
//
// This fixes historical manual admin orders where perfume.purchasePricePerMl
// was 0, which caused the bottle owner to lose the liquid-cost recovery
// portion of their earnings.
//
// Usage:
//   npx tsx scripts/backfill-personal-collection-earnings.ts          (dry-run)
//   npx tsx scripts/backfill-personal-collection-earnings.ts --apply  (save)
// ─────────────────────────────────────────────────────────

import { initializeApp, cert, getApps, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { config } from "dotenv";

config({ path: ".env.local" });

const serviceAccount: ServiceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID!,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};

if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const APPLY = process.argv.includes("--apply");

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function calculatePersonalBottleEarnings(
  sellingPrice: number,
  packagingCost: number,
  productCost: number,
) {
  const netSaleAmount = round2(sellingPrice - packagingCost);
  const profit = round2(netSaleAmount - productCost);
  const bottleOwnerEarnings = round2(productCost + profit * 0.85);
  const otherOwnerEarnings = round2(profit * 0.15);
  return { bottleOwnerEarnings, otherOwnerEarnings };
}

function fmt(n: number): string {
  return n.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Backfill Personal-Collection Earnings");
  console.log(`  Mode: ${APPLY ? "⚠️  APPLY (writing to Firestore)" : "DRY-RUN (pass --apply to save)"}`);
  console.log("═══════════════════════════════════════════════════════\n");

  const itemsSnap = await db.collectionGroup("items").get();

  let scanned = 0;
  let candidates = 0;
  let toUpdate = 0;
  let unchanged = 0;
  let skippedMissingSnapshot = 0;

  const updates: Array<{
    orderId: string;
    itemId: string;
    perfumeName: string;
    ownerName: string;
    before: { ownerProfit: number; otherOwnerProfit: number };
    after: { ownerProfit: number; otherOwnerProfit: number };
    ref: FirebaseFirestore.DocumentReference;
  }> = [];

  for (const doc of itemsSnap.docs) {
    scanned++;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = doc.data() as any;
    const ownerName = String(item.ownerName || "Store");
    if (!item.isPersonalCollection || ownerName === "Store") continue;
    candidates++;

    const snap = item.pricingSnapshot;
    if (!snap) {
      skippedMissingSnapshot++;
      continue;
    }

    const qty = Number(item.quantity ?? 1);
    const totalPrice = Number(item.totalPrice ?? 0);
    const costPrice = Number(item.costPrice ?? 0);
    const packagingTotal =
      (Number(snap.packagingCost ?? 0) + Number(snap.bottleCost ?? 0)) * qty;
    const derivedProductCost = Math.max(0, costPrice - packagingTotal);
    const fallbackProductCost =
      Number(snap.costPricePerMl ?? 0) * Number(item.ml ?? 0) * qty;
    const productCost = derivedProductCost > 0 ? derivedProductCost : fallbackProductCost;

    const result = calculatePersonalBottleEarnings(totalPrice, packagingTotal, productCost);
    const nextOwnerProfit = result.bottleOwnerEarnings;
    const nextOtherOwnerProfit = result.otherOwnerEarnings;

    const prevOwnerProfit = round2(Number(item.ownerProfit ?? 0));
    const prevOtherOwnerProfit = round2(Number(item.otherOwnerProfit ?? 0));

    // Only update if there is a meaningful difference (> 0.01 BDT)
    if (
      Math.abs(nextOwnerProfit - prevOwnerProfit) < 0.01 &&
      Math.abs(nextOtherOwnerProfit - prevOtherOwnerProfit) < 0.01
    ) {
      unchanged++;
      continue;
    }

    toUpdate++;
    updates.push({
      orderId: doc.ref.parent.parent?.id || "?",
      itemId: doc.id,
      perfumeName: String(item.perfumeName || "?"),
      ownerName,
      before: { ownerProfit: prevOwnerProfit, otherOwnerProfit: prevOtherOwnerProfit },
      after: { ownerProfit: nextOwnerProfit, otherOwnerProfit: nextOtherOwnerProfit },
      ref: doc.ref,
    });
  }

  console.log(`Items scanned:               ${scanned}`);
  console.log(`Personal-collection items:   ${candidates}`);
  console.log(`Missing pricingSnapshot:     ${skippedMissingSnapshot}`);
  console.log(`Already correct:             ${unchanged}`);
  console.log(`Need update:                 ${toUpdate}\n`);

  if (updates.length > 0) {
    console.log("Changes:");
    console.log(
      "  " +
        "Order".padEnd(38) +
        "Perfume".padEnd(30) +
        "Owner".padEnd(10) +
        "Before (owner/other)".padEnd(25) +
        "After (owner/other)",
    );
    for (const u of updates) {
      console.log(
        "  " +
          u.orderId.slice(0, 36).padEnd(38) +
          u.perfumeName.slice(0, 28).padEnd(30) +
          u.ownerName.slice(0, 8).padEnd(10) +
          `${fmt(u.before.ownerProfit)} / ${fmt(u.before.otherOwnerProfit)}`.padEnd(25) +
          `${fmt(u.after.ownerProfit)} / ${fmt(u.after.otherOwnerProfit)}`,
      );
    }
    console.log();
  }

  if (!APPLY) {
    console.log("Dry-run complete. Re-run with --apply to persist changes.");
    return;
  }

  if (updates.length === 0) {
    console.log("Nothing to update.");
    return;
  }

  // Commit in batches of ≤500
  let batch = db.batch();
  let batchOps = 0;
  let committed = 0;
  for (const u of updates) {
    batch.update(u.ref, {
      ownerProfit: u.after.ownerProfit,
      otherOwnerProfit: u.after.otherOwnerProfit,
    });
    batchOps++;
    if (batchOps >= 400) {
      await batch.commit();
      committed += batchOps;
      batch = db.batch();
      batchOps = 0;
    }
  }
  if (batchOps > 0) {
    await batch.commit();
    committed += batchOps;
  }

  console.log(`\n✅ Updated ${committed} items.`);
  console.log(
    "Owner-accounts, dashboard, and withdrawal pages recompute earnings from item data,\n" +
      "so the fixed numbers will appear immediately on the admin dashboard.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
