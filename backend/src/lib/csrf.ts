// ─── CSRF Protection Utilities ─────────────────────
// Implements double-submit cookie pattern for CSRF protection

import { cookies } from "next/headers";

const CSRF_COOKIE_NAME = "vp-csrf-token";
const CSRF_HEADER_NAME = "x-csrf-token";
const MAX_AGE = 60 * 60 * 24; // 24 hours

// Generate a random CSRF token
export function generateCsrfToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Set CSRF token cookie and return token for client
export async function createCsrfToken(): Promise<string> {
  const token = generateCsrfToken();
  const cookieStore = await cookies();
  cookieStore.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Must be accessible to client-side JS
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: MAX_AGE,
    path: "/",
  });
  return token;
}

// Verify CSRF token from request header against cookie
export async function verifyCsrfToken(req: Request): Promise<boolean> {
  const token = req.headers.get(CSRF_HEADER_NAME) || req.headers.get("x-csrf-token");
  if (!token) return false;

  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;

  if (!cookieToken) return false;

  // Use constant-time comparison to prevent timing attacks
  if (token.length !== cookieToken.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ cookieToken.charCodeAt(i);
  }
  return diff === 0;
}

// Middleware-friendly version that throws on invalid token
export async function requireValidCsrfToken(req: Request, method: string): Promise<void> {
  // Only validate on state-changing methods
  if (!["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    return;
  }

  // Skip CSRF check for specific public endpoints (if needed)
  const pathname = new URL(req.url).pathname;
  const exemptPaths = [
    "/api/auth/login",
    "/api/auth/signup",
    "/api/auth/google",
    "/api/public/", // Any public API endpoints
  ];

  if (exemptPaths.some((p) => pathname.startsWith(p))) {
    return;
  }

  if (!(await verifyCsrfToken(req))) {
    throw new Error("Invalid CSRF token");
  }
}
