"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PACK_MAX_QUANTITY } from "@/types/pack";
import type { PackDiscountType, PackQuote } from "@/types/pack";

/** A single perfume (decant or full-bottle) cart line. `type` is optional for carts saved before packs existed. */
export interface PerfumeCartItem {
  type?: "perfume";
  perfumeId: string;
  perfumeName: string;
  ml: number;
  isFullBottle?: boolean;
  fullBottleSize?: string;
  quantity: number;
  unitPrice: number;
  image?: string;
}

export interface PackCartComponent {
  perfumeId: string;
  name: string;
  brand: string;
  image: string;
}

/**
 * A Perfume Pack cart line. ONE line per pack (never expanded into perfume lines).
 * Prices here are display-only snapshots refreshed from /api/packs/quote — the
 * backend recomputes the real price at order time and rejects a stale one.
 */
export interface PackCartItem {
  type: "pack";
  packId: string;
  packName: string;
  slug: string;
  quantity: number;
  /** Final price of ONE pack (after the pack discount). */
  unitPrice: number;
  /** Normal subtotal of ONE pack (sum of current component prices). */
  originalPrice: number;
  /** Discount on ONE pack. */
  discountAmount: number;
  discountType: PackDiscountType;
  discountValue: number;
  decantSizeMl: number;
  packItems: PackCartComponent[];
  image?: string;
  /** Set when the last quote said this pack cannot currently be bought. */
  unavailable?: boolean;
}

export type CartItem = PerfumeCartItem | PackCartItem;

export function isPackItem(item: CartItem): item is PackCartItem {
  return item.type === "pack";
}

export function perfumeLineId(perfumeId: string, ml: number, isFullBottle?: boolean, fullBottleSize?: string): string {
  return `perfume:${perfumeId}:${ml}:${isFullBottle ? "full" : "decant"}:${fullBottleSize || ""}`;
}

/** Stable identity of a cart line (what addItem merges on and remove/update address). */
export function cartLineId(item: CartItem): string {
  return isPackItem(item)
    ? `pack:${item.packId}`
    : perfumeLineId(item.perfumeId, item.ml, item.isFullBottle, item.fullBottleSize);
}

function clampPackQuantity(quantity: number): number {
  return Math.min(PACK_MAX_QUANTITY, Math.max(1, Math.floor(quantity) || 1));
}

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (lineId: string) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  clearCart: () => void;
  subtotal: () => number;
  /**
   * Overwrite pack lines with fresh server quotes (price, discount, composition, availability).
   * Returns the names of packs whose price changed, so the UI can tell the customer.
   */
  refreshPacks: (quotes: PackQuote[]) => string[];
}

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        set((state) => {
          const lineId = cartLineId(item);
          const existing = state.items.find((i) => cartLineId(i) === lineId);
          if (existing) {
            return {
              items: state.items.map((i) =>
                cartLineId(i) === lineId
                  ? { ...i, quantity: isPackItem(i) ? clampPackQuantity(i.quantity + item.quantity) : i.quantity + item.quantity }
                  : i,
              ),
            };
          }
          return { items: [...state.items, isPackItem(item) ? { ...item, quantity: clampPackQuantity(item.quantity) } : item] };
        });
      },

      removeItem: (lineId) => {
        set((state) => ({ items: state.items.filter((i) => cartLineId(i) !== lineId) }));
      },

      updateQuantity: (lineId, quantity) => {
        set((state) => ({
          items: state.items.map((i) =>
            cartLineId(i) === lineId
              ? { ...i, quantity: isPackItem(i) ? clampPackQuantity(quantity) : Math.max(1, Math.floor(quantity) || 1) }
              : i,
          ),
        }));
      },

      clearCart: () => set({ items: [] }),

      subtotal: () => {
        return get().items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
      },

      refreshPacks: (quotes) => {
        const byId = new Map(quotes.map((q) => [q.id, q]));
        const changed: string[] = [];
        set((state) => ({
          items: state.items.map((i) => {
            if (!isPackItem(i)) return i;
            const quote = byId.get(i.packId);
            if (!quote) return i;
            if (!quote.pack) return { ...i, unavailable: true };
            const p = quote.pack;
            if (p.finalPrice !== i.unitPrice) changed.push(p.name);
            return {
              ...i,
              packName: p.name,
              slug: p.slug,
              unitPrice: p.finalPrice,
              originalPrice: p.originalPrice,
              discountAmount: p.discountAmount,
              discountType: p.discountType,
              discountValue: p.discountValue,
              decantSizeMl: p.decantSizeMl,
              packItems: p.items.map((c) => ({ perfumeId: c.perfumeId, name: c.name, brand: c.brand, image: c.image })),
              image: p.items.find((c) => c.image)?.image || i.image,
              unavailable: !quote.available,
            };
          }),
        }));
        return changed;
      },
    }),
    {
      name: "vp-cart",
      // v2 introduced pack lines. Older carts only hold perfume lines, which stay valid as-is
      // (`type` is optional); this just drops anything malformed so a bad blob can't crash pages.
      version: 2,
      migrate: (persisted) => {
        const state = (persisted ?? {}) as { items?: unknown };
        const items = Array.isArray(state.items) ? state.items : [];
        return {
          items: items.filter(
            (i): i is CartItem =>
              Boolean(i) &&
              typeof i === "object" &&
              Number.isFinite((i as CartItem).quantity) &&
              Number.isFinite((i as CartItem).unitPrice) &&
              ((i as CartItem).type === "pack" ? typeof (i as PackCartItem).packId === "string" : typeof (i as PerfumeCartItem).perfumeId === "string"),
          ),
        };
      },
    },
  ),
);
