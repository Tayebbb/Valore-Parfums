import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { investmentBuyback } from "@/lib/investments/buybackService";

// GET buyback quote — admin only (read-only; no mutation).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const quote = await investmentBuyback.quote(id);
    return NextResponse.json(quote);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quote failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// POST execute buyback — admin only. Atomic; closes the investment.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const result = await investmentBuyback.execute({
      investmentId: id,
      performedBy: admin.id,
      notes: String(body?.notes ?? "").trim().slice(0, 1000),
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Buyback failed:", error);
    const message = error instanceof Error ? error.message : "Buyback failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
