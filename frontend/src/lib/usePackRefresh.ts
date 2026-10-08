"use client";

import { useCallback, useEffect, useState } from "react";
import { isPackItem, useCart } from "@/store/cart";
import type { PackQuote } from "@/types/pack";

export const PACK_PRICE_CHANGED_MESSAGE =
  "The price of one of the items in your pack has changed. Your order total has been updated.";

/**
 * Re-quotes every pack line in the cart against the server (POST /api/packs/quote) so the cart and
 * checkout never trust stale localStorage prices. Returns the names of packs whose price changed
 * (so the page can show PACK_PRICE_CHANGED_MESSAGE) plus a way to dismiss the notice.
 *
 * This only refreshes what is DISPLAYED — the order endpoint recomputes the real price anyway.
 */
export function usePackRefresh() {
  const items = useCart((s) => s.items);
  const refreshPacks = useCart((s) => s.refreshPacks);
  const [changed, setChanged] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const packKey = items
    .filter(isPackItem)
    .map((i) => `${i.packId}:${i.quantity}`)
    .sort()
    .join("|");

  useEffect(() => {
    if (!packKey) return;
    let cancelled = false;
    setRefreshing(true);
    (async () => {
      try {
        const res = await fetch("/api/packs/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packs: packKey.split("|").map((entry) => {
              const [id, quantity] = entry.split(":");
              return { id, quantity: Number(quantity) };
            }),
          }),
        });
        if (!res.ok || cancelled) return;
        const quotes = (await res.json()) as PackQuote[];
        if (cancelled) return;
        const names = refreshPacks(quotes);
        if (names.length > 0) setChanged((prev) => [...new Set([...prev, ...names])]);
      } catch {
        // Offline / transient: keep the last known prices. Checkout re-validates server-side regardless.
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [packKey, refreshPacks]);

  const noteChanged = useCallback((names: string[]) => {
    if (names.length > 0) setChanged((prev) => [...new Set([...prev, ...names])]);
  }, []);
  const dismiss = useCallback(() => setChanged([]), []);

  return { priceChangedPacks: changed, refreshing, noteChanged, dismiss };
}
