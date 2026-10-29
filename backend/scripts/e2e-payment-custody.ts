/** Run only against the local emulator (never loads .env or production credentials):
 * FIRESTORE_EMULATOR_HOST=127.0.0.1:8189 npx tsx scripts/e2e-payment-custody.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Stub only request-scoped authentication; use real Firestore and route implementations. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { orderCashAmountMinor } from "../src/lib/payment-custody";

if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8189") {
  throw new Error("This test requires the local Firestore emulator at 127.0.0.1:8189");
}
const app = initializeApp({ projectId: `demo-payment-custody-${randomUUID().slice(0, 6)}` }, randomUUID());
const db = getFirestore(app);
const Collections = Object.fromEntries([
  "settings", "orders", "paymentReceipts", "paymentTransfers", "paymentCustodyActions",
  "perfumes", "bottles", "stockRequests", "ownerAccounts", "withdrawals", "requests", "profitTransactions",
].map((name) => [name, name]));
let admin: { name: string; email: string } | null = { name: "Tayeb", email: "tayeb@example.test" };
const serializeDoc = (value: unknown): unknown => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeDoc);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serializeDoc(child)]));
  return value;
};
for (const [path, exports] of [
  ["../src/lib/auth", { requireAdmin: async () => admin }],
  ["../src/lib/prisma", { db, Collections, serializeDoc }],
] as const) {
  const resolved = require.resolve(path);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports } as NodeJS.Module;
}
const { GET, POST } = require("../src/app/api/payment-custody/route");
const { GET: dashboardGET } = require("../src/app/api/dashboard/route");
const read = async () => (await GET()).json();
const post = async (body: Record<string, unknown>) => {
  const order = body.action === "receive" ? (await db.doc(`orders/${body.orderId}`).get()).data() : undefined;
  return POST(new Request("http://localhost/api/payment-custody", {
    method: "POST", body: JSON.stringify({ requestId: randomUUID(), expectedAmountMinor: orderCashAmountMinor(order || {}), ...body }),
  }));
};

async function main() {
  const now = Timestamp.now();
  await db.doc("settings/default").set({ owner1Name: "Tayeb", owner2Name: "Enid", owner1Email: "tayeb@example.test", owner2Email: "enid@example.test", owner1Share: 60, owner2Share: 40 });
  for (const [id, total, deliveryFee, paymentMethod] of [
    ["prepaid", 3100, 100, "Bkash Manual"], ["cod", 1120, 120, "Cash on Delivery"], ["bank", 2150, 150, "Bank Manual"],
  ] as const) {
    await db.doc(`orders/${id}`).set({ total, deliveryFee, paymentMethod, profit: 200, status: "Dispatched", pickupMethod: "Delivery", createdAt: now, customerName: "Fixture customer" });
    await db.doc(`orders/${id}/items/item`).set({ ownerName: "Store", perfumeName: "Fixture", totalPrice: total - deliveryFee, costPrice: total - deliveryFee - 200, quantity: 1, ml: 10 });
  }
  const dashboardBefore = await (await dashboardGET()).json();
  assert.equal(dashboardBefore.totalRevenue, 6000);
  assert.equal(dashboardBefore.totalProfit, 600);
  assert.equal((await read()).heldMinor, 0);
  const original = { action: "receive", orderId: "prepaid", ownerId: "owner2", revision: 0, transferredThrough: 0, requestId: randomUUID() };
  assert.equal((await post(original)).status, 200);
  assert.equal((await post(original)).status, 200);
  assert.equal((await read()).heldMinor, 310000);
  assert.equal((await db.collection("paymentReceipts").get()).size, 1);

  const stale = await read();
  assert.equal((await post({ action: "receive", orderId: "cod", ownerId: "owner2", revision: 0, transferredThrough: 0 })).status, 200);
  assert.equal((await read()).heldMinor, 410000);
  await db.doc("orders/cod").update({ total: 2120 });
  assert.equal((await post({ action: "receive", orderId: "cod", ownerId: "owner1", revision: 1, transferredThrough: 0, expectedAmountMinor: 100000 })).status, 409);
  assert.equal((await read()).heldMinor, 410000, "Stale order edits never silently change the recorded cash");
  await db.doc("orders/cod").update({ total: 1120 });
  assert.equal((await post({ action: "transfer", expectedSequence: stale.sequence, transferredThrough: stale.transferredThrough })).status, 409);
  assert.equal((await read()).heldMinor, 410000);
  await db.doc("settings/default").update({ owner2Name: "Enid Updated" });
  assert.equal((await read()).heldMinor, 410000);
  assert.equal((await read()).receipts.prepaid.holderId, "owner2");
  await db.doc("settings/default").update({ owner2Name: "Enid" });

  const fresh = await read();
  const transfer = { action: "transfer", expectedSequence: fresh.sequence, transferredThrough: fresh.transferredThrough, requestId: randomUUID() };
  const competingTransfer = { ...transfer, requestId: randomUUID() };
  const outcomes = await Promise.all([post(transfer), post(competingTransfer)]);
  assert.deepEqual(outcomes.map((response: Response) => response.status).sort(), [200, 409]);
  assert.equal((await read()).heldMinor, 0);
  assert.equal((await read()).receipts.prepaid.holderId, "owner1");
  const winningTransfer = outcomes[0].status === 200 ? transfer : competingTransfer;
  assert.equal((await post(winningTransfer)).status, 200);
  assert.equal((await db.collection("paymentTransfers").get()).size, 1);
  assert.equal((await read()).transfers[0].amountMinor, 410000);
  assert.deepEqual(await (await dashboardGET()).json(), dashboardBefore, "The actual dashboard response is identical before/after payment assignment and handover");

  const state = await read();
  const assignments = await Promise.all([
    post({ action: "receive", orderId: "bank", ownerId: "owner2", revision: 0, transferredThrough: state.transferredThrough }),
    post({ action: "receive", orderId: "bank", ownerId: "owner1", revision: 0, transferredThrough: state.transferredThrough }),
  ]);
  assert.deepEqual(assignments.map((response: Response) => response.status).sort(), [200, 409]);
  assert.equal((await db.collection("paymentReceipts").get()).size, 3, "Contending assignments never create duplicate receipts");
  assert.deepEqual(await (await dashboardGET()).json(), dashboardBefore);
  admin = { name: "Other", email: "other@example.test" };
  assert.equal((await post({ action: "transfer" })).status, 403);
  admin = null;
  assert.equal((await GET()).status, 401);
  console.log("Firestore emulator checks passed: actual transactions, concurrent transfers/assignments, retries, stale tabs, owner renames, prepaid/COD amounts, and unchanged dashboard response.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await db.terminate(); await deleteApp(app); });
