import { NextResponse } from "next/server";
import { db, Collections } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

type BrandSections = {
  uaeBrands: string[];
  nicheBrands: string[];
  designerBrands: string[];
};

const DEFAULT_BRAND_SECTIONS: BrandSections = {
  uaeBrands: [
    "Lattafa",
    "Armaf",
    "Afnan",
    "Fragrance World",
    "Rasasi",
    "Al Haramain",
    "Ajmal",
    "Arabiyat",
    "Emir",
    "Paris Corner",
    "My Perfumes",
    "Zimaya",
  ],
  nicheBrands: [
    "Creed",
    "Amouage",
    "Xerjoff",
    "Parfums de Marly",
    "Roja",
    "Initio",
    "Montale",
    "Mancera",
    "Nishane",
    "Byredo",
    "Diptyque",
    "Killian",
    "BDK",
    "Memo",
    "Penhaligon",
    "Maison Francis Kurkdjian",
    "Frederic Malle",
    "Le Labo",
  ],
  designerBrands: [],
};

function sanitizeBrandList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(cleaned)).sort((a, b) => a.localeCompare(b));
}

async function getAvailableBrands(): Promise<string[]> {
  const snap = await db.collection(Collections.perfumes).where("isActive", "==", true).get();
  const brands = new Set<string>();
  for (const doc of snap.docs) {
    const data = doc.data() as { brand?: unknown };
    if (typeof data.brand === "string" && data.brand.trim()) {
      brands.add(data.brand.trim());
    }
  }
  return Array.from(brands).sort((a, b) => a.localeCompare(b));
}

// GET brand sections config — admin only
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const doc = await db.collection(Collections.settings).doc("default").get();
  const data = doc.data() || {};
  const sectionsRaw = (data.brandSections || {}) as Record<string, unknown>;

  const brandSections: BrandSections = {
    uaeBrands: sanitizeBrandList(sectionsRaw.uaeBrands).length
      ? sanitizeBrandList(sectionsRaw.uaeBrands)
      : DEFAULT_BRAND_SECTIONS.uaeBrands,
    nicheBrands: sanitizeBrandList(sectionsRaw.nicheBrands).length
      ? sanitizeBrandList(sectionsRaw.nicheBrands)
      : DEFAULT_BRAND_SECTIONS.nicheBrands,
    designerBrands: sanitizeBrandList(sectionsRaw.designerBrands),
  };

  // Combine all brands from brandSections and inventory
  const brandsFromSections = [
    ...brandSections.uaeBrands,
    ...brandSections.nicheBrands,
    ...brandSections.designerBrands,
  ];
  const brandsFromInventory = await getAvailableBrands();
  const allBrands = Array.from(new Set([...brandsFromSections, ...brandsFromInventory])).sort((a, b) => a.localeCompare(b));

  return NextResponse.json({ brandSections, availableBrands: allBrands });
}

// PUT brand sections config — admin only
export async function PUT(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const payload = {
      uaeBrands: sanitizeBrandList(body?.brandSections?.uaeBrands),
      nicheBrands: sanitizeBrandList(body?.brandSections?.nicheBrands),
      designerBrands: sanitizeBrandList(body?.brandSections?.designerBrands),
    };

    await db.collection(Collections.settings).doc("default").set(
      {
        brandSections: payload,
      },
      { merge: true },
    );

    const availableBrands = await getAvailableBrands();
    return NextResponse.json({ brandSections: payload, availableBrands });
  } catch (error) {
    console.error("Brand sections PUT error:", error);
    return NextResponse.json({ error: "Failed to save brand sections" }, { status: 500 });
  }
}
