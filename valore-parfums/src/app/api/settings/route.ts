import { NextResponse } from "next/server";
import { db, Collections } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Default settings values (used if doc doesn't exist yet)
const DEFAULTS = {
  profitMargin: 20,
  packagingCost: 20,
  deliveryFee: 80,
  deliveryFeeInsideDhaka: 80,
  deliveryFeeOutsideDhaka: 150,
  platformFees: 0,
  tierMargins: '{"Budget":{"3":37,"5":37,"6":37,"10":27,"15":22,"30":17},"Premium":{"3":32,"5":32,"6":32,"10":22,"15":17,"30":12},"Luxury":{"3":45,"5":45,"6":45,"10":35,"15":27,"30":27}}',
  currency: "BDT",
  lowStockAlertMl: 20,
  owner1Name: "Tayeb",
  owner1Email: "mohammedtayebibne@gmail.com",
  owner2Name: "Enid",
  owner2Email: "enid.hasan.21@gmail.com",
  owner1Share: 60,
  owner2Share: 40,
  ownerProfitPercent: 85,
  bkashAccountName: "Valore Parfums",
  bkashAccountNumber: "",
  bkashAccountType: "Personal",
  bkashQrImageUrl: "",
  bankName: "",
  bankAccountName: "",
  bankAccountNumber: "",
  bankAccountType: "",
  bankDistrict: "",
  bankBranch: "",
  bankQrImageUrl: "",
};

// GET settings — admin only
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const doc = await db.collection(Collections.settings).doc("default").get();
  if (!doc.exists) {
    // Create defaults if no settings doc exists
    await db.collection(Collections.settings).doc("default").set(DEFAULTS);
    return NextResponse.json({ id: "default", ...DEFAULTS });
  }
  const data = doc.data() || {};
  const legacyDeliveryFee = Number(data.deliveryFee ?? DEFAULTS.deliveryFee);
  const rawInside = Number(data.deliveryFeeInsideDhaka ?? DEFAULTS.deliveryFeeInsideDhaka);
  const rawOutside = Number(data.deliveryFeeOutsideDhaka ?? DEFAULTS.deliveryFeeOutsideDhaka);
  const legacyFallback = Number.isFinite(legacyDeliveryFee) ? Math.max(0, legacyDeliveryFee) : null;
  return NextResponse.json({
    id: doc.id,
    ...data,
    deliveryFeeInsideDhaka: Number.isFinite(rawInside) ? Math.max(0, rawInside) : (legacyFallback ?? DEFAULTS.deliveryFeeInsideDhaka),
    deliveryFeeOutsideDhaka: Number.isFinite(rawOutside) ? Math.max(0, rawOutside) : (legacyFallback ?? DEFAULTS.deliveryFeeOutsideDhaka),
    bkashAccountName: String(data.bkashAccountName ?? DEFAULTS.bkashAccountName),
    bkashAccountNumber: String(data.bkashAccountNumber ?? DEFAULTS.bkashAccountNumber),
    bkashAccountType: String(data.bkashAccountType ?? DEFAULTS.bkashAccountType),
    bkashQrImageUrl: String(data.bkashQrImageUrl ?? DEFAULTS.bkashQrImageUrl),
    bankName: String(data.bankName ?? DEFAULTS.bankName),
    bankAccountName: String(data.bankAccountName ?? DEFAULTS.bankAccountName),
    bankAccountNumber: String(data.bankAccountNumber ?? DEFAULTS.bankAccountNumber),
    bankAccountType: String(data.bankAccountType ?? DEFAULTS.bankAccountType),
    bankDistrict: String(data.bankDistrict ?? DEFAULTS.bankDistrict),
    bankBranch: String(data.bankBranch ?? DEFAULTS.bankBranch),
    bankQrImageUrl: String(data.bankQrImageUrl ?? DEFAULTS.bankQrImageUrl),
  });
}

// PUT settings — admin only
export async function PUT(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const data = await req.json();
    const deliveryFeeInsideDhaka = Number(data.deliveryFeeInsideDhaka ?? data.deliveryFee ?? DEFAULTS.deliveryFeeInsideDhaka);
    const deliveryFeeOutsideDhaka = Number(data.deliveryFeeOutsideDhaka ?? data.deliveryFee ?? DEFAULTS.deliveryFeeOutsideDhaka);

    const bkashAccountName = String(data.bkashAccountName ?? DEFAULTS.bkashAccountName).trim();
    const bkashAccountNumber = String(data.bkashAccountNumber ?? DEFAULTS.bkashAccountNumber).trim();
    const bkashAccountType = String(data.bkashAccountType ?? DEFAULTS.bkashAccountType).trim();
    const bkashQrImageUrl = String(data.bkashQrImageUrl ?? DEFAULTS.bkashQrImageUrl).trim();
    const bankName = String(data.bankName ?? DEFAULTS.bankName).trim();
    const bankAccountName = String(data.bankAccountName ?? DEFAULTS.bankAccountName).trim();
    const bankAccountNumber = String(data.bankAccountNumber ?? DEFAULTS.bankAccountNumber).trim();
    const bankAccountType = String(data.bankAccountType ?? DEFAULTS.bankAccountType).trim();
    const bankDistrict = String(data.bankDistrict ?? DEFAULTS.bankDistrict).trim();
    const bankBranch = String(data.bankBranch ?? DEFAULTS.bankBranch).trim();
    const bankQrImageUrl = String(data.bankQrImageUrl ?? DEFAULTS.bankQrImageUrl).trim();

    await db.collection(Collections.settings).doc("default").set(
      {
        ...data,
        deliveryFeeInsideDhaka,
        deliveryFeeOutsideDhaka,
        bkashAccountName,
        bkashAccountNumber,
        bkashAccountType,
        bkashQrImageUrl,
        bankName,
        bankAccountName,
        bankAccountNumber,
        bankAccountType,
        bankDistrict,
        bankBranch,
        bankQrImageUrl,
        // Keep legacy field for compatibility with old consumers.
        deliveryFee: deliveryFeeInsideDhaka,
      },
      { merge: true },
    );
    const doc = await db.collection(Collections.settings).doc("default").get();
    const saved = doc.data() || {};
    const legacyDeliveryFee = Number(saved.deliveryFee ?? DEFAULTS.deliveryFee);
    return NextResponse.json({
      id: "default",
      ...saved,
      deliveryFeeInsideDhaka: Number(saved.deliveryFeeInsideDhaka ?? legacyDeliveryFee),
      deliveryFeeOutsideDhaka: Number(saved.deliveryFeeOutsideDhaka ?? legacyDeliveryFee),
      bkashAccountName: String(saved.bkashAccountName ?? DEFAULTS.bkashAccountName),
      bkashAccountNumber: String(saved.bkashAccountNumber ?? DEFAULTS.bkashAccountNumber),
      bkashAccountType: String(saved.bkashAccountType ?? DEFAULTS.bkashAccountType),
      bkashQrImageUrl: String(saved.bkashQrImageUrl ?? DEFAULTS.bkashQrImageUrl),
      bankName: String(saved.bankName ?? DEFAULTS.bankName),
      bankAccountName: String(saved.bankAccountName ?? DEFAULTS.bankAccountName),
      bankAccountNumber: String(saved.bankAccountNumber ?? DEFAULTS.bankAccountNumber),
      bankAccountType: String(saved.bankAccountType ?? DEFAULTS.bankAccountType),
      bankDistrict: String(saved.bankDistrict ?? DEFAULTS.bankDistrict),
      bankBranch: String(saved.bankBranch ?? DEFAULTS.bankBranch),
      bankQrImageUrl: String(saved.bankQrImageUrl ?? DEFAULTS.bankQrImageUrl),
    });
  } catch (e) {
    console.error("Settings PUT error:", e);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
