import { notFound, permanentRedirect } from "next/navigation";
import { buildCanonicalProductPath, getActivePerfumes, resolveBrandSlug, resolvePerfumeSlug } from "@/lib/seo-catalog";

export default async function BrandProductPage({ params }: { params: Promise<{ brand: string; perfume: string }> }) {
  const { brand, perfume } = await params;
  const products = await getActivePerfumes();
  const product = products.find((item) =>
    resolveBrandSlug(item) === brand &&
    (resolvePerfumeSlug(item) === perfume || item.storedSlug === perfume)
  );
  if (!product) notFound();
  permanentRedirect(buildCanonicalProductPath(product));
}
