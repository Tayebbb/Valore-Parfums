import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";

const NOTIFICATIONS_CACHE_TTL = 30_000;
const notificationsCache = new Map<string, { data: unknown[]; ts: number }>();

// GET — return notifications (replaces prisma.notification.findMany)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("active") === "true";
    const cacheKey = activeOnly ? "active" : "all";
    const cached = notificationsCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < NOTIFICATIONS_CACHE_TTL) {
      return NextResponse.json(cached.data);
    }

    const baseQuery = activeOnly
      ? db.collection(Collections.notifications).where("isActive", "==", true)
      : db.collection(Collections.notifications);

    const snap = await baseQuery.get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notifications: any[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    notifications.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    const payload = notifications.map(serializeDoc);
    notificationsCache.set(cacheKey, { data: payload, ts: Date.now() });
    return NextResponse.json(payload);
  } catch (error) {
    console.error("notifications GET failed", error);
    return NextResponse.json([]);
  }
}

// POST — create notification — admin only
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const id = uuid();
    const data = {
      message: body.message,
      isActive: body.isActive ?? true,
      sortOrder: body.sortOrder ?? 0,
      createdAt: Timestamp.now(),
    };
    await db.collection(Collections.notifications).doc(id).set(data);
    notificationsCache.clear();
    return NextResponse.json(serializeDoc({ id, ...data }), { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create notification" }, { status: 500 });
  }
}
