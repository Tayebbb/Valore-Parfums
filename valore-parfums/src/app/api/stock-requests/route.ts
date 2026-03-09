import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";

// GET all stock requests — admin only
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch stock requests and all perfumes in parallel (avoids N+1)
  const [snap, perfumesSnap] = await Promise.all([
    db.collection(Collections.stockRequests).orderBy("createdAt", "desc").get(),
    db.collection(Collections.perfumes).get(),
  ]);

  // Build perfume lookup map
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const perfumeMap = new Map<string, any>();
  for (const doc of perfumesSnap.docs) {
    perfumeMap.set(doc.id, { id: doc.id, ...doc.data() });
  }

  const requests = snap.docs.map((doc) => {
    const data = doc.data();
    const perfume = perfumeMap.get(data.perfumeId) || null;
    return serializeDoc({ id: doc.id, ...data, perfume });
  });
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
