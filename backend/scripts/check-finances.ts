// ─── check-finances.ts ─────────────────────────────────
// Reports real financial numbers from Firestore.
// Usage: npx tsx scripts/check-finances.ts
// ────────────────────────────────────────────────────────

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

function toMinorUnits(v: number) { return Math.round(v * 100); }
function fromMinorUnits(v: number) { return v / 100; }
function fmt(n: number) { return n.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function normalizeStatus(status?: string, pickupMethod?: string): string {
  if (!status) return "Pending";
  const s = status.toLowerCase();
  if (s === "dispatched" || s === "delivered" || s === "picked up" || s === "completed") return "Dispatched";
  if (s === "cancelled" || s === "refunded") return "Cancelled";
  if (s === "pending bkash verification" || s === "pending bank verification") return "Pending";
  return "Pending";
}

function calculatePersonalBottleEarnings(sellingPrice: number, packagingCost: number, productCost: number) {
  const r = (v: number) => Math.round(v * 100) / 100;
  const netSaleAmount = r(sellingPrice - packagingCost);
  const profit = r(netSaleAmount - productCost);
  const bottleOwnerEarnings = r(productCost + profit * 0.85);
  const otherOwnerEarnings = r(profit * 0.15);
  return { netSaleAmount, profit, bottleOwnerEarnings, otherOwnerEarnings };
}

async function main() {
  const [ordersSnap, allItemsSnap, withdrawalsSnap, ownerAccountsSnap] = await Promise.all([
    db.collection("orders").get(),
    db.collectionGroup("items").get(),
    db.collection("withdrawals").get(),
    db.collection("ownerAccounts").get(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allOrders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
  const dispatchedOrders = allOrders.filter((o) => normalizeStatus(o.status, o.pickupMethod) === "Dispatched");
  const cancelledOrders = allOrders.filter((o) => normalizeStatus(o.status, o.pickupMethod) === "Cancelled");
  const pendingOrders = allOrders.filter((o) => normalizeStatus(o.status, o.pickupMethod) === "Pending");

  console.log("\n════════════════════════════════════════════════════════");
  console.log("  VALORE PARFUMS — FINANCIAL SNAPSHOT");
  console.log("════════════════════════════════════════════════════════");
  console.log(`  Total orders: ${allOrders.length}  |  Dispatched: ${dispatchedOrders.length}  |  Pending: ${pendingOrders.length}  |  Cancelled: ${cancelledOrders.length}`);

  // Build itemsByOrder map
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemsByOrder = new Map<string, any[]>();
  for (const doc of allItemsSnap.docs) {
    const orderId = doc.ref.parent.parent?.id;
    if (!orderId) continue;
    const list = itemsByOrder.get(orderId) || [];
    list.push({ id: doc.id, ...doc.data() });
    itemsByOrder.set(orderId, list);
  }

  let totalRevenueMinor = 0;
  let totalProfitMinor = 0;
  let bkashGrossMinor = 0;
  let bankGrossMinor = 0;
  let codGrossMinor = 0;
  let bkashWithdrawableMinor = 0;
  let bankWithdrawableMinor = 0;
  let codWithdrawableMinor = 0;
  // Store cost breakdown across all personal collection items
  let totalPackagingMaterialMinor = 0;
  let totalBottleCostMinor = 0;

  // Per-order personal collection deduction
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function personalDeductionMinor(order: any): number {
    const items = itemsByOrder.get(order.id) || [];
    let deduction = 0;
    for (const item of items) {
      if (!item.isPersonalCollection || (item.ownerName || "Store") === "Store") continue;
      const snap = item.pricingSnapshot;
      if (!snap) continue;
      const qty = Number(item.quantity ?? 1);
      const r = calculatePersonalBottleEarnings(
        Number(item.totalPrice ?? 0),
        (Number(snap.packagingCost ?? 0) + Number(snap.bottleCost ?? 0)) * qty,
        Number(snap.costPricePerMl ?? 0) * Number(item.ml ?? 0) * qty,
      );
      deduction += toMinorUnits(r.bottleOwnerEarnings + r.otherOwnerEarnings);
    }
    return deduction;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function grossMinor(order: any): number {
    const totalMinor = Number(order?.financialsMinor?.totalMinor ?? toMinorUnits(order.total ?? 0));
    const deliveryFeeMinor = Number(order?.financialsMinor?.deliveryFeeMinor ?? toMinorUnits(order.deliveryFee ?? 0));
    return Math.max(0, totalMinor - deliveryFeeMinor);
  }

  console.log("\n─── DISPATCHED ORDERS ──────────────────────────────────");
  for (const order of dispatchedOrders) {
    const gross = grossMinor(order);
    // Delivery fee excluded from all payment methods — merchant app auto-deducts it.
    const sourceWithdrawableBase = gross;
    const profitMinor = Number(order?.financialsMinor?.totalProfitMinor ?? toMinorUnits(order.profit ?? 0));
    const deduction = personalDeductionMinor(order);
    const withdrawable = Math.max(0, sourceWithdrawableBase - deduction);
    const pm = String(order.paymentMethod || "Unknown");
    totalRevenueMinor += gross;
    totalProfitMinor += profitMinor;
    if (pm === "Bkash Manual")        { bkashGrossMinor += gross; bkashWithdrawableMinor += withdrawable; }
    else if (pm === "Bank Manual")     { bankGrossMinor += gross; bankWithdrawableMinor += withdrawable; }
    else if (pm === "Cash on Delivery"){ codGrossMinor += gross; codWithdrawableMinor += withdrawable; }

    const items = itemsByOrder.get(order.id) || [];
    const hasPersonal = items.some((i) => i.isPersonalCollection && (i.ownerName || "Store") !== "Store");
    console.log(
      `  Order ${order.id.slice(0, 8)}  [${pm.padEnd(18)}]  total=${fmt(fromMinorUnits(gross))} BDT` +
      `  profit=${fmt(fromMinorUnits(profitMinor))} BDT` +
      (hasPersonal ? `  personal_col_deduction=${fmt(fromMinorUnits(deduction))} BDT  withdrawable=${fmt(fromMinorUnits(withdrawable))} BDT` : "")
    );
    for (const item of items) {
      const snap = item.pricingSnapshot;
      const qty = Number(item.quantity ?? 1);
      if (item.isPersonalCollection && (item.ownerName || "Store") !== "Store" && snap) {
        const r = calculatePersonalBottleEarnings(
          Number(item.totalPrice ?? 0),
          (Number(snap.packagingCost ?? 0) + Number(snap.bottleCost ?? 0)) * qty,
          Number(snap.costPricePerMl ?? 0) * Number(item.ml ?? 0) * qty,
        );
        const packMat = Number(snap.packagingCost ?? 0) * qty;
        const bottleCostRaw = Number(snap.bottleCost ?? 0) * qty;
        totalPackagingMaterialMinor += toMinorUnits(packMat);
        totalBottleCostMinor += toMinorUnits(bottleCostRaw);
        console.log(
          `    └─ [PERSONAL] ${item.name || item.perfumeName || item.id.slice(0,8)}  owner=${item.ownerName}  sellingPrice=${item.totalPrice}` +
          `  packagingMaterial=${packMat.toFixed(2)}  bottleCost=${bottleCostRaw.toFixed(2)}  totalPackaging=${(packMat+bottleCostRaw).toFixed(2)}` +
          `  productCost=${(Number(snap.costPricePerMl??0)*Number(item.ml??0)*qty).toFixed(2)}` +
          `  profit=${r.profit.toFixed(2)}  bottleOwnerEarnings=${r.bottleOwnerEarnings.toFixed(2)}  otherOwnerEarnings=${r.otherOwnerEarnings.toFixed(2)}` +
          `  storeKeeps=${(packMat+bottleCostRaw).toFixed(2)}`
        );
      } else {
        console.log(
          `    └─ [STORE]    ${item.name || item.perfumeName || item.id.slice(0,8)}  owner=${item.ownerName || "Store"}  price=${item.totalPrice}`
        );
      }
    }
  }

  console.log("\n─── STORE REVENUE BREAKDOWN (personal collection items) ─");
  console.log(`  Packaging material cost (snap.packagingCost × qty): ${fmt(fromMinorUnits(totalPackagingMaterialMinor))} BDT`);
  console.log(`  Bottle/sprayer cost     (snap.bottleCost × qty):    ${fmt(fromMinorUnits(totalBottleCostMinor))} BDT`);
  console.log(`  ─────────────────────────────────────────────────────`);
  console.log(`  Total store keeps (packaging + bottle):              ${fmt(fromMinorUnits(totalPackagingMaterialMinor + totalBottleCostMinor))} BDT`);

  console.log("\n─── REVENUE SUMMARY ────────────────────────────────────");
  console.log(`  Total Revenue (gross, excl delivery): ${fmt(fromMinorUnits(totalRevenueMinor))} BDT`);
  console.log(`  Total Profit (from order snapshots):  ${fmt(fromMinorUnits(totalProfitMinor))} BDT`);
  console.log(`  Bkash  | Gross: ${fmt(fromMinorUnits(bkashGrossMinor))} BDT  |  Withdrawable: ${fmt(fromMinorUnits(bkashWithdrawableMinor))} BDT`);
  console.log(`  Bank   | Gross: ${fmt(fromMinorUnits(bankGrossMinor))} BDT  |  Withdrawable: ${fmt(fromMinorUnits(bankWithdrawableMinor))} BDT`);
  console.log(`  COD    | Gross: ${fmt(fromMinorUnits(codGrossMinor))} BDT  |  Withdrawable: ${fmt(fromMinorUnits(codWithdrawableMinor))} BDT`);
  const totalWithdrawable = bkashWithdrawableMinor + bankWithdrawableMinor + codWithdrawableMinor;
  console.log(`  ─────────────────────────────────────────────────────`);
  console.log(`  Total Store Revenue (withdrawable):   ${fmt(fromMinorUnits(totalWithdrawable))} BDT`);

  // Withdrawals
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withdrawals = withdrawalsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
  const completedWithdrawals = withdrawals.filter((w) => (w.status ?? "Completed") === "Completed");
  const revenueWithdrawals = completedWithdrawals.filter((w) => (w.withdrawFrom ?? (w.withdrawalType === "revenue" ? "Store Revenue" : "Owner's Profit")) === "Store Revenue");
  const profitWithdrawals = completedWithdrawals.filter((w) => (w.withdrawFrom ?? (w.withdrawalType === "revenue" ? "Store Revenue" : "Owner's Profit")) === "Owner's Profit");

  const revenueWithdrawnTotal = revenueWithdrawals.reduce((s: number, w: { amount?: number }) => s + Number(w.amount || 0), 0);
  const bkashWithdrawn = revenueWithdrawals.filter((w) => w.paymentSource === "Bkash").reduce((s: number, w: { amount?: number }) => s + Number(w.amount || 0), 0);
  const bankWithdrawn = revenueWithdrawals.filter((w) => w.paymentSource === "Bank").reduce((s: number, w: { amount?: number }) => s + Number(w.amount || 0), 0);
  const codWithdrawn = revenueWithdrawals.filter((w) => w.paymentSource === "COD").reduce((s: number, w: { amount?: number }) => s + Number(w.amount || 0), 0);

  console.log("\n─── REVENUE WITHDRAWALS ────────────────────────────────");
  console.log(`  Revenue withdrawn (total): ${fmt(revenueWithdrawnTotal)} BDT`);
  console.log(`  Bkash withdrawn:           ${fmt(bkashWithdrawn)} BDT`);
  console.log(`  Bank withdrawn:            ${fmt(bankWithdrawn)} BDT`);
  console.log(`  COD withdrawn:             ${fmt(codWithdrawn)} BDT`);
  console.log(`  Revenue Balance:           ${fmt(fromMinorUnits(totalWithdrawable) - revenueWithdrawnTotal)} BDT`);
  console.log(`  COD Balance (withdrawable):${fmt(fromMinorUnits(codWithdrawableMinor) - codWithdrawn)} BDT`);

  // Owner accounts
  console.log("\n─── OWNER ACCOUNTS ─────────────────────────────────────");
  for (const doc of ownerAccountsSnap.docs) {
    const a = doc.data();
    console.log(`  ${doc.id}:`);
    console.log(`    totalEarned:       ${fmt(Number(a.totalEarned ?? 0))} BDT`);
    console.log(`    storeShareEarned:  ${fmt(Number(a.storeShareEarned ?? 0))} BDT`);
  }

  // Per-owner profit withdrawals
  const ownerNames = [...new Set(profitWithdrawals.map((w: { ownerName?: string }) => w.ownerName || "Unknown"))];
  if (ownerNames.length > 0) {
    console.log("\n─── PROFIT WITHDRAWALS ─────────────────────────────────");
    for (const name of ownerNames) {
      const total = profitWithdrawals.filter((w: { ownerName?: string }) => w.ownerName === name).reduce((s: number, w: { amount?: number }) => s + Number(w.amount || 0), 0);
      console.log(`  ${name}: ${fmt(total)} BDT withdrawn`);
    }
  }

  console.log("\n════════════════════════════════════════════════════════\n");
}

main().catch(console.error);
