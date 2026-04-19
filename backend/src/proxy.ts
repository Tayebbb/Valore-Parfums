import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type RateEntry = { count: number; resetAt: number };
const apiRateStore = new Map<string, RateEntry>();
const VERCEL_PREVIEW_ORIGIN_PATTERN = /^https:\/\/valore-parfums(?:-[a-z0-9-]+)?\.vercel\.app$/i;

function parseOrigins(rawValue?: string): string[] {
  return (rawValue || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getAllowedOrigins(): string[] {
  const configured = [
    ...parseOrigins(process.env.ALLOWED_ORIGINS),
    ...parseOrigins(process.env.ALLOWED_ORIGIN),
  ];

  if (configured.length > 0) {
    return Array.from(new Set(configured));
  }

  if (process.env.NODE_ENV === "production") {
    return [
      "https://valore-parfums.vercel.app",
      "https://valore-parfums-two.vercel.app",
    ];
  }

  return [];
}

function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  return VERCEL_PREVIEW_ORIGIN_PATTERN.test(origin);
}

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
    const requestOrigin = request.headers.get("origin");
    const allowedOrigins = getAllowedOrigins();
    const originAllowed = requestOrigin ? isOriginAllowed(requestOrigin, allowedOrigins) : false;

    if (requestOrigin && originAllowed) {
      response.headers.set("Access-Control-Allow-Origin", requestOrigin);
      response.headers.append("Vary", "Origin");
    } else if (!requestOrigin && process.env.NODE_ENV !== "production") {
      response.headers.set("Access-Control-Allow-Origin", "*");
    }

    response.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-webhook-token");
    response.headers.set("Access-Control-Allow-Credentials", "true");

    if (request.method === "OPTIONS") {
      if (requestOrigin && !originAllowed && process.env.NODE_ENV === "production") {
        return NextResponse.json(
          { error: "Origin not allowed" },
          { status: 403, headers: response.headers },
        );
      }
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

  // Protect admin routes — redirect to login if no session cookie
  if (request.nextUrl.pathname.startsWith("/admin")) {
    const session = request.cookies.get("vp-session");
    if (!session?.value) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    try {
      const user = JSON.parse(session.value);
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