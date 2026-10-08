"use client";

import { cartLineId, isPackItem, useCart } from "@/store/cart";
import type { PackCartItem } from "@/store/cart";
import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Trash2, ArrowLeft, ShoppingBag, Info, AlertTriangle } from "lucide-react";
import PackImage from "@/components/store/PackImage";
import PackPrice from "@/components/store/PackPrice";
import { PACK_PRICE_CHANGED_MESSAGE, usePackRefresh } from "@/lib/usePackRefresh";
import { PACK_MAX_QUANTITY } from "@/types/pack";

function QuantityStepper({
  quantity,
  onChange,
  max,
}: {
  quantity: number;
  onChange: (next: number) => void;
  max?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(Math.max(1, quantity - 1))}
        className="w-11 h-11 border border-[var(--border)] rounded flex items-center justify-center hover:border-[var(--gold)] transition-colors"
        aria-label="Decrease quantity"
      >
        <Minus size={14} />
      </button>
      <span className="font-serif text-base w-6 text-center">{quantity}</span>
      <button
        onClick={() => onChange(quantity + 1)}
        disabled={max !== undefined && quantity >= max}
        className="w-11 h-11 border border-[var(--border)] rounded flex items-center justify-center hover:border-[var(--gold)] transition-colors disabled:opacity-40 disabled:hover:border-[var(--border)]"
        aria-label="Increase quantity"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

function PackCartLine({
  item,
  onRemove,
  onQuantity,
}: {
  item: PackCartItem;
  onRemove: () => void;
  onQuantity: (next: number) => void;
}) {
  const images = item.packItems.map((c) => c.image);
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-gold)] rounded p-3.5">
      <div className="flex items-start gap-3">
        <div className="w-20 h-20 rounded flex-shrink-0 overflow-hidden relative">
          <PackImage images={images} fallbackLetter={item.packName?.[0] || "P"} sizes="80px" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--gold)]">Perfume Pack</p>
          <h3 className="font-serif text-lg leading-tight truncate">{item.packName}</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {item.decantSizeMl}ml × {item.packItems.length}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {item.packItems.map((c) => (
              <li key={c.perfumeId} className="text-xs text-[var(--text-secondary)] truncate">
                • {c.name} <span className="text-[var(--text-muted)]">— {item.decantSizeMl}ml</span>
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={onRemove}
          className="text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
          aria-label={`Remove ${item.packName}`}
        >
          <Trash2 size={16} />
        </button>
      </div>

      {item.unavailable ? (
        <div className="mt-3 flex items-start gap-2 rounded border border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.06)] px-3 py-2 text-xs text-[var(--error)]">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>This pack is currently unavailable. Remove it to continue to checkout.</span>
        </div>
      ) : null}

      <div className="mt-3 rounded border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5">
        <PackPrice
          originalPrice={item.originalPrice}
          discountAmount={item.discountAmount}
          discountType={item.discountType}
          discountValue={item.discountValue}
          finalPrice={item.unitPrice}
          quantity={item.quantity}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <QuantityStepper quantity={item.quantity} onChange={onQuantity} max={PACK_MAX_QUANTITY} />
        <p className="text-xs text-[var(--text-muted)]">{item.unitPrice.toLocaleString("en-BD")} BDT per pack</p>
      </div>
    </div>
  );
}

export default function CartPage() {
  const { items, removeItem, updateQuantity, subtotal } = useCart();
  const { priceChangedPacks, dismiss } = usePackRefresh();
  const total = subtotal();
  const hasUnavailablePack = items.some((i) => isPackItem(i) && i.unavailable);

  if (items.length === 0) {
    return (
      <div className="px-4 sm:px-6 md:px-[5%] py-16 sm:py-20 text-center">
        <ShoppingBag size={48} className="mx-auto text-[var(--text-muted)] mb-4" />
        <h1 className="font-serif text-3xl font-light mb-2">Your Cart is Empty</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">Discover our collection and find your signature scent</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-[var(--gold)] text-black px-6 py-3 text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors"
        >
          Browse Collection
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 md:px-[5%] py-8 pb-24 lg:pb-8">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--gold)] transition-colors mb-6"
      >
        <ArrowLeft size={14} /> Continue Shopping
      </Link>

      <h1 className="font-serif text-3xl font-light mb-2">Shopping Cart</h1>

      {priceChangedPacks.length > 0 ? (
        <div
          role="status"
          className="mt-4 mb-2 flex items-start gap-2 rounded border border-[var(--border-gold)] bg-[var(--gold-tint)] px-3.5 py-3 text-sm text-[var(--text-primary)]"
        >
          <Info size={16} className="mt-0.5 flex-shrink-0 text-[var(--gold)]" />
          <div className="flex-1">
            <p>{PACK_PRICE_CHANGED_MESSAGE}</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Updated: {priceChangedPacks.join(", ")}</p>
          </div>
          <button onClick={dismiss} className="text-xs uppercase tracking-wider text-[var(--gold)] hover:underline">
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-4">
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-3">
          {items.map((item) => {
            const lineId = cartLineId(item);
            if (isPackItem(item)) {
              return (
                <PackCartLine
                  key={lineId}
                  item={item}
                  onRemove={() => removeItem(lineId)}
                  onQuantity={(next) => updateQuantity(lineId, next)}
                />
              );
            }
            return (
              <div key={lineId} className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-3.5">
                <div className="flex items-start gap-3">
                  {/* Image */}
                  <div className="w-20 h-20 bg-[var(--bg-surface)] rounded flex-shrink-0 overflow-hidden relative">
                    {item.image ? (
                      <Image src={item.image} alt="" fill className="object-cover" sizes="80px" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="font-serif text-2xl text-[var(--text-muted)]">{item.perfumeName?.[0] || "P"}</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-serif text-base truncate">{item.perfumeName}</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {item.isFullBottle ? "Full Bottle" : `${item.ml}ml`}
                    </p>
                    {item.isFullBottle && item.fullBottleSize && (
                      <p className="text-xs text-[var(--text-muted)]">Requested size: {item.fullBottleSize}</p>
                    )}
                    <p className="font-serif text-sm text-[var(--gold)] mt-1">
                      {item.isFullBottle ? "Price pending" : `${item.unitPrice.toLocaleString("en-BD")} BDT each`}
                    </p>
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => removeItem(lineId)}
                    className="text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
                    aria-label={`Remove ${item.perfumeName}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <QuantityStepper quantity={item.quantity} onChange={(next) => updateQuantity(lineId, next)} />

                  {/* Total */}
                  <div className="text-right">
                    <p className="font-serif text-lg text-[var(--gold)]">
                      {item.isFullBottle ? "Pending" : `${(item.unitPrice * item.quantity).toLocaleString("en-BD")} BDT`}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="lg:col-span-1">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5 sticky top-24">
            <h2 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Order Summary</h2>

            <div className="space-y-2 mb-4">
              {items.map((item) => (
                <div key={cartLineId(item)} className="flex justify-between text-sm text-[var(--text-secondary)]">
                  <span className="truncate mr-2">
                    {isPackItem(item)
                      ? `${item.packName} (${item.decantSizeMl}ml × ${item.packItems.length}) ×${item.quantity}`
                      : `${item.perfumeName} ${item.isFullBottle ? `Full Bottle (${item.fullBottleSize || "size pending"})` : `${item.ml}ml`} ×${item.quantity}`}
                  </span>
                  <span className="flex-shrink-0">
                    {!isPackItem(item) && item.isFullBottle ? "Pending" : (item.unitPrice * item.quantity).toLocaleString("en-BD")}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-[var(--border)] my-4" />

            <div className="flex justify-between items-center mb-6">
              <span className="text-sm text-[var(--text-muted)]">Subtotal</span>
              <span className="font-serif text-xl text-[var(--gold)]">{total.toLocaleString("en-BD")} BDT</span>
            </div>

            <Link
              href="/checkout"
              aria-disabled={hasUnavailablePack}
              className={`block w-full text-center bg-[var(--gold)] text-black py-2.5 text-xs uppercase tracking-wider font-medium hover:bg-[var(--gold-light)] transition-colors ${hasUnavailablePack ? "pointer-events-none opacity-50" : ""}`}
            >
              Proceed to Checkout
            </Link>
          </div>
        </div>
      </div>

      {/* Sticky mobile checkout bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--bg-base)] px-4 py-3 lg:hidden">
        <div className="flex items-center gap-3 max-w-6xl mx-auto">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Subtotal</p>
            <p className="font-serif text-lg text-[var(--gold)] truncate">{total.toLocaleString("en-BD")} BDT</p>
          </div>
          <Link
            href="/checkout"
            aria-disabled={hasUnavailablePack}
            className={`rounded-xl bg-[var(--gold)] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-black shadow-[0_10px_22px_var(--gold-glow)] transition-all hover:bg-[var(--gold-light)] ${hasUnavailablePack ? "pointer-events-none opacity-50" : ""}`}
          >
            Checkout
          </Link>
        </div>
      </div>
    </div>
  );
}
