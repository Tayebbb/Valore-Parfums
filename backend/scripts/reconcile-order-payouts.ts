import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { config } from "dotenv";
import { FieldValue, type DocumentData, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { calculateDiscountedPayouts } from "../src/lib/ownerEarnings";
import { computeItemBreakdown, distributeOrderProfit, fromMinorUnits as major, toMinorUnits as minor } from "../src/lib/finance";

// One-time reconciliation for the November 2026 order history. Default is a read-only preview.
// No invoice, withdrawal, inventory count or customer field is rewritten.
const endOfHistory = Date.parse("2026-11-22T00:00:00+06:00");
const balances = () => ({ totalEarned: 0, storeShareEarned: 0 });
type Bucket = keyof ReturnType<typeof balances>;
function bucket(row: DocumentData): Bucket {
  if (["store-share", "cross-owner-share"].includes(row.type)) return "storeShareEarned";
  if (["sale", "owner-revenue-base"].includes(row.type)) return "totalEarned";
  assert.equal(row.type, "cancellation", "Unknown order ledger type");
  return /store|cross.owner/i.test(row.description) ? "storeShareEarned" : "totalEarned";
}

function restoreLine(doc: QueryDocumentSnapshot) {
  const line = doc.data();
  let snap = line.pricingSnapshot;
  if (!snap) {
    // Prices, packaging, and ownership verified against same-day booked lines;
    // Enid confirmed by the business owner for the Amber Oud replacement.
    const orderId = doc.ref.parent.parent!.id;
    const verified = [
      { order: "14d277fb", name: "Angham EDP", ml: 10, liquid: 30.3, bottle: 39.5, oldCost: 323, owner: "Store" },
      { order: "99bbf836", name: "9PM EDP", ml: 10, liquid: 32, bottle: 39.5, oldCost: 340, owner: "Store" },
      { order: "99bbf836", name: "Amber Oud Gold Edition EDP", ml: 5, liquid: 44.17, bottle: 17, oldCost: 241, owner: "Enid" },
    ].find(v => orderId.startsWith(v.order) && line.perfumeName.trim() === v.name && line.ml === v.ml);
    assert(verified && line.addedByAdmin && line.quantity === 1 && line.costPrice === verified.oldCost, "Unverified historical pricing");
    snap = { costPricePerMl: verified.liquid, packagingCost: 20, bottleCost: verified.bottle };
    line.pricingSnapshot = snap;
    line.ownerName = verified.owner;
    line.isPersonalCollection = verified.owner !== "Store";
  }
  if (!line.isFullBottle && !snap.partialDealType && Number.isFinite(snap.costPricePerMl)) {
    const liquidAndPack = snap.costPricePerMl * line.ml + snap.packagingCost;
    const unitCost = minor(liquidAndPack + snap.bottleCost);
    if (minor(line.costPrice) !== unitCost * line.quantity) {
      // Legacy picker omitted the atomizer and sometimes rounded up to a whole taka.
      assert([minor(liquidAndPack), minor(Math.ceil(liquidAndPack))].some(n => n * line.quantity === minor(line.costPrice)), "Unexplained cost difference");
      line.costPrice = major(unitCost * line.quantity);
      line.financialBreakdown = computeItemBreakdown({ unitCostMinor: unitCost, unitSellingPriceMinor: minor(line.unitPrice), quantity: line.quantity });
    }
  }
  return line;
}

async function main() {
  config({ path: ".env.local", quiet: true });
  const { db, Collections: C } = await import("../src/lib/firebase-admin");
  const apply = process.argv.includes("--apply");
  try {
    const report = await db.runTransaction(async tx => {
      const [orders, items, credits, accounts] = await Promise.all([
        tx.get(db.collection(C.orders)), tx.get(db.collectionGroup("items")),
        tx.get(db.collection(C.profitTransactions)), tx.get(db.collection(C.ownerAccounts)),
      ]);
      const owners = ["Tayeb", "Enid"];
      const ledgerBalances = new Map(owners.map(n => [n, balances()]));
      const deltas = new Map(owners.map(n => [n, balances()]));
      const eligibleCredits = credits.docs.filter(d => d.get("orderId") && !d.get("reversed"));
      for (const doc of eligibleCredits) {
        const row = doc.data();
        const account = accounts.docs.find(d => d.id === row.ownerName);
        assert(account && row.createdAt.toMillis() >= account.get("resetAt").toMillis(), "Review historical account reset before applying");
        ledgerBalances.get(account.id)![bucket(row)] += minor(row.amount);
      }
      for (const account of accounts.docs) {
        const amounts = ledgerBalances.get(account.id)!;
        for (const key of Object.keys(amounts) as Bucket[]) assert.equal(minor(account.get(key)), amounts[key], "Account and ledger disagree");
      }
      let changedOrders = 0, changedLines = 0, ledgerRows = 0, costCorrections = 0, reviewed = 0;
      for (const doc of orders.docs) {
        const o = doc.data();
        if (o.createdAt.toMillis() >= endOfHistory) continue;
        reviewed++;
        const docs = items.docs.filter(i => i.ref.parent.parent?.path === doc.ref.path)
          .sort((a,b) => (a.get("payoutIndex") ?? Infinity) - (b.get("payoutIndex") ?? Infinity) || a.id.localeCompare(b.id));
        const lines = docs.map(restoreLine);
        assert(lines.every(i => !i.investmentRecognition?.investorProfitMinor && ["Store", ...owners].includes(i.ownerName)), "Unverified owner or investor");
        assert.equal(lines.reduce((sum, i) => sum + minor(i.totalPrice), 0), minor(o.subtotal), "Invoice and lines disagree");
        const share = Number(o.payoutOwner1Share ?? 60);
        const payouts = calculateDiscountedPayouts(lines, minor(o.discount), share, 85);
        const expected = new Map(owners.map(n => [n, balances()]));
        const settled = ["Dispatched","Delivered","Completed","Fulfilled"].includes(o.status);
        assert(settled || ["Pending","Ready for Pickup","Cancelled","Confirmed"].includes(o.status), "Unrecognized status");
        const audit: Record<string, DocumentData> = {};
        let changed = false;
        function patch(ref: QueryDocumentSnapshot, fields: DocumentData) {
          const data = Object.fromEntries(Object.entries(fields).filter(([k,v]) => !isDeepStrictEqual(ref.get(k),v)));
          if (!Object.keys(data).length) return;
          audit[ref.id] = Object.fromEntries(Object.keys(data).map(k => [k, ref.get(k) ?? null]));
          if (apply) tx.update(ref.ref, data);
          changed = true;
          if (ref.ref.path !== doc.ref.path) changedLines++;
        }
        payouts.forEach(({ distribution, ...p }, index) => {
          const line = lines[index], original = docs[index];
          if (line.costPrice !== original.get("costPrice")) costCorrections++;
          patch(original, { ...p, ownerName: line.ownerName, isPersonalCollection: Boolean(line.isPersonalCollection),
            pricingSnapshot: line.pricingSnapshot, financialBreakdown: line.financialBreakdown, costPrice: line.costPrice });
          if (!settled) return;
          if (line.ownerName === "Store") {
            expected.get(owners[0])!.storeShareEarned += distribution.ownerProfitMinor;
            expected.get(owners[1])!.storeShareEarned += distribution.otherOwnerProfitMinor;
          } else {
            expected.get(line.ownerName)!.totalEarned += distribution.ownerProfitMinor;
            expected.get(owners.find(n => n !== line.ownerName)!)!.storeShareEarned += distribution.otherOwnerProfitMinor;
          }
        });
        const prior = eligibleCredits.filter(d => d.get("orderId") === doc.id);
        for (const credit of prior) expected.get(credit.get("ownerName"))![bucket(credit.data())] -= minor(credit.get("amount"));
        for (const [owner, amounts] of expected) {
          for (const field of Object.keys(amounts) as Bucket[]) {
            const delta = amounts[field];
            if (!delta) continue;
            ledgerRows++;
            changed = true;
            deltas.get(owner)![field] += delta;
            if (apply) tx.create(db.collection(C.profitTransactions).doc(), { orderId: doc.id, ownerName: owner,
              type: field === "totalEarned" ? "sale" : "store-share", amount: major(delta),
              description: "Historical order payout reconciliation", createdAt: FieldValue.serverTimestamp(),
              reconciliation: { source: "2026-11-owner-payouts", priorEntries: prior.map(d => d.id) } });
          }
        }
        const cost = lines.reduce((sum,i) => sum + minor(i.costPrice), 0);
        const profit = minor(o.subtotal) - minor(o.discount) - cost;
        const fields: DocumentData = { payoutOwner1Share: share, profit: major(profit), profitDistribution: distributeOrderProfit({
          items: payouts.map(p => p.distribution), owner1Name: owners[0], owner2Name: owners[1], owner1Share: share }) };
        for (const key of ["pricingSnapshot","financialsMinor"]) if (o[key]) fields[key] = { ...o[key], totalCostMinor: cost, totalProfitMinor: profit };
        patch(doc, fields);
        if (changed) {
          changedOrders++;
          if (apply) tx.create(doc.ref.collection("payoutReconciliations").doc(), { priorFields: audit, createdAt: FieldValue.serverTimestamp() });
        }
      }
      for (const [owner, amounts] of deltas) {
        const patch: DocumentData = {};
        for (const field of Object.keys(amounts) as Bucket[]) if (amounts[field]) patch[field] = major(ledgerBalances.get(owner)![field] + amounts[field]);
        if (apply && Object.keys(patch).length) tx.update(db.collection(C.ownerAccounts).doc(owner), patch);
      }
      return { reviewed, changedOrders, changedLines, costCorrections, ledgerRows, balanceChangesInMinorUnits: Object.fromEntries(deltas) };
    });
    console.log(apply ? "Applied" : "Preview", JSON.stringify(report));
  } finally { await db.terminate(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
