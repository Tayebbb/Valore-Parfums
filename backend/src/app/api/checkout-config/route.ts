import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";
import { apiCache } from "@/lib/api-cache";

const CACHE_TTL = 60_000;
const CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=120";

export async function GET() {
  const cached = apiCache.checkoutConfig;
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data, { headers: { "Cache-Control": CACHE_CONTROL } });
  }

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

  const data = {
    deliveryFeeInsideDhaka: Number.isFinite(deliveryFeeInsideDhaka) ? deliveryFeeInsideDhaka : 0,
    deliveryFeeOutsideDhaka: Number.isFinite(deliveryFeeOutsideDhaka) ? deliveryFeeOutsideDhaka : 0,
    bkashAccountName: String(settings.bkashAccountName || ""),
    bkashAccountNumber: String(settings.bkashAccountNumber || ""),
    bkashAccountType: String(settings.bkashAccountType || ""),
    bkashQrImageUrl: String(settings.bkashQrImageUrl || ""),
    bankName: String(settings.bankName || ""),
    bankAccountName: String(settings.bankAccountName || ""),
    bankAccountNumber: String(settings.bankAccountNumber || ""),
    bankAccountType: String(settings.bankAccountType || ""),
    bankDistrict: String(settings.bankDistrict || ""),
    bankBranch: String(settings.bankBranch || ""),
    bankQrImageUrl: String(settings.bankQrImageUrl || ""),
    pickupLocations,
  };

  apiCache.checkoutConfig = { data, ts: Date.now() };
  return NextResponse.json(data, { headers: { "Cache-Control": CACHE_CONTROL } });
}