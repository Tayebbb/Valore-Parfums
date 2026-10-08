/**
 * Perfume Pack types shared by the storefront, cart, checkout and admin UI.
 * They mirror the backend's public shapes (backend/src/lib/packs/types.ts);
 * the backend is the only place prices are computed.
 */

export type PackDiscountType = "percentage" | "fixed";

export const PACK_MAX_QUANTITY = 10;
export const PACK_MAX_COMPONENTS = 6;

export interface PackPublicItem {
  perfumeId: string;
  name: string;
  brand: string;
  image: string;
  /** Canonical storefront path of the perfume (e.g. /products/brand-name). */
  path: string;
  /** Current normal decant price for the pack's size, before the pack discount. */
  unitPrice: number;
  available: boolean;
}

export interface PackPublic {
  id: string;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  decantSizeMl: number;
  discountType: PackDiscountType;
  discountValue: number;
  originalPrice: number;
  discountAmount: number;
  finalPrice: number;
  available: boolean;
  items: PackPublicItem[];
}

/** Response entry of POST /api/packs/quote. */
export interface PackQuote {
  id: string;
  available: boolean;
  pack?: PackPublic;
}

export type ComponentStatus =
  | "available"
  | "low_stock"
  | "insufficient"
  | "inactive"
  | "unavailable_size"
  | "missing";

export interface PackAdminItem extends PackPublicItem {
  status: ComponentStatus;
  stockMl: number;
  unitCost: number;
}

export interface PackAdmin extends Omit<PackPublic, "items"> {
  isActive: boolean;
  items: PackAdminItem[];
  totalCost: number;
  warnings: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

/** Immutable pack snapshot stored on `orders/{id}.packs[]` (never read from the live pack). */
export interface PackOrderSnapshot {
  packGroupId: string;
  packId: string;
  packName: string;
  packSlug: string;
  decantSizeMl: number;
  quantity: number;
  items: {
    perfumeId: string;
    perfumeName: string;
    brand: string;
    ml: number;
    unitPrice: number;
    listUnitPrice: number;
  }[];
  discountType: PackDiscountType;
  discountValue: number;
  originalUnitPrice: number;
  discountUnitAmount: number;
  finalUnitPrice: number;
  originalTotal: number;
  discountTotal: number;
  finalTotal: number;
}

/** "10% OFF" / "৳100 OFF" label for a pack's discount. */
export function packDiscountLabel(type: PackDiscountType, value: number): string {
  return type === "percentage" ? `${Number(value)}% OFF` : `৳${Number(value).toLocaleString("en-BD")} OFF`;
}
