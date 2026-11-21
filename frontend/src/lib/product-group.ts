import type { DecantPrice } from "./catalog-pricing";
import { productDescription } from "./product-description";

export function buildProductGroup(
  perfume: { id: string; name: string; brand: string; description?: string; partialDealType?: string },
  prices: DecantPrice[],
  images: string[],
  canonicalUrl: string,
  skuPrefix: string,
) {
  const variants = prices.filter((p) => p.sellingPrice > 0);
  return {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    productGroupID: perfume.id,
    name: `${perfume.brand} ${perfume.name} decant`,
    description: perfume.description || productDescription(perfume, prices),
    brand: { "@type": "Brand", name: perfume.brand },
    variesBy: "https://schema.org/size",
    url: canonicalUrl,
    hasVariant: variants.map((p) => ({
      "@type": "Product",
      sku: `${skuPrefix}-${p.ml}ml`,
      name: `${perfume.brand} ${perfume.name} ${p.ml} ml decant`,
      size: `${p.ml} ml`,
      image: images.map((src) => new URL(src, canonicalUrl).href),
      offers: {
        "@type": "Offer",
        url: `${canonicalUrl}?size=${p.ml}ml`,
        priceCurrency: "BDT",
        price: p.sellingPrice,
        availability: p.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      },
    })),
  };
}
