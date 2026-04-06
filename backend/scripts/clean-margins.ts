// ─── clean-margins.ts ──────────────────────────────────
// Remove invalid sizes (5ml, 30ml) and obsolete keys from
// tier margins in the settings document.
//
// Usage: npx tsx scripts/clean-margins.ts          (dry-run)
//        npx tsx scripts/clean-margins.ts --apply  (save)
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

// Sizes to remove from tier margins
const INVALID_SIZES = ["5", "30"];

async function main() {
  const apply = process.argv.includes("--apply");
  console.log("═══════════════════════════════════════");
  console.log("  Clean Tier Margins");
  console.log(`  Mode: ${apply ? "APPLY" : "DRY-RUN (pass --apply to save)"}`);
  console.log("═══════════════════════════════════════\n");

  const doc = await db.collection("settings").doc("default").get();
  if (!doc.exists) {
    console.log("No settings document found. Nothing to clean.");
    return;
  }

  const data = doc.data()!;
  let margins: Record<string, Record<string, number>>;

  try {
    margins = typeof data.tierMargins === "string"
      ? JSON.parse(data.tierMargins)
      : data.tierMargins;
  } catch {
    console.error("Could not parse tierMargins. Raw value:", data.tierMargins);
    return;
  }

  if (!margins || typeof margins !== "object") {
    console.log("tierMargins is empty or not an object.");
    return;
  }

  console.log("Current tier margins:");
  let removedCount = 0;

  for (const [tier, sizes] of Object.entries(margins)) {
    console.log(`\n  ${tier}:`);
    const toRemove: string[] = [];

    for (const [ml, margin] of Object.entries(sizes)) {
      const isInvalid = INVALID_SIZES.includes(ml);
      const marker = isInvalid ? "  ← REMOVE" : "";
      console.log(`    ${ml}ml → ${margin}%${marker}`);
      if (isInvalid) toRemove.push(ml);
    }

    for (const ml of toRemove) {
      delete margins[tier][ml];
      removedCount++;
    }
  }

  if (removedCount === 0) {
    console.log("\n✓ No invalid sizes found. Margins are clean.");
    return;
  }

  console.log(`\n${removedCount} entries to remove.`);

  if (apply) {
    const serialized = JSON.stringify(margins);
    await db.collection("settings").doc("default").update({ tierMargins: serialized });
    console.log("✓ Tier margins updated in Firestore.");
  } else {
    console.log("\nCleaned margins would be:");
    for (const [tier, sizes] of Object.entries(margins)) {
      console.log(`  ${tier}: ${JSON.stringify(sizes)}`);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
