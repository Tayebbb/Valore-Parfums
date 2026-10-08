"use client";

import { ShoppingBag } from "lucide-react";
import { useCart } from "@/store/cart";
import { toast } from "@/components/ui/Toaster";
import { packToCartItem } from "@/lib/packs-cart";
import type { PackPublic } from "@/types/pack";

interface AddPackButtonProps {
  pack: PackPublic;
  quantity?: number;
  /** Called after a successful add (e.g. to reset a quantity stepper). */
  onAdded?: () => void;
  className?: string;
}

/** "Add Pack to Cart" — disabled with a clear label when the pack cannot currently be fulfilled. */
export default function AddPackButton({ pack, quantity = 1, onAdded, className = "" }: AddPackButtonProps) {
  const addItem = useCart((s) => s.addItem);

  const handleAdd = () => {
    if (!pack.available) return;
    addItem(packToCartItem(pack, quantity));
    toast(`${pack.name} added to cart`, "success");
    onAdded?.();
  };

  return (
    <button
      type="button"
      onClick={handleAdd}
      disabled={!pack.available}
      className={`w-full flex items-center justify-center gap-2.5 bg-[var(--gold)] text-black py-3 text-xs uppercase tracking-wider font-sans font-semibold hover:bg-[var(--gold-light)] transition-colors disabled:cursor-not-allowed disabled:bg-[var(--bg-surface)] disabled:text-[var(--text-muted)] disabled:border disabled:border-[var(--border)] ${className}`}
    >
      <ShoppingBag size={15} />
      {pack.available ? "Add Pack to Cart" : "Currently Unavailable"}
    </button>
  );
}
