// ─── set-personal-collection.ts ───────────────────────
// Marks all non-Store owned perfumes as isPersonalCollection=true
// AND retroactively patches existing order items.
//
// DRY-RUN by default. Pass --apply to commit changes.
// Usage: npx tsx scripts/set-personal-collection.ts [--apply]
// ────────────────────────────────────────────────────────

import { initializeApp, cert, getApps, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, WriteBatch } from "firebase-admin/firestore";
import { config } from "dotenv";
config({ path: ".env.local" });

const serviceAccount: ServiceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID!,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};
if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const APPLY = process.argv.includes("--apply");

async function commitBatch(batch: WriteBatch, count: number) {
  if (APPLY) await batch.commit();
  return count;
}

async function main() {
  console.log(`\nMode: ${APPLY ? "⚠️  APPLY (writing to Firestore)" : "DRY RUN (no changes)"}\n`);

  // ── 1. Perfume documents ─────────────────────────────
  const perfumesSnap = await db.collection("perfumes").get();
  const toUpdatePerfumes: Array<{ id: string; name: string; owner: string }> = [];

  for (const doc of perfumesSnap.docs) {
    const d = doc.data();
    if ((d.owner || "Store") !== "Store" && !d.isPersonalCollection) {
      toUpdatePerfumes.push({ id: doc.id, name: d.name, owner: d.owner });
    }
  }

  console.log(`Perfumes to mark isPersonalCollection=true: ${toUpdatePerfumes.length}`);
  for (const p of toUpdatePerfumes) {
    console.log(`  [PERFUME] ${p.name.padEnd(35)} owner=${p.owner}`);
  }

  if (toUpdatePerfumes.length > 0) {
    // Firestore max batch = 500
    for (let i = 0; i < toUpdatePerfumes.length; i += 499) {
      const chunk = toUpdatePerfumes.slice(i, i + 499);
      const batch = db.batch();
      for (const p of chunk) {
        batch.update(db.collection("perfumes").doc(p.id), { isPersonalCollection: true });
      }
      await commitBatch(batch, chunk.length);
    }
    console.log(APPLY ? `  → Updated ${toUpdatePerfumes.length} perfume(s).\n` : "  → (dry run — no writes)\n");
  }

  // ── 2. Order items (retroactive patch) ────────────────
  const allItemsSnap = await db.collectionGroup("items").get();
  const personalOwners = new Set(toUpdatePerfumes.map((p) => p.owner));

  // Also include already-true perfumes in case of re-runs
  for (const doc of perfumesSnap.docs) {
    const d = doc.data();
    if ((d.owner || "Store") !== "Store") personalOwners.add(d.owner);
  }

  const toUpdateItems: Array<{ ref: FirebaseFirestore.DocumentReference; orderId: string; itemId: string; name: string; owner: string }> = [];
  for (const doc of allItemsSnap.docs) {
    const d = doc.data();
    const ownerName = (d.ownerName || "Store") as string;
    if (ownerName !== "Store" && !d.isPersonalCollection) {
      const orderId = doc.ref.parent.parent?.id ?? "unknown";
      toUpdateItems.push({ ref: doc.ref, orderId, itemId: doc.id, name: d.name || d.perfumeName || doc.id.slice(0, 8), owner: ownerName });
    }
  }

  console.log(`Order items to patch isPersonalCollection=true: ${toUpdateItems.length}`);
  for (const it of toUpdateItems) {
    console.log(`  [ITEM] order=${it.orderId.slice(0, 8)}  item=${it.name.padEnd(35)}  owner=${it.owner}`);
  }

  if (toUpdateItems.length > 0) {
    for (let i = 0; i < toUpdateItems.length; i += 499) {
      const chunk = toUpdateItems.slice(i, i + 499);
      const batch = db.batch();
      for (const it of chunk) {
        batch.update(it.ref, { isPersonalCollection: true });
      }
      await commitBatch(batch, chunk.length);
    }
    console.log(APPLY ? `  → Patched ${toUpdateItems.length} order item(s).\n` : "  → (dry run — no writes)\n");
  }

  if (!APPLY) {
    console.log("─────────────────────────────────────────────────────");
    console.log("Run with --apply to commit these changes:");
    console.log("  npx tsx scripts/set-personal-collection.ts --apply\n");
  } else {
    console.log("✅ Done. Re-run check-finances.ts to verify numbers.\n");
  }
}

main().catch(console.error);
