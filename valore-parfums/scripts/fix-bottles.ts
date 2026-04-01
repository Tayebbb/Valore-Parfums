// ─── fix-bottles.ts ────────────────────────────────────
// Update bottle sizes and remove unnecessary entries.
//
// Usage: npx tsx scripts/fix-bottles.ts          (dry-run)
//        npx tsx scripts/fix-bottles.ts --apply  (save)
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

// Bottle sizes that should be removed (no longer offered)
const SIZES_TO_REMOVE = [5, 30];

interface BottleDoc {
  id: string;
  ml: number;
  costPerBottle: number;
  availableCount: number;
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log("═══════════════════════════════════════");
  console.log("  Fix Bottles");
  console.log(`  Mode: ${apply ? "APPLY" : "DRY-RUN (pass --apply to save)"}`);
  console.log("═══════════════════════════════════════\n");

  const snap = await db.collection("bottles").get();
  const bottles: BottleDoc[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as BottleDoc));
  bottles.sort((a, b) => a.ml - b.ml);

  console.log(`Found ${bottles.length} bottle entries:\n`);

  const toRemove: BottleDoc[] = [];
  const toKeep: BottleDoc[] = [];

  for (const b of bottles) {
    if (SIZES_TO_REMOVE.includes(b.ml)) {
      toRemove.push(b);
      console.log(`  ✗  ${b.ml}ml — cost: ${b.costPerBottle} BDT, stock: ${b.availableCount}  ← REMOVE`);
    } else {
      toKeep.push(b);
      console.log(`  ✓  ${b.ml}ml — cost: ${b.costPerBottle} BDT, stock: ${b.availableCount}`);
    }
  }

  if (toRemove.length === 0) {
    console.log("\n✓ No bottles to remove. Everything is clean.");
    return;
  }

  console.log(`\n${toRemove.length} bottle(s) to remove.`);

  if (apply) {
    const batch = db.batch();
    for (const b of toRemove) {
      batch.delete(db.collection("bottles").doc(b.id));
    }
    await batch.commit();
    console.log("✓ Removed bottle entries from Firestore.");
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
