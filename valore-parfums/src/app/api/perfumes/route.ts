import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";

const PERFUMES_CACHE_TTL = 20_000;
const perfumesCache = new Map<string, { data: unknown[]; ts: number }>();

function getDate(value: unknown): Date {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return new Date(value as string | number | Date);
}

// GET all perfumes (replaces prisma.perfume.findMany)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const active = searchParams.get("active");
  const cacheKey = active === "true" ? "active:true" : "active:all";
  const cached = perfumesCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < PERFUMES_CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  const baseQuery = active === "true"
    ? db.collection(Collections.perfumes).where("isActive", "==", true)
    : db.collection(Collections.perfumes);

  const snap = await baseQuery.get();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const perfumes: any[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  perfumes.sort((a, b) => {
    const da = getDate(a.createdAt);
    const db2 = getDate(b.createdAt);
    return db2.getTime() - da.getTime();
  });

  const payload = perfumes.map(serializeDoc);
  perfumesCache.set(cacheKey, { data: payload, ts: Date.now() });
  return NextResponse.json(payload);
}

// CREATE perfume — admin only
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const id = uuid();
    const now = Timestamp.now();
    const data = { ...body, createdAt: now, updatedAt: now };
    await db.collection(Collections.perfumes).doc(id).set(data);
    perfumesCache.clear();
    return NextResponse.json(serializeDoc({ id, ...data }), { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create perfume";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
