import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

// Dedicated /api/auth/me handler. Reads the vp-session cookie directly on
// the frontend server \u2014 no backend hop, no HMAC-key-mismatch risk.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(null, { status: 401 });
  }
  return NextResponse.json(user);
}
