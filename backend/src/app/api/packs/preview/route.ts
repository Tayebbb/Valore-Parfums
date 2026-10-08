import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { resolvePacks, toAdminPack } from "@/lib/packs/service";
import { PACK_MAX_COMPONENTS } from "@/lib/packs/types";
import type { Pack } from "@/lib/packs/types";

// POST { perfumeIds, decantSizeMl, discountType, discountValue } — admin only.
// Live price preview for the pack form: current canonical component prices,
// original / discount / final, per-component availability and cost warnings.
// Nothing is stored. Admin-only because it exposes cost data.
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const perfumeIds: string[] = Array.isArray(body?.perfumeIds)
    ? body.perfumeIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
    : [];
  const decantSizeMl = Number(body?.decantSizeMl);
  const discountType = body?.discountType === "fixed" ? "fixed" : "percentage";
  const discountValue = Number(body?.discountValue);

  if (perfumeIds.length === 0 || perfumeIds.length > PACK_MAX_COMPONENTS || !(decantSizeMl > 0)) {
    return NextResponse.json({ error: "Select 1–6 perfumes and a decant size" }, { status: 400 });
  }

  const pack: Pack = {
    id: "preview",
    name: "Preview",
    slug: "preview",
    description: "",
    isActive: true,
    sortOrder: 0,
    decantSizeMl,
    items: [...new Set(perfumeIds)].map((perfumeId) => ({ perfumeId })),
    discountType,
    discountValue: Number.isFinite(discountValue) ? discountValue : 0,
    createdAt: null,
    updatedAt: null,
  };
  const [resolved] = await resolvePacks([pack]);
  return NextResponse.json(toAdminPack(resolved), { headers: { "Cache-Control": "private, no-store" } });
}
