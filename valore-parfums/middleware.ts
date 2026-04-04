import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function getCanonicalHost(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://valoreparfums.app";
  try {
    const normalized = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
    return new URL(normalized).host.toLowerCase();
  } catch {
    return "valoreparfums.app";
  }
}

function getRequestHost(request: NextRequest): string {
  // Prefer forwarded host when behind CDN/proxy (Netlify).
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || request.headers.get("host") || "";
  return host.toLowerCase().replace(/:\d+$/, "");
}

export function middleware(request: NextRequest) {
  const canonicalHost = getCanonicalHost();
  const currentHost = getRequestHost(request);

  if (!currentHost || currentHost === canonicalHost) {
    return NextResponse.next();
  }

  // Keep local development and loopback traffic untouched.
  if (currentHost.includes("localhost") || currentHost.startsWith("127.0.0.1")) {
    return NextResponse.next();
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.protocol = "https:";
  redirectUrl.host = canonicalHost;

  return NextResponse.redirect(redirectUrl, 308);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
