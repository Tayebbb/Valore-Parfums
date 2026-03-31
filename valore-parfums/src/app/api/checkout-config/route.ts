import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";

export async function GET() {
  const [settingsDoc, pickupSnap] = await Promise.all([
    db.collection(Collections.settings).doc("default").get(),
    db.collection(Collections.pickupLocations).orderBy("createdAt", "desc").get(),
  ]);

  const settings = settingsDoc.data() || {};
  const legacyDeliveryFee = Number(settings.deliveryFee ?? 0);
  const deliveryFeeInsideDhaka = Number(settings.deliveryFeeInsideDhaka ?? legacyDeliveryFee);
  const deliveryFeeOutsideDhaka = Number(settings.deliveryFeeOutsideDhaka ?? legacyDeliveryFee);
  const pickupLocations = pickupSnap.docs
    .map((doc) => serializeDoc({ id: doc.id, ...doc.data() }))
    .filter((location) => location.active !== false);

  return NextResponse.json({
    deliveryFeeInsideDhaka: Number.isFinite(deliveryFeeInsideDhaka) ? deliveryFeeInsideDhaka : 0,
    deliveryFeeOutsideDhaka: Number.isFinite(deliveryFeeOutsideDhaka) ? deliveryFeeOutsideDhaka : 0,
    pickupLocations,
  });
}