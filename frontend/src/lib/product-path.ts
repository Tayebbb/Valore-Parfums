export type CanonicalProduct = {
  name: string;
  brand: string;
  slug?: string;
  brandSlug?: string;
};

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/['`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function resolvePerfumeSlug(perfume: Pick<CanonicalProduct, "name" | "slug">): string {
  return perfume.slug && perfume.slug.trim() ? perfume.slug : slugify(perfume.name);
}

export function resolveBrandSlug(perfume: Pick<CanonicalProduct, "brand" | "brandSlug">): string {
  return perfume.brandSlug && perfume.brandSlug.trim() ? perfume.brandSlug : slugify(perfume.brand);
}

export function buildCanonicalProductPath(perfume: CanonicalProduct): string {
  return `/brand/${resolveBrandSlug(perfume)}/${resolvePerfumeSlug(perfume)}`;
}
