import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  // Clear the vp-session cookie on the frontend directly.
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
