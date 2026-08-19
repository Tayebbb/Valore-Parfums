import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/session-token";

type RateEntry = { count: number; resetAt: number };
const apiRateStore = new Map<string, RateEntry>();

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
  if (configured.length > 0) return Array.from(new Set(configured));

  if (process.env.NODE_ENV === "production") {
    return ["https://www.valoreparfums.app", "https://valoreparfums.app"];
  }
  return ["http://localhost:3000", "http://127.0.0.1:3000"];
}

// First-party requests are always allowed, regardless of how narrowly
// ALLOWED_ORIGIN is configured (e.g. apex-only while the site serves www).
function isSameOrigin(request: NextRequest, origin: string): boolean {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for") || "";
  const ip = forwardedFor.split(",")[0]?.trim();
  return ip || req.headers.get("x-real-ip") || "unknown";
}

// NextResponse.next() carries internal `x-middleware-*` markers that tell Next
// to continue on to the route handler. When the middleware answers a request
// itself, those markers must be stripped or the response is discarded and the
// request falls through — which would silently bypass the checks below.
function terminalHeaders(source: Headers): Headers {
  const headers = new Headers(source);
  for (const key of Array.from(headers.keys())) {
    if (key.toLowerCase().startsWith("x-middleware-")) headers.delete(key);
  }
  return headers;
}

// The storefront calls the backend directly in some client paths, so its origin
// has to be in connect-src or those fetches are blocked by the browser.
function getApiOrigin(): string | null {
  const raw = (
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.API_BASE_URL ||
    ""
  ).trim();
  if (!raw) return null;
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).origin;
  } catch {
    return null;
  }
}

function buildContentSecurityPolicy(): string {
  const connectSrc = [
    "'self'",
    "https://*.googleapis.com",
    "https://apis.google.com",
    "https://accounts.google.com",
    "https://*.firebaseio.com",
    "https://*.firebaseapp.com",
    "https://res.cloudinary.com",
    "https://*.google-analytics.com",
    "https://*.googletagmanager.com",
  ];
  const apiOrigin = getApiOrigin();
  if (apiOrigin) connectSrc.push(apiOrigin);

  return [
    "default-src 'self'",
    // Next.js injects inline bootstrap scripts; 'unsafe-inline' is required here.
    "script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://res.cloudinary.com https://lh3.googleusercontent.com https://*.googleusercontent.com https://www.googletagmanager.com https://*.google-analytics.com",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
    // signInWithPopup loads a gapi iframe from apis.google.com.
    "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://apis.google.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const CONTENT_SECURITY_POLICY = buildContentSecurityPolicy();

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();

  // Security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
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

  // CORS policy for API routes — strict allowlist, never a wildcard.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const requestOrigin = request.headers.get("origin");
    const allowedOrigins = getAllowedOrigins();
    const originAllowed = requestOrigin
      ? allowedOrigins.includes(requestOrigin) || isSameOrigin(request, requestOrigin)
      : false;

    if (requestOrigin && originAllowed) {
      response.headers.set("Access-Control-Allow-Origin", requestOrigin);
      response.headers.append("Vary", "Origin");
      response.headers.set("Access-Control-Allow-Credentials", "true");
    }
    response.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-webhook-token");

    if (request.method === "OPTIONS") {
      if (requestOrigin && !originAllowed) {
        return NextResponse.json(
          { error: "Origin not allowed" },
          { status: 403, headers: terminalHeaders(response.headers) },
        );
      }
      return new NextResponse(null, { status: 204, headers: terminalHeaders(response.headers) });
    }

    // CSRF defence-in-depth: reject cross-origin state-changing requests.
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && requestOrigin && !originAllowed) {
      return NextResponse.json(
        { error: "Cross-origin request blocked." },
        { status: 403 },
      );
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

  // Protect admin routes. The cookie is only trustworthy after its HMAC
  // signature verifies — any client can send an arbitrary Cookie header.
  if (request.nextUrl.pathname.startsWith("/admin")) {
    const session = request.cookies.get("vp-session");
    if (!session?.value) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const user = await verifySessionToken(session.value);
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (user.role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // Protect investor portal (defense-in-depth; the server layout and the
  // backend APIs are the real boundaries). Investor OR admin may enter.
  if (request.nextUrl.pathname.startsWith("/investor")) {
    const session = request.cookies.get("vp-session");
    const user = session?.value ? await verifySessionToken(session.value) : null;
    if (!user) {
      return NextResponse.redirect(new URL("/login?next=/investor", request.url));
    }
    if (user.role !== "investor" && user.role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
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