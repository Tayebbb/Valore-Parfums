import { NextRequest, NextResponse } from "next/server";

function resolveBackendBaseUrl(): string | null {
  const raw =
    process.env.API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.BACKEND_URL ||
    "";

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function copyUpstreamHeaders(upstream: Response): Headers {
  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === "content-length" ||
      lower === "transfer-encoding" ||
      lower === "content-encoding"
    ) {
      return;
    }
    headers.set(key, value);
  });
  return headers;
}

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const backendBaseUrl = resolveBackendBaseUrl();
  if (!backendBaseUrl) {
    return NextResponse.json(
      {
        error: "Backend API is not configured. Set API_BASE_URL or NEXT_PUBLIC_API_BASE_URL.",
      },
      { status: 503 },
    );
  }

  const pathname = path.join("/");
  const query = req.nextUrl.search || "";
  const targetUrl = `${backendBaseUrl}/api/${pathname}${query}`;
  const method = req.method.toUpperCase();
  const isGetLike = method === "GET" || method === "HEAD";
  const isPublicCatalogPath =
    pathname === "perfumes" ||
    pathname === "notifications" ||
    pathname === "notes-library" ||
    pathname.startsWith("perfumes/search");
  const useCatalogCache = isGetLike && isPublicCatalogPath;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.delete("connection");
  if (useCatalogCache) {
    headers.delete("cookie");
    headers.delete("authorization");
  }

  const body = method === "GET" || method === "HEAD" ? undefined : await req.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method,
      headers,
      body,
      redirect: "manual",
      cache: useCatalogCache ? "force-cache" : "no-store",
      next: useCatalogCache ? { revalidate: 20 } : undefined,
    });
  } catch (error) {
    console.error("API proxy request failed", { targetUrl, error });
    return NextResponse.json(
      { error: "Failed to reach backend API service." },
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") || "";
  if (!upstream.ok && !contentType.toLowerCase().includes("application/json")) {
    const text = await upstream.text();
    return NextResponse.json(
      {
        error: "Backend API returned a non-JSON error response.",
        status: upstream.status,
        details: text.slice(0, 400),
      },
      { status: upstream.status },
    );
  }

  const bodyBuffer = await upstream.arrayBuffer();

  return new NextResponse(bodyBuffer, {
    status: upstream.status,
    headers: copyUpstreamHeaders(upstream),
  });
}

export async function GET(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(req, path);
}

export async function PUT(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(req, path);
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(req, path);
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(req, path);
}

export async function OPTIONS(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(req, path);
}

export async function HEAD(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(req, path);
}

export const dynamic = "force-dynamic";