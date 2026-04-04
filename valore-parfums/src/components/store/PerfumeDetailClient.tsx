"use client";

import { useEffect, useState, use } from "react";
import { useCart } from "@/store/cart";
import { useAuth } from "@/store/auth";
import { toast } from "@/components/ui/Toaster";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Minus, Plus, ShoppingBag, Heart } from "lucide-react";
import { parseImageList } from "@/lib/seo-catalog";

interface Perfume {
  id: string;
  name: string;
  brand: string;
  slug?: string;
  brandSlug?: string;
  inspiredBy: string;
  description: string;
  category: string;
  images: string;
  totalStockMl: number;
  marketPricePerMl: number;
  isPersonalCollection?: boolean;
  purchasePricePerMl?: number;
  fragranceNotes?: {
    top?: string[];
    middle?: string[];
    base?: string[];
    all?: string[];
  };
}

interface PriceOption {
  ml: number;
  sellingPrice: number;
  totalCost: number;
  bottleCost: number;
  packagingCost: number;
  profitMargin: number;
  tier: string;
  inStock: boolean;
  bottleAvailable: boolean;
  available: boolean;
}

interface BulkRule {
  minQuantity: number;
  discountPercent: number;
}

interface PerfumeReview {
  id: string;
  name: string;
  rating: number;
  comment: string;
  createdAt?: string;
}

export default function PerfumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [perfume, setPerfume] = useState<Perfume | null>(null);
  const [relatedPerfumes, setRelatedPerfumes] = useState<Perfume[]>([]);
  const [reviews, setReviews] = useState<PerfumeReview[]>([]);
  const [prices, setPrices] = useState<PriceOption[]>([]);
  const [bulkRules, setBulkRules] = useState<BulkRule[]>([]);
  const [selectedMl, setSelectedMl] = useState<number | null>(null);
  const [selectedOption, setSelectedOption] = useState<"decant" | "full-bottle">("decant");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showRequest, setShowRequest] = useState(false);
  const [showFullBottleModal, setShowFullBottleModal] = useState(false);
  const [fullBottleForm, setFullBottleForm] = useState({ name: "", phone: "", product: "", message: "" });
  const [reqForm, setReqForm] = useState({ customerName: "", customerPhone: "", desiredMl: 0, quantity: 1 });
  const [reviewForm, setReviewForm] = useState({ name: "", rating: 5, comment: "" });
  const [wishlisted, setWishlisted] = useState(false);

  const addItem = useCart((s) => s.addItem);
  const { user } = useAuth();

  useEffect(() => {
    Promise.all([
      fetch(`/api/perfumes/${id}`).then((r) => r.json()),
      fetch(`/api/pricing?perfumeId=${id}`).then((r) => r.json()),
      fetch(`/api/reviews?perfumeId=${id}`).then((r) => r.json()),
      fetch("/api/perfumes?active=true").then((r) => r.json()),
    ]).then(([p, pricing, reviewsRes, activePerfumes]) => {
      setPerfume(p);
      setPrices(pricing.prices || []);
      setBulkRules(pricing.bulkRules || []);
      setReviews(reviewsRes?.reviews || []);
      setRelatedPerfumes((activePerfumes || []).filter((item: Perfume) => item.id !== p.id && item.brand === p.brand).slice(0, 6));
      const firstAvail = (pricing.prices || []).find((pr: PriceOption) => pr.available);
      if (firstAvail) setSelectedMl(firstAvail.ml);
    }).finally(() => setLoading(false));
  }, [id]);

  const openFullBottleModal = () => {
    setFullBottleForm((current) => ({
      ...current,
      product: perfume?.name || current.product,
      message: current.message || `I want full bottle of ${perfume?.name || "this perfume"}`,
    }));
    setShowFullBottleModal(true);
  };

  // Check wishlist status
  useEffect(() => {
    if (!user) return;
    fetch("/api/wishlist")
      .then((r) => r.json())
      .then((data) => {
        const inWishlist = (data.items || []).some((item: { perfume: { id: string } }) => item.perfume.id === id);
        setWishlisted(inWishlist);
      })
      .catch(() => {});
  }, [user, id]);

  const toggleWishlist = async () => {
    if (!user) {
      toast("Sign in to add to wishlist", "error");
      return;
    }
    await fetch("/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ perfumeId: id }),
    });
    setWishlisted(!wishlisted);
    toast(wishlisted ? "Removed from wishlist" : "Added to wishlist", "success");
  };

  const selectedPrice = prices.find((p) => p.ml === selectedMl);
  const images: string[] = perfume ? parseImageList(perfume.images) : [];
  const outOfStock = perfume && perfume.totalStockMl <= 0;

  // Calculate bulk discount for current quantity — pick the highest-tier rule that applies
  const activeBulkRule = bulkRules.reduce<BulkRule | null>((best, rule) => {
    if (quantity < rule.minQuantity) return best;
    if (!best || rule.minQuantity > best.minQuantity) return rule;
    return best;
  }, null);
  const bulkDiscountPercent = activeBulkRule?.discountPercent ?? 0;
  const decantUnitPrice = selectedPrice ? Math.ceil(selectedPrice.sellingPrice * (1 - bulkDiscountPercent / 100)) : 0;
  const effectiveUnitPrice = selectedOption === "full-bottle" ? 0 : decantUnitPrice;
  const totalDisplayPrice = effectiveUnitPrice * quantity;
  const requestHref = perfume
    ? `/requests?perfumeName=${encodeURIComponent(perfume.name)}&brand=${encodeURIComponent(perfume.brand || "")}&type=full_bottle`
    : "/requests?type=full_bottle";

  const handleAddToCart = () => {
    if (!perfume) return;

    if (selectedOption === "decant" && !selectedPrice) return;

    addItem({
      perfumeId: perfume.id,
      perfumeName: perfume.name,
      ml: selectedOption === "full-bottle" ? 0 : (selectedPrice?.ml ?? 0),
      isFullBottle: selectedOption === "full-bottle",
      quantity,
      unitPrice: effectiveUnitPrice,
      image: images[0],
    });
    toast(
      selectedOption === "full-bottle"
        ? `${perfume.name} Full Bottle request added to cart`
        : `${perfume.name} ${selectedPrice?.ml}ml added to cart`,
      "success",
    );
    setQuantity(1);
  };

  const submitRequest = async () => {
    if (!reqForm.customerName || !reqForm.customerPhone) {
      return toast("Name and phone are required", "error");
    }
    await fetch("/api/stock-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        perfumeId: id,
        ...reqForm,
        desiredMl: reqForm.desiredMl || selectedMl || 5,
      }),
    });
    toast("Stock request submitted!", "success");
    setShowRequest(false);
    setReqForm({ customerName: "", customerPhone: "", desiredMl: 0, quantity: 1 });
  };

  const submitFullBottleRequest = async () => {
    if (!fullBottleForm.name || !fullBottleForm.phone || !fullBottleForm.product) {
      return toast("Name, phone and product are required", "error");
    }

    const response = await fetch("/api/full-bottle-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fullBottleForm.name,
        phone: fullBottleForm.phone,
        product: fullBottleForm.product,
        perfumeId: perfume?.id,
        message: fullBottleForm.message || `I want full bottle of ${fullBottleForm.product}`,
      }),
    });

    if (!response.ok) {
      return toast("Failed to send full bottle request", "error");
    }

    toast("Full bottle request submitted", "success");
    setShowFullBottleModal(false);
    setFullBottleForm({ name: "", phone: "", product: perfume?.name || "", message: `I want full bottle of ${perfume?.name || "this perfume"}` });
  };

  const submitReview = async () => {
    if (!reviewForm.name || !reviewForm.comment) {
      return toast("Name and review comment are required", "error");
    }

    const response = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        perfumeId: id,
        name: reviewForm.name,
        rating: reviewForm.rating,
        comment: reviewForm.comment,
      }),
    });

    if (!response.ok) {
      return toast("Failed to submit review", "error");
    }

    const createdReview = await response.json();
    setReviews((current) => [createdReview, ...current]);
    setReviewForm({ name: "", rating: 5, comment: "" });
    toast("Thanks for your review", "success");
  };

  if (loading) {
    return (
      <div className="px-[5%] py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="skeleton aspect-[3/4] rounded" />
          <div className="space-y-4">
            <div className="skeleton h-8 rounded w-3/4" />
            <div className="skeleton h-4 rounded w-1/2" />
            <div className="skeleton h-32 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!perfume) {
    return (
      <div className="px-[5%] py-20 text-center">
        <p className="font-serif text-2xl text-[var(--text-muted)]">Perfume not found</p>
        <Link href="/" className="text-sm text-[var(--gold)] mt-4 inline-block hover:underline">
          ← Back to collection
        </Link>
      </div>
    );
  }

  return (
    <div className="px-[5%] py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--gold)] transition-colors mb-8"
      >
        <ArrowLeft size={14} /> Back to Collection
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {/* Images */}
        <div>
          <div className="aspect-square bg-[var(--bg-surface)] rounded overflow-hidden img-zoom relative">
            {images[0] ? (
              <Image src={images[0]} alt={perfume.name} fill className="object-contain" sizes="(max-width: 768px) 100vw, 50vw" priority />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="font-serif text-6xl text-[var(--text-muted)]">{perfume.name?.[0] || "P"}</span>
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="grid grid-cols-4 gap-2 mt-2">
              {images.slice(1, 5).map((img, i) => (
                <div key={i} className="aspect-square bg-[var(--bg-surface)] rounded overflow-hidden relative">
                  <Image src={img} alt="" fill className="object-cover" sizes="12vw" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--gold)] border border-[var(--border-gold)] px-2 py-1 rounded">
              {perfume.category}
            </span>
            <button
              onClick={toggleWishlist}
              className="p-2 rounded border border-[var(--border)] hover:border-[var(--gold)] transition-colors"
              title={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
            >
              <Heart size={18} className={wishlisted ? "fill-[var(--error)] text-[var(--error)]" : "text-[var(--text-muted)]"} />
            </button>
          </div>

          <h1 className="font-serif text-4xl font-light">{perfume.name} by {perfume.brand} - Authentic Decant</h1>

          {perfume.inspiredBy && (
            <p className="text-xs uppercase tracking-[0.15em] text-[var(--text-muted)]">
              Inspired by: <span className="text-[var(--gold)]">{perfume.inspiredBy}</span>
            </p>
          )}

          <div className="gold-line" />

          {perfume.description && (
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{perfume.description}</p>
          )}

          <h2 className="font-serif text-2xl font-light">Select Your Size</h2>

          {(perfume.fragranceNotes?.top?.length || perfume.fragranceNotes?.middle?.length || perfume.fragranceNotes?.base?.length) ? (
            <div className="space-y-3">
              <h2 className="font-serif text-2xl font-light">Fragrance Notes</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded border border-[var(--border)] bg-[var(--bg-surface)] p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">Top Notes</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(perfume.fragranceNotes?.top || []).map((note) => (
                      <span key={`top-${note}`} className="text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-[var(--border-gold)] text-[var(--gold)] bg-[var(--gold-tint)]">
                        {note}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded border border-[var(--border)] bg-[var(--bg-surface)] p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">Middle Notes</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(perfume.fragranceNotes?.middle || []).map((note) => (
                      <span key={`middle-${note}`} className="text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-[var(--border-gold)] text-[var(--gold)] bg-[var(--gold-tint)]">
                        {note}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded border border-[var(--border)] bg-[var(--bg-surface)] p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">Base Notes</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(perfume.fragranceNotes?.base || []).map((note) => (
                      <span key={`base-${note}`} className="text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-[var(--border-gold)] text-[var(--gold)] bg-[var(--gold-tint)]">
                        {note}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Size Selector */}
          <div>
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-3">Variant Selector</h3>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setSelectedOption("full-bottle")}
                className={`px-5 py-3 rounded text-sm transition-all ${
                  selectedOption === "full-bottle"
                    ? "bg-[var(--gold)] text-black"
                    : "border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)]"
                }`}
              >
                <span className="font-serif text-base">Full Bottle</span>
              </button>
              <button
                onClick={() => setSelectedOption("decant")}
                className={`px-5 py-3 rounded text-sm transition-all ${
                  selectedOption === "decant"
                    ? "bg-[var(--gold)] text-black"
                    : "border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)]"
                }`}
              >
                <span className="font-serif text-base">Decant</span>
              </button>
            </div>

            {selectedOption === "decant" && (
              <div className="flex flex-wrap gap-2">
              {prices.map((p) => (
                <button
                  key={p.ml}
                  onClick={() => {
                    if (!p.available) return;
                    setSelectedOption("decant");
                    setSelectedMl(p.ml);
                  }}
                  disabled={!p.available}
                  className={`px-5 py-3 rounded text-sm transition-all ${
                    selectedOption === "decant" && selectedMl === p.ml
                      ? "bg-[var(--gold)] text-black"
                      : p.available
                      ? "border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)]"
                      : "border border-[var(--border)] text-[var(--text-muted)] opacity-40 cursor-not-allowed line-through"
                  }`}
                >
                  <span className="font-serif text-base">{p.ml}ml</span>
                  <span className="block text-[10px] uppercase tracking-wider mt-0.5">
                    {p.sellingPrice.toLocaleString("en-BD")} BDT
                  </span>
                </button>
              ))}
              </div>
            )}

          </div>

          {/* Quantity */}
          {(selectedOption === "full-bottle" || (selectedPrice && selectedPrice.available)) && (
            <div>
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-3">Quantity</h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-10 border border-[var(--border)] rounded flex items-center justify-center hover:border-[var(--gold)] transition-colors"
                >
                  <Minus size={16} />
                </button>
                <span className="font-serif text-xl w-8 text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-10 border border-[var(--border)] rounded flex items-center justify-center hover:border-[var(--gold)] transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Price Display */}
          {selectedOption === "decant" && selectedPrice && (
            <div className="py-4 space-y-3">
              <div className="flex items-baseline gap-3">
                <p className="font-serif text-3xl text-[var(--gold)]">
                  {totalDisplayPrice.toLocaleString("en-BD")} BDT
                </p>
                {selectedOption === "decant" && bulkDiscountPercent > 0 && (
                  <span className="text-xs bg-[var(--success)]/20 text-[var(--success)] px-2 py-0.5 rounded">
                    {bulkDiscountPercent}% bulk discount
                  </span>
                )}
              </div>
              {quantity > 1 && (
                <p className="text-xs text-[var(--text-muted)]">
                  {effectiveUnitPrice.toLocaleString("en-BD")} BDT × {quantity}
                </p>
              )}

              {/* Bulk pricing tiers hint */}
              {selectedOption === "decant" && bulkRules.length > 0 && (
                <div className="text-xs text-[var(--text-muted)] space-y-0.5">
                  {bulkRules.map((r, i) => (
                    <p key={i} className={quantity >= r.minQuantity ? "text-[var(--gold)]" : ""}>
                      Buy {r.minQuantity}+ → {r.discountPercent}% off
                      {quantity >= r.minQuantity && " ✓"}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Add to Cart / Request */}
          {selectedOption === "full-bottle" ? (
            <Link
              href={requestHref}
              className="w-full flex items-center justify-center gap-3 bg-[var(--gold)] text-black py-4 text-xs uppercase tracking-wider font-medium hover:bg-[var(--gold-light)] transition-colors"
            >
              <ShoppingBag size={18} /> Request Perfume
            </Link>
          ) : selectedPrice?.available ? (
            <button
              onClick={handleAddToCart}
              className="w-full flex items-center justify-center gap-3 bg-[var(--gold)] text-black py-4 text-xs uppercase tracking-wider font-medium hover:bg-[var(--gold-light)] transition-colors"
            >
              <ShoppingBag size={18} /> Add to Cart
            </button>
          ) : (
            <div className="space-y-3">
              <div className="w-full py-4 text-center bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-muted)] text-xs uppercase tracking-wider">
                {outOfStock ? "Out of Stock" : "Select an available size"}
              </div>
              {outOfStock && (
                <button
                  onClick={() => setShowRequest(true)}
                  className="w-full py-3 border border-[var(--gold)] text-[var(--gold)] text-xs uppercase tracking-wider hover:bg-[var(--gold-tint)] transition-colors"
                >
                  Request Stock
                </button>
              )}
            </div>
          )}

          {/* Stock status */}
          <p className="text-xs text-[var(--text-muted)]">
            Stock: <span className={outOfStock ? "text-[var(--error)]" : "text-[var(--success)]"}>
              {outOfStock ? "Out of Stock" : `${perfume.totalStockMl}ml available`}
            </span>
          </p>

          <div className="rounded border border-[var(--border)] p-4 bg-[var(--bg-surface)] space-y-3">
            <h2 className="font-serif text-2xl font-light">Performance</h2>
            <p className="text-sm text-[var(--text-secondary)]">Longevity: {perfume.marketPricePerMl > 120 ? "8-10 hours" : "6-8 hours"}</p>
            <p className="text-sm text-[var(--text-secondary)]">Projection: {perfume.marketPricePerMl > 120 ? "Moderate to strong" : "Moderate"}</p>
            <p className="text-sm text-[var(--text-secondary)]">Best Season: {perfume.category === "Oud" ? "Winter and evening" : "All season versatile"}</p>
          </div>

          <div className="rounded border border-[var(--border)] p-4 bg-[var(--bg-surface)] space-y-3" id="request-full-bottle">
            <h2 className="font-serif text-2xl font-light">Love This Fragrance?</h2>
            <p className="text-sm text-[var(--text-secondary)]">Request an authentic full bottle in Bangladesh after testing this decant.</p>
            <button
              onClick={openFullBottleModal}
              className="w-full py-3 border border-[var(--gold)] text-[var(--gold)] text-xs uppercase tracking-wider hover:bg-[var(--gold-tint)] transition-colors"
            >
              Request Full Bottle
            </button>
          </div>
        </div>
      </div>

      <section className="mt-12 space-y-4">
        <h2 className="font-serif text-3xl font-light">Customer Reviews</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            {reviews.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No reviews yet. Be the first to review this decant.</p>
            ) : (
              reviews.slice(0, 8).map((review) => (
                <div key={review.id} className="border border-[var(--border)] rounded p-4 bg-[var(--bg-surface)]">
                  <p className="text-sm font-medium">{review.name}</p>
                  <p className="text-xs text-[var(--gold)]">{"★".repeat(Math.max(1, Math.min(5, Number(review.rating || 5))))}</p>
                  <p className="text-sm text-[var(--text-secondary)] mt-2">{review.comment}</p>
                </div>
              ))
            )}
          </div>

          <div className="border border-[var(--border)] rounded p-4 bg-[var(--bg-surface)] space-y-3">
            <p className="text-sm font-medium">Share your experience</p>
            <input
              type="text"
              value={reviewForm.name}
              onChange={(e) => setReviewForm({ ...reviewForm, name: e.target.value })}
              placeholder="Your name"
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] outline-none"
            />
            <select
              value={reviewForm.rating}
              onChange={(e) => setReviewForm({ ...reviewForm, rating: Number(e.target.value) })}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] outline-none"
            >
              <option value={5}>5 stars</option>
              <option value={4}>4 stars</option>
              <option value={3}>3 stars</option>
              <option value={2}>2 stars</option>
              <option value={1}>1 star</option>
            </select>
            <textarea
              value={reviewForm.comment}
              onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
              placeholder="How did this perfume perform for you?"
              rows={4}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] outline-none"
            />
            <button
              onClick={submitReview}
              className="w-full bg-[var(--gold)] text-black py-2.5 text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors"
            >
              Submit Review
            </button>
          </div>
        </div>
      </section>

      <section className="mt-12 space-y-4">
        <h2 className="font-serif text-3xl font-light">Related Fragrances</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {relatedPerfumes.map((item) => (
            <Link key={item.id} href={`/brand/${item.brandSlug || item.brand.toLowerCase().replace(/[^a-z0-9]+/g, "-")}/${item.slug || item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className="border border-[var(--border)] rounded p-3 hover:border-[var(--gold)] transition-colors">
              <p className="text-sm font-medium">{item.name}</p>
              <p className="text-xs text-[var(--text-muted)]">{item.name} decant Bangladesh by {item.brand}</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-elevated)] border-t border-[var(--border)] p-3 md:hidden grid grid-cols-2 gap-2">
        <button
          onClick={handleAddToCart}
          className="w-full bg-[var(--gold)] text-black py-3 text-xs uppercase tracking-wider font-medium"
        >
          Sticky Add to Cart
        </button>
        <button
          onClick={openFullBottleModal}
          className="w-full border border-[var(--gold)] text-[var(--gold)] py-3 text-xs uppercase tracking-wider font-medium"
        >
          Request Full Bottle
        </button>
      </div>

      {/* Stock Request Modal */}
      {showRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowRequest(false)} />
          <div className="relative bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg w-full max-w-md p-6 animate-fade-up">
            <h2 className="font-serif text-xl font-light mb-4">Request Stock</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              We&apos;ll notify you when <span className="text-[var(--gold)]">{perfume.name}</span> is back in stock.
            </p>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Your Name"
                value={reqForm.customerName}
                onChange={(e) => setReqForm({ ...reqForm, customerName: e.target.value })}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] outline-none"
              />
              <input
                type="text"
                placeholder="Phone Number"
                value={reqForm.customerPhone}
                onChange={(e) => setReqForm({ ...reqForm, customerPhone: e.target.value })}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  placeholder="Desired ML"
                  value={reqForm.desiredMl || ""}
                  onChange={(e) => setReqForm({ ...reqForm, desiredMl: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] outline-none"
                />
                <input
                  type="number"
                  placeholder="Quantity"
                  value={reqForm.quantity}
                  onChange={(e) => setReqForm({ ...reqForm, quantity: parseInt(e.target.value) || 1 })}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={submitRequest}
                className="flex-1 bg-[var(--gold)] text-black py-2.5 text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors"
              >
                Submit Request
              </button>
              <button
                onClick={() => setShowRequest(false)}
                className="px-4 py-2.5 border border-[var(--border)] text-[var(--text-secondary)] text-xs uppercase tracking-wider hover:border-[var(--gold)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showFullBottleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowFullBottleModal(false)} />
          <div className="relative bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg w-full max-w-md p-6 animate-fade-up space-y-3">
            <h2 className="font-serif text-xl font-light">Request Full Bottle</h2>
            <input
              type="text"
              placeholder="Name"
              value={fullBottleForm.name}
              onChange={(e) => setFullBottleForm({ ...fullBottleForm, name: e.target.value })}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] outline-none"
            />
            <input
              type="text"
              placeholder="Phone"
              value={fullBottleForm.phone}
              onChange={(e) => setFullBottleForm({ ...fullBottleForm, phone: e.target.value })}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] outline-none"
            />
            <input
              type="text"
              placeholder="Product"
              value={fullBottleForm.product}
              onChange={(e) => setFullBottleForm({ ...fullBottleForm, product: e.target.value })}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] outline-none"
            />
            <textarea
              rows={3}
              placeholder="Message"
              value={fullBottleForm.message}
              onChange={(e) => setFullBottleForm({ ...fullBottleForm, message: e.target.value })}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] outline-none"
            />
            <div className="flex gap-3 pt-2">
              <button
                onClick={submitFullBottleRequest}
                className="flex-1 bg-[var(--gold)] text-black py-2.5 text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors"
              >
                Submit
              </button>
              <button
                onClick={() => setShowFullBottleModal(false)}
                className="px-4 py-2.5 border border-[var(--border)] text-[var(--text-secondary)] text-xs uppercase tracking-wider hover:border-[var(--gold)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
