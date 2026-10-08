import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

// Storefront pages render from THIS app's unstable_cache/ISR entries (tags
// "perfumes" / "pricing-config"), which the backend's own revalidateTag can
// never reach. Admin mutations flow through this proxy, so purge here.
const PRICE_DATA_PATH_RE = /^(perfumes|settings|decant-sizes|bottles|bulk-pricing|packs)(\/|$)/;
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Perfume Packs: the public list (`packs`) and a single active pack (`packs/<id|slug>`) are cached
// under their own "packs" tag. These sub-paths are admin-only or per-request and must NEVER be
// cached (they carry cost data / cookies / per-cart quotes), and the read-only POSTs must not purge.
const PACK_UNCACHED_SEGMENTS = new Set(["admin", "preview", "quote", "reorder"]);
function isPublicPackPath(pathname: string): boolean {
  if (pathname === "packs") return true;
  const parts = pathname.split("/");
  return parts.length === 2 && parts[0] === "packs" && !PACK_UNCACHED_SEGMENTS.has(parts[1]);
}
function isPackReadOnlyPost(pathname: string): boolean {
  return pathname === "packs/quote" || pathname === "packs/preview";
}

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
      lower === "content-encoding" ||
      // set-cookie is handled separately below — in Node.js 20+ (browser-spec
      // alignment) forEach() skips set-cookie entirely, so we must use
      // getSetCookie() to read them. Excluding here prevents double-setting on
      // Node.js 18 where forEach() still yields them.
      lower === "set-cookie"
    ) {
      return;
    }
    headers.set(key, value);
  });

  // Explicitly forward every Set-Cookie header from the upstream response.
  // getSetCookie() is available in Node.js 18+ (undici) and returns all
  // Set-Cookie values as an array, even in Node.js 20+ where they are
  // hidden from the regular iteration methods.
  const upstreamCookies =
    (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const cookie of upstreamCookies) {
    headers.append("set-cookie", cookie);
  }

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
  // Prevent the caller from escaping the backend's /api namespace (SSRF / traversal).
  if (path.some((segment) => segment === "." || segment === ".." || segment.includes("\\")) ||
      /^https?:\/\//i.test(pathname)) {
    return NextResponse.json({ error: "Invalid API path." }, { status: 400 });
  }
  const query = req.nextUrl.search || "";
  const targetUrl = `${backendBaseUrl}/api/${pathname}${query}`;
  const method = req.method.toUpperCase();
  const isGetLike = method === "GET" || method === "HEAD";
  const isPublicCatalogPath =
    pathname === "perfumes" ||
    pathname === "notifications" ||
    pathname === "notes-library" ||
    pathname.startsWith("perfumes/search") ||
    isPublicPackPath(pathname);
  const useCatalogCache = isGetLike && isPublicCatalogPath;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.delete("connection");
  // This is a server-to-server call, not a browser request. Forwarding the
  // browser's Origin would make the backend re-run its own CORS allowlist
  // against it; cross-origin writes are already rejected by the middleware.
  headers.delete("origin");
  headers.delete("referer");
  if (useCatalogCache) {
    headers.delete("cookie");
    headers.delete("authorization");
  }

  const body = method === "GET" || method === "HEAD" ? undefined : await req.arrayBuffer();

  let upstream: Response;
  try {
    // Add timeout for backend requests - 15s for general, 20s for catalog (may be large)
    // Mobile networks may be slower, so we use longer timeouts than client-side
    const timeoutMs = isPublicCatalogPath ? 20000 : 15000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      upstream = await fetch(targetUrl, {
        method,
        headers,
        body,
        redirect: "manual",
        signal: controller.signal,
        cache: useCatalogCache ? "force-cache" : "no-store",
        next: useCatalogCache ? { revalidate: 20, tags: isPublicPackPath(pathname) ? ["packs"] : ["perfumes"] } : undefined,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const isTimeout = error instanceof Error && (
      error.name === "AbortError" || 
      error.message.includes("timeout")
    );
    console.error("API proxy request failed", { 
      targetUrl, 
      error,
      isTimeout,
    });
    return NextResponse.json(
      { 
        error: isTimeout 
          ? "Backend API request timeout - please retry"
          : "Failed to reach backend API service."
      },
      { status: isTimeout ? 504 : 502 },
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

  // Successful admin write to pricing-relevant data → storefront caches are stale.
  // { expire: 0 } hard-expires the tag; the "max" profile would keep serving the
  // stale entry once more (stale-while-revalidate) — not acceptable for prices.
  if (upstream.ok && MUTATING_METHODS.has(method) && PRICE_DATA_PATH_RE.test(pathname) && !isPackReadOnlyPost(pathname)) {
    try {
      revalidateTag("perfumes", { expire: 0 });
      revalidateTag("pricing-config", { expire: 0 });
      // Pack prices/availability derive from perfumes, sizes, bottles and margins, so any of
      // those changing — or a pack itself changing — makes the cached pack list stale.
      revalidateTag("packs", { expire: 0 });
    } catch (error) {
      console.error("Storefront cache revalidation failed", { pathname, error });
    }
  }

  // A successful order changes stock, which changes pack availability.
  if (upstream.ok && method === "POST" && pathname === "orders") {
    try {
      revalidateTag("packs", { expire: 0 });
    } catch (error) {
      console.error("Storefront pack cache revalidation failed", { pathname, error });
    }
  }

  // 204/205/304 responses must not carry a body — passing one throws.
  const isNullBodyStatus = upstream.status === 204 || upstream.status === 205 || upstream.status === 304;
  const bodyBuffer = isNullBodyStatus ? null : await upstream.arrayBuffer();

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