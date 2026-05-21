import { NextRequest, NextResponse } from "next/server";

// Middleware always runs on every request before any cache, before any
// server component renders. We use it as an additional auth guard for
// /admin so that even if a stale redirect were cached, this layer would
// still enforce the cookie check freshly.

export const config = {
  matcher: ["/admin/:path*"],
};

const COOKIE_NAME = "vp-session";

export function middleware(req: NextRequest) {
  const session = req.cookies.get(COOKIE_NAME)?.value;

  // Diagnostic header — visible in browser DevTools Network tab.
  const debugHeader = `cookie=${session ? "present:" + session.length : "missing"}`;

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?next=/admin";
    const res = NextResponse.redirect(url);
    res.headers.set("x-admin-mw", debugHeader);
    return res;
  }

  // Try to parse role from the signed token: "{json}.{64-hex-sig}"
  let role: string | null = null;
  try {
    let raw = session;
    const lastDot = raw.lastIndexOf(".");
    if (lastDot !== -1 && /^[0-9a-f]{64}$/.test(raw.slice(lastDot + 1))) {
      raw = raw.slice(0, lastDot);
    }
    const parsed = JSON.parse(raw) as { role?: string };
    role = parsed?.role ?? null;
  } catch {
    role = null;
  }

  if (role !== "admin") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    const res = NextResponse.redirect(url);
    res.headers.set("x-admin-mw", `${debugHeader} role=${role ?? "unknown"}`);
    return res;
  }

  const res = NextResponse.next();
  res.headers.set("x-admin-mw", `${debugHeader} role=admin OK`);
  return res;
}
