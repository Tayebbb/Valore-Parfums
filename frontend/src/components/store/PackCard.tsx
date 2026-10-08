import Link from "next/link";
import PackImage from "./PackImage";
import PackPrice from "./PackPrice";
import AddPackButton from "./AddPackButton";
import { packDiscountLabel } from "@/types/pack";
import type { PackPublic } from "@/types/pack";

/**
 * Storefront card for a Perfume Pack. Mirrors the PerfumeCard visual language (card, gold accents,
 * serif titles) so packs feel native to the catalog. Server-renderable; only the add button is client-side.
 */
export default function PackCard({ pack, priority = false }: { pack: PackPublic; priority?: boolean }) {
  const href = `/packs/${pack.slug}`;
  const images = pack.items.map((i) => i.image);

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded overflow-hidden card-hover group flex flex-col">
      <Link href={href} className="block">
        <div className="aspect-square bg-[var(--bg-surface)] relative img-zoom">
          <PackImage images={images} fallbackLetter={pack.name?.[0] || "P"} sizes="(max-width: 768px) 100vw, 33vw" priority={priority} />
          <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 pointer-events-none">
            {pack.discountAmount > 0 ? (
              <span className="meta-pill meta-pill-accent bg-[var(--bg-base)]/80 backdrop-blur-sm">
                {packDiscountLabel(pack.discountType, pack.discountValue)}
              </span>
            ) : <span />}
            {!pack.available ? <span className="meta-pill meta-pill-danger">Unavailable</span> : null}
          </div>
        </div>
      </Link>

      <div className="p-4 flex flex-1 flex-col">
        <Link href={href}>
          <p className="text-[10px] uppercase tracking-[0.25em] text-[var(--gold)]">Perfume Pack</p>
          <h3 className="font-serif text-2xl font-light leading-tight mt-1 group-hover:text-[var(--gold-light)] transition-colors">
            {pack.name}
          </h3>
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)] mt-1">
            {pack.items.length} × {pack.decantSizeMl}ml
          </p>
        </Link>

        <ul className="mt-3 space-y-1">
          {pack.items.map((item) => (
            <li key={item.perfumeId} className="text-sm text-[var(--text-secondary)] truncate">
              {item.name}
              {item.brand ? <span className="text-[var(--text-muted)]"> · {item.brand}</span> : null}
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5">
          <PackPrice
            originalPrice={pack.originalPrice}
            discountAmount={pack.discountAmount}
            discountType={pack.discountType}
            discountValue={pack.discountValue}
            finalPrice={pack.finalPrice}
          />
        </div>

        <div className="mt-auto pt-4">
          <AddPackButton pack={pack} />
        </div>
      </div>
    </div>
  );
}
