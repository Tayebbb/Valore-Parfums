"use client";

import { useCart } from "@/store/cart";
import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Trash2, ArrowLeft, ShoppingBag } from "lucide-react";

export default function CartPage() {
  const { items, removeItem, updateQuantity, subtotal } = useCart();
  const total = subtotal();

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
    <div className="px-4 sm:px-6 md:px-[5%] py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--gold)] transition-colors mb-6"
      >
        <ArrowLeft size={14} /> Continue Shopping
      </Link>

      <h1 className="font-serif text-3xl font-light mb-2">Shopping Cart</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-3">
          {items.map((item) => (
            <div
              key={`${item.perfumeId}-${item.ml}-${item.isFullBottle ? "full" : "decant"}-${item.fullBottleSize || ""}`}
              className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-3.5"
            >
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
                onClick={() => removeItem(item.perfumeId, item.ml, item.isFullBottle, item.fullBottleSize)}
                className="text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
              >
                <Trash2 size={16} />
              </button>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                {/* Quantity */}
                <div className="flex items-center gap-2">
                <button
                  onClick={() => updateQuantity(item.perfumeId, item.ml, Math.max(1, item.quantity - 1), item.isFullBottle, item.fullBottleSize)}
                  className="w-8 h-8 border border-[var(--border)] rounded flex items-center justify-center hover:border-[var(--gold)] transition-colors"
                >
                  <Minus size={14} />
                </button>
                <span className="font-serif text-base w-6 text-center">{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(item.perfumeId, item.ml, item.quantity + 1, item.isFullBottle, item.fullBottleSize)}
                  className="w-8 h-8 border border-[var(--border)] rounded flex items-center justify-center hover:border-[var(--gold)] transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* Total */}
              <div className="text-right">
                <p className="font-serif text-lg text-[var(--gold)]">
                  {item.isFullBottle ? "Pending" : `${(item.unitPrice * item.quantity).toLocaleString("en-BD")} BDT`}
                </p>
              </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="lg:col-span-1">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5 sticky top-24">
            <h2 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Order Summary</h2>
            
            <div className="space-y-2 mb-4">
              {items.map((item) => (
                <div key={`${item.perfumeId}-${item.ml}-${item.isFullBottle ? "full" : "decant"}-${item.fullBottleSize || ""}`} className="flex justify-between text-sm text-[var(--text-secondary)]">
                  <span className="truncate mr-2">
                    {item.perfumeName} {item.isFullBottle ? `Full Bottle (${item.fullBottleSize || "size pending"})` : `${item.ml}ml`} ×{item.quantity}
                  </span>
                  <span className="flex-shrink-0">{item.isFullBottle ? "Pending" : (item.unitPrice * item.quantity).toLocaleString("en-BD")}</span>
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
              className="block w-full text-center bg-[var(--gold)] text-black py-2.5 text-xs uppercase tracking-wider font-medium hover:bg-[var(--gold-light)] transition-colors"
            >
              Proceed to Checkout
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
