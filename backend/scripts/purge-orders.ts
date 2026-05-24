// ─── purge-orders.ts ───────────────────────────────────
// Delete all order records and their linked order items.
// Also removes order-linked request and profit ledger docs,
// then zeroes owner revenue balances.
//
// Usage: npx tsx scripts/purge-orders.ts          (dry-run)
//        npx tsx scripts/purge-orders.ts --apply  (save)
// ────────────────────────────────────────────────────────

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert, getApps, type ServiceAccount } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

const serviceAccount: ServiceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID!,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};

if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

type FirestoreRecord = Record<string, unknown>;

function asRecord(value: unknown): FirestoreRecord {
  return value && typeof value === "object" ? (value as FirestoreRecord) : {};
}

async function deleteCollectionDocs(collectionPath: string, docIds: string[]) {
  const BATCH_SIZE = 300;
  for (let i = 0; i < docIds.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const id of docIds.slice(i, i + BATCH_SIZE)) {
      batch.delete(db.collection(collectionPath).doc(id));
    }
    await batch.commit();
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log("═══════════════════════════════════════");
  console.log("  Purge Orders");
  console.log(`  Mode: ${apply ? "APPLY" : "DRY-RUN (pass --apply to save)"}`);
  console.log("═══════════════════════════════════════\n");

  const ordersSnap = await db.collection("orders").get();
  const requestsSnap = await db.collection("requests").get();
  const stockRequestsSnap = await db.collection("stockRequests").get();
  const profitTransactionsSnap = await db.collection("profitTransactions").get();
  const ownerAccountsSnap = await db.collection("ownerAccounts").get();

  const orderIds = ordersSnap.docs.map((doc) => doc.id);
  const linkedRequestIds = new Set<string>();
  const linkedProfitTransactionIds = new Set<string>();

  for (const doc of ordersSnap.docs) {
    const data = asRecord(doc.data());
    if (typeof data.requestId === "string" && data.requestId.trim()) {
      linkedRequestIds.add(data.requestId.trim());
    }
  }

  for (const doc of profitTransactionsSnap.docs) {
    const data = asRecord(doc.data());
    if (typeof data.orderId === "string" && orderIds.includes(data.orderId)) {
      linkedProfitTransactionIds.add(doc.id);
    }
  }

  console.log(`Orders to delete: ${ordersSnap.size}`);
  console.log(`Order item docs to delete: ${ordersSnap.size ? "(will delete subcollections)" : 0}`);
  console.log(`Requests to delete: ${linkedRequestIds.size}`);
  console.log(`Stock requests to delete: ${stockRequestsSnap.size}`);
  console.log(`Profit transactions to delete: ${linkedProfitTransactionIds.size}`);
  console.log(`Owner accounts to zero: ${ownerAccountsSnap.size}\n`);

  if (!apply) {
    console.log("Dry run summary:");
    console.log("- Each order document and its items subcollection would be deleted.");
    console.log("- Linked request docs and profit transaction docs would be deleted.");
    console.log("- Stock request docs would be deleted.");
    console.log("- Owner revenue balances would be reset to zero.");
    console.log("\nRe-run with --apply to write changes.");
    return;
  }

  for (const orderDoc of ordersSnap.docs) {
    const itemsSnap = await orderDoc.ref.collection("items").get();
    const itemBatchIds = itemsSnap.docs.map((doc) => doc.id);
    await deleteCollectionDocs(`orders/${orderDoc.id}/items`, itemBatchIds);
  }

  await deleteCollectionDocs("orders", orderIds);

  if (linkedRequestIds.size > 0) {
    await deleteCollectionDocs("requests", Array.from(linkedRequestIds));
  }

  if (stockRequestsSnap.size > 0) {
    await deleteCollectionDocs("stockRequests", stockRequestsSnap.docs.map((doc) => doc.id));
  }

  if (linkedProfitTransactionIds.size > 0) {
    await deleteCollectionDocs("profitTransactions", Array.from(linkedProfitTransactionIds));
  }

  const ownerBatch = db.batch();
  for (const doc of ownerAccountsSnap.docs) {
    ownerBatch.set(
      db.collection("ownerAccounts").doc(doc.id),
      {
        totalEarned: 0,
        storeShareEarned: 0,
        updatedAt: Timestamp.now(),
        resetAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  await ownerBatch.commit();

  console.log("\n✓ Orders purged.");
  console.log("✓ Linked request and profit records deleted.");
  console.log("✓ Owner revenue balances reset.");
  console.log("Done.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});