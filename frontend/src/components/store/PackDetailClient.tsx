"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Minus, Plus } from "lucide-react";
import PackImage from "./PackImage";
import PackPrice from "./PackPrice";
import AddPackButton from "./AddPackButton";
import { PACK_MAX_QUANTITY, packDiscountLabel } from "@/types/pack";
import type { PackPublic } from "@/types/pack";

const fmt = (n: number) => `৳${n.toLocaleString("en-BD")}`;

/**
 * Pack detail: composition is read-only (the admin owns it). The server-rendered pack is shown
 * immediately and silently refreshed on mount so price/availability are never staler than the cache window.
 */
export default function PackDetailClient({ initialPack }: { initialPack: PackPublic }) {
  const [pack, setPack] = useState<PackPublic>(initialPack);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    let active = true;
    fetch(`/api/packs/${encodeURIComponent(initialPack.slug)}`)
      .then((res) => (res.ok ? (res.json() as Promise<PackPublic>) : null))
      .then((fresh) => {
        if (active && fresh && fresh.id === initialPack.id) setPack(fresh);
      })
      .catch(() => {
        /* keep the server-rendered pack */
      });
    return () => {
      active = false;
    };
  }, [initialPack.id, initialPack.slug]);

  const unavailableItems = pack.items.filter((i) => !i.available);
  const images = pack.items.map((i) => i.image);

  return (
    <div className="px-4 sm:px-6 md:px-[5%] py-7 sm:py-8 pb-28 md:pb-8">
      <Link
        href="/packs"
        className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--gold)] transition-colors mb-6"
      >
        <ArrowLeft size={14} /> All Packs
      </Link>

      <div className="grid md:grid-cols-[1.1fr_0.9fr] gap-8 lg:gap-12">
        {/* Collage */}
        <div>
          <div className="relative aspect-square bg-[var(--bg-card)] border border-[var(--border)] rounded overflow-hidden">
            <PackImage images={images} fallbackLetter={pack.name?.[0] || "P"} sizes="(max-width: 768px) 100vw, 50vw" priority />
            {pack.discountAmount > 0 ? (
              <span className="absolute top-3 left-3 meta-pill meta-pill-accent bg-[var(--bg-base)]/80 backdrop-blur-sm">
                {packDiscountLabel(pack.discountType, pack.discountValue)}
              </span>
            ) : null}
          </div>
        </div>

        {/* Info */}
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--gold)]">Perfume Pack</p>
          <h1 className="font-serif text-3xl md:text-4xl font-light mt-1">{pack.name}</h1>
          <div className="gold-line mt-3" />
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mt-3">
            {pack.items.length} × {pack.decantSizeMl}ml decants
          </p>
          {pack.description ? (
            <p className="text-sm text-[var(--text-secondary)] mt-4 leading-relaxed whitespace-pre-line">{pack.description}</p>
          ) : null}

          {/* Contents */}
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mt-6 mb-2">What&apos;s inside</h2>
          <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded bg-[var(--bg-card)]">
            {pack.items.map((item) => {
              const row = (
                <div className="flex items-center gap-3 p-3">
                  <div className="relative w-14 h-14 rounded bg-[var(--bg-surface)] overflow-hidden flex-shrink-0">
                    {item.image ? (
                      <Image src={item.image} alt="" fill className="object-cover" sizes="56px" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="font-serif text-xl text-[var(--text-muted)]">{item.name?.[0] || "P"}</span>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-serif text-base truncate">{item.name}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">
                      {item.brand ? `${item.brand} · ` : ""}
                      {pack.decantSizeMl}ml
                    </p>
                    {!item.available ? <p className="text-[10px] uppercase tracking-wider text-[var(--error)] mt-0.5">Currently unavailable</p> : null}
                  </div>
                  <p className="font-serif text-base text-[var(--text-secondary)] flex-shrink-0">{fmt(item.unitPrice)}</p>
                </div>
              );
              return (
                <li key={item.perfumeId}>
                  {item.path ? (
                    <Link href={item.path} className="block hover:bg-[var(--gold-tint)] transition-colors">
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              );
            })}
          </ul>

          {/* Price */}
          <div className="mt-5 rounded border border-[var(--border-gold)] bg-[var(--bg-card)] p-4">
            <PackPrice
              originalPrice={pack.originalPrice}
              discountAmount={pack.discountAmount}
              discountType={pack.discountType}
              discountValue={pack.discountValue}
              finalPrice={pack.finalPrice}
              quantity={quantity}
              size="lg"
            />
            <p className="mt-3 text-[11px] text-[var(--text-muted)] leading-relaxed">
              Individual prices above are the current price of each decant. The pack discount is applied once to their total.
            </p>
          </div>

          {/* Availability */}
          <p className={`mt-4 text-xs uppercase tracking-[0.14em] ${pack.available ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
            {pack.available
              ? "Available"
              : unavailableItems.length > 0
                ? `Currently unavailable — ${unavailableItems.map((i) => i.name).join(", ")} ${unavailableItems.length > 1 ? "are" : "is"} out of stock`
                : "Currently unavailable"}
          </p>

          {/* Quantity + CTA (desktop) */}
          <div className="mt-4 hidden md:block">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Quantity</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-11 h-11 border border-[var(--border)] rounded flex items-center justify-center hover:border-[var(--gold)] transition-colors"
                  aria-label="Decrease quantity"
                >
                  <Minus size={14} />
                </button>
                <span className="font-serif text-xl w-8 text-center">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(PACK_MAX_QUANTITY, q + 1))}
                  disabled={quantity >= PACK_MAX_QUANTITY}
                  className="w-11 h-11 border border-[var(--border)] rounded flex items-center justify-center hover:border-[var(--gold)] transition-colors disabled:opacity-40"
                  aria-label="Increase quantity"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <AddPackButton pack={pack} quantity={quantity} onAdded={() => setQuantity(1)} className="py-3.5" />
          </div>
        </div>
      </div>

      {/* Mobile sticky action bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-[var(--bg-elevated)] border-t border-[var(--border)] p-2.5 md:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-11 h-11 border border-[var(--border)] rounded flex items-center justify-center"
              aria-label="Decrease quantity"
            >
              <Minus size={14} />
            </button>
            <span className="font-serif text-lg w-6 text-center">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(PACK_MAX_QUANTITY, q + 1))}
              disabled={quantity >= PACK_MAX_QUANTITY}
              className="w-11 h-11 border border-[var(--border)] rounded flex items-center justify-center disabled:opacity-40"
              aria-label="Increase quantity"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="flex-1 min-w-0">
            <AddPackButton pack={pack} quantity={quantity} onAdded={() => setQuantity(1)} className="py-3" />
          </div>
        </div>
      </div>
    </div>
  );
}
