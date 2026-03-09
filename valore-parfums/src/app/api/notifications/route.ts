import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { v4 as uuid } from "uuid";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth";

// GET — return notifications (replaces prisma.notification.findMany)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get("active") === "true";

  // Fetch all then filter/sort in memory to avoid Firestore composite index requirement
  const snap = await db.collection(Collections.notifications).get();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let notifications: any[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (activeOnly) {
    notifications = notifications.filter((n) => n.isActive === true);
  }
  notifications.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return NextResponse.json(notifications.map(serializeDoc));
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
    return NextResponse.json(serializeDoc({ id, ...data }), { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create notification" }, { status: 500 });
  }
}
