import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type RateEntry = { count: number; resetAt: number };
const apiRateStore = new Map<string, RateEntry>();

function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for") || "";
  const ip = forwardedFor.split(",")[0]?.trim();
  return ip || req.headers.get("x-real-ip") || "unknown";
}

export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  // Security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );

  // Strict CSP for production
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  // CORS policy for API routes (restrict in production via env)
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const allowOrigin = process.env.ALLOWED_ORIGIN || "*";
    response.headers.set("Access-Control-Allow-Origin", allowOrigin);
    response.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-webhook-token");

    if (request.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: response.headers });
    }

    // In-memory API rate limiting
    const key = `${getClientIp(request)}:${request.nextUrl.pathname}`;
    const limit = request.nextUrl.pathname.startsWith("/api/auth/") ? 20 : 120;
    const windowMs = 60_000;
    const now = Date.now();
    const current = apiRateStore.get(key);

    if (!current || current.resetAt <= now) {
      apiRateStore.set(key, { count: 1, resetAt: now + windowMs });
      response.headers.set("X-RateLimit-Limit", String(limit));
      response.headers.set("X-RateLimit-Remaining", String(limit - 1));
    } else {
      current.count += 1;
      apiRateStore.set(key, current);
      const remaining = Math.max(0, limit - current.count);
      response.headers.set("X-RateLimit-Limit", String(limit));
      response.headers.set("X-RateLimit-Remaining", String(remaining));
      if (current.count > limit) {
        const retryAfter = Math.ceil((current.resetAt - now) / 1000);
        return NextResponse.json(
          { error: "Too many requests. Please try again shortly." },
          {
            status: 429,
            headers: {
              "Retry-After": String(retryAfter),
              "X-RateLimit-Limit": String(limit),
              "X-RateLimit-Remaining": "0",
            },
          },
        );
      }
    }
  }

  // Protect admin routes — redirect to login if no session cookie.
  // NOTE: the cookie value is a SIGNED token of the form "{json}.{64-hex-hmac}".
  // We must strip the trailing ".{hex}" suffix before JSON.parse, otherwise it
  // throws and the catch redirects every admin request to /login.
  if (request.nextUrl.pathname.startsWith("/admin")) {
    const session = request.cookies.get("vp-session");
    if (!session?.value) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    try {
      let raw = session.value;
      const lastDot = raw.lastIndexOf(".");
      if (lastDot !== -1) {
        const possibleSig = raw.slice(lastDot + 1);
        if (/^[0-9a-f]{64}$/.test(possibleSig)) {
          raw = raw.slice(0, lastDot);
        }
      }
      const user = JSON.parse(raw);
      if (user.role !== "admin") {
        return NextResponse.redirect(new URL("/", request.url));
      }
    } catch {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Apply to all routes except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};