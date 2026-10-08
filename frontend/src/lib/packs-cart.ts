import type { PackCartItem } from "@/store/cart";
import type { PackPublic } from "@/types/pack";

/** Convert a public pack (server-priced) into a cart line. The price is display-only; checkout re-prices server-side. */
export function packToCartItem(pack: PackPublic, quantity = 1): PackCartItem {
  return {
    type: "pack",
    packId: pack.id,
    packName: pack.name,
    slug: pack.slug,
    quantity,
    unitPrice: pack.finalPrice,
    originalPrice: pack.originalPrice,
    discountAmount: pack.discountAmount,
    discountType: pack.discountType,
    discountValue: pack.discountValue,
    decantSizeMl: pack.decantSizeMl,
    packItems: pack.items.map((c) => ({ perfumeId: c.perfumeId, name: c.name, brand: c.brand, image: c.image })),
    image: pack.items.find((c) => c.image)?.image,
  };
}
