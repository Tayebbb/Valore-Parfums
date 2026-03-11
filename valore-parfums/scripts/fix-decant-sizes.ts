// ─── fix-decant-sizes.ts ───────────────────────────────
// Convert all 5ml decants → 6ml and remove 30ml sizes.
//
// Usage: npx tsx scripts/fix-decant-sizes.ts          (dry-run)
//        npx tsx scripts/fix-decant-sizes.ts --apply  (save)
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

interface DecantSizeDoc {
  id: string;
  ml: number;
  bottleCost: number;
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log("═══════════════════════════════════════");
  console.log("  Fix Decant Sizes (5ml→6ml, remove 30ml)");
  console.log(`  Mode: ${apply ? "APPLY" : "DRY-RUN (pass --apply to save)"}`);
  console.log("═══════════════════════════════════════\n");

  const snap = await db.collection("decantSizes").get();
  const sizes: DecantSizeDoc[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DecantSizeDoc));
  sizes.sort((a, b) => a.ml - b.ml);

  const toConvert: DecantSizeDoc[] = [];
  const toRemove: DecantSizeDoc[] = [];
  let has6ml = false;

  for (const s of sizes) {
    if (s.ml === 5) toConvert.push(s);
    else if (s.ml === 30) toRemove.push(s);
    if (s.ml === 6) has6ml = true;
  }

  console.log(`Found ${sizes.length} decant sizes:`);
  for (const s of sizes) {
    let marker = "";
    if (s.ml === 5) marker = "  ← CONVERT to 6ml";
    if (s.ml === 30) marker = "  ← REMOVE";
    console.log(`  ${s.ml}ml  (bottle cost: ${s.bottleCost} BDT)  id: ${s.id}${marker}`);
  }

  if (toConvert.length === 0 && toRemove.length === 0) {
    console.log("\n✓ No changes needed. Sizes are clean.");
    return;
  }

  console.log(`\nActions: ${toConvert.length} to convert, ${toRemove.length} to remove.`);

  if (toConvert.length > 0 && has6ml) {
    console.log("⚠  A 6ml size already exists. 5ml entries will be removed instead of converted.");
  }

  if (apply) {
    const batch = db.batch();

    for (const s of toConvert) {
      if (has6ml) {
        // 6ml already exists, just remove the 5ml
        batch.delete(db.collection("decantSizes").doc(s.id));
        console.log(`  ✓ Removed duplicate 5ml entry (${s.id})`);
      } else {
        // Convert 5ml → 6ml
        batch.update(db.collection("decantSizes").doc(s.id), { ml: 6 });
        console.log(`  ✓ Converted 5ml → 6ml (${s.id})`);
        has6ml = true; // prevent duplicates in same batch
      }
    }

    for (const s of toRemove) {
      batch.delete(db.collection("decantSizes").doc(s.id));
      console.log(`  ✓ Removed 30ml entry (${s.id})`);
    }

    await batch.commit();
    console.log("\n✓ Changes applied to Firestore.");
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
