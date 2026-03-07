// Firebase Admin SDK — server-side only (API routes)
// Replaces Prisma as the database layer, connecting to Firestore
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount: ServiceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID!,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  // The private key comes from .env with escaped newlines
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};

// Prevent re-initializing in dev (hot-reload)
if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}

export const db = getFirestore();

// ─── Serialization helper ──────────────────────────────
// Recursively converts Firestore Timestamp fields to ISO strings
// so JSON responses don't contain raw {_seconds, _nanoseconds} objects
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeDoc(obj: any): any {
  if (obj == null) return obj;
  if (obj.toDate && typeof obj.toDate === "function") return obj.toDate().toISOString();
  if (Array.isArray(obj)) return obj.map(serializeDoc);
  if (typeof obj === "object") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[key] = serializeDoc(obj[key]);
    }
    return result;
  }
  return obj;
}

// ─── Collection name constants ─────────────────────────
// Centralised so typos are caught at compile time
export const Collections = {
  perfumes: "perfumes",
  decantSizes: "decantSizes",
  bottles: "bottles",
  settings: "settings",
  bulkPricingRules: "bulkPricingRules",
  orders: "orders",
  orderItems: "orderItems",
  vouchers: "vouchers",
  stockRequests: "stockRequests",
  users: "users",
  wishlists: "wishlists",
  notifications: "notifications",
} as const;
