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
  const snap = await db.collection("perfumes").where("owner", "==", "Store").get();
  snap.docs.forEach((d) => {
    const p = d.data();
    console.log(JSON.stringify({
      name: p.name,
      purchasePricePerMl: p.purchasePricePerMl,
      marketPricePerMl: p.marketPricePerMl,
      partialDealType: p.partialDealType,
      partialSellingPrice: p.partialSellingPrice,
    }));
  });
}

main().then(() => process.exit(0));
