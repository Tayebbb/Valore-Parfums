/** Isolated route tests. No Firebase initialization, credentials, or live writes.
 * Run from backend: npx tsx scripts/test-payment-custody.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { currentPaymentHolder, enidHeldMinor, orderCashAmountMinor } from "../src/lib/payment-custody";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports -- Test-only dependency doubles for the real route. */

type Row = Record<string, any>; // Test-only Firestore double.
const rows = new Map<string, Row>();
const snapshot = (path: string) => ({ id: path.split("/").pop(), exists: rows.has(path), data: () => rows.get(path) });
const collection = (name: string, descending = false, maximum = Infinity): any => ({
  doc: (id: string) => ({ path: `${name}/${id}` }),
  orderBy: () => collection(name, true, maximum),
  limit: (count: number) => collection(name, descending, count),
  query: () => [...rows.keys()].filter((path) => path.startsWith(`${name}/`))
    .sort((a, b) => descending ? Number(rows.get(b)?.createdAt?.seconds || 0) - Number(rows.get(a)?.createdAt?.seconds || 0) : a.localeCompare(b))
    .slice(0, maximum).map(snapshot),
});
let queue: Promise<unknown> = Promise.resolve();
const fakeDb = {
  collection,
  runTransaction(callback: (tx: any) => Promise<unknown>) {
    const run = queue.then(async () => {
      const writes: (() => void)[] = [];
      const result = await callback({
        get: async (ref: any) => ref.path ? snapshot(ref.path) : { docs: ref.query() },
        set: (ref: any, data: Row) => writes.push(() => rows.set(ref.path, data)),
        create: (ref: any, data: Row) => writes.push(() => { assert(!rows.has(ref.path)); rows.set(ref.path, data); }),
      });
      writes.forEach((write) => write());
      return result;
    });
    queue = run.catch(() => {});
    return run;
  },
};
let admin: Row | null = { name: "Tayeb", email: "tayeb@example.test", role: "admin" };
// Replace only the route's external dependencies before loading it. The actual
// transaction callback, validation, authorization and response run unchanged.
for (const [path, exports] of [
  ["../src/lib/auth", { requireAdmin: async () => admin }],
  ["../src/lib/prisma", { db: fakeDb, Collections: { settings: "settings", orders: "orders", paymentReceipts: "paymentReceipts", paymentTransfers: "paymentTransfers", paymentCustodyActions: "paymentCustodyActions" }, serializeDoc: (value: unknown) => JSON.parse(JSON.stringify(value)) }],
] as const) {
  const resolved = require.resolve(path);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports } as NodeJS.Module;
}
const { GET, POST } = require("../src/app/api/payment-custody/route");
const read = async () => (await GET()).json();
const post = async (body: Row) => POST(new Request("http://localhost/api/payment-custody", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: randomUUID(), expectedAmountMinor: orderCashAmountMinor(rows.get(`orders/${body.orderId}`) || {}), ...body }),
}));

async function main() {
  rows.set("settings/default", { owner1Name: "Tayeb", owner2Name: "Enid", owner1Email: "tayeb@example.test", owner2Email: "enid@example.test", owner1Share: 60, owner2Share: 40 });
  rows.set("ownerAccounts/Enid", { totalEarned: 1000, storeShareEarned: 400 });
  rows.set("ownerAccounts/Tayeb", { totalEarned: 1500, storeShareEarned: 600 });
  rows.set("profitTransactions/enid-sale", { ownerName: "Enid", type: "sale", amount: 1000 });
  rows.set("withdrawals/enid-profit", { ownerName: "Enid", withdrawFrom: "Owner's Profit", amount: 300, status: "Completed" });
  const profitState = () => JSON.stringify([...rows.entries()].filter(([path]) => /^(ownerAccounts\/|profitTransactions\/|withdrawals\/|settings\/default$)/.test(path)));
  const profitBefore = profitState();
  rows.set("orders/one", { total: 3100, deliveryFee: 100, status: "Confirmed", paymentMethod: "Bkash Manual" });
  rows.set("orders/two", { total: 1120, deliveryFee: 120, status: "Dispatched" });
  rows.set("orders/unpaid", { total: 20000, status: "Pending" });
  rows.set("orders/cancelled", { total: 500, status: "Cancelled" });
  // The dashboard reads business records, never payment-holder metadata.
  const dashboardInputs = () => JSON.stringify([...rows.entries()].filter(([path]) =>
    !/^(paymentReceipts\/|paymentTransfers\/|paymentCustodyActions\/|settings\/paymentCustody$)/.test(path)));
  const dashboardBefore = dashboardInputs();
  assert.equal(orderCashAmountMinor({ total: 10.29, deliveryFee: 0.10 }), 1019);
  assert.equal(orderCashAmountMinor({ total: 5, financialsMinor: { totalMinor: 12345, deliveryFeeMinor: 345 } }), 12000);
  assert.equal(orderCashAmountMinor({ total: NaN }), 0);
  assert.equal(orderCashAmountMinor({ total: 3100, deliveryFee: 100, paymentMethod: "Bkash Manual" }), 310000, "Prepaid cash includes the delivery money actually received");
  assert.equal((await read()).heldMinor, 0, "Existing/unpaid orders are never guessed as Enid's cash");

  const assign = { action: "receive", orderId: "one", ownerId: "owner2", revision: 0, transferredThrough: 0, requestId: randomUUID() };
  assert.equal((await post(assign)).status, 200);
  assert.equal((await post(assign)).status, 200, "Exact retry is idempotent");
  assert.equal((await read()).heldMinor, 310000, "Prepaid delivery money included in Enid's cash balance");
  assert.equal(profitState(), profitBefore, "Recording Enid's cash leaves both owners' profit shares, earnings and withdrawals untouched");
  for (let revision = 1; revision <= 3; revision++) {
    assert.equal((await post({ ...assign, requestId: randomUUID(), revision })).status, 200);
    const repeated = await read();
    assert.equal(repeated.heldMinor, 310000, "Recording the same payment again must not add its amount twice");
    assert.equal(Object.keys(repeated.receipts).length, 1, "An order has exactly one payment-holder record");
  }
  assert.equal(dashboardInputs(), dashboardBefore, "Payment-holder changes leave every dashboard input unchanged");
  assert.equal((await post({ ...assign, requestId: randomUUID() })).status, 409, "Stale receipt updates rejected");
  const staleTransfer = { action: "transfer", expectedSequence: (await read()).sequence, transferredThrough: 0 };
  assert.equal((await post({ action: "receive", orderId: "two", ownerId: "owner1", revision: 0, transferredThrough: 0 })).status, 200);
  assert.equal((await read()).heldMinor, 310000, "Business receipts do not increase Enid's cash");
  rows.get("orders/two")!.total = 2120;
  assert.equal((await post({ action: "receive", orderId: "two", ownerId: "owner2", revision: 1, transferredThrough: 0, expectedAmountMinor: 100000 })).status, 409, "A stale order price cannot silently record a different payment amount");
  rows.get("orders/two")!.total = 1120;
  assert.equal((await post(staleTransfer)).status, 409, "Stale transfers cannot silently include changed payments");
  assert.equal((await read()).heldMinor, 310000, "A rejected stale transfer leaves the cash untouched");
  rows.get("settings/default")!.owner2Name = "Enid Renamed";
  assert.equal((await read()).heldMinor, 310000, "Renaming an owner preserves the cash held by their stable account");
  assert.equal((await read()).receipts.one.holderId, "owner2");
  rows.get("settings/default")!.owner2Name = "Enid";
  assert.equal((await post({ action: "receive", orderId: "cancelled", ownerId: "owner2", revision: 0, transferredThrough: 0 })).status, 400);
  assert.equal((await post({ action: "receive", orderId: "missing", ownerId: "owner2", revision: 0, transferredThrough: 0 })).status, 404);
  assert.equal((await post({ action: "receive", orderId: "two", ownerId: "Other", revision: 1, transferredThrough: 0 })).status, 400);
  const businessBefore = JSON.stringify([...rows.entries()].filter(([path]) => path.startsWith("orders/")));

  const transferRequest = { action: "transfer", requestId: randomUUID(), expectedSequence: (await read()).sequence, transferredThrough: 0 };
  const transfers = await Promise.all([post(transferRequest), post({ ...transferRequest, requestId: randomUUID() })]);
  assert.deepEqual(transfers.map((response: Response) => response.status).sort(), [200, 409], "Concurrent transfers settle funds once");
  let summary = await read();
  assert.equal(summary.heldMinor, 0);
  assert.equal(summary.receipts.one.holderId, "owner1", "Transferred orders show business custody");
  assert.equal(summary.transfers.length, 1);
  assert.equal(summary.transfers[0].amountMinor, 310000);
  assert.equal((await post(transferRequest)).status, 200, "Retrying the same transfer succeeds without recording it again");
  assert.equal((await read()).transfers.length, 1, "A retried transfer has exactly one history entry");
  assert.equal((await read()).heldMinor, 0, "A retried transfer cannot deduct money twice");
  assert.equal(dashboardInputs(), dashboardBefore, "Transfers leave dashboard totals and all their source records unchanged");
  assert.equal(JSON.stringify([...rows.entries()].filter(([path]) => path.startsWith("orders/"))), businessBefore, "Transfers never change order revenue or profit");
  assert.equal(profitState(), profitBefore, "Transferring all Enid's cash preserves his existing profit entitlement and share percentages");
  assert.equal((await post({ action: "receive", orderId: "one", ownerId: "owner2", revision: 4, transferredThrough: 0 })).status, 409, "Old tabs cannot restore transferred funds");

  assert.equal((await post({ action: "receive", orderId: "two", ownerId: "owner2", revision: 1, transferredThrough: summary.transferredThrough })).status, 200);
  summary = await read();
  assert.equal(summary.heldMinor, 100000, "New receipts accumulate after a transfer");
  rows.set("orders/two", { total: 1120, deliveryFee: 120, status: "Cancelled" });
  assert.equal((await read()).heldMinor, 100000, "Cancellation alone does not pretend cash was refunded");
  assert.equal((await post({ action: "receive", orderId: "two", ownerId: "", revision: 2, transferredThrough: summary.transferredThrough })).status, 200);
  assert.equal((await read()).heldMinor, 0, "Recording returned cash clears the balance");
  assert.equal(profitState(), profitBefore, "Cash-holder corrections and returned payments do not change the separate profit accounting");

  admin = { name: "Other", email: "other@example.test", role: "admin" };
  assert.equal((await post({ action: "transfer" })).status, 403);
  assert.equal((await read()).canManage, false);
  admin = null;
  assert.equal((await GET()).status, 401);
  assert.equal((await post({ action: "transfer" })).status, 401);

  // More than a Firestore batch's write capacity still settles with one cutoff.
  const receipts = Array.from({ length: 1000 }, (_, id) => ({ id: `${id}`, ownerId: "owner2" as const, amountMinor: 101, sequence: id + 1, revision: 1 }));
  assert.equal(enidHeldMinor(receipts, { sequence: 1000, transferredThrough: 0 }), 101000);
  assert.equal(enidHeldMinor(receipts, { sequence: 1000, transferredThrough: 1000 }), 0);
  assert.equal(currentPaymentHolder(receipts[0], { sequence: 1000, transferredThrough: 1000 }), "owner1");
  console.log("Payment custody: all route and balance checks passed (isolated in-memory storage).");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
