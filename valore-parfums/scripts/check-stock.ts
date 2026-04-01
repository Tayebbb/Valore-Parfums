// ─── check-stock.ts ────────────────────────────────────
// Check perfume and order stock levels.
// Flags misreported brands (e.g. Givenchy) and low stock.
//
// Usage: npx tsx scripts/check-stock.ts
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

// Known brand corrections: misreported → correct
const BRAND_FIXES: Record<string, string> = {
  "Givenchy": "GIVENCHY",
  "givenchy": "GIVENCHY",
  "givency": "GIVENCHY",
  "Givency": "GIVENCHY",
};

interface PerfumeDoc {
  id: string;
  name: string;
  brand: string;
  totalStockMl: number;
  lowStockThreshold?: number;
  tier?: string;
}

async function main() {
  console.log("═══════════════════════════════════════");
  console.log("  Valore Parfums — Stock Check");
  console.log("═══════════════════════════════════════\n");

  // 1. Perfume stock
  const perfumesSnap = await db.collection("perfumes").get();
  const perfumes: PerfumeDoc[] = perfumesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as PerfumeDoc));

  console.log(`Total perfumes: ${perfumes.length}\n`);

  // Check for brand mismatches
  const brandIssues: PerfumeDoc[] = [];
  for (const p of perfumes) {
    if (BRAND_FIXES[p.brand]) {
      brandIssues.push(p);
    }
  }

  if (brandIssues.length > 0) {
    console.log("── Brand Issues ──");
    for (const p of brandIssues) {
      console.log(`  ⚠  "${p.name}" has brand "${p.brand}" → should be "${BRAND_FIXES[p.brand]}"`);
    }
    console.log("");
  }

  // Low stock perfumes
  const defaultThreshold = 20;
  const lowStock = perfumes.filter(
    (p) => p.totalStockMl <= (p.lowStockThreshold ?? defaultThreshold)
  );

  console.log("── Low Stock Perfumes ──");
  if (lowStock.length === 0) {
    console.log("  All stock levels healthy ✓");
  } else {
    lowStock.sort((a, b) => a.totalStockMl - b.totalStockMl);
    for (const p of lowStock) {
      console.log(`  ⚠  ${p.name} (${p.brand}) — ${p.totalStockMl}ml remaining`);
    }
  }

  // Out of stock
  const oos = perfumes.filter((p) => p.totalStockMl <= 0);
  console.log(`\n── Out of Stock: ${oos.length} ──`);
  for (const p of oos) {
    console.log(`  ✗  ${p.name} (${p.brand})`);
  }

  // 2. Bottles stock
  console.log("\n── Bottle Stock ──");
  const bottlesSnap = await db.collection("bottles").get();
  if (bottlesSnap.empty) {
    console.log("  No bottles found.");
  } else {
    for (const d of bottlesSnap.docs) {
      const b = d.data();
      const warn = (b.availableCount ?? 0) <= 5 ? " ⚠ LOW" : "";
      console.log(`  ${b.ml}ml — ${b.availableCount ?? 0} available${warn}`);
    }
  }

  // 3. Order summary
  console.log("\n── Order Summary ──");
  const ordersSnap = await db.collection("orders").get();
  const statusCounts: Record<string, number> = {};
  for (const d of ordersSnap.docs) {
    const status = d.data().status ?? "Unknown";
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`  ${status}: ${count}`);
  }

  // 4. Fix misreported brands (dry-run by default)
  if (brandIssues.length > 0) {
    const dryRun = !process.argv.includes("--fix");
    console.log(`\n── Brand Fix ${dryRun ? "(DRY-RUN — pass --fix to apply)" : "(APPLYING)"} ──`);
    for (const p of brandIssues) {
      const correctBrand = BRAND_FIXES[p.brand];
      if (dryRun) {
        console.log(`  Would update "${p.name}": "${p.brand}" → "${correctBrand}"`);
      } else {
        await db.collection("perfumes").doc(p.id).update({ brand: correctBrand });
        console.log(`  ✓ Updated "${p.name}": "${p.brand}" → "${correctBrand}"`);
      }
    }
  }

  console.log("\n═══════════════════════════════════════");
  console.log("  Done.");
  console.log("═══════════════════════════════════════");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
