"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, Trash2 } from "lucide-react";
import { useAuth } from "@/store/auth";

interface WishlistItem {
  id: string;
  perfume: {
    id: string;
    name: string;
    brand: string;
    slug: string;
    inspiredBy: string;
    category: string;
    images: string;
  };
}

export default function WishlistPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWishlist = useCallback(() => {
    setLoading(true);
    fetch("/api/wishlist")
      .then((r) => r.json())
      .then((data) => {
        const nextItems = Array.isArray(data) ? data : (data.items || []);
        setItems(nextItems);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      fetchWishlist();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user, fetchWishlist]);

  const removeItem = async (perfumeId: string) => {
    await fetch("/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ perfumeId }),
    });
    setItems((prev) => prev.filter((i) => i.perfume.id !== perfumeId));
  };

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-[5%]">
        <div className="text-center">
          <Heart size={48} className="text-[var(--text-muted)] mx-auto mb-4" />
          <h1 className="font-serif text-3xl font-light italic mb-2">Your Wishlist</h1>
          <p className="text-sm text-[var(--text-muted)] mb-6">Sign in to save your favorite fragrances</p>
          <Link
            href="/login"
            className="inline-block bg-[var(--gold)] text-black px-8 py-3 rounded text-sm uppercase tracking-wider font-medium hover:bg-[var(--gold-hover)] transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-[5%] py-12">
      <div className="mb-10 text-center">
        <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--gold)] mb-3">Your Collection</p>
        <h1 className="font-serif text-4xl font-light italic">Wishlist</h1>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i}>
              <div className="skeleton aspect-[3/4] rounded" />
              <div className="skeleton h-4 mt-3 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <Heart size={48} className="text-[var(--text-muted)] mx-auto mb-4" />
          <p className="font-serif text-2xl text-[var(--text-muted)]">No items yet</p>
          <p className="text-sm text-[var(--text-muted)] mt-2 mb-6">Browse our collection and save your favorites</p>
          <Link
            href="/shop"
            className="inline-block bg-[var(--gold)] text-black px-8 py-3 rounded text-sm uppercase tracking-wider font-medium hover:bg-[var(--gold-hover)] transition-colors"
          >
            Explore Collection
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {items.map((item) => {
            const images: string[] = JSON.parse(item.perfume.images || "[]");
            return (
              <div key={item.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded overflow-hidden card-hover group relative">
                <Link href={`/products/${item.perfume.slug}`}>
                  <div className="aspect-[3/4] bg-[var(--bg-surface)] img-zoom relative">
                    {images[0] ? (
                      <Image src={images[0]} alt={item.perfume.name} fill className="object-cover" sizes="(max-width: 768px) 50vw, 25vw" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="font-serif text-4xl text-[var(--text-muted)]">{item.perfume?.name?.[0] || "P"}</span>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-serif text-lg font-light leading-tight">{item.perfume.name}</h3>
                    <p className="text-sm md:text-base leading-relaxed font-medium uppercase tracking-[0.08em] text-[var(--text-muted)] mt-1">{item.perfume.brand}</p>
                  </div>
                </Link>
                <button
                  onClick={() => removeItem(item.perfume.id)}
                  className="absolute top-3 right-3 p-2 bg-black/40 backdrop-blur rounded text-white hover:bg-[var(--error)] transition-colors"
                  title="Remove from wishlist"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
