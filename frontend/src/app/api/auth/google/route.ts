import { NextRequest, NextResponse } from "next/server";
import { signSessionToken, COOKIE_NAME, COOKIE_MAX_AGE } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const forwardHeaders: Record<string, string> = { "content-type": "application/json" };
  const xff = req.headers.get("x-forwarded-for");
  if (xff) forwardHeaders["x-forwarded-for"] = xff;
  const xri = req.headers.get("x-real-ip");
  if (xri) forwardHeaders["x-real-ip"] = xri;

  let upstream: Response;
  try {
    upstream = await fetch(`${backendBase}/api/auth/google`, {
      method: "POST",
      headers: forwardHeaders,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    console.error("[auth/google] backend fetch failed", err);
    return NextResponse.json(
      { error: "Cannot reach authentication service." },
      { status: 502 },
    );
  }

  const data = await upstream.json().catch(() => null);

  if (!upstream.ok || !data) {
    return NextResponse.json(
      data ?? { error: "Google sign-in failed" },
      { status: upstream.status || 500 },
    );
  }

  if (!data.id || !data.role) {
    return NextResponse.json({ error: "Invalid auth payload" }, { status: 500 });
  }

  const token = await signSessionToken({
    id: String(data.id),
    name: String(data.name ?? ""),
    email: String(data.email ?? ""),
    role: String(data.role),
  });

  const response = NextResponse.json(data);
  response.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  return response;
}
