import { NextResponse } from "next/server";
// Updated: replaced Prisma with Firestore Admin SDK
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";

// GET all stock requests (replaces prisma.stockRequest.findMany with include: perfume)
// Note: Firestore has no joins — perfume data is fetched separately and merged
export async function GET() {
  const snap = await db.collection(Collections.stockRequests).orderBy("createdAt", "desc").get();
  const requests = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    // Fetch related perfume (replaces Prisma include)
    const perfumeDoc = await db.collection(Collections.perfumes).doc(data.perfumeId).get();
    requests.push(serializeDoc({
      id: doc.id,
      ...data,
      perfume: perfumeDoc.exists ? { id: perfumeDoc.id, ...perfumeDoc.data() } : null,
    }));
  }
  return NextResponse.json(requests);
}

// POST create stock request (replaces prisma.stockRequest.create)
export async function POST(req: Request) {
  const body = await req.json();
  // Fetch perfume name (replaces prisma.perfume.findUnique)
  const perfumeDoc = await db.collection(Collections.perfumes).doc(body.perfumeId).get();
  if (!perfumeDoc.exists) return NextResponse.json({ error: "Perfume not found" }, { status: 404 });

  const id = uuid();
  const data = {
    ...body,
    perfumeName: perfumeDoc.data()!.name,
    createdAt: Timestamp.now(),
  };
  await db.collection(Collections.stockRequests).doc(id).set(data);
  return NextResponse.json(serializeDoc({ id, ...data }), { status: 201 });
}
