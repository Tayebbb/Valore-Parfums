/**
 * Perfume Pack types.
 *
 * A pack OWNS: its perfume references, the decant size and the discount
 * configuration. It never owns a price — the price is always derived from the
 * current per-perfume decant prices (see ./pricing.ts and ./service.ts).
 *
 * Public (customer) and admin shapes are intentionally different: public
 * payloads never contain stock levels, costs or margins.
 */

export type PackDiscountType = "percentage" | "fixed";

export interface PackDiscount {
  type: PackDiscountType;
  value: number;
}

/** Reference to a component perfume. Extensible (per-perfume ml etc.) later. */
export interface PackItem {
  perfumeId: string;
}

/** Stored Firestore document (`packs/{id}`). Timestamps are Firestore Timestamps. */
export interface Pack {
  id: string;
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
  decantSizeMl: number;
  items: PackItem[];
  discountType: PackDiscountType;
  discountValue: number;
  createdAt: unknown;
  updatedAt: unknown;
}

/** Normalised, validated admin input for create/update. */
export interface PackInput {
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
  decantSizeMl: number;
  perfumeIds: string[];
  discountType: PackDiscountType;
  discountValue: number;
}

export type ComponentStatus =
  | "available"
  | "low_stock"
  | "insufficient"
  | "inactive"
  | "unavailable_size"
  | "missing";

export interface PackPricing {
  /** Sum of the current normal decant prices of all components (one pack). */
  originalPrice: number;
  discountAmount: number;
  finalPrice: number;
}

// ── Public shapes ──────────────────────────────────────────────────

export interface PackPublicItem {
  perfumeId: string;
  name: string;
  brand: string;
  image: string;
  /** Canonical storefront path of the perfume (e.g. /products/brand-name). */
  path: string;
  /** Current normal decant price for the pack's size (before the pack discount). */
  unitPrice: number;
  available: boolean;
}

export interface PackPublic extends PackPricing {
  id: string;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  decantSizeMl: number;
  discountType: PackDiscountType;
  discountValue: number;
  items: PackPublicItem[];
  available: boolean;
}

// ── Admin shapes ───────────────────────────────────────────────────

export interface PackAdminItem extends PackPublicItem {
  status: ComponentStatus;
  stockMl: number;
  /** Total unit cost of this component (purchase + packaging + bottle). */
  unitCost: number;
}

export interface PackAdmin extends PackPricing {
  id: string;
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
  decantSizeMl: number;
  discountType: PackDiscountType;
  discountValue: number;
  items: PackAdminItem[];
  available: boolean;
  totalCost: number;
  warnings: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

// ── Order snapshot (immutable business evidence) ───────────────────

export interface PackOrderSnapshotItem {
  perfumeId: string;
  perfumeName: string;
  brand: string;
  ml: number;
  /** Component's allocated (discounted) unit price. */
  unitPrice: number;
  /** Component's normal price before the pack discount. */
  listUnitPrice: number;
}

/** Stored on `orders/{id}.packs[]`. Contains no cost/profit information. */
export interface PackOrderSnapshot {
  packGroupId: string;
  packId: string;
  packName: string;
  packSlug: string;
  decantSizeMl: number;
  quantity: number;
  items: PackOrderSnapshotItem[];
  discountType: PackDiscountType;
  discountValue: number;
  originalUnitPrice: number;
  discountUnitAmount: number;
  finalUnitPrice: number;
  originalTotal: number;
  discountTotal: number;
  finalTotal: number;
}

/** Limits shared by the admin validation and the order path. */
export const PACK_MAX_COMPONENTS = 6;
export const PACK_MAX_QUANTITY = 10;
