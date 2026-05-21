import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

// Dedicated /api/auth/me handler.
// Reads the vp-session cookie directly on the frontend server instead of
// proxying to the backend. This avoids any HMAC-key mismatch between the
// Vercel (frontend) and Render (backend) deployments and is faster since
// it requires no network hop.

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(null, { status: 401 });
  }
  return NextResponse.json(user);
}
