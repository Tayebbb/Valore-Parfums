/**
 * END-TO-END test of the investment system over real HTTP.
 *
 * Boots nothing itself — expects the backend dev server on
 * http://localhost:3001 (override with E2E_BASE_URL).
 *
 * Exercises the REAL routes against the REAL Firestore project using
 * clearly-namespaced fixtures (e2e-inv-*), asserts every money movement
 * (credit, idempotency, reversal, withdrawal, buyback) plus a security
 * battery (401s, forged cookies, role isolation, IDOR), and deletes
 * every document it created in a finally block — including compensating
 * ownerAccounts decrements for credits that were intentionally left
 * un-reversed (order 2).
 *
 * Run:  cd backend && npx tsx scripts/e2e-investments.ts
 * Exits non-zero on any failure.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const BASE = process.env.E2E_BASE_URL || "http://localhost:3001";
const RUN = Date.now().toString(36);

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
  ok(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`
  );
}

async function main() {
  const { db, Collections } = await import("../src/lib/firebase-admin");
  const { signSessionToken } = await import("../src/lib/session-token");
  const { Timestamp } = await import("firebase-admin/firestore");

  // ── Sessions (signed with the same key resolution the dev server uses) ──
  const adminCookie = `vp-session=${await signSessionToken({ id: "e2e-admin", name: "E2E Admin", email: `e2e-admin-${RUN}@example.com`, role: "admin" })}`;
  const investorEmailA = `e2e-investor-a-${RUN}@example.com`;
  const investorEmailB = `e2e-investor-b-${RUN}@example.com`;
  const investorCookieA = `vp-session=${await signSessionToken({ id: `e2e-user-a-${RUN}`, name: "E2E Investor A", email: investorEmailA, role: "investor" })}`;
  const customerCookie = `vp-session=${await signSessionToken({ id: `e2e-cust-${RUN}`, name: "E2E Customer", email: `e2e-cust-${RUN}@example.com`, role: "customer" })}`;

  const api = async (
    method: string,
    path: string,
    opts: { cookie?: string; body?: unknown } = {}
  ): Promise<{ status: number; json: Record<string, unknown> }> => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(opts.cookie ? { cookie: opts.cookie } : {}),
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    let json: Record<string, unknown> = {};
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      /* non-JSON */
    }
    return { status: res.status, json };
  };

  // ── Wait for the dev server ──
  process.stdout.write("Waiting for backend dev server");
  let up = false;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/api/checkout-config`);
      if (res.status < 500) {
        up = true;
        break;
      }
    } catch {
      /* not up yet */
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log("");
  if (!up) throw new Error(`Backend not reachable at ${BASE}`);

  // ── Fixture ids ──
  const perfumeId = `e2e-inv-perfume-${RUN}`;
  const order1Id = `e2e-inv-order1-${RUN}`;
  const order2Id = `e2e-inv-order2-${RUN}`;
  let investorIdA = "";
  let investorIdB = "";
  let investmentId = "";
  let investmentIdB = "";
  let poolPerfumeId = "";
  let withdrawalId = "";
  const orderIds = [order1Id, order2Id];

  // Owner names + baseline balances (settings-driven).
  const settingsDoc = await db.collection(Collections.settings).doc("default").get();
  const settings = settingsDoc.data() || {};
  const owner1Name: string = settings.owner1Name ?? "Tayeb";
  const owner2Name: string = settings.owner2Name ?? "Enid";
  const readOwnerBalances = async () => {
    const [o1, o2] = await Promise.all([
      db.collection(Collections.ownerAccounts).doc(owner1Name).get(),
      db.collection(Collections.ownerAccounts).doc(owner2Name).get(),
    ]);
    return {
      o1Total: Number(o1.data()?.totalEarned ?? 0),
      o1Share: Number(o1.data()?.storeShareEarned ?? 0),
      o2Total: Number(o2.data()?.totalEarned ?? 0),
      o2Share: Number(o2.data()?.storeShareEarned ?? 0),
    };
  };
  const baseline = await readOwnerBalances();

  // Track how much of our credits stay un-reversed so cleanup can compensate.
  let residualOwner1Share = 0;
  let residualOwner2Share = 0;

  const now = () => Timestamp.now();
  const makeOrder = async (orderId: string) => {
    await db.collection(Collections.orders).doc(orderId).set({
      status: "Out for Delivery",
      pickupMethod: "Delivery",
      paymentMethod: "Cash on Delivery",
      customerName: "E2E TEST ORDER (DELETE ME)",
      customerEmail: "", // empty → all email sending is skipped
      customerPhone: "01000000000",
      address: "E2E",
      subtotal: 900,
      total: 900,
      deliveryFee: 0,
      profit: 200,
      financialsMinor: {
        subtotalMinor: 90_000,
        discountMinor: 0,
        deliveryFeeMinor: 0,
        totalMinor: 90_000,
        totalCostMinor: 70_000,
        totalProfitMinor: 20_000,
      },
      createdAt: now(),
      updatedAt: now(),
    });
    await db.collection(Collections.orders).doc(orderId).collection("items").doc(`${orderId}-item1`).set({
      perfumeId,
      perfumeName: "E2E TEST PERFUME (DELETE ME)",
      ml: 10,
      quantity: 1,
      unitPrice: 900,
      totalPrice: 900,
      costPrice: 700, // perfume 600 + packaging/bottle 100
      ownerName: "Store",
      isPersonalCollection: false,
      isFullBottle: false,
      ownerProfit: 120, // creation-time estimate (owner1 60% of 200)
      otherOwnerProfit: 80,
      pricingSnapshot: {
        packagingCost: 25,
        bottleCost: 75,
        costPricePerMl: 60,
        marketPricePerMl: 90,
      },
      createdAt: now(),
    });
  };

  try {
    // ════════════════════════════════════════════════════
    console.log("\n1. Setup fixtures (perfume via db, investor + investment via API)");
    // ════════════════════════════════════════════════════
    await db.collection(Collections.perfumes).doc(perfumeId).set({
      name: "E2E TEST PERFUME (DELETE ME)",
      brand: "E2E",
      owner: "Store",
      isPersonalCollection: false,
      isActive: false, // hidden from the storefront
      totalStockMl: 490, // as if 10ml already sold for order 1
      purchasePricePerMl: 60,
      marketPricePerMl: 90,
      createdAt: now(),
      updatedAt: now(),
    });

    const invA = await api("POST", "/api/investors", {
      cookie: adminCookie,
      body: { name: "E2E Investor A (DELETE ME)", email: investorEmailA, phone: "01", notes: "e2e" },
    });
    ok(invA.status === 201 || invA.status === 200, `create investor A → ${invA.status}`);
    investorIdA = String(invA.json.id || "");

    const invB = await api("POST", "/api/investors", {
      cookie: adminCookie,
      body: { name: "E2E Investor B (DELETE ME)", email: investorEmailB, phone: "02", notes: "e2e" },
    });
    investorIdB = String(invB.json.id || "");
    ok(Boolean(investorIdA && investorIdB), "both investors created");

    const createdInvestment = await api("POST", "/api/investments", {
      cookie: adminCookie,
      body: {
        investorId: investorIdA,
        profitSharePercentage: 40,
        notes: "e2e",
        allocations: [{ perfumeId, ml: 500, costPerMl: 60 }],
      },
    });
    ok(createdInvestment.status === 201, `create investment → ${createdInvestment.status}`);
    investmentId = String(createdInvestment.json.id || "");
    eq(createdInvestment.json.amountMinor, 3_000_000, "investment principal = ৳30,000");
    eq(createdInvestment.json.profitSharePercentage, 40, "profit share = 40%");

    // ════════════════════════════════════════════════════
    console.log("\n2. Dispatched recognition (canonical 900/600/100 → 200 = 80 + 120)");
    // ════════════════════════════════════════════════════
    await makeOrder(order1Id);
    const dispatch1 = await api("PUT", `/api/orders/${order1Id}`, {
      cookie: adminCookie,
      body: { status: "Dispatched" },
    });
    ok(dispatch1.status === 200, `PUT Dispatched → ${dispatch1.status}`);

    const invAfterSale = (await db.collection(Collections.investments).doc(investmentId).get()).data()!;
    eq(invAfterSale.recoveredCapitalMinor, 60_000, "capital recovered = ৳600");
    eq(invAfterSale.remainingInventoryCostMinor, 2_940_000, "remaining = ৳29,400");
    eq(invAfterSale.availableProfitMinor, 8_000, "investor profit = ৳80");
    ok(
      invAfterSale.recoveredCapitalMinor + invAfterSale.remainingInventoryCostMinor === invAfterSale.amountMinor,
      "INVARIANT holds after sale"
    );

    const item1 = (
      await db.collection(Collections.orders).doc(order1Id).collection("items").doc(`${order1Id}-item1`).get()
    ).data()!;
    eq(item1.investmentRecognition?.investorProfitMinor, 8_000, "investmentRecognition persisted on item");
    const order1Doc = (await db.collection(Collections.orders).doc(order1Id).get()).data()!;
    ok(Boolean(order1Doc.profitCreditedAt), "profitCreditedAt claim set");

    const profitTx1 = await db.collection(Collections.profitTransactions).where("orderId", "==", order1Id).get();
    const storeShares = profitTx1.docs.map((d) => d.data()).filter((t) => t.type === "store-share");
    eq(storeShares.reduce((s, t) => s + t.amount, 0), 120, "owners credited exactly ৳120 (net of investor ৳80)");
    const afterCredit = await readOwnerBalances();
    eq(afterCredit.o1Share - baseline.o1Share, 72, `${owner1Name} +৳72 (60% of 120)`);
    eq(afterCredit.o2Share - baseline.o2Share, 48, `${owner2Name} +৳48 (40% of 120)`);

    // ════════════════════════════════════════════════════
    console.log("\n3. Idempotency (duplicate + alias dispatch attempts)");
    // ════════════════════════════════════════════════════
    await api("PUT", `/api/orders/${order1Id}`, { cookie: adminCookie, body: { status: "Dispatched" } });
    await api("PUT", `/api/orders/${order1Id}`, { cookie: adminCookie, body: { status: "Delivered" } });
    const profitTxAfterDup = await db.collection(Collections.profitTransactions).where("orderId", "==", order1Id).get();
    eq(profitTxAfterDup.size, profitTx1.size, "no new profit transactions after duplicate dispatch");
    const ledgerAfterDup = await db
      .collection(Collections.investmentTransactions)
      .where("referenceOrderId", "==", order1Id)
      .get();
    eq(ledgerAfterDup.size, 2, "still exactly 2 ledger entries (capital + profit)");
    const balAfterDup = await readOwnerBalances();
    eq(balAfterDup.o1Share, afterCredit.o1Share, "owner balances unchanged after duplicates");

    // ════════════════════════════════════════════════════
    console.log("\n4. Cancellation reverses BOTH books symmetrically");
    // ════════════════════════════════════════════════════
    const cancel1 = await api("POST", `/api/orders/${order1Id}/cancel`, {
      cookie: adminCookie,
      body: { cancelReason: "E2E reversal test" },
    });
    ok(cancel1.status === 200, `cancel → ${cancel1.status}`);

    const invAfterCancel = (await db.collection(Collections.investments).doc(investmentId).get()).data()!;
    eq(invAfterCancel.recoveredCapitalMinor, 0, "capital recovery reversed to 0");
    eq(invAfterCancel.remainingInventoryCostMinor, 3_000_000, "remaining restored to ৳30,000");
    eq(invAfterCancel.availableProfitMinor, 0, "investor profit reversed to 0");

    const balAfterCancel = await readOwnerBalances();
    eq(balAfterCancel.o1Share, baseline.o1Share, `${owner1Name} back to baseline`);
    eq(balAfterCancel.o2Share, baseline.o2Share, `${owner2Name} back to baseline`);

    const perfumeAfterCancel = (await db.collection(Collections.perfumes).doc(perfumeId).get()).data()!;
    // 490 initial + 500 added by investment funding (inventory purchase) + 10 restored by cancel
    eq(perfumeAfterCancel.totalStockMl, 1000, "stock restored exactly once (490 + 500 funded + 10)");
    const allocAfterCancel = await db
      .collection(Collections.investmentAllocations)
      .where("investmentId", "==", investmentId)
      .get();
    eq(allocAfterCancel.docs[0].data().remainingMl, 500, "allocation ml restored to 500");
    const order1AfterCancel = (await db.collection(Collections.orders).doc(order1Id).get()).data()!;
    ok(Boolean(order1AfterCancel.profitReversedAt), "profitReversedAt claim set");

    const cancelAgain = await api("POST", `/api/orders/${order1Id}/cancel`, {
      cookie: adminCookie,
      body: { cancelReason: "E2E duplicate cancel" },
    });
    ok(cancelAgain.status === 400, `second cancel rejected (${cancelAgain.status})`);

    // ════════════════════════════════════════════════════
    console.log("\n5. Withdrawal flow (request → approve → paid)");
    // ════════════════════════════════════════════════════
    await makeOrder(order2Id);
    await db.collection(Collections.perfumes).doc(perfumeId).update({ totalStockMl: 490 });
    const dispatch2 = await api("PUT", `/api/orders/${order2Id}`, {
      cookie: adminCookie,
      body: { status: "Dispatched" },
    });
    ok(dispatch2.status === 200, `order 2 Dispatched → ${dispatch2.status}`);
    residualOwner1Share = 72; // order 2 credits stay (compensated in cleanup)
    residualOwner2Share = 48;

    const wdTooMuch = await api("POST", "/api/investment-withdrawals", {
      cookie: investorCookieA,
      body: { investmentId, amount: 500, paymentSource: "Bkash" },
    });
    ok(wdTooMuch.status === 400, `withdrawal above available profit rejected (${wdTooMuch.status})`);

    const wd = await api("POST", "/api/investment-withdrawals", {
      cookie: investorCookieA,
      body: { investmentId, amount: 50, paymentSource: "Bkash" },
    });
    ok(wd.status === 201, `investor A requests ৳50 withdrawal → ${wd.status}`);
    withdrawalId = String(wd.json.id || "");

    const approve = await api("PUT", `/api/investment-withdrawals/${withdrawalId}`, {
      cookie: adminCookie,
      body: { action: "approve" },
    });
    ok(approve.status === 200, `admin approves → ${approve.status}`);
    const invAfterApprove = (await db.collection(Collections.investments).doc(investmentId).get()).data()!;
    eq(invAfterApprove.availableProfitMinor, 3_000, "available profit ৳80 − ৳50 = ৳30");
    eq(invAfterApprove.withdrawnProfitMinor, 5_000, "withdrawn profit = ৳50");

    const paid = await api("PUT", `/api/investment-withdrawals/${withdrawalId}`, {
      cookie: adminCookie,
      body: { action: "paid" },
    });
    ok(paid.status === 200, `admin marks paid → ${paid.status}`);

    // ════════════════════════════════════════════════════
    console.log("\n6. Buyback (quote shown first, then atomic close)");
    // ════════════════════════════════════════════════════
    const quote = await api("GET", `/api/investments/${investmentId}/buyback`, { cookie: adminCookie });
    ok(quote.status === 200, `buyback quote → ${quote.status}`);
    eq(quote.json.totalAmountMinor, 2_943_000, "quote = remaining ৳29,400 + profit ৳30");

    const buyback = await api("POST", `/api/investments/${investmentId}/buyback`, {
      cookie: adminCookie,
      body: { notes: "e2e buyback" },
    });
    ok(buyback.status === 200 || buyback.status === 201, `buyback executed → ${buyback.status}`);
    const invAfterBuyback = (await db.collection(Collections.investments).doc(investmentId).get()).data()!;
    eq(invAfterBuyback.status, "bought_back", "investment status = bought_back");
    eq(invAfterBuyback.remainingInventoryCostMinor, 0, "remaining cost moved out");
    const allocAfterBuyback = await db
      .collection(Collections.investmentAllocations)
      .where("investmentId", "==", investmentId)
      .get();
    eq(allocAfterBuyback.docs[0].data().status, "bought_back", "allocation bought_back");

    // ════════════════════════════════════════════════════
    console.log("\n7. Statement + reports reflect the full history");
    // ════════════════════════════════════════════════════
    const statement = await api("GET", "/api/investor/statement", { cookie: investorCookieA });
    ok(statement.status === 200, `investor statement → ${statement.status}`);
    const pos = statement.json.position as Record<string, number>;
    eq(pos.totalCapitalInvested, 30_000, "statement: total invested ৳30,000");
    // ৳50 manual withdrawal + ৳30 buyback profit payout = ৳80 withdrawn total
    eq(pos.profitWithdrawn, 80, "statement: withdrawn ৳80 (50 manual + 30 buyback payout)");
    const reports = await api("GET", "/api/investments/reports", { cookie: adminCookie });
    ok(reports.status === 200, `admin reports → ${reports.status}`);
    const attribution = reports.json.profitAttribution as Record<string, unknown>;
    ok(Boolean(attribution?.invariantHolds), "reports: gross = investor + Valore invariant holds");

    // ══════════════════════════════════════════════════
    console.log("\n7b. Capital pool: deposit → investor-funded bottle from inventory page");
    // ══════════════════════════════════════════════════
    const depositDenied = await api("POST", `/api/investors/${investorIdB}/capital`, {
      cookie: investorCookieA,
      body: { amount: 5000 },
    });
    ok(depositDenied.status === 401, `investor role cannot deposit capital (${depositDenied.status})`);

    const deposit = await api("POST", `/api/investors/${investorIdB}/capital`, {
      cookie: adminCookie,
      body: { amount: 5000, notes: "e2e deposit" },
    });
    ok(deposit.status === 201, `admin deposits ৳5,000 → ${deposit.status}`);
    const investorBAfterDeposit = (await db.collection(Collections.investors).doc(investorIdB).get()).data()!;
    eq(investorBAfterDeposit.unallocatedCapitalMinor, 500_000, "pool = ৳5,000 after deposit");

    // Inventory page flow: perfume created with investor as funding source.
    const poolPerfume = await api("POST", "/api/perfumes", {
      cookie: adminCookie,
      body: {
        name: `E2E POOL PERFUME ${RUN} (DELETE ME)`,
        brand: "E2E-POOL",
        owner: "Store",
        investorId: investorIdB,
        purchasePricePerMl: 60,
        marketPricePerMl: 90,
        totalStockMl: 50, // 50 ml × ৳60 = ৳3,000 — cut from the ৳5,000 pool
        isActive: false,
        category: "Unisex",
        images: "[]",
      },
    });
    ok(poolPerfume.status === 201, `investor-funded perfume created → ${poolPerfume.status}`);
    poolPerfumeId = String(poolPerfume.json.id || "");
    eq(poolPerfume.json.owner, "Store", "funded perfume stays owner Store (NOT personal collection)");
    eq(poolPerfume.json.isPersonalCollection, false, "isPersonalCollection = false");
    eq(poolPerfume.json.totalStockMl, 50, "stock = funded 50 ml");

    const investorBAfterFunding = (await db.collection(Collections.investors).doc(investorIdB).get()).data()!;
    eq(investorBAfterFunding.unallocatedCapitalMinor, 200_000, "pool ৳5,000 − ৳3,000 = ৳2,000");
    eq(investorBAfterFunding.totalInvestedMinor, 300_000, "investor B total invested = ৳3,000");

    const invBSnap = await db
      .collection(Collections.investments)
      .where("investorId", "==", investorIdB)
      .get();
    eq(invBSnap.size, 1, "exactly one investment auto-created for investor B");
    investmentIdB = invBSnap.docs[0]?.id || "";
    const autoInvB = invBSnap.docs[0]?.data() as Record<string, unknown>;
    eq(autoInvB?.amountMinor, 300_000, "auto investment principal = ৳3,000");
    eq((autoInvB?.metadata as { fundedFromPool?: boolean })?.fundedFromPool, true, "investment flagged fundedFromPool");
    const dbPoolPerfume = (await db.collection(Collections.perfumes).doc(poolPerfumeId).get()).data()!;
    eq(dbPoolPerfume.totalStockMl, 50, "db stock = 50 ml (no doubling)");

    // Over-fund attempt: ৳6,000 bottle against a ৳2,000 pool must fail atomically.
    const overFund = await api("POST", "/api/perfumes", {
      cookie: adminCookie,
      body: {
        name: `E2E POOL OVERFUND ${RUN} (DELETE ME)`,
        brand: "E2E-POOL",
        owner: "Store",
        investorId: investorIdB,
        purchasePricePerMl: 60,
        marketPricePerMl: 90,
        totalStockMl: 100,
        isActive: false,
        category: "Unisex",
        images: "[]",
      },
    });
    ok(overFund.status === 400, `over-funding rejected (${overFund.status})`);
    const orphanCheck = await db.collection(Collections.perfumes).where("brand", "==", "E2E-POOL").get();
    eq(orphanCheck.size, 1, "rejected bottle left NO orphan perfume doc");
    const investorBAfterReject = (await db.collection(Collections.investors).doc(investorIdB).get()).data()!;
    eq(investorBAfterReject.unallocatedCapitalMinor, 200_000, "pool untouched by rejected funding");

    const statementB = await api("GET", `/api/investor/statement?investorId=${investorIdB}`, { cookie: adminCookie });
    eq((statementB.json.position as Record<string, number>)?.undeployedCapital, 2000, "statement shows ৳2,000 undeployed");

    // Lists must surface WHICH perfume each investment funds (allocations join).
    const adminList = await api("GET", `/api/investments?investorId=${investorIdB}`, { cookie: adminCookie });
    const listedRows = adminList.json as unknown as Array<Record<string, unknown>>;
    const listedAllocs = (Array.isArray(listedRows) ? (listedRows[0]?.allocations as Array<{ perfumeName?: string; fundedMl?: number; remainingMl?: number }>) : []) || [];
    ok(
      listedAllocs.length === 1 &&
        listedAllocs[0]?.fundedMl === 50 &&
        listedAllocs[0]?.remainingMl === 50 &&
        String(listedAllocs[0]?.perfumeName || "").includes("E2E POOL PERFUME"),
      "admin investments list attaches funded perfume (name + 50/50 ml)",
    );

    const dashA = await api("GET", "/api/investor/dashboard", { cookie: investorCookieA });
    const dashInvs = ((dashA.json as Record<string, unknown>).investments || []) as Array<Record<string, unknown>>;
    ok(dashA.status === 200 && dashInvs.length > 0, `investor dashboard returns investments (${dashA.status}, ${dashInvs.length})`);
    ok(
      dashInvs.some((i) => {
        const allocs = i.allocations as Array<{ perfumeName?: string }> | undefined;
        return Array.isArray(allocs) && allocs.length > 0 && Boolean(allocs[0]?.perfumeName);
      }),
      "investor dashboard rows include funded perfume names (allocations)",
    );

    // Idempotent deposits: a retry with the same key must NOT double-credit.
    const idemKey = `e2e-idem-${RUN}`;
    const dep1 = await api("POST", `/api/investors/${investorIdB}/capital`, {
      cookie: adminCookie,
      body: { amount: 500, notes: "e2e idem deposit", idempotencyKey: idemKey },
    });
    ok(dep1.status === 201 && dep1.json.duplicate === false, `keyed deposit recorded (${dep1.status})`);
    const dep2 = await api("POST", `/api/investors/${investorIdB}/capital`, {
      cookie: adminCookie,
      body: { amount: 500, notes: "e2e idem deposit", idempotencyKey: idemKey },
    });
    ok(dep2.status === 200 && dep2.json.duplicate === true, `same-key retry is a no-op (${dep2.status})`);
    const afterIdem = (await db.collection(Collections.investors).doc(investorIdB).get()).data()!;
    eq(afterIdem.unallocatedCapitalMinor, 250_000, "pool credited exactly once (৳2,000 + ৳500)");

    // Corrections: negative amount, note required, never below zero.
    const noNote = await api("POST", `/api/investors/${investorIdB}/capital`, {
      cookie: adminCookie,
      body: { amount: -100 },
    });
    ok(noNote.status === 400, `correction without a note rejected (${noNote.status})`);
    const overCorrect = await api("POST", `/api/investors/${investorIdB}/capital`, {
      cookie: adminCookie,
      body: { amount: -99999, notes: "e2e over-correction" },
    });
    ok(overCorrect.status === 400, `correction beyond pool rejected (${overCorrect.status})`);
    const correction = await api("POST", `/api/investors/${investorIdB}/capital`, {
      cookie: adminCookie,
      body: { amount: -500, notes: "e2e correction of the idem deposit" },
    });
    ok(correction.status === 201, `correction applied (${correction.status})`);
    const afterCorrection = (await db.collection(Collections.investors).doc(investorIdB).get()).data()!;
    eq(afterCorrection.unallocatedCapitalMinor, 200_000, "pool back to ৳2,000 after correction");

    // ════════════════════════════════════════════════════
    console.log("\n8. Security battery");
    // ════════════════════════════════════════════════════
    for (const path of [
      "/api/investments",
      "/api/investors",
      "/api/investments/reports",
      "/api/investment-withdrawals",
      "/api/investor/dashboard",
      "/api/investor/statement",
    ]) {
      const res = await api("GET", path);
      ok(res.status === 401, `no session → 401 for ${path} (${res.status})`);
    }

    const forgedPayload = JSON.stringify({ id: "x", name: "x", email: "x@x.com", role: "admin", exp: 9999999999 });
    const forged1 = await api("GET", "/api/investments", { cookie: `vp-session=${forgedPayload}` });
    ok(forged1.status === 401, `unsigned forged cookie rejected (${forged1.status})`);
    const forged2 = await api("GET", "/api/investments", { cookie: `vp-session=${forgedPayload}.deadbeef` });
    ok(forged2.status === 401, `bad-signature cookie rejected (${forged2.status})`);

    const custDash = await api("GET", "/api/investor/dashboard", { cookie: customerCookie });
    ok(custDash.status === 401, `customer role cannot open investor dashboard (${custDash.status})`);
    const investorAdmin = await api("GET", "/api/investments/reports", { cookie: investorCookieA });
    ok(investorAdmin.status === 401, `investor role cannot open admin reports (${investorAdmin.status})`);
    const investorCreate = await api("POST", "/api/investors", {
      cookie: investorCookieA,
      body: { name: "nope", email: "nope@example.com" },
    });
    ok(investorCreate.status === 401, `investor role cannot create investors (${investorCreate.status})`);

    const idor = await api("GET", `/api/investor/statement?investorId=${investorIdB}`, { cookie: investorCookieA });
    ok(
      idor.status === 200 && (idor.json.investor as { id?: string })?.id === investorIdA,
      "investor A asking for B's statement gets OWN statement (param ignored)"
    );
    const foreign = await api("GET", `/api/investor/investments/${investmentId.replace(/./g, "z")}`, {
      cookie: investorCookieA,
    });
    ok(foreign.status === 404, `foreign/unknown investment id → 404 (${foreign.status})`);
  } finally {
    // ════════════════════════════════════════════════════
    console.log("\n9. Cleanup (delete every fixture, compensate residual credits)");
    // ════════════════════════════════════════════════════
    try {
      for (const orderId of orderIds) {
        const items = await db.collection(Collections.orders).doc(orderId).collection("items").get();
        for (const d of items.docs) await d.ref.delete();
        await db.collection(Collections.orders).doc(orderId).delete();
        const pt = await db.collection(Collections.profitTransactions).where("orderId", "==", orderId).get();
        for (const d of pt.docs) await d.ref.delete();
      }
      if (investmentId) {
        for (const col of [
          Collections.investmentTransactions,
          Collections.investmentAllocations,
          Collections.investmentWithdrawals,
          Collections.buybacks,
        ]) {
          const snap = await db.collection(col).where("investmentId", "==", investmentId).get();
          for (const d of snap.docs) await d.ref.delete();
        }
        await db.collection(Collections.investments).doc(investmentId).delete();
      }
      if (investmentIdB) {
        for (const col of [
          Collections.investmentTransactions,
          Collections.investmentAllocations,
          Collections.investmentWithdrawals,
          Collections.buybacks,
        ]) {
          const snap = await db.collection(col).where("investmentId", "==", investmentIdB).get();
          for (const d of snap.docs) await d.ref.delete();
        }
        await db.collection(Collections.investments).doc(investmentIdB).delete();
      }
      // Pool contribution entries carry investmentId "" — delete by investor.
      for (const invId of [investorIdA, investorIdB].filter(Boolean)) {
        const contribSnap = await db
          .collection(Collections.investmentTransactions)
          .where("investorId", "==", invId)
          .get();
        for (const d of contribSnap.docs) await d.ref.delete();
      }
      if (poolPerfumeId) await db.collection(Collections.perfumes).doc(poolPerfumeId).delete();
      if (investorIdA) await db.collection(Collections.investors).doc(investorIdA).delete();
      if (investorIdB) await db.collection(Collections.investors).doc(investorIdB).delete();
      await db.collection(Collections.perfumes).doc(perfumeId).delete();

      // Compensate ownerAccounts for order 2 credits we intentionally kept.
      const { FieldValue } = await import("firebase-admin/firestore");
      if (residualOwner1Share !== 0) {
        await db.collection(Collections.ownerAccounts).doc(owner1Name).set(
          { storeShareEarned: FieldValue.increment(-residualOwner1Share) },
          { merge: true }
        );
      }
      if (residualOwner2Share !== 0) {
        await db.collection(Collections.ownerAccounts).doc(owner2Name).set(
          { storeShareEarned: FieldValue.increment(-residualOwner2Share) },
          { merge: true }
        );
      }

      // Best-effort: audit logs + notifications referencing our fixtures.
      const auditSnap = await db.collection(Collections.auditLogs).orderBy("createdAt", "desc").limit(200).get();
      for (const d of auditSnap.docs) {
        const raw = JSON.stringify(d.data());
        if (raw.includes(RUN) || (investmentId && raw.includes(investmentId)) || (investorIdA && raw.includes(investorIdA))) {
          await d.ref.delete();
        }
      }
      const notifSnap = await db.collection(Collections.notifications).orderBy("createdAt", "desc").limit(50).get();
      for (const d of notifSnap.docs) {
        const msg = String(d.data().message || "");
        if (orderIds.some((o) => msg.includes(o.slice(0, 8)))) await d.ref.delete();
      }

      // Verify balances really returned to baseline.
      const final = await readOwnerBalances();
      eq(final.o1Share, baseline.o1Share, `cleanup: ${owner1Name} storeShare back to baseline`);
      eq(final.o2Share, baseline.o2Share, `cleanup: ${owner2Name} storeShare back to baseline`);
      eq(final.o1Total, baseline.o1Total, `cleanup: ${owner1Name} totalEarned back to baseline`);
      console.log("  cleanup complete");
    } catch (cleanupError) {
      console.error("  CLEANUP ERROR (manual check needed):", cleanupError);
      failed++;
      failures.push("cleanup failed");
    }
  }

  console.log("\n──────────────────────────────────");
  console.log(`E2E PASSED: ${passed}   FAILED: ${failed}`);
  if (failed > 0) {
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
  console.log("All E2E investment tests passed.");
}

main().catch((e) => {
  console.error("E2E fatal:", e);
  process.exit(1);
});
