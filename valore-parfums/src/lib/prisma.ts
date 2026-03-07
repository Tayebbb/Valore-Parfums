// Database layer — now uses Firebase Admin SDK / Firestore
// Replaced Prisma ORM which previously connected to a local SQLite database
export { db, Collections, serializeDoc } from "./firebase-admin";
