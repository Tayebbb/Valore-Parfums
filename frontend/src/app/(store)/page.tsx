import Image from "next/image";
import Link from "next/link";
import { ChevronDown, ArrowRight } from "lucide-react";
import { buildCanonicalProductPath } from "@/lib/product-path";
import { getActivePerfumes, getPerfumeOffers, parseImageList, type PerfumeDocument } from "@/lib/seo-catalog";

export const revalidate = 300;

interface PriceInfo {
  ml: number;
  sellingPrice: number;
  available: boolean;
}

function PerfumeCard({ perfume, prices, priority }: { perfume: PerfumeDocument; prices?: PriceInfo[]; priority?: boolean }) {
  const images = parseImageList(perfume.images);
  const lowestPrice = (prices || []).filter((p) => p.available).sort((a, b) => a.sellingPrice - b.sellingPrice)[0];
  const outOfStock = Number(perfume.totalStockMl || 0) <= 0;
  const isDynamicBestSeller = Number(perfume.totalOrders || 0) > 0;

  return (
    <Link href={buildCanonicalProductPath(perfume)}>
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded overflow-hidden card-hover group">
        <div className="aspect-square bg-[var(--bg-surface)] relative img-zoom">
          {images[0] ? (
            <Image src={images[0]} alt={perfume.name} fill className="object-cover" sizes="(max-width: 768px) 50vw, 25vw" priority={priority} />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="font-serif text-4xl text-[var(--text-muted)]">{perfume.name?.[0] || "P"}</span>
            </div>
          )}
          <div className="absolute top-3 left-3 right-3 flex flex-wrap gap-1.5 max-w-[calc(100%-1.5rem)]">
            {outOfStock && (
              <span className="meta-pill meta-pill-danger backdrop-blur-sm">
                Out of Stock
              </span>
            )}
            <span className="meta-pill meta-pill-accent backdrop-blur-sm">
              {perfume.category}
            </span>
            {isDynamicBestSeller && (
              <span className="meta-pill meta-pill-accent">
                Best Seller
              </span>
            )}
          </div>
        </div>
        {/* Lean card spacing keeps the listing easy to scan. */}
        <div className="p-3.5">
          <h3 className="font-serif text-lg font-light leading-tight line-clamp-2">{perfume.name}</h3>
          <div className="mt-2.5">
            {lowestPrice ? (
              <p className="font-serif text-base md:text-xl leading-snug font-medium text-[var(--gold-light)]">
                From {lowestPrice.sellingPrice.toLocaleString("en-BD")} BDT
              </p>
            ) : (
              <p className="text-base md:text-lg leading-snug font-medium text-[var(--text-secondary)]">
                {prices ? "Unavailable" : "..."}
              </p>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default async function HomePage() {
  const perfumes = await getActivePerfumes();

  const bestSellers = [...perfumes]
    .filter((p) => Number(p.totalOrders ?? 0) > 0)
    .sort((a, b) => Number(b.totalOrders ?? 0) - Number(a.totalOrders ?? 0))
    .slice(0, 4);
  const newArrivals = perfumes.slice(0, 8);

  // Deduplicated top-12 for pricing — bestSellers first, then fill from newArrivals.
  // getPricingConfig is now cached (unstable_cache + React cache) so these parallel
  // calls hit Firestore only once per 300 s instead of N×3 reads.
  const top12 = [...new Map([...bestSellers, ...newArrivals].map((p) => [p.id, p])).values()].slice(0, 12);
  const pricingEntries = await Promise.all(
    top12.map(async (perfume) => {
      const offers = await getPerfumeOffers(perfume);
      const prices: PriceInfo[] = offers.decantOffers.map((o) => ({
        ml: o.ml,
        sellingPrice: o.price,
        available: o.available,
      }));
      return [perfume.id, prices] as const;
    }),
  );
  const priceMap = Object.fromEntries(pricingEntries);

  return (
    <div>
      {/* Hero */}
      <section className="relative px-4 sm:px-6 md:px-[5%] py-16 sm:py-20 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(201,165,92,0.06)_0%,transparent_70%)]" />
        </div>

        <div className="relative text-center max-w-2xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--gold)] mb-4">Curated Collection</p>
          <h1 className="font-serif text-5xl md:text-6xl font-light italic leading-tight">
            Discover Your<br />Signature Scent
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-4 max-w-md mx-auto leading-relaxed">
            Premium perfume decants from the world&apos;s finest fragrances. Experience luxury without the full-bottle commitment.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/shop"
              className="w-full sm:w-auto bg-[var(--gold)] text-black px-8 py-3 text-xs uppercase tracking-wider font-medium hover:bg-[var(--gold-hover)] transition-colors rounded text-center"
            >
              Shop Now
            </Link>
            <Link
              href="/shop?bestSeller=true"
              className="w-full sm:w-auto border border-[var(--border)] px-8 py-3 text-xs uppercase tracking-wider text-[var(--text-secondary)] hover:border-[var(--gold)] hover:text-[var(--gold)] transition-colors rounded text-center"
            >
              Best Sellers
            </Link>
          </div>
          <div className="mt-10 pulse-scroll text-[var(--gold)]">
            <ChevronDown size={24} className="mx-auto" />
          </div>
        </div>
      </section>

      <div className="gold-line" />

      {/* Best Sellers */}
      {bestSellers.length > 0 && (
        <section className="px-4 sm:px-6 md:px-[5%] py-8 sm:py-10">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--gold)] mb-2">Most Popular</p>
              <h2 className="font-serif text-3xl font-light">Best Sellers</h2>
            </div>
            <Link href="/shop?bestSeller=true" className="text-xs uppercase tracking-wider text-[var(--gold)] hover:underline flex items-center gap-1">
              View All <ArrowRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {bestSellers.map((perfume, i) => (
              <div key={perfume.id} className="animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                <PerfumeCard perfume={perfume} prices={priceMap[perfume.id]} priority={i === 0} />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="gold-line" />

      {/* New Arrivals */}
      <section className="px-4 sm:px-6 md:px-[5%] py-8 sm:py-10">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--gold)] mb-2">Latest Additions</p>
            <h2 className="font-serif text-3xl font-light">New Arrivals</h2>
          </div>
          <Link href="/shop" className="text-xs uppercase tracking-wider text-[var(--gold)] hover:underline flex items-center gap-1">
            View All <ArrowRight size={12} />
          </Link>
        </div>

        {newArrivals.length === 0 ? (
          <div className="text-center py-20">
            <p className="font-serif text-2xl text-[var(--text-muted)]">No perfumes available</p>
            <p className="text-sm text-[var(--text-muted)] mt-2">Check back soon for new arrivals</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {newArrivals.map((perfume, i) => (
              <div key={perfume.id} className="animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
                <PerfumeCard perfume={perfume} prices={priceMap[perfume.id]} priority={i === 0 && bestSellers.length === 0} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
