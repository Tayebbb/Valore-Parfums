import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getSessionUser, setSessionCookie } from "@/lib/auth";
import { db, Collections } from "@/lib/prisma";

type SavedDeliveryInfo = {
  pickupMethod: "Pickup" | "Delivery";
  deliveryZone: "" | "Inside Dhaka" | "Outside Dhaka";
  pickupLocationId: string;
  area: string;
  city: string;
  fullAddress: string;
  addressNotes: string;
};

function normalizeSavedDeliveryInfo(value: unknown): SavedDeliveryInfo {
  const input = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const pickupMethod = input.pickupMethod === "Delivery" ? "Delivery" : "Pickup";
  const rawZone = String(input.deliveryZone || "");
  const deliveryZone = rawZone === "Inside Dhaka" || rawZone === "Outside Dhaka" ? rawZone : "";

  return {
    pickupMethod,
    deliveryZone,
    pickupLocationId: String(input.pickupLocationId || "").slice(0, 120),
    area: String(input.area || "").slice(0, 120),
    city: String(input.city || "").slice(0, 120),
    fullAddress: String(input.fullAddress || "").slice(0, 400),
    addressNotes: String(input.addressNotes || "").slice(0, 400),
  };
}

// GET /api/auth/profile
export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userDoc = await db.collection(Collections.users).doc(sessionUser.id).get();
  const userData = userDoc.exists ? (userDoc.data() as Record<string, unknown>) : {};

  const name = String(userData.name || sessionUser.name || "");
  const email = String(userData.email || sessionUser.email || "");
  const phone = String(userData.phone || "");
  const savedDeliveryInfo = normalizeSavedDeliveryInfo(userData.savedDeliveryInfo);

  return NextResponse.json({
    id: sessionUser.id,
    name,
    email,
    phone,
    savedDeliveryInfo,
  });
}

// PUT /api/auth/profile
export async function PUT(req: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const name = String(body.name || "").trim().slice(0, 100);
    const phone = String(body.phone || "").trim().slice(0, 20);
    const savedDeliveryInfo = normalizeSavedDeliveryInfo(body.savedDeliveryInfo);

    const now = Timestamp.now();

    await db.collection(Collections.users).doc(sessionUser.id).set(
      {
        ...(name ? { name } : {}),
        phone,
        savedDeliveryInfo,
        updatedAt: now,
      },
      { merge: true },
    );

    const nextName = name || sessionUser.name;
    await setSessionCookie({
      id: sessionUser.id,
      name: nextName,
      email: sessionUser.email,
      role: sessionUser.role,
    });

    return NextResponse.json({
      id: sessionUser.id,
      name: nextName,
      email: sessionUser.email,
      phone,
      savedDeliveryInfo,
    });
  } catch (error) {
    console.error("Profile PUT error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
