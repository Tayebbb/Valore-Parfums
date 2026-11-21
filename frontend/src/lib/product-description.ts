import type { DecantPrice } from "./catalog-pricing";

export function productDescription(
  product: { brand: string; name: string; partialDealType?: unknown },
  prices: DecantPrice[],
): string {
  const name = `${product.brand} ${product.name}`;
  if (product.partialDealType === "full_bottle") return `${name}. Full bottle ordering is currently unavailable.`;
  if (!prices.length) return `Check decant sizes and availability for ${name} in Bangladesh.`;
  const available = prices.filter((p) => p.available);
  if (!available.length) return `${name} decants are currently out of stock in Bangladesh. Check sizes and prices.`;
  const sizes = available.map((p) => `${p.ml} ml`).join(", ");
  const from = Math.min(...available.map((p) => p.sellingPrice)).toLocaleString("en-BD");
  return `Shop ${name} decants in Bangladesh. Available sizes: ${sizes}. From ${from} BDT.`;
}
