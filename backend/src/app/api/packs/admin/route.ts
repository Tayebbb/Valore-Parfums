import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { loadAllPacks, resolvePacks, toAdminPack } from "@/lib/packs/service";

// GET every pack (active + inactive) with stock, cost and availability detail — admin only.
// Never cached: it contains cost data and must reflect stock changes immediately.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const packs = await loadAllPacks();
    const resolved = await resolvePacks(packs);
    return NextResponse.json(resolved.map(toAdminPack), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("packs/admin GET failed", error);
    return NextResponse.json({ error: "Failed to load packs" }, { status: 500 });
  }
}
