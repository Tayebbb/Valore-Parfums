import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, COOKIE_NAME } from "@/lib/auth";

// Temporary diagnostic endpoint that runs the exact same code path as the
// admin layout. Used to debug why /admin redirects when /api/auth/me works.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies();
  const all = cookieStore.getAll().map((c) => ({ name: c.name, valueLen: c.value.length }));
  const raw = cookieStore.get(COOKIE_NAME)?.value ?? null;
  const user = await getSessionUser();
  return NextResponse.json({
    allCookies: all,
    sessionCookiePresent: Boolean(raw),
    sessionCookieLen: raw?.length ?? 0,
    sessionCookiePrefix: raw?.slice(0, 40) ?? null,
    user,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      hasSigningKey: Boolean(process.env.SESSION_SIGNING_KEY),
    },
  });
}
