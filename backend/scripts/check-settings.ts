// ─── check-settings.ts ─────────────────────────────────
// Retrieve and display all Firestore settings:
//   tier margins, decant sizes, bottle costs, packaging
//
// Usage: npx tsx scripts/check-settings.ts
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

async function main() {
  console.log("═══════════════════════════════════════");
  console.log("  Valore Parfums — Settings Check");
  console.log("═══════════════════════════════════════\n");

  // 1. Main settings
  const settingsDoc = await db.collection("settings").doc("default").get();
  if (!settingsDoc.exists) {
    console.log("⚠  No settings document found (settings/default).\n");
  } else {
    const s = settingsDoc.data()!;
    console.log("── General Settings ──");
    console.log(`  Profit Margin:      ${s.profitMargin ?? "N/A"}%`);
    console.log(`  Packaging Cost:     ${s.packagingCost ?? "N/A"} ${s.currency ?? "BDT"}`);
    console.log(`  Platform Fees:      ${s.platformFees ?? 0}`);
    console.log(`  Low Stock Alert:    ${s.lowStockAlertMl ?? 20} ml`);
    console.log(`  Currency:           ${s.currency ?? "BDT"}`);
    console.log(`  Owner 1:            ${s.owner1Name ?? "N/A"} (${s.owner1Share ?? 0}%)`);
    console.log(`  Owner 2:            ${s.owner2Name ?? "N/A"} (${s.owner2Share ?? 0}%)`);

    // Tier margins
    console.log("\n── Tier Margins ──");
    try {
      const margins = typeof s.tierMargins === "string" ? JSON.parse(s.tierMargins) : s.tierMargins;
      if (margins && typeof margins === "object") {
        for (const [tier, sizes] of Object.entries(margins)) {
          console.log(`  ${tier}:`);
          for (const [ml, margin] of Object.entries(sizes as Record<string, number>)) {
            console.log(`    ${ml}ml → ${margin}%`);
          }
        }
      } else {
        console.log("  (no tier margins configured)");
      }
    } catch {
      console.log(`  (raw value): ${s.tierMargins}`);
    }
  }

  // 2. Decant sizes
  console.log("\n── Decant Sizes ──");
  const sizesSnap = await db.collection("decantSizes").get();
  if (sizesSnap.empty) {
    console.log("  No decant sizes found.");
  } else {
    const sizes = sizesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    sizes.sort((a: Record<string, unknown>, b: Record<string, unknown>) => (a.ml as number) - (b.ml as number));
    for (const s of sizes) {
      const data = s as Record<string, unknown>;
      console.log(`  ${data.ml}ml  (bottle cost: ${data.bottleCost ?? "N/A"} BDT)  id: ${data.id}`);
    }
  }

  // 3. Bottles
  console.log("\n── Bottles ──");
  const bottlesSnap = await db.collection("bottles").get();
  if (bottlesSnap.empty) {
    console.log("  No bottles found.");
  } else {
    const bottles = bottlesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    bottles.sort((a: Record<string, unknown>, b: Record<string, unknown>) => (a.ml as number) - (b.ml as number));
    for (const b of bottles) {
      const data = b as Record<string, unknown>;
      console.log(`  ${data.ml}ml  cost: ${data.costPerBottle ?? "N/A"} BDT  available: ${data.availableCount ?? 0}  id: ${data.id}`);
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
