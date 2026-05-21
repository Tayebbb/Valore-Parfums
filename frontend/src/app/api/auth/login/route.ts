import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth";

// Dedicated login handler — sets the vp-session cookie directly on the
// frontend server instead of relying on the catch-all proxy to forward the
// Set-Cookie header from the backend. The proxy approach breaks in Node.js
// 20+ where Headers.forEach() silently skips set-cookie headers.

export const dynamic = "force-dynamic";

function resolveBackendBase(): string | null {
  const raw = (
    process.env.API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.BACKEND_URL ||
    ""
  ).trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/+$/, "");
}

export async function POST(req: NextRequest) {
  const backendBase = resolveBackendBase();
  if (!backendBase) {
    return NextResponse.json(
      { error: "Backend API is not configured. Set API_BASE_URL." },
      { status: 503 },
    );
  }

  const body = await req.text();

  // Forward IP headers so the backend can apply rate limiting per client IP.
  const forwardHeaders: Record<string, string> = { "content-type": "application/json" };
  const xff = req.headers.get("x-forwarded-for");
  if (xff) forwardHeaders["x-forwarded-for"] = xff;
  const xri = req.headers.get("x-real-ip");
  if (xri) forwardHeaders["x-real-ip"] = xri;

  let upstream: Response;
  try {
    upstream = await fetch(`${backendBase}/api/auth/login`, {
      method: "POST",
      headers: forwardHeaders,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return NextResponse.json(
      { error: "Cannot reach authentication service." },
      { status: 502 },
    );
  }

  const data = await upstream.json();

  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status });
  }

  // Set the session cookie directly on the frontend (same domain as the
  // browser). cookies().set() in a Route Handler always works regardless of
  // Node.js version or Vercel runtime.
  if (data?.id && data?.role) {
    await setSessionCookie({
      id: String(data.id),
      name: String(data.name ?? ""),
      email: String(data.email ?? ""),
      role: String(data.role),
    });
  }

  return NextResponse.json(data);
}
