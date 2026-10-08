import type { PackPublic } from "@/types/pack";

/**
 * Server-side access to the public pack API. Pack prices are computed ONLY by the backend
 * (canonical pricing engine) — storefront server components never re-derive them. Results are cached
 * under the "packs" tag, which the /api proxy purges whenever an admin changes packs, perfumes,
 * prices, sizes or bottles, or a pack order changes stock.
 */
function resolveBackendBaseUrl(): string | null {
  const raw = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || process.env.BACKEND_URL || "";
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

const REVALIDATE_SECONDS = 300;

async function fetchBackend<T>(path: string): Promise<T | null> {
  const base = resolveBackendBaseUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/${path}`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: ["packs"] },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    // Backend unreachable (e.g. during a build without a backend): render the empty state.
    return null;
  }
}

/** Active packs, sorted by display order. Empty array when the backend is unreachable. */
export async function getPublicPacks(): Promise<PackPublic[]> {
  const packs = await fetchBackend<PackPublic[]>("packs");
  return Array.isArray(packs) ? packs : [];
}

export async function getPublicPackBySlug(slug: string): Promise<PackPublic | null> {
  const pack = await fetchBackend<PackPublic>(`packs/${encodeURIComponent(slug)}`);
  return pack && typeof pack === "object" && "id" in pack ? pack : null;
}
