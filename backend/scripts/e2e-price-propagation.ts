/**
 * END-TO-END price-propagation test over real HTTP.
 *
 * Reproduces the reported bug: admin updates a perfume price / tier margin and
 * the CUSTOMER-facing surfaces (product page SSR, pricing API, batch pricing,
 * perfume list) must reflect it IMMEDIATELY — no TTL waiting.
 *
 * Expects BOTH dev servers running:
 *   backend  on http://localhost:3001 (override E2E_BACKEND_URL)
 *   frontend on http://localhost:3000 (override E2E_FRONTEND_URL)
 *   — frontend must be started with API_BASE_URL=http://localhost:3001
 *
 * Uses a clearly-namespaced fixture perfume (e2e-price-*), snapshots and
 * restores the settings doc, and deletes everything it created in a finally
 * block. Run: cd backend && npx tsx scripts/e2e-price-propagation.ts
 * Exits non-zero on any failure.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const BACKEND = process.env.E2E_BACKEND_URL || "http://localhost:3001";
const FRONTEND = process.env.E2E_FRONTEND_URL || "http://localhost:3000";
const RUN = Date.now().toString(36);

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(cond: boolean, label: string) {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.error(`  \u2717 ${label}`);
  }
}

async function fetchText(url: string, init?: RequestInit): Promise<{ status: number; text: string }> {
  const res = await fetch(url, init);
  return { status: res.status, text: await res.text() };
}

/** RSC flight payloads escape quotes — normalize so `"sellingPrice":705` matches either form. */
function htmlContains(html: string, needle: string): boolean {
  return html.replace(/\\/g, "").includes(needle);
}

async function waitFor(url: string, label: string, tries = 60): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`${label} did not come up at ${url}`);
}

async function main() {
  const { signSessionToken } = await import("../src/lib/session-token");
  const adminCookie = `vp-session=${await signSessionToken({
    id: "e2e-price-admin",
    name: "E2E Price Admin",
    email: `e2e-price-admin-${RUN}@example.com`,
    role: "admin",
  })}`;

  const api = async (
    base: string,
    method: string,
    path: string,
    body?: unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ status: number; json: any }> => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        cookie: adminCookie,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let json: any = {};
    try {
      json = await res.json();
    } catch {
      /* non-JSON */
    }
    return { status: res.status, json };
  };

  console.log("\n0. Waiting for servers");
  await waitFor(`${BACKEND}/api/notes-library`, "backend");
  await waitFor(`${FRONTEND}/`, "frontend");
  ok(true, `backend ${BACKEND} and frontend ${FRONTEND} are up`);

  let perfumeId = "";
  let productPath = "";
  let originalSettings: Record<string, unknown> | null = null;
  let settingsModified = false;

  try {
    // ── 1. Create fixture perfume THROUGH THE FRONTEND PROXY (the real admin path) ──
    console.log("\n1. Fixture perfume via admin flow (frontend proxy)");
    const create = await api(FRONTEND, "POST", "/api/perfumes", {
      name: `E2E Price Probe ${RUN}`,
      brand: "E2E Brand",
      category: "EDP",
      owner: "Store",
      isActive: true,
      totalStockMl: 100,
      purchasePricePerMl: 60,
      marketPricePerMl: 120,
      images: "[]",
    });
    ok(create.status === 201, `POST /api/perfumes \u2192 201 (got ${create.status})`);
    perfumeId = String(create.json.id || "");
    productPath = String(create.json.canonicalPath || "");
    ok(Boolean(perfumeId && productPath), `fixture id + canonicalPath returned (${productPath})`);

    // Pricing source of truth for the fixture (5ml row).
    const basePricing = await api(FRONTEND, "GET", `/api/pricing?perfumeId=${perfumeId}`);
    ok(basePricing.status === 200, "GET /api/pricing \u2192 200");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const baseRow = (basePricing.json.prices || []).find((p: any) => p.ml === 5);
    ok(Boolean(baseRow), "5ml price row exists");
    const p1 = Number(baseRow?.sellingPrice || 0);
    ok(p1 > 0, `baseline 5ml price computed (${p1})`);

    // New perfume must be visible on the storefront IMMEDIATELY (tag purge on POST).
    const page1 = await fetchText(`${FRONTEND}${productPath}`);
    ok(page1.status === 200, `product page live immediately after create (got ${page1.status})`);
    ok(
      htmlContains(page1.text, `"sellingPrice":${p1}`),
      `product page SSR shows baseline price ${p1}`,
    );

    // ── 2. Admin raises the market price → customer side must update instantly ──
    console.log("\n2. Perfume price change propagates instantly");
    // Prime the batch-pricing cache first (the shop grid path), so we prove invalidation.
    const batchBefore = await api(BACKEND, "POST", "/api/pricing", { perfumeIds: [perfumeId] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const batchBeforeRow = (batchBefore.json[perfumeId]?.prices || []).find((p: any) => p.ml === 5);
    ok(Number(batchBeforeRow?.sellingPrice) === p1, `batch pricing primed at ${p1}`);

    const put = await api(FRONTEND, "PUT", `/api/perfumes/${perfumeId}`, { marketPricePerMl: 240 });
    ok(put.status === 200, `PUT /api/perfumes/[id] \u2192 200 (got ${put.status})`);

    const freshPricing = await api(FRONTEND, "GET", `/api/pricing?perfumeId=${perfumeId}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const freshRow = (freshPricing.json.prices || []).find((p: any) => p.ml === 5);
    const p2 = Number(freshRow?.sellingPrice || 0);
    ok(p2 > p1, `pricing API shows raised price instantly (${p1} \u2192 ${p2})`);

    const batchAfter = await api(BACKEND, "POST", "/api/pricing", { perfumeIds: [perfumeId] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const batchAfterRow = (batchAfter.json[perfumeId]?.prices || []).find((p: any) => p.ml === 5);
    ok(
      Number(batchAfterRow?.sellingPrice) === p2,
      `shop-grid batch pricing updated instantly (got ${batchAfterRow?.sellingPrice}, want ${p2})`,
    );

    const page2 = await fetchText(`${FRONTEND}${productPath}`);
    ok(
      htmlContains(page2.text, `"sellingPrice":${p2}`),
      `product page SSR shows NEW price ${p2} immediately`,
    );
    ok(
      !htmlContains(page2.text, `"sellingPrice":${p1}`),
      `product page no longer shows old price ${p1}`,
    );

    // Admin inventory list path (proxied, tagged fetch + backend list cache).
    const list = await api(FRONTEND, "GET", "/api/perfumes");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listed = (Array.isArray(list.json) ? list.json : []).find((p: any) => p.id === perfumeId);
    ok(
      Number(listed?.marketPricePerMl) === 240,
      `/api/perfumes list reflects new market price instantly (got ${listed?.marketPricePerMl})`,
    );

    // ── 3. Settings tier-margin change → instant repricing ──
    console.log("\n3. Tier-margin change propagates instantly");
    const settingsRes = await api(BACKEND, "GET", "/api/settings");
    ok(settingsRes.status === 200, "GET /api/settings \u2192 200");
    originalSettings = settingsRes.json as Record<string, unknown>;

    const tier = String(freshPricing.json.tier || "");
    const margins = JSON.parse(String(originalSettings.tierMargins || "{}"));
    ok(Boolean(tier && margins[tier]), `fixture tier resolved (${tier})`);
    const bumped = JSON.parse(JSON.stringify(margins));
    bumped[tier]["5"] = Number(bumped[tier]["5"] ?? 30) + 10;

    const settingsPut = await api(FRONTEND, "PUT", "/api/settings", {
      ...originalSettings,
      tierMargins: JSON.stringify(bumped),
    });
    settingsModified = true;
    ok(settingsPut.status === 200, `PUT /api/settings \u2192 200 (got ${settingsPut.status})`);

    const marginPricing = await api(FRONTEND, "GET", `/api/pricing?perfumeId=${perfumeId}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const marginRow = (marginPricing.json.prices || []).find((p: any) => p.ml === 5);
    const p3 = Number(marginRow?.sellingPrice || 0);
    ok(p3 > p2, `pricing API repriced from margin change instantly (${p2} \u2192 ${p3})`);

    const page3 = await fetchText(`${FRONTEND}${productPath}`);
    ok(
      htmlContains(page3.text, `"sellingPrice":${p3}`),
      `product page SSR shows margin-adjusted price ${p3} immediately`,
    );

    // Restore settings through the same path (fires invalidation again).
    const restore = await api(FRONTEND, "PUT", "/api/settings", originalSettings);
    ok(restore.status === 200, "settings restored");
    settingsModified = false;

    const restoredPricing = await api(FRONTEND, "GET", `/api/pricing?perfumeId=${perfumeId}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const restoredRow = (restoredPricing.json.prices || []).find((p: any) => p.ml === 5);
    ok(
      Number(restoredRow?.sellingPrice) === p2,
      `price back to ${p2} after restore (got ${restoredRow?.sellingPrice})`,
    );
  } finally {
    console.log("\n4. Cleanup");
    if (settingsModified && originalSettings) {
      const r = await api(FRONTEND, "PUT", "/api/settings", originalSettings);
      console.log(`  settings restored in finally (${r.status})`);
    }
    if (perfumeId) {
      const del = await api(FRONTEND, "DELETE", `/api/perfumes/${perfumeId}`);
      ok(del.status === 200, `fixture perfume deleted (${del.status})`);
      if (productPath) {
        const gone = await fetchText(`${FRONTEND}${productPath}`);
        ok(gone.status === 404, `product page 404s immediately after delete (got ${gone.status})`);
      }
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`PASSED: ${passed}  FAILED: ${failed}`);
  if (failed > 0) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log("All price-propagation checks green.");
}

main().catch((err) => {
  console.error("E2E run crashed:", err);
  process.exit(1);
});
