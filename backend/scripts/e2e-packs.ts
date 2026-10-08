/**
 * END-TO-END test of Perfume Packs over real HTTP.
 *
 * Expects the backend dev server on http://localhost:3001 (override with E2E_BASE_URL) and exercises the
 * REAL routes against the REAL Firestore project with clearly-namespaced fixtures (e2e-pack-*):
 * three perfumes, a private 7ml decant size + atomiser bottle (so no real catalog data is touched), a pack
 * and a voucher. Every document it creates (including orders and their items) is deleted in a finally block.
 *
 * SAFETY: .env.local normally points at the PRODUCTION Firebase project. The script refuses to run unless
 * E2E_CONFIRM_PROJECT equals FIREBASE_PROJECT_ID — set FIREBASE_* to a staging project, or consciously confirm.
 * While it runs, a "7ml" decant size briefly exists in the project.
 *
 * Run:  cd backend && E2E_CONFIRM_PROJECT=<project-id> npx tsx scripts/e2e-packs.ts
 * Exits non-zero on any failure.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const BASE = process.env.E2E_BASE_URL || "http://localhost:3001";
const RUN = Date.now().toString(36);
const ML = 7; // fixture-only decant size

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(cond: boolean, label: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.error(`  ✗ ${label}`);
  }
}
function eq(actual: unknown, expected: unknown, label: string) {
  ok(JSON.stringify(actual) === JSON.stringify(expected), `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

type Json = Record<string, unknown>;

async function main() {
  if (!process.env.FIREBASE_PROJECT_ID || process.env.E2E_CONFIRM_PROJECT !== process.env.FIREBASE_PROJECT_ID) {
    console.error(
      `Refusing to run: set E2E_CONFIRM_PROJECT to the FIREBASE_PROJECT_ID you intend to test against (currently "${process.env.FIREBASE_PROJECT_ID || ""}").`,
    );
    process.exit(2);
  }

  const { db, Collections } = await import("../src/lib/firebase-admin");
  const { signSessionToken } = await import("../src/lib/session-token");
  const { Timestamp } = await import("firebase-admin/firestore");
  const { computeDecantPrice } = await import("../src/lib/pricing-engine");
  const { computePackTotals, allocatePackPrice } = await import("../src/lib/packs/pricing");
  const { getPricingConfig } = await import("../src/lib/pricing-config");

  const adminCookie = `vp-session=${await signSessionToken({ id: "e2e-admin", name: "E2E Admin", email: `e2e-admin-${RUN}@example.com`, role: "admin" })}`;
  const customerCookie = `vp-session=${await signSessionToken({ id: `e2e-cust-${RUN}`, name: "E2E Customer", email: `e2e-cust-${RUN}@example.com`, role: "customer" })}`;

  const api = async (method: string, path: string, opts: { cookie?: string; body?: unknown } = {}): Promise<{ status: number; json: Json | Json[] }> => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(opts.cookie ? { cookie: opts.cookie } : {}),
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    let json: Json | Json[] = {};
    try {
      json = (await res.json()) as Json;
    } catch {
      /* non-JSON */
    }
    return { status: res.status, json };
  };
  const obj = (r: { json: Json | Json[] }) => r.json as Json;

  // ── Fixture ids ──
  const ids = {
    perfumeA: `e2e-pack-a-${RUN}`,
    perfumeB: `e2e-pack-b-${RUN}`,
    perfumeC: `e2e-pack-c-${RUN}`,
    size: `e2e-pack-size-${RUN}`,
    bottle: `e2e-pack-bottle-${RUN}`,
    voucher: `e2e-pack-voucher-${RUN}`,
  };
  const orderIds: string[] = [];
  const packIds: string[] = [];

  const stockOf = async (id: string) => Number((await db.collection(Collections.perfumes).doc(id).get()).data()?.totalStockMl);
  const bottleCount = async () => Number((await db.collection(Collections.bottles).doc(ids.bottle).get()).data()?.availableCount);
  const totalOrdersOf = async (id: string) => Number((await db.collection(Collections.perfumes).doc(id).get()).data()?.totalOrders || 0);
  const setStock = (id: string, ml: number) => db.collection(Collections.perfumes).doc(id).update({ totalStockMl: ml });

  const perfumeDoc = (name: string, market: number, purchase: number, stock: number) => ({
    name,
    brand: "E2E Pack Brand",
    slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${RUN}`,
    category: "Unisex",
    images: "[]",
    isActive: true,
    isPersonalCollection: false,
    owner: "Store",
    marketPricePerMl: market,
    purchasePricePerMl: purchase,
    totalStockMl: stock,
    totalOrders: 0,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  const customer = {
    customerName: "E2E Customer",
    customerPhone: "01712345678",
    recipientEmail: `e2e-cust-${RUN}@example.com`,
    pickupMethod: "Pickup",
    paymentMethod: "Cash on Delivery",
  };
  const placeOrder = async (body: Json, cookie?: string) => {
    const res = await api("POST", "/api/orders", { cookie: cookie ?? customerCookie, body: { ...customer, ...body } });
    if (res.status === 201) orderIds.push(String(obj(res).id));
    return res;
  };

  try {
    process.stdout.write("Waiting for backend dev server");
    let up = false;
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`${BASE}/api/checkout-config`)).status < 500) {
          up = true;
          break;
        }
      } catch {
        /* not up yet */
      }
      process.stdout.write(".");
      await new Promise((r) => setTimeout(r, 1000));
    }
    console.log(up ? " up" : " TIMEOUT");
    if (!up) throw new Error("backend dev server not reachable");

    // ═══ Fixtures ═══
    console.log("\n0. Fixtures");
    await db.collection(Collections.perfumes).doc(ids.perfumeA).set(perfumeDoc(`E2EPack Alpha ${RUN}`, 10, 6, 100));
    await db.collection(Collections.perfumes).doc(ids.perfumeB).set(perfumeDoc(`E2EPack Bravo ${RUN}`, 40, 25, 100));
    await db.collection(Collections.perfumes).doc(ids.perfumeC).set(perfumeDoc(`E2EPack Charlie ${RUN}`, 100, 70, 25));
    await db.collection(Collections.decantSizes).doc(ids.size).set({ ml: ML, enabled: true, createdAt: Timestamp.now() });
    await db.collection(Collections.bottles).doc(ids.bottle).set({ ml: ML, costPerBottle: 10, availableCount: 20, createdAt: Timestamp.now() });
    await db.collection(Collections.vouchers).doc(ids.voucher).set({
      code: `E2EPACK${RUN.toUpperCase()}`,
      discountType: "percentage",
      discountValue: 10,
      isActive: true,
      usedCount: 0,
      createdAt: Timestamp.now(),
    });
    const voucherCode = `E2EPACK${RUN.toUpperCase()}`;
    // The server caches pricing config for 60s; nudge by waiting for a fresh read via admin-less pricing POST.
    const { invalidatePricingConfigCache } = await import("../src/lib/api-cache");
    invalidatePricingConfigCache();
    ok(true, "fixtures created");

    // Expected prices from the canonical engine, using the SAME fresh config the server reads.
    const cfg = await getPricingConfig({ fresh: true });
    const bottleCost = 10;
    const price = (market: number, purchase: number) =>
      computeDecantPrice({ marketPricePerMl: market, purchasePricePerMl: purchase }, ML, { packagingCost: cfg.packagingCost, margins: cfg.margins, bottleCost }).sellingPrice;
    const prices = [price(10, 6), price(40, 25), price(100, 70)];
    const totals10 = computePackTotals(prices, "percentage", 10);
    const alloc10 = allocatePackPrice(prices, totals10.finalPrice);
    console.log(`   component prices ${JSON.stringify(prices)} → pack ${JSON.stringify(totals10)}`);

    const packBody = {
      name: `E2E Winter Pack ${RUN}`,
      description: "Three rich fragrances for colder evenings.",
      isActive: true,
      sortOrder: 99,
      decantSizeMl: ML,
      perfumeIds: [ids.perfumeA, ids.perfumeB, ids.perfumeC],
      discountType: "percentage",
      discountValue: 10,
    };

    // ═══ 1. Admin: validation + CRUD ═══
    console.log("\n1. Admin CRUD & validation");
    eq((await api("POST", "/api/packs", { body: packBody })).status, 401, "unauthenticated create → 401");
    eq((await api("POST", "/api/packs", { cookie: customerCookie, body: packBody })).status, 401, "customer create → 401");
    eq((await api("PUT", "/api/packs/nope", { body: { isActive: false } })).status, 401, "unauthenticated update → 401");
    eq((await api("DELETE", "/api/packs/nope")).status, 401, "unauthenticated delete → 401");
    eq((await api("GET", "/api/packs/admin")).status, 401, "unauthenticated admin list → 401");
    eq((await api("POST", "/api/packs/preview", { body: {} })).status, 401, "unauthenticated preview → 401");

    const bad = async (patch: Json, label: string, status = 400) => eq((await api("POST", "/api/packs", { cookie: adminCookie, body: { ...packBody, ...patch } })).status, status, label);
    await bad({ perfumeIds: [] }, "zero perfumes rejected");
    await bad({ perfumeIds: [ids.perfumeA, ids.perfumeA] }, "duplicate perfumes rejected");
    await bad({ perfumeIds: [ids.perfumeA, "does-not-exist"] }, "invalid perfume id rejected");
    await bad({ discountType: "bogus" }, "invalid discount type rejected");
    await bad({ discountType: "percentage", discountValue: 0 }, "0% rejected");
    await bad({ discountType: "percentage", discountValue: 150 }, ">100% rejected");
    await bad({ discountType: "fixed", discountValue: -5 }, "negative fixed rejected");
    await bad({ decantSizeMl: 999 }, "disabled/unknown decant size rejected");
    await bad({ name: "" }, "blank name rejected");

    const created = await api("POST", "/api/packs", { cookie: adminCookie, body: packBody });
    eq(created.status, 201, "valid pack created");
    const pack = obj(created);
    packIds.push(String(pack.id));
    eq(pack.originalPrice, totals10.originalPrice, "admin sees the canonical original price");
    eq(pack.discountAmount, totals10.discountAmount, "admin sees the discount amount");
    eq(pack.finalPrice, totals10.finalPrice, "admin sees the final price");
    ok(String(pack.slug).startsWith("e2e-winter-pack"), "slug auto-generated");
    eq((await api("POST", "/api/packs", { cookie: adminCookie, body: packBody })).status, 409, "duplicate slug rejected");

    const preview = obj(await api("POST", "/api/packs/preview", { cookie: adminCookie, body: { perfumeIds: packBody.perfumeIds, decantSizeMl: ML, discountType: "fixed", discountValue: 100 } }));
    eq(preview.finalPrice, computePackTotals(prices, "fixed", 100).finalPrice, "preview: fixed ৳100 discount");

    const updated = await api("PUT", `/api/packs/${pack.id}`, { cookie: adminCookie, body: { discountType: "fixed", discountValue: 100, description: "Updated" } });
    eq(updated.status, 200, "update ok");
    eq(obj(updated).finalPrice, computePackTotals(prices, "fixed", 100).finalPrice, "update recomputes the price");
    eq((await api("PUT", `/api/packs/${pack.id}`, { cookie: adminCookie, body: { discountValue: -1 } })).status, 400, "update with invalid discount rejected");
    await api("PUT", `/api/packs/${pack.id}`, { cookie: adminCookie, body: { discountType: "percentage", discountValue: 10 } });

    // ═══ 2. Public visibility ═══
    console.log("\n2. Public API");
    const listed = (await api("GET", "/api/packs")).json as Json[];
    const publicPack = listed.find((p) => p.id === pack.id);
    ok(Boolean(publicPack), "active pack listed publicly");
    eq(publicPack?.available, true, "pack is available");
    eq(publicPack?.finalPrice, totals10.finalPrice, "public price matches the canonical price");
    ok(!JSON.stringify(publicPack).match(/totalCost|unitCost|stockMl|profit|purchase/i), "public payload has no cost / stock / profit fields");
    const detail = await api("GET", `/api/packs/${pack.slug}`);
    eq(detail.status, 200, "detail by slug loads");
    eq((obj(detail).items as Json[]).map((i) => i.unitPrice), prices, "component prices are the canonical decant prices");

    await api("PUT", `/api/packs/${pack.id}`, { cookie: adminCookie, body: { isActive: false } });
    ok(!((await api("GET", "/api/packs")).json as Json[]).some((p) => p.id === pack.id), "inactive pack hidden from the public list");
    eq((await api("GET", `/api/packs/${pack.slug}`)).status, 404, "inactive pack detail → 404");
    const inactiveOrder = await placeOrder({ items: [], packs: [{ packId: pack.id, quantity: 1 }] });
    eq(inactiveOrder.status, 409, "inactive pack cannot be ordered (stale cart)");
    await api("PUT", `/api/packs/${pack.id}`, { cookie: adminCookie, body: { isActive: true } });
    ok(((await api("GET", "/api/packs")).json as Json[]).some((p) => p.id === pack.id), "re-activated pack visible again");

    const quote = (await api("POST", "/api/packs/quote", { body: { packs: [{ id: pack.id, quantity: 1 }, { id: "ghost", quantity: 1 }] } })).json as Json[];
    eq(quote.find((q) => q.id === pack.id)?.available, true, "quote: live pack available");
    eq(quote.find((q) => q.id === "ghost")?.available, false, "quote: unknown pack unavailable");

    // ═══ 3. Orders: tampering ═══
    console.log("\n3. Order: server authority");
    const before = { a: await stockOf(ids.perfumeA), b: await stockOf(ids.perfumeB), c: await stockOf(ids.perfumeC), bottle: await bottleCount() };
    const tamper = await placeOrder({ items: [], packs: [{ packId: pack.id, quantity: 1, expectedUnitPrice: 1 }] });
    eq(tamper.status, 409, "tampered expectedUnitPrice → 409");
    eq(obj(tamper).code, "PRICE_CHANGED", "code PRICE_CHANGED");
    eq(((obj(tamper).packs as Json[])[0] || {}).finalPrice, totals10.finalPrice, "409 carries the authoritative price");
    eq(await stockOf(ids.perfumeA), before.a, "no stock change after rejected order");
    const clientPrice = await placeOrder({ items: [], packs: [{ packId: pack.id, quantity: 1, unitPrice: 1, price: 1, discount: 99999, finalPrice: 1 }] });
    eq(clientPrice.status, 201, "extra client price fields are ignored");
    const tamperedOrder = obj(clientPrice);
    eq(tamperedOrder.subtotal, totals10.finalPrice, "charged the authoritative pack price, not the client's");
    eq((await api("POST", "/api/orders", { cookie: customerCookie, body: { ...customer, items: [], packs: [{ packId: pack.id, quantity: 0 }] } })).status, 400, "quantity 0 rejected");
    eq((await api("POST", "/api/orders", { cookie: customerCookie, body: { ...customer, items: [], packs: [{ packId: pack.id, quantity: 11 }] } })).status, 400, "quantity above the limit rejected");
    // First (client-tampered) order consumed 1 pack. Cancel it to reset stock for the next scenarios.
    await api("POST", `/api/orders/${tamperedOrder.id}/cancel`, { cookie: adminCookie, body: { cancelReason: "e2e reset" } });
    eq(await stockOf(ids.perfumeA), before.a, "cancel restored stock after the tampered order");

    // ═══ 4. Orders: pack ×2 ═══
    console.log("\n4. Order: pack × 2");
    const orders0 = { a: await totalOrdersOf(ids.perfumeA), c: await totalOrdersOf(ids.perfumeC) };
    const two = await placeOrder({ items: [], packs: [{ packId: pack.id, quantity: 2, expectedUnitPrice: totals10.finalPrice }] });
    eq(two.status, 201, "pack ×2 placed");
    const order2 = obj(two);
    eq(order2.subtotal, totals10.finalPrice * 2, "subtotal = 2 × pack price");
    eq(order2.total, totals10.finalPrice * 2, "pickup order: total = subtotal");
    eq(await stockOf(ids.perfumeA), before.a - ML * 2, "perfume A −14ml");
    eq(await stockOf(ids.perfumeB), before.b - ML * 2, "perfume B −14ml");
    eq(await stockOf(ids.perfumeC), before.c - ML * 2, "perfume C −14ml");
    eq(await bottleCount(), before.bottle - 6, "3 components × 2 packs = 6 atomisers");
    eq(await totalOrdersOf(ids.perfumeA), orders0.a + 2, "perfume A totalOrders +2");
    eq(await totalOrdersOf(ids.perfumeC), orders0.c + 2, "perfume C totalOrders +2");

    const itemsSnap = await db.collection(Collections.orders).doc(String(order2.id)).collection("items").get();
    const items = itemsSnap.docs.map((d) => d.data());
    eq(items.length, 3, "3 component item docs (no pack header doc)");
    eq(new Set(items.map((i) => i.packGroupId)).size, 1, "all components share one packGroupId");
    ok(items.every((i) => i.itemType === "pack_component" && i.quantity === 2 && i.ml === ML && i.isFullBottle === false), "components are ordinary decant items tagged pack_component");
    const byPerfume = new Map(items.map((i) => [i.perfumeId, i]));
    eq([ids.perfumeA, ids.perfumeB, ids.perfumeC].map((id) => byPerfume.get(id)?.unitPrice), alloc10, "component unit prices = proportional allocation");
    eq(items.reduce((s, i) => s + Number(i.totalPrice), 0), totals10.finalPrice * 2, "component revenue sums EXACTLY to the pack total");
    eq(items.reduce((s, i) => s + Number(i.financialBreakdown.totalRevenueMinor), 0), totals10.finalPrice * 2 * 100, "minor-unit revenue reconciles");
    ok(items.every((i) => i.discountPercent === undefined && i.pricingSnapshot.discountPercent === 0), "no bulk discount stacked on pack components");
    eq(Number(order2.profit), items.reduce((acc, i) => acc + Number(i.financialBreakdown.computedProfitMinor), 0) / 100, "order profit = Σ component profit (accounting reconciles)");
    ok(items.every((i) => Math.round((Number(i.ownerProfit) + Number(i.otherOwnerProfit)) * 100) === Number(i.financialBreakdown.computedProfitMinor)), "owner split of every component adds up to its profit");
    ok(items.every((i) => i.ownerName === "Store" && i.pricingSnapshot.packagingCost === cfg.packagingCost && i.pricingSnapshot.bottleCost === bottleCost), "components keep ownership + pricing snapshot");
    eq(items[0].packOriginalSubtotal, totals10.originalPrice * 2, "item snapshot: original subtotal (line)");
    eq(items[0].packDiscountAmount, totals10.discountAmount * 2, "item snapshot: discount amount (line)");
    const packsSnapshot = (order2.packs as Json[]) || [];
    eq(packsSnapshot.length, 1, "order carries one pack snapshot");
    eq(packsSnapshot[0]?.packName, pack.name, "snapshot has the pack name");
    eq((packsSnapshot[0]?.items as Json[]).map((i) => i.perfumeId), packBody.perfumeIds, "snapshot lists the components");
    ok(!JSON.stringify(packsSnapshot).match(/cost|profit/i), "snapshot has no cost/profit data");

    // ═══ 5. Snapshot immutability ═══
    console.log("\n5. History is immutable");
    await api("PUT", `/api/packs/${pack.id}`, { cookie: adminCookie, body: { name: `Renamed ${RUN}`, perfumeIds: [ids.perfumeA, ids.perfumeB], discountType: "fixed", discountValue: 50 } });
    const reread = obj(await api("GET", `/api/orders/${order2.id}`, { cookie: adminCookie }));
    eq((reread.packs as Json[])[0]?.packName, pack.name, "old order still shows the ORIGINAL pack name");
    eq(((reread.packs as Json[])[0]?.items as Json[]).length, 3, "old order still shows A + B + C");
    eq((reread.packs as Json[])[0]?.discountValue, 10, "old order still shows the original 10% discount");
    eq(reread.subtotal, totals10.finalPrice * 2, "old order total unchanged");
    await api("PUT", `/api/packs/${pack.id}`, { cookie: adminCookie, body: { name: String(pack.name), perfumeIds: packBody.perfumeIds, discountType: "percentage", discountValue: 10 } });

    // ═══ 6. Cancellation ═══
    console.log("\n6. Cancellation");
    const cancel1 = await api("POST", `/api/orders/${order2.id}/cancel`, { cookie: adminCookie, body: { cancelReason: "e2e cancel" } });
    eq(cancel1.status, 200, "cancel ok");
    eq(await stockOf(ids.perfumeA), before.a, "perfume A fully restored");
    eq(await stockOf(ids.perfumeB), before.b, "perfume B fully restored");
    eq(await stockOf(ids.perfumeC), before.c, "perfume C fully restored");
    eq(await bottleCount(), before.bottle, "atomisers restored");
    const cancel2 = await api("POST", `/api/orders/${order2.id}/cancel`, { cookie: adminCookie, body: { cancelReason: "again" } });
    ok(cancel2.status >= 400, "second cancel rejected");
    eq(await stockOf(ids.perfumeA), before.a, "repeated cancel does NOT double-restore");
    eq((obj(await api("GET", `/api/orders/${order2.id}`, { cookie: adminCookie })).packs as Json[]).length, 1, "pack snapshot intact after cancellation");

    // ═══ 7. Stock boundaries ═══
    console.log("\n7. Stock boundaries");
    await setStock(ids.perfumeC, ML - 1);
    const short = await placeOrder({ items: [], packs: [{ packId: pack.id, quantity: 1 }] });
    eq(short.status, 409, "one ml below the requirement → rejected");
    eq(await stockOf(ids.perfumeA), before.a, "rejected order did not touch other components");
    await setStock(ids.perfumeC, ML);
    const exact = await placeOrder({ items: [], packs: [{ packId: pack.id, quantity: 1 }] });
    eq(exact.status, 201, "stock exactly equal to the requirement → accepted");
    eq(await stockOf(ids.perfumeC), 0, "stock is exactly 0, never negative");
    await api("POST", `/api/orders/${obj(exact).id}/cancel`, { cookie: adminCookie, body: { cancelReason: "e2e reset" } });

    // Two customers race for the LAST pack: exactly one may win, nothing goes negative.
    await setStock(ids.perfumeC, ML);
    const race = await Promise.all([
      placeOrder({ items: [], packs: [{ packId: pack.id, quantity: 1 }] }),
      placeOrder({ items: [], packs: [{ packId: pack.id, quantity: 1 }] }),
    ]);
    eq(race.map((r) => r.status).sort(), [201, 409], "concurrent orders for the last pack: one wins, one is rejected");
    eq(await stockOf(ids.perfumeC), 0, "race: stock is exactly 0 (never negative)");
    eq(await stockOf(ids.perfumeA), before.a - ML, "race: only the winning order deducted the other components");
    const winner = race.find((r) => r.status === 201);
    if (winner) await api("POST", `/api/orders/${obj(winner).id}/cancel`, { cookie: adminCookie, body: { cancelReason: "e2e reset" } });
    await setStock(ids.perfumeC, before.c);

    // ═══ 8. Voucher / mixed / owner voucher ═══
    console.log("\n8. Voucher, mixed order, owner voucher");
    const withVoucher = await placeOrder({ items: [], packs: [{ packId: pack.id, quantity: 1 }], voucherCode });
    eq(withVoucher.status, 201, "voucher + pack placed");
    eq(obj(withVoucher).subtotal, totals10.finalPrice, "voucher applies AFTER the pack discount (subtotal = pack price)");
    const expectedVoucher = Math.round(totals10.finalPrice * 100 * 0.1) / 100; // the server works in minor units
    eq(obj(withVoucher).discount, expectedVoucher, "voucher = 10% of the pack-discounted subtotal, once");
    eq(obj(withVoucher).total, totals10.finalPrice - expectedVoucher, "total = pack price − voucher");
    await api("POST", `/api/orders/${obj(withVoucher).id}/cancel`, { cookie: adminCookie, body: { cancelReason: "e2e reset" } });

    const mixed = await placeOrder({ items: [{ perfumeId: ids.perfumeA, ml: ML, quantity: 1 }], packs: [{ packId: pack.id, quantity: 1 }] });
    eq(mixed.status, 201, "normal item + pack placed");
    eq(await stockOf(ids.perfumeA), before.a - ML * 2, "same perfume in a pack and as a normal item: stock aggregates (−14ml)");
    eq(obj(mixed).subtotal, totals10.finalPrice + prices[0], "subtotal = pack + normal item");
    await api("POST", `/api/orders/${obj(mixed).id}/cancel`, { cookie: adminCookie, body: { cancelReason: "e2e reset" } });

    const ownerVoucher = String(process.env.OWNER_VOUCHER_CODE || "VALORE1290");
    eq((await placeOrder({ items: [], packs: [{ packId: pack.id, quantity: 1 }], voucherCode: ownerVoucher }, adminCookie)).status, 400, "owner voucher + pack rejected");

    // ═══ 9. Unavailable / deleted ═══
    console.log("\n9. Availability & deletion");
    await setStock(ids.perfumeB, ML - 1);
    const unavailable = ((await api("GET", "/api/packs")).json as Json[]).find((p) => p.id === pack.id);
    // The public list is cached for ≤20s; the quote endpoint is always fresh.
    const q2 = (await api("POST", "/api/packs/quote", { body: { packs: [{ id: pack.id, quantity: 1 }] } })).json as Json[];
    eq(q2[0]?.available, false, "a component below the pack size makes the pack unavailable (quote)");
    ok(unavailable !== undefined, "a temporarily unavailable pack stays configured and listed");
    await setStock(ids.perfumeB, before.b);

    const ordersBeforeDelete = obj(await api("GET", `/api/orders/${orderIds[0]}`, { cookie: adminCookie }));
    eq((await api("DELETE", `/api/packs/${pack.id}`, { cookie: adminCookie })).status, 200, "pack deleted");
    eq((await api("GET", `/api/packs/${pack.slug}`)).status, 404, "deleted pack gone from the storefront");
    eq(obj(await api("GET", `/api/orders/${orderIds[0]}`, { cookie: adminCookie })).id, ordersBeforeDelete.id, "historical orders still load after the pack is deleted");
    ok((await db.collection(Collections.perfumes).doc(ids.perfumeA).get()).exists, "deleting a pack never deletes perfumes");
    eq((await placeOrder({ items: [], packs: [{ packId: pack.id, quantity: 1 }] })).status, 409, "deleted pack cannot be ordered");

    // ═══ 10. Regression: an ordinary (pack-free) order is unchanged ═══
    console.log("\n11. Ordinary order regression");
    const plainBefore = { a: await stockOf(ids.perfumeA), bottle: await bottleCount(), orders: await totalOrdersOf(ids.perfumeA) };
    const plain = await placeOrder({ items: [{ perfumeId: ids.perfumeA, ml: ML, quantity: 2 }] });
    eq(plain.status, 201, "ordinary order placed");
    eq(obj(plain).subtotal, prices[0] * 2, "ordinary order priced at the canonical decant price × quantity");
    eq(obj(plain).packs, undefined, "ordinary order carries no pack snapshot");
    eq(await stockOf(ids.perfumeA), plainBefore.a - ML * 2, "ordinary order deducts stock as before");
    eq(await bottleCount(), plainBefore.bottle - 2, "ordinary order deducts atomisers as before");
    eq(await totalOrdersOf(ids.perfumeA), plainBefore.orders + 2, "ordinary order bumps totalOrders as before");
    const plainItems = (await db.collection(Collections.orders).doc(String(obj(plain).id)).collection("items").get()).docs.map((d) => d.data());
    ok(plainItems.length === 1 && plainItems[0].packGroupId === undefined && plainItems[0].itemType === undefined, "ordinary item docs have no pack fields");
    await api("POST", `/api/orders/${obj(plain).id}/cancel`, { cookie: adminCookie, body: { cancelReason: "e2e reset" } });
    eq(await stockOf(ids.perfumeA), plainBefore.a, "ordinary order cancel restores stock");

    // ═══ 11. Pure pricing unaffected ═══
    console.log("\n10. /api/pricing unchanged by the refactor");
    const pricing = obj(await api("GET", `/api/pricing?perfumeId=${ids.perfumeA}`));
    const row = (pricing.prices as Json[]).find((p) => p.ml === ML);
    eq(row?.sellingPrice, prices[0], "/api/pricing returns the same price the pack engine uses");
  } finally {
    console.log("\nCleanup");
    const { db: cdb, Collections: C } = await import("../src/lib/firebase-admin");
    try {
      for (const orderId of orderIds) {
        const items = await cdb.collection(C.orders).doc(orderId).collection("items").get();
        await Promise.all(items.docs.map((d) => d.ref.delete()));
        await cdb.collection(C.orders).doc(orderId).delete();
      }
      for (const id of packIds) await cdb.collection(C.packs).doc(id).delete();
      for (const id of [ids.perfumeA, ids.perfumeB, ids.perfumeC]) await cdb.collection(C.perfumes).doc(id).delete();
      await cdb.collection(C.decantSizes).doc(ids.size).delete();
      await cdb.collection(C.bottles).doc(ids.bottle).delete();
      await cdb.collection(C.vouchers).doc(ids.voucher).delete();
      // Defensive: remove any pack the test created but lost track of.
      const stray = await cdb.collection(C.packs).where("sortOrder", "==", 99).get();
      for (const d of stray.docs) if (String(d.data().name || "").includes(RUN)) await d.ref.delete();
      console.log("  cleaned up fixtures");
    } catch (error) {
      console.error("  cleanup failed — remove e2e-pack-* docs manually", error);
    }
  }

  console.log("\n──────────────────────────────────");
  console.log(`PASSED: ${passed}   FAILED: ${failed}`);
  if (failed > 0) {
    console.error("Failing checks:");
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
  console.log("All pack e2e checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
