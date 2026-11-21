import { resolveBackendBaseUrl } from "./backend-base-url";

export interface DecantPrice {
  ml: number;
  sellingPrice: number;
  available: boolean;
}

type PriceCatalog = Record<string, { prices: DecantPrice[] }>;

// The anonymous batch endpoint uses the same pricing engine as checkout, including partials.
// Its public contract deliberately excludes purchase costs and margins.
export async function getCatalogPrices(ids: string[]): Promise<PriceCatalog> {
  const base = resolveBackendBaseUrl();
  if (!base || !ids.length) return {};

  const unique = [...new Set(ids)].sort();
  const batches: Promise<PriceCatalog>[] = [];
  for (let i = 0; i < unique.length; i += 50) {
    batches.push(fetchPrices(base, unique.slice(i, i + 50)));
  }
  return Object.assign({}, ...await Promise.all(batches));
}

async function fetchPrices(base: string, perfumeIds: string[]): Promise<PriceCatalog> {
  try {
    const response = await fetch(`${base}/api/pricing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ perfumeIds }),
      next: { revalidate: 60, tags: ["perfumes", "pricing-config"] },
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) return await response.json();
  } catch {
    // An unavailable price service must never produce an invented price.
  }
  return {};
}
