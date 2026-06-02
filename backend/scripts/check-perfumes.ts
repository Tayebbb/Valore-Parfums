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
  const snap = await db.collection("perfumes").get();
  for (const doc of snap.docs) {
    const d = doc.data();
    console.log(JSON.stringify({
      id: doc.id,
      name: d.name,
      owner: d.owner,
      isPersonalCollection: d.isPersonalCollection,
      bottleSource: d.bottleSource,
      purchasePricePerMl: d.purchasePricePerMl,
    }));
  }
}
main().catch(console.error);
