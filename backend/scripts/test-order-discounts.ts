/** Run from backend with npx tsx scripts/test-order-discounts.ts. */
import assert from "node:assert/strict";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports -- In-memory doubles for route dependencies. */

type Row = Record<string, any>;
const rows = new Map<string, Row>();
let admin: Row | null = { id: "staff", role: "admin" };

function doc(path: string): any {
  const id = path.split("/").at(-1);
  return {
    id, path,
    get: async () => ({ id, exists: rows.has(path), ref: doc(path), data: () => rows.get(path) }),
    collection: (name: string) => collection(path + "/" + name),
    set: (data: Row, options?: { merge: boolean }) => {
      if (!options?.merge) return rows.set(path, data);
      if (!rows.has(path)) rows.set(path, {});
      return doc(path).update(data);
    },
    update: (data: Row) => {
      const prev = rows.get(path);
      assert.ok(prev);
      const next = { ...prev, ...data };
      for (const [key, value] of Object.entries(data)) {
        if (value?.operand !== undefined) next[key] = (prev[key] || 0) + value.operand;
      }
      rows.set(path, next);
    },
    delete: () => rows.delete(path),
  };
}

function collection(path: string, matches: (row: Row) => boolean = () => true): any {
  return {
    doc: (id: string) => doc(path + "/" + id),
    where: (key: string, _op: string, value: unknown) => collection(path, row => row[key] === value),
    limit: () => collection(path, matches),
    get: async () => {
      const paths = [...rows.keys()].filter(key =>
        key.slice(0, key.lastIndexOf("/")) === path && matches(rows.get(key)!));
      return { empty: paths.length === 0, docs: await Promise.all(paths.map(key => doc(key).get())) };
    },
  };
}
const writer = {
  get: (ref: any) => ref.get(),
  getAll: (...refs: any[]) => Promise.all(refs.map(ref => ref.get())),
  update: (ref: any, data: Row) => ref.update(data),
  create: (ref: any, data: Row) => { assert.ok(!rows.has(ref.path)); return ref.set(data); },
  set: (ref: any, data: Row, options?: {merge: boolean}) => ref.set(data, options),
  delete: (ref: any) => ref.delete(),
  commit: async () => {},
};
const db = { collection, getAll: writer.getAll, batch: () => writer, runTransaction: (fn: any) => fn(writer) };
const dbModule = { db, Collections: new Proxy({}, { get: (_, key) => key }), serializeDoc: (data: Row) => data };
for (const [path, exports] of [
  ["../src/lib/prisma", dbModule],
  ["../src/lib/firebase-admin", dbModule],
  ["../src/lib/auth", { getSessionUser: async () => null, requireAdmin: async () => admin }],
  ["../src/lib/email", new Proxy({}, { get: () => () => ({}) })],
] as const) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports } as NodeJS.Module;
}
const { PUT } = require("../src/app/api/orders/[id]/route");
const { POST } = require("../src/app/api/orders/route");
const request = (method: string, data: Row) => new Request("http://localhost/api/orders", {
  method, body: JSON.stringify(data),
});
async function edit(id: string, data: Row) {
  const response = await PUT(request("PUT", data), { params: Promise.resolve({ id }) });
  const order = await response.json();
  assert.equal(response.status, 200, JSON.stringify(order));
  return order;
}
const extraItem = { perfumeName: "Sample", ml: 5, quantity: 1, unitPrice: 300, costPrice: 100 };

async function checkReplacementOwnership(checkout: Row) {
  const perfume = { name: "Amber Oud Gold Edition EDP", brand: "Al Haramain", owner: "Enid",
    isPersonalCollection: true, purchasePricePerMl: 14, partialDealType: "decant", partialSellingPrice: 200, totalStockMl: 100 };
  rows.set("perfumes/amber", perfume);
  rows.set("bottles/5ml", { ml: 5, costPerBottle: 10, availableCount: 10 });
  rows.set("settings/default", { packagingCost: 20 });
  async function place(data: Row) {
    const response = await POST(request("POST", { ...checkout, voucherCode: undefined, ...data }));
    const order = await response.json();
    assert.equal(response.status, 201, JSON.stringify(order));
    return order;
  }
  const replacement = { perfumeId: "amber", perfumeName: perfume.name, ml: 5, unitPrice: 200, costPrice: 100, quantity: 2 };
  const direct = await place({ items: [replacement] });
  const original = await place({ items: checkout.items });
  const stockBefore = rows.get("perfumes/amber")!.totalStockMl;
  const bottlesBefore = rows.get("bottles/5ml")!.availableCount;
  const swapped = await edit(original.id, { removeItemIds: [original.items[0].id], addItems: [replacement] });
  assert.equal(swapped.items.length, 1);
  assert.equal(rows.get("perfumes/amber")!.totalStockMl, stockBefore - 10);
  assert.equal(rows.get("bottles/5ml")!.availableCount, bottlesBefore - 2);
  const [item] = swapped.items;
  assert.equal(item.ownerName, "Enid");
  assert.equal(item.isPersonalCollection, true);
  assert.equal(item.ownerProfit, 310); // 140 in liquid cost plus 85% of the 200 profit
  assert.equal(item.otherOwnerProfit, 30);
  assert.equal(item.pricingSnapshot.bottleCost, 10);
  assert.equal(item.pricingSnapshot.packagingCost, 20);
  assert.deepEqual(swapped.profitDistribution, direct.profitDistribution);

  const fullBottle = await place({ manualAdminOrder: true, items: [{ ...replacement, quantity: 1, isFullBottle: true, fullBottleSize: "100ml" }] });
  assert.equal(fullBottle.items[0].ownerName, "Enid");
  assert.equal(fullBottle.items[0].ownerProfit, 165); // 80 in product cost plus 85 in profit
  assert.equal(fullBottle.items[0].otherOwnerProfit, 15);

  const store = await edit(original.id, { addItems: [{ ...replacement, perfumeId: "sample" }] });
  const storeItem = store.items.find((i: Row) => i.perfumeId === "sample");
  assert.equal(storeItem.ownerName, "Store");
  assert.equal(storeItem.ownerProfit, 120);
  assert.equal(storeItem.otherOwnerProfit, 80);
  const missing = await PUT(request("PUT", {
    removeItemIds: [item.id], addItems: [{ ...replacement, perfumeId: "deleted" }],
  }), { params: Promise.resolve({ id: original.id }) });
  assert.equal(missing.status, 409);
  assert.ok(rows.has(`orders/${original.id}/items/${item.id}`));

  // An existing booking keeps its saved shares even if its catalog item now has a different owner.
  rows.set("orders/booked", { status: "Pending", deliveryFee: 0 });
  const bookedLine = { ...replacement, ownerName: "Store", ownerProfit: 120, otherOwnerProfit: 80, totalPrice: 400, costPrice: 200 };
  rows.set("orders/booked/items/amber", bookedLine);
  const booked = await edit("booked", { deliveryFee: 50, useCatalogOwnershipOnEdit: true });
  assert.deepEqual(booked.items[0], { id: "amber", ...bookedLine });
  assert.equal(booked.useCatalogOwnershipOnEdit, undefined);
}

async function main() {
  rows.set("orders/legacy", { status: "Pending", voucherCode: "TEN", discount: 200, subtotal: 2000, deliveryFee: 70 });
  rows.set("orders/legacy/items/original", { quantity: 1, totalPrice: 2000, costPrice: 1200 });
  rows.set("vouchers/v1", { code: "TEN", discountType: "percentage", discountValue: 10, isActive: true, usageLimit: 1, usedCount: 1 });
  // Editing an existing order cannot opt it into the new pricing policy.
  await edit("legacy", { recalculateDiscountOnEdit: true });
  const added = await edit("legacy", { addItems: [extraItem] });
  assert.equal(added.discount, 200);
  assert.equal(added.total, 2170);
  assert.equal(added.financialsMinor.totalProfitMinor, 80000);
  assert.equal(added.voucherAppliedAt, undefined);
  assert.equal(added.recalculateDiscountOnEdit, undefined);
  const removed = await edit("legacy", { removeItemIds: [added.items.find((item: Row) => item.id !== "original").id] });
  assert.equal(removed.discount, 200);
  assert.equal(rows.get("vouchers/v1")!.usedCount, 1);
  // Saving contact details on an already-accounted order preserves the saved invoice.
  rows.set("orders/legacy/items/previous-add", { isFullBottle: true, quantity: 1, totalPrice: 300, costPrice: 100 });
  const savedInvoice: Row = { ...rows.get("orders/legacy"), subtotal: 2300, total: 2170 };
  rows.set("orders/legacy", savedInvoice);
  const saved = await edit("legacy", { customerName: "Updated Customer", deliveryFee: 70 });
  assert.equal(saved.discount, 200);
  assert.equal(saved.total, 2170);
  assert.strictEqual(rows.get("orders/legacy")!.pricingSnapshot, savedInvoice.pricingSnapshot);
  const repriced = await edit("legacy", { itemPriceUpdates: [{ itemId: "previous-add", unitPrice: 500 }] });
  assert.equal(repriced.discount, 200);
  assert.equal(repriced.total, 2370);
  assert.equal((await edit("legacy", { deliveryFee: 90 })).discount, 200);
  assert.equal(rows.get("vouchers/v1")!.usedCount, 1);
  const withoutVoucher = await edit("legacy", { removeVoucher: true });
  assert.equal(withoutVoucher.discount, 0);
  assert.equal(withoutVoucher.voucherCode, null);
  assert.equal(rows.get("vouchers/v1")!.usedCount, 0);
  await edit("legacy", { removeVoucher: true });
  assert.equal(rows.get("vouchers/v1")!.usedCount, 0);

  const manual = {
    manualAdminOrder: true, manualDiscountPercent: 10, pickupMethod: "Pickup",
    customerName: "Test Customer", customerPhone: "01700000000", customerEmail: "test@example.test",
    items: [{ perfumeName: "Sample", isFullBottle: true, fullBottleSize: "100ml", quantity: 1, unitPrice: 2000, costPrice: 1200 }],
  };
  const fractional = await POST(request("POST", { ...manual, items: [{ ...manual.items[0], quantity: 2, unitPrice: 100.75, costPrice: 60.25 }] }));
  assert.equal(fractional.status, 201);
  const invoice = await fractional.json();
  assert.equal(invoice.subtotal, 201.5);
  assert.equal(invoice.discount, 20.15);
  assert.equal(invoice.profit, 60.85);
  const replacementOrder = await edit(invoice.id, { removeItemIds: [invoice.items[0].id], addItems: [extraItem] });
  assert.equal(replacementOrder.hasFullBottle, false);
  const missingProduct = await POST(request("POST", { ...manual, items: [manual.items[0], { ...manual.items[0], perfumeId: "deleted" }] }));
  assert.equal(missingProduct.status, 409);
  const response = await POST(request("POST", manual));
  const created = await response.json();
  assert.equal(response.status, 201, JSON.stringify(created));
  assert.equal(created.discount, 200);
  assert.equal(created.total, 1800);
  assert.deepEqual(created.profitDistribution.map((p: Row) => p.profitAmountMinor), [36000, 24000]);
  assert.equal(created.items[0].payoutRevenue, 1800);
  const paid = await (await POST(request("POST", manual))).json();
  await edit(paid.id, { status: "Dispatched" });
  assert.equal(rows.get("ownerAccounts/Tayeb")!.storeShareEarned, 360);
  assert.equal(rows.get("ownerAccounts/Enid")!.storeShareEarned, 240);
  await edit(paid.id, { status: "Cancelled", cancelReason: "Test reversal" });
  assert.equal(rows.get("ownerAccounts/Tayeb")!.storeShareEarned, 0);
  assert.equal(rows.get("ownerAccounts/Enid")!.storeShareEarned, 0);
  const edited = await edit(created.id, { itemPriceUpdates: [{ itemId: created.items[0].id, unitPrice: 2300 }], deliveryFee: 70 });
  assert.equal(edited.discount, 230);
  assert.equal(edited.total, 2140);
  assert.equal((await edit(created.id, { deliveryFee: 90 })).total, 2160);
  const withItemAdded = await edit(created.id, { addItems: [extraItem] });
  assert.equal(withItemAdded.discount, 260);
  assert.equal(withItemAdded.financialsMinor.discountMinor, 26000);
  assert.equal((await POST(request("POST", { ...manual, voucherCode: "TEN" }))).status, 400);

  // Checkout sets the policy on new orders, regardless of the incoming request.
  rows.set("perfumes/sample", { name: "Sample", totalStockMl: 100 });
  const checkout = { ...manual, manualAdminOrder: false, manualDiscountPercent: undefined, voucherCode: "TEN", recalculateDiscountOnEdit: false,
    items: [{ ...manual.items[0], perfumeId: "sample", unitPrice: 2000 }] };
  const placed = await POST(request("POST", checkout));
  const fresh = await placed.json();
  assert.equal(placed.status, 201, JSON.stringify(fresh));
  assert.equal(fresh.subtotal, 0);
  assert.equal(fresh.items[0].costPrice, 0);
  assert.equal(fresh.discount, 0);
  const quoted = await edit(fresh.id, { itemPriceUpdates: [{ itemId: fresh.items[0].id, unitPrice: 2000, buyingPrice: 1200 }] });
  assert.equal(quoted.discount, 200);
  assert.equal(fresh.recalculateDiscountOnEdit, true);
  assert.equal(rows.get("vouchers/v1")!.usedCount, 1);
  assert.ok(quoted.voucherAppliedAt);
  await edit(fresh.id, { recalculateDiscountOnEdit: false });
  assert.equal((await edit(fresh.id, { addItems: [extraItem] })).discount, 230);
  assert.equal(rows.get("vouchers/v1")!.usedCount, 1);
  const unavailable = await POST(request("POST", { ...checkout, voucherCode: undefined, items: [...checkout.items, { ...checkout.items[0], perfumeId: "deleted" }] }));
  assert.equal(unavailable.status, 409);
  await checkReplacementOwnership(checkout);

  rows.set("vouchers/fixed", { code: "FIXED", discountType: "fixed", discountValue: 400, minOrderValue: 200,
    usedCount: 1, usageLimit: 1, isActive: true });
  rows.set("orders/fixed", { voucherCode: "FIXED", discount: 400, deliveryFee: 70, recalculateDiscountOnEdit: true, voucherAppliedAt: new Date() });
  rows.set("orders/fixed/items/original", { isFullBottle: true, quantity: 1, totalPrice: 2000 });
  const reprice = (unitPrice: number) => edit("fixed", { itemPriceUpdates: [{ itemId: "original", unitPrice }] });
  assert.equal((await reprice(2300)).discount, 400);
  assert.equal((await reprice(300)).discount, 300);
  assert.equal((await reprice(150)).discount, 0);
  assert.equal((await reprice(900)).discount, 400);
  assert.equal(rows.get("vouchers/fixed")!.usedCount, 1);
  rows.get("orders/fixed")!.status = "Delivered";
  const locked = await PUT(request("PUT", { addItems: [extraItem] }), { params: Promise.resolve({ id: "fixed" }) });
  assert.equal(locked.status, 409);
  for (const value of [-1, 101, "10"]) {
    assert.equal((await POST(request("POST", { ...manual, manualDiscountPercent: value }))).status, 400);
  }
  const validateVoucher = require("../src/app/api/vouchers/validate/route").POST;
  rows.set("vouchers/unlimited", { code: "UNLIMITED", discountType: "percentage", discountValue: 10, isActive: true, usedCount: 12, usageLimit: null });
  const unlimited = await validateVoucher(request("POST", { code: "UNLIMITED", orderTotal: 500 }));
  assert.equal(unlimited.status, 200);
  assert.equal((await unlimited.json()).discount, 50);
  rows.set("settings/default", { packagingCost: 25 });
  rows.set("perfumes/sample", { purchasePricePerMl: 14.05 });
  const atCost = await validateVoucher(request("POST", { code: process.env.OWNER_VOUCHER_CODE || "VALORE1290",
    items: [{ perfumeId: "sample", ml: 5, quantity: 2, unitPrice: 150 }] }));
  assert.equal((await atCost.json()).discount, 89.5); // 2 x (150 - 70.25 liquid - 25 packaging - 10 atomizer)
  admin = null;
  assert.equal((await POST(request("POST", manual))).status, 401);
  assert.equal((await POST(request("POST", { ...manual, manualAdminOrder: false }))).status, 400);
  console.log("Order discount and ownership checks passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
