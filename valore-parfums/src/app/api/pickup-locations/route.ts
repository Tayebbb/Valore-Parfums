import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";

// GET all pickup locations
export async function GET() {
  const snap = await db.collection(Collections.pickupLocations).orderBy("createdAt", "desc").get();
  const locations = snap.docs.map((doc) => serializeDoc({ id: doc.id, ...doc.data() }));
  return NextResponse.json(locations);
}

// POST create pickup location — admin only
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, address, phone, notes } = body;

  if (!name || !address) {
    return NextResponse.json({ error: "Name and address are required" }, { status: 400 });
  }

  const id = uuid();
  const data = {
    name: String(name).slice(0, 200),
    address: String(address).slice(0, 500),
    phone: String(phone || "").slice(0, 20),
    notes: String(notes || "").slice(0, 500),
    active: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  await db.collection(Collections.pickupLocations).doc(id).set(data);
  return NextResponse.json(serializeDoc({ id, ...data }), { status: 201 });
}
