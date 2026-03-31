"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, ArrowRight } from "lucide-react";

interface Perfume {
  id: string;
  name: string;
  brand: string;
  inspiredBy: string;
  category: string;
  images: string;
  totalStockMl: number;
  isBestSeller: boolean;
  totalOrders?: number;
  keyNotes?: string[];
  isActive: boolean;
}

interface PriceInfo {
  ml: number;
  sellingPrice: number;
  available: boolean;
}

function PerfumeCard({ perfume, prices }: { perfume: Perfume; prices?: PriceInfo[] }) {
  const images: string[] = JSON.parse(perfume.images || "[]");
  const lowestPrice = (prices || []).filter((p) => p.available).sort((a, b) => a.sellingPrice - b.sellingPrice)[0];
  const outOfStock = perfume.totalStockMl <= 0;
  const isDynamicBestSeller = Number(perfume.totalOrders || 0) > 0 || perfume.isBestSeller;

  return (
    <Link href={`/perfume/${perfume.id}`}>
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded overflow-hidden card-hover group">
        <div className="aspect-[3/4] bg-[var(--bg-surface)] relative img-zoom">
          {images[0] ? (
            <Image src={images[0]} alt={perfume.name} fill className="object-cover" sizes="(max-width: 768px) 50vw, 25vw" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="font-serif text-4xl text-[var(--text-muted)]">{perfume.name?.[0] || "P"}</span>
            </div>
          )}
          <div className="absolute top-3 left-3 flex flex-col gap-1">
            {outOfStock && (
              <span className="text-sm md:text-base leading-snug font-semibold uppercase tracking-[0.08em] bg-[var(--error)] text-white px-2.5 py-1">
                Out of Stock
              </span>
            )}
            <span className="text-sm md:text-base leading-snug font-semibold uppercase tracking-[0.08em] bg-black/60 text-[var(--gold)] px-2.5 py-1 backdrop-blur">
              {perfume.category}
            </span>
            {isDynamicBestSeller && (
              <span className="text-sm md:text-base leading-snug font-semibold uppercase tracking-[0.08em] bg-[var(--gold)] text-black px-2.5 py-1">
                Best Seller
              </span>
            )}
          </div>
        </div>
        <div className="p-4">
          <h3 className="font-serif text-lg font-light leading-tight">{perfume.name}</h3>
          {perfume.inspiredBy && (
            <p className="text-sm md:text-base leading-relaxed font-medium uppercase tracking-[0.08em] text-[var(--text-muted)] mt-1">
              Inspired by: {perfume.inspiredBy}
            </p>
          )}
          {Array.isArray(perfume.keyNotes) && perfume.keyNotes.length > 0 && (
            <p className="text-sm md:text-base leading-relaxed font-semibold uppercase tracking-[0.08em] text-[var(--gold)] mt-2 truncate">
              {perfume.keyNotes.slice(0, 3).join(" | ")}
            </p>
          )}
          <div className="mt-3">
            {lowestPrice ? (
              <p className="font-serif text-lg md:text-2xl leading-snug font-bold text-[var(--gold-light)] drop-shadow-[0_1px_0_rgba(0,0,0,0.35)]">
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

export default function HomePage() {
  const [perfumes, setPerfumes] = useState<Perfume[]>([]);
  const [priceMap, setPriceMap] = useState<Record<string, PriceInfo[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/perfumes?active=true")
      .then((r) => r.json())
      .then((data: Perfume[]) => {
        setPerfumes(data);
        // Batch-fetch pricing for all displayed perfumes in ONE call
        const ids = data.slice(0, 12).map((p) => p.id);
        if (ids.length > 0) {
          fetch("/api/pricing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ perfumeIds: ids }),
          })
            .then((r) => r.json())
            .then((map) => {
              const parsed: Record<string, PriceInfo[]> = {};
              for (const [id, val] of Object.entries(map)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                parsed[id] = (val as any).prices || [];
              }
              setPriceMap(parsed);
            })
            .catch(() => {});
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const bestSellers = [...perfumes]
    .filter((p) => Number(p.totalOrders || 0) > 0)
    .sort((a, b) => Number(b.totalOrders || 0) - Number(a.totalOrders || 0))
    .slice(0, 4);
  const newArrivals = perfumes.slice(0, 8);

  return (
    <div>
      {/* Hero */}
      <section className="relative px-[5%] py-24 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(201,165,92,0.06)_0%,transparent_70%)]" />
          <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-[var(--border)] to-transparent" />
          <div className="absolute top-0 right-1/4 w-px h-full bg-gradient-to-b from-transparent via-[var(--border)] to-transparent" />
        </div>

        <div className="relative text-center max-w-2xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--gold)] mb-4">Curated Collection</p>
          <h1 className="font-serif text-5xl md:text-6xl font-light italic leading-tight">
            Discover Your<br />Signature Scent
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-4 max-w-md mx-auto leading-relaxed">
            Premium perfume decants from the world&apos;s finest fragrances. Experience luxury without the full-bottle commitment.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href="/shop"
              className="bg-[var(--gold)] text-black px-8 py-3 text-xs uppercase tracking-wider font-medium hover:bg-[var(--gold-hover)] transition-colors rounded"
            >
              Shop Now
            </Link>
            <Link
              href="/shop?bestSeller=true"
              className="border border-[var(--border)] px-8 py-3 text-xs uppercase tracking-wider text-[var(--text-secondary)] hover:border-[var(--gold)] hover:text-[var(--gold)] transition-colors rounded"
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
        <section className="px-[5%] py-12">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--gold)] mb-2">Most Popular</p>
              <h2 className="font-serif text-3xl font-light">Best Sellers</h2>
            </div>
            <Link href="/shop?bestSeller=true" className="text-xs uppercase tracking-wider text-[var(--gold)] hover:underline flex items-center gap-1">
              View All <ArrowRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {bestSellers.map((perfume, i) => (
              <div key={perfume.id} className="animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                <PerfumeCard perfume={perfume} prices={priceMap[perfume.id]} />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="gold-line" />

      {/* New Arrivals / All Perfumes */}
      <section className="px-[5%] py-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--gold)] mb-2">Latest Additions</p>
            <h2 className="font-serif text-3xl font-light">New Arrivals</h2>
          </div>
          <Link href="/shop" className="text-xs uppercase tracking-wider text-[var(--gold)] hover:underline flex items-center gap-1">
            View All <ArrowRight size={12} />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {[...Array(8)].map((_, i) => (
              <div key={i}>
                <div className="skeleton aspect-[3/4] rounded" />
                <div className="skeleton h-4 mt-3 rounded w-3/4" />
                <div className="skeleton h-3 mt-2 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : newArrivals.length === 0 ? (
          <div className="text-center py-20">
            <p className="font-serif text-2xl text-[var(--text-muted)]">No perfumes available</p>
            <p className="text-sm text-[var(--text-muted)] mt-2">Check back soon for new arrivals</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {newArrivals.map((perfume, i) => (
              <div key={perfume.id} className="animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
                <PerfumeCard perfume={perfume} prices={priceMap[perfume.id]} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
