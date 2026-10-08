/**
 * Perfume Pack engine tests (pure functions — no Firestore, no deps).
 *
 * Run:  cd backend && npx tsx scripts/test-packs.ts
 * Exits non-zero on any failure.
 */

import { computeDecantPrice } from "../src/lib/pricing-engine";
import {
  allocatePackPrice,
  buildPackWarnings,
  computePackTotals,
  evaluateComponent,
  isSellable,
  slugifyPackName,
  validatePackInput,
} from "../src/lib/packs/pricing";
import { calculateSellingPrice, DEFAULT_TIER_MARGINS } from "../src/lib/utils";
import { resolvePack, toAdminPack, toPublicPack } from "../src/lib/packs/resolve";
import { computeItemBreakdown, toMinorUnits } from "../src/lib/finance";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, name: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(name);
    console.error(`  ✗ FAIL: ${name}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, name: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) console.error(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  assert(ok, name);
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// ═══ 1. Canonical decant price engine (golden — pins the /api/pricing lift) ═══
console.log("1. computeDecantPrice golden values");
{
  const ctx = { packagingCost: 20, margins: DEFAULT_TIER_MARGINS, bottleCost: 15 };

  // Budget: market 20/ml → full bottle 2000 (<3000). 10ml margin 27%.
  // base 200 + 54 + 15 + 20 = 289 → psychological round keeps 289.
  const budget = computeDecantPrice({ marketPricePerMl: 20, purchasePricePerMl: 12 }, 10, ctx);
  assertEqual(budget.tier, "Budget", "budget tier");
  assertEqual(budget.sellingPrice, 289, "budget 10ml price");
  assertEqual(
    budget.sellingPrice,
    calculateSellingPrice(20, 10, 15, 20, 27),
    "budget price equals the underlying calculateSellingPrice call",
  );

  // Premium: market 40/ml → 4000. 10ml margin 22%.  400*1.22=488 +15+20 = 523 → 529
  const premium = computeDecantPrice({ marketPricePerMl: 40, purchasePricePerMl: 25 }, 10, ctx);
  assertEqual(premium.tier, "Premium", "premium tier");
  assertEqual(premium.sellingPrice, 529, "premium 10ml price");

  // Luxury: market 100/ml → 10000. 10ml margin 35%. 1000*1.35=1350+35=1385 → 1389
  const luxury = computeDecantPrice({ marketPricePerMl: 100, purchasePricePerMl: 70 }, 10, ctx);
  assertEqual(luxury.tier, "Luxury", "luxury tier");
  assertEqual(luxury.sellingPrice, 1389, "luxury 10ml price");

  // Personal collection prices off the purchase price.
  const personal = computeDecantPrice(
    { marketPricePerMl: 100, purchasePricePerMl: 20, isPersonalCollection: true },
    10,
    ctx,
  );
  assertEqual(personal.effectiveMarketPricePerMl, 20, "personal collection uses purchase price");
  assertEqual(personal.sellingPrice, 289, "personal collection 10ml price");

  // Partial deal: flat price regardless of size.
  const partial = computeDecantPrice(
    { marketPricePerMl: 100, purchasePricePerMl: 70, partialDealType: "decant", partialSellingPrice: 410.2 },
    10,
    ctx,
  );
  assertEqual(partial.isPartialDeal, true, "partial deal detected");
  assertEqual(partial.sellingPrice, 411, "partial deal price is ceil(partialSellingPrice)");
  const partialLegacy = computeDecantPrice(
    { marketPricePerMl: 100, purchasePricePerMl: 70, partialDealType: "FULL_BOTTLE", partialSellingPricePerMl: 300 },
    5,
    ctx,
  );
  assertEqual(partialLegacy.sellingPrice, 300, "partial deal legacy per-ml field + case-insensitive type");
}

// ═══ 2. Pack totals — percentage & fixed ═══
console.log("2. Pack totals");
{
  const prices = [300, 350, 400]; // 1050 (spec example)
  assertEqual(computePackTotals(prices, "percentage", 10), { originalPrice: 1050, discountAmount: 105, finalPrice: 945 }, "10% of 1050 → 945");
  assertEqual(computePackTotals(prices, "fixed", 100), { originalPrice: 1050, discountAmount: 100, finalPrice: 950 }, "৳100 fixed of 1050 → 950");
  assertEqual(computePackTotals([300, 300, 300], "percentage", 10), { originalPrice: 900, discountAmount: 90, finalPrice: 810 }, "10% of 900 → 810");
  assertEqual(computePackTotals([300, 300, 300], "fixed", 100), { originalPrice: 900, discountAmount: 100, finalPrice: 800 }, "৳100 fixed of 900 → 800");
  assertEqual(computePackTotals(prices, "percentage", 5), { originalPrice: 1050, discountAmount: 53, finalPrice: 997 }, "5% of 1050 = 52.5 → rounds to 53 → 997");
  assertEqual(computePackTotals(prices, "percentage", 50), { originalPrice: 1050, discountAmount: 525, finalPrice: 525 }, "50% of 1050 → 525");
  assertEqual(computePackTotals(prices, "fixed", 50), { originalPrice: 1050, discountAmount: 50, finalPrice: 1000 }, "৳50 fixed → 1000");

  // Edge cases: the final price can never go negative.
  assertEqual(computePackTotals([100, 100], "fixed", 5000), { originalPrice: 200, discountAmount: 200, finalPrice: 0 }, "fixed discount larger than subtotal clamps to 0");
  assertEqual(computePackTotals([100, 100], "percentage", 100), { originalPrice: 200, discountAmount: 200, finalPrice: 0 }, "100% → free, not negative");
  assertEqual(computePackTotals([100, 100], "percentage", 250).finalPrice, 0, "percentage above 100 is clamped");
  assertEqual(computePackTotals([100, 100], "fixed", -40).finalPrice, 200, "negative discount is ignored");
  assertEqual(computePackTotals([], "fixed", 10), { originalPrice: 0, discountAmount: 0, finalPrice: 0 }, "empty pack");
  assertEqual(computePackTotals([100, 100], "fixed", Number.NaN).finalPrice, 200, "NaN discount is ignored");
}

// ═══ 3. Discount allocation reconciles exactly ═══
console.log("3. Allocation");
{
  // Spec example: 300 / 300 / 400, ৳100 off → 900 → 270 / 270 / 360
  const prices = [300, 300, 400];
  const totals = computePackTotals(prices, "fixed", 100);
  assertEqual(totals.finalPrice, 900, "spec example final 900");
  assertEqual(allocatePackPrice(prices, totals.finalPrice), [270, 270, 360], "spec example allocation 270/270/360");

  // Odd remainders always sum exactly.
  const cases: [number[], number][] = [
    [[299, 349, 399], 945],
    [[199, 199, 199], 500],
    [[329, 149, 219, 899, 59, 109], 1234],
    [[1, 1, 1], 2],
    [[1000], 777],
    [[10, 20, 30], 59],
    [[333, 333, 333], 1],
  ];
  for (const [p, final] of cases) {
    const alloc = allocatePackPrice(p, final);
    assertEqual(sum(alloc), final, `allocation of ${JSON.stringify(p)} → ${final} sums exactly`);
    assert(alloc.every((a, i) => Number.isInteger(a) && a >= 0 && a <= p[i]), `allocation ${JSON.stringify(p)} is whole BDT, non-negative, ≤ list price`);
  }

  // Percentage case reconciles through the per-line money math used by orders.
  const pctTotals = computePackTotals([299, 349, 399], "percentage", 10);
  const alloc = allocatePackPrice([299, 349, 399], pctTotals.finalPrice);
  const qty = 3;
  const lineRevenueMinor = alloc.reduce(
    (acc, unit) => acc + computeItemBreakdown({ unitCostMinor: 0, unitSellingPriceMinor: toMinorUnits(unit), quantity: qty }).totalRevenueMinor,
    0,
  );
  assertEqual(lineRevenueMinor, toMinorUnits(pctTotals.finalPrice) * qty, "pack ×3 component revenue sums to exactly 3 × pack price");

  // Deterministic.
  assertEqual(allocatePackPrice([100, 100, 100], 100), allocatePackPrice([100, 100, 100], 100), "allocation is deterministic");
  assertEqual(allocatePackPrice([100, 100, 100], 100), [34, 33, 33], "ties go to lower index");

  // Degenerate input.
  assertEqual(allocatePackPrice([], 0), [], "no components");
  assertEqual(allocatePackPrice([0, 0], 0), [0, 0], "zero-priced components");
  assertEqual(sum(allocatePackPrice([100, 100], 99999)), 200, "final price above list is clamped to the list total");
}

// ═══ 4. Component availability ═══
console.log("4. Component status");
{
  const base = {
    exists: true,
    isActive: true,
    sizeEnabled: true,
    stockMl: 100,
    requiredMl: 10,
    hasBottleRecord: true,
    bottleCount: 5,
    requiredBottles: 1,
    lowStockThresholdMl: 20,
  };
  assertEqual(evaluateComponent(base), "available", "plenty of stock");
  assertEqual(evaluateComponent({ ...base, exists: false }), "missing", "deleted perfume");
  assertEqual(evaluateComponent({ ...base, isActive: false }), "inactive", "inactive perfume");
  assertEqual(evaluateComponent({ ...base, sizeEnabled: false }), "unavailable_size", "decant size disabled");
  assertEqual(evaluateComponent({ ...base, stockMl: 10, requiredMl: 10 }), "low_stock", "stock exactly equal to the requirement is still sellable (low stock)");
  assertEqual(evaluateComponent({ ...base, stockMl: 9, requiredMl: 10 }), "insufficient", "stock one ml below the requirement");
  assertEqual(evaluateComponent({ ...base, stockMl: 25, requiredMl: 20 }), "low_stock", "quantity 2 × 10ml leaves <20ml → low stock");
  assertEqual(evaluateComponent({ ...base, stockMl: 19, requiredMl: 20 }), "insufficient", "quantity 2 × 10ml with 19ml");
  assertEqual(evaluateComponent({ ...base, bottleCount: 0 }), "insufficient", "no atomiser left");
  assertEqual(evaluateComponent({ ...base, bottleCount: 1, requiredBottles: 2 }), "insufficient", "not enough atomisers for quantity 2");
  assertEqual(evaluateComponent({ ...base, hasBottleRecord: false, bottleCount: 0 }), "available", "no bottle record = not gated (matches /api/pricing)");
  assertEqual(evaluateComponent({ ...base, isActive: false, stockMl: 0 }), "inactive", "inactive wins over insufficient");

  assert(isSellable("available") && isSellable("low_stock"), "available + low_stock are sellable");
  assert(!isSellable("insufficient") && !isSellable("inactive") && !isSellable("unavailable_size") && !isSellable("missing"), "other statuses are not sellable");
}

// ═══ 5. Admin input validation ═══
console.log("5. Validation");
{
  const good = {
    name: "Winter Pack",
    description: "Three rich fragrances for colder evenings.",
    isActive: true,
    sortOrder: 2,
    decantSizeMl: 10,
    perfumeIds: ["a", "b", "c"],
    discountType: "percentage",
    discountValue: 10,
  };
  const ok = validatePackInput(good);
  assert(ok.ok, "valid pack accepted");
  assertEqual(ok.value?.slug, "winter-pack", "slug auto-generated from the name");
  assertEqual(validatePackInput({ ...good, slug: "My  Custom_Slug!" }).value?.slug, "my-custom-slug", "provided slug is normalised");
  assertEqual(validatePackInput({ ...good, items: [{ perfumeId: "x" }], perfumeIds: undefined }).value?.perfumeIds, ["x"], "items[].perfumeId form accepted");

  const fields = (r: ReturnType<typeof validatePackInput>) => r.errors.map((e) => e.field);
  assert(fields(validatePackInput({ ...good, perfumeIds: [] })).includes("perfumeIds"), "zero perfumes rejected");
  assert(fields(validatePackInput({ ...good, perfumeIds: ["a", "a"] })).includes("perfumeIds"), "duplicate perfumes rejected");
  assert(fields(validatePackInput({ ...good, perfumeIds: ["a", "b", "c", "d", "e", "f", "g"] })).includes("perfumeIds"), "more than 6 perfumes rejected");
  assert(validatePackInput({ ...good, perfumeIds: ["a", "b", "c", "d", "e", "f"] }).ok, "exactly 6 perfumes accepted");
  assert(fields(validatePackInput({ ...good, perfumeIds: ["a", ""] })).includes("perfumeIds"), "blank perfume id rejected");
  assert(fields(validatePackInput({ ...good, perfumeIds: ["a", 7 as unknown as string] })).includes("perfumeIds"), "non-string perfume id rejected");
  assert(fields(validatePackInput({ ...good, discountType: "bogus" })).includes("discountType"), "invalid discount type rejected");
  assert(fields(validatePackInput({ ...good, discountType: undefined })).includes("discountType"), "missing discount type rejected");
  assert(fields(validatePackInput({ ...good, discountValue: 0 })).includes("discountValue"), "0% rejected");
  assert(fields(validatePackInput({ ...good, discountValue: -5 })).includes("discountValue"), "negative percentage rejected");
  assert(fields(validatePackInput({ ...good, discountValue: 101 })).includes("discountValue"), ">100% rejected");
  assert(validatePackInput({ ...good, discountValue: 100 }).ok, "100% is allowed");
  assert(fields(validatePackInput({ ...good, discountValue: "abc" })).includes("discountValue"), "non-numeric discount rejected");
  assert(validatePackInput({ ...good, discountType: "fixed", discountValue: 0 }).ok, "৳0 fixed allowed");
  assert(fields(validatePackInput({ ...good, discountType: "fixed", discountValue: -1 })).includes("discountValue"), "negative fixed rejected");
  assert(fields(validatePackInput({ ...good, name: " " })).includes("name"), "blank name rejected");
  assert(fields(validatePackInput({ ...good, name: "x".repeat(81) })).includes("name"), "overlong name rejected");
  assert(fields(validatePackInput({ ...good, decantSizeMl: 0 })).includes("decantSizeMl"), "zero decant size rejected");
  assert(fields(validatePackInput({ ...good, decantSizeMl: undefined })).includes("decantSizeMl"), "missing decant size rejected");
  assert(fields(validatePackInput({ ...good, isActive: "yes" })).includes("isActive"), "non-boolean isActive rejected");
  assert(fields(validatePackInput({ ...good, sortOrder: "abc" })).includes("sortOrder"), "non-numeric sortOrder rejected");
  assert(fields(validatePackInput(null)).length > 0, "null body rejected");
  assertEqual(slugifyPackName("Date Night Pack!"), "date-night-pack", "slugify");
}

// ═══ 6. Admin warnings ═══
console.log("6. Warnings");
{
  const w1 = buildPackWarnings({
    pricing: computePackTotals([300, 300], "percentage", 10),
    totalCost: 200,
    discountType: "percentage",
    discountValue: 10,
  });
  assertEqual(w1, [], "healthy pack has no warnings");
  const w2 = buildPackWarnings({
    pricing: computePackTotals([300, 300], "percentage", 60),
    totalCost: 400,
    discountType: "percentage",
    discountValue: 60,
  });
  assert(w2.some((w) => w.includes("below the total cost")), "price below cost is flagged");
  assert(w2.some((w) => w.includes("aggressive")), "≥50% is flagged");
  const w3 = buildPackWarnings({
    pricing: computePackTotals([100, 100], "fixed", 5000),
    totalCost: 100,
    discountType: "fixed",
    discountValue: 5000,
  });
  assert(w3.some((w) => w.includes("free")), "free pack is flagged");
  assert(w3.some((w) => w.includes("larger than the pack subtotal")), "oversized fixed discount is flagged");
}

// ═══ 7. No discount stacking: the pack discount applies to the NORMAL price once ═══
console.log("7. Single discount");
{
  // Bulk rules never feed computeDecantPrice / computePackTotals, so a pack ×N
  // cannot be bulk-discounted on top of the pack discount.
  const normal = [299, 349, 399];
  const totals = computePackTotals(normal, "percentage", 10);
  const alloc = allocatePackPrice(normal, totals.finalPrice);
  assertEqual(sum(alloc) * 3, totals.finalPrice * 3, "3 packs cost exactly 3 × the single pack price");
}

// ═══ 8. resolvePack: pricing + availability + public/admin payloads ═══
console.log("8. resolvePack");
{
  const config = {
    sizes: [{ ml: 10, enabled: true }],
    bottles: [{ id: "b10", ml: 10, costPerBottle: 15, availableCount: 6 }],
    packagingCost: 20,
    ownerProfitPercent: 85,
    margins: DEFAULT_TIER_MARGINS,
    // An active bulk rule must NOT influence pack pricing.
    bulkRules: [{ minQuantity: 1, discountPercent: 50 }],
    lowStockAlertMl: 20,
    ts: Date.now(),
  };
  const perfume = (id: string, market: number, purchase: number, stock: number, extra: Record<string, unknown> = {}) => ({
    id,
    name: `Perfume ${id.toUpperCase()}`,
    brand: "Brand",
    slug: `perfume-${id}`,
    images: JSON.stringify([`https://res.cloudinary.com/demo/${id}.png`]),
    isActive: true,
    marketPricePerMl: market,
    purchasePricePerMl: purchase,
    totalStockMl: stock,
    ...extra,
  });
  const catalog = (overrides: Record<string, ReturnType<typeof perfume>> = {}) =>
    new Map<string, ReturnType<typeof perfume>>(
      Object.entries({
        a: perfume("a", 20, 12, 100),
        b: perfume("b", 40, 25, 100),
        c: perfume("c", 100, 70, 100),
        ...overrides,
      }),
    );
  const basePack = {
    id: "pk",
    name: "Winter Pack",
    slug: "winter-pack",
    description: "d",
    isActive: true,
    sortOrder: 0,
    decantSizeMl: 10,
    items: [{ perfumeId: "a" }, { perfumeId: "b" }, { perfumeId: "c" }],
    discountType: "percentage" as const,
    discountValue: 10,
    createdAt: null,
    updatedAt: null,
  };
  const ctx = { packagingCost: 20, margins: DEFAULT_TIER_MARGINS, bottleCost: 15 };
  const expectedPrices = [
    computeDecantPrice({ marketPricePerMl: 20, purchasePricePerMl: 12 }, 10, ctx).sellingPrice,
    computeDecantPrice({ marketPricePerMl: 40, purchasePricePerMl: 25 }, 10, ctx).sellingPrice,
    computeDecantPrice({ marketPricePerMl: 100, purchasePricePerMl: 70 }, 10, ctx).sellingPrice,
  ];
  const expectedTotals = computePackTotals(expectedPrices, "percentage", 10);

  const r = resolvePack(basePack, catalog(), config as never, 1);
  assertEqual(r.components.map((c) => c.listPrice), expectedPrices, "component prices are the canonical decant prices (bulk rule ignored)");
  assertEqual(r.pricing, expectedTotals, "pack pricing matches computePackTotals");
  assertEqual(sum(r.allocation), r.pricing.finalPrice, "allocation sums to the pack price");
  assert(r.available, "pack with plenty of stock is available");
  assertEqual(r.totalCost, [12, 25, 70].reduce((acc, p) => acc + p * 10 + 20 + 15, 0), "total cost = purchase + packaging + bottle per component");

  const pub = toPublicPack(r);
  const pubJson = JSON.stringify(pub);
  assert(!/unitCost|totalCost|stockMl|profit|purchase|margin/i.test(pubJson), "public payload exposes no cost / stock / profit / margin");
  assertEqual(pub.finalPrice, expectedTotals.finalPrice, "public final price");
  assertEqual(pub.items.map((i) => i.unitPrice), expectedPrices, "public component prices");
  const adm = toAdminPack(r);
  assert(adm.items.every((i) => typeof i.stockMl === "number" && typeof i.unitCost === "number"), "admin payload carries stock + cost");

  // Availability
  const lowStock = resolvePack(basePack, catalog({ c: perfume("c", 100, 70, 25) }), config as never, 1);
  assert(lowStock.available && lowStock.components[2].status === "low_stock", "15ml left after the sale → low stock but sellable");
  const exact = resolvePack(basePack, catalog({ c: perfume("c", 100, 70, 10) }), config as never, 1);
  assert(exact.available, "stock exactly equal to the requirement → still sellable");
  const oneShort = resolvePack(basePack, catalog({ c: perfume("c", 100, 70, 9) }), config as never, 1);
  assert(!oneShort.available && oneShort.components[2].status === "insufficient", "one ml below the requirement → unavailable");
  const qty2 = resolvePack(basePack, catalog({ c: perfume("c", 100, 70, 19) }), config as never, 2);
  assert(!qty2.available, "quantity 2 needs ml × 2 per component");
  const qty2ok = resolvePack(basePack, catalog({ c: perfume("c", 100, 70, 20) }), config as never, 2);
  assert(qty2ok.available, "quantity 2 with exactly 2 × ml");
  assert(!resolvePack(basePack, catalog({ a: perfume("a", 20, 12, 100, { isActive: false }) }), config as never, 1).available, "an inactive component makes the pack unavailable");
  assert(!resolvePack({ ...basePack, items: [...basePack.items, { perfumeId: "ghost" }] }, catalog(), config as never, 1).available, "a missing component makes the pack unavailable");
  assert(!resolvePack({ ...basePack, decantSizeMl: 15 }, catalog(), config as never, 1).available, "a disabled decant size makes the pack unavailable");
  assert(!resolvePack(basePack, catalog(), config as never, 3).available, "3 packs need 9 atomisers but only 6 exist");
  assert(resolvePack(basePack, catalog(), config as never, 2).available, "2 packs need exactly 6 atomisers → available");
  assert(!resolvePack({ ...basePack, items: [] }, catalog(), config as never, 1).available, "an empty pack is never available");

  // Discount edge cases through the full resolver
  const free = resolvePack({ ...basePack, discountType: "fixed", discountValue: 999999 }, catalog(), config as never, 1);
  assertEqual(free.pricing.finalPrice, 0, "discount larger than the subtotal → final price 0 (never negative)");
  assert(toAdminPack(free).warnings.some((w) => w.includes("free")), "admin is warned about a free pack");
  const partialDeal = resolvePack(basePack, catalog({ a: perfume("a", 20, 12, 100, { partialDealType: "decant", partialSellingPrice: 111 }) }), config as never, 1);
  assertEqual(partialDeal.components[0].listPrice, 111, "partial-deal perfumes keep their flat price inside a pack");
}

// ═══ Summary ═══
console.log("\n──────────────────────────────────");
console.log(`PASSED: ${passed}   FAILED: ${failed}`);
if (failed > 0) {
  console.error("Failing tests:");
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log("All pack engine tests passed.");
