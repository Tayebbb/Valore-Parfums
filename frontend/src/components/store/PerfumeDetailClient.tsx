"use client";

import { useEffect, useState } from "react";
import { useCart } from "@/store/cart";
import { useAuth } from "@/store/auth";
import { toast } from "@/components/ui/Toaster";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Minus, Plus, ShoppingBag, Heart, Zap } from "lucide-react";
import type { DecantPrice } from "@/lib/catalog-pricing";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildProductGroup } from "@/lib/product-group";
import { parseImageList } from "@/lib/image-utils";

interface Perfume {
  id: string;
  name: string;
  brand: string;
  description?: string;
  slug?: string;
  brandSlug?: string;
  inspiredBy?: string;
  category?: string;
  images?: string;
  totalStockMl?: number;
  marketPricePerMl?: number;
  isPersonalCollection?: boolean;
  purchasePricePerMl?: number;
  partialDealType?: "decant" | "full_bottle" | "";
  fragranceNotes?: {
    top?: string[];
    middle?: string[];
    base?: string[];
    all?: string[];
  };
  season?: string[];
}

interface BulkRule {
  minQuantity: number;
  discountPercent: number;
}

export default function PerfumePage({
  canonicalUrl,
  brandPath,
  fullBottleEnquiry,
  skuPrefix,
  requestedMl,
  initialPerfume,
  initialPrices,
}: {
  canonicalUrl: string;
  brandPath: string;
  fullBottleEnquiry: boolean;
  skuPrefix: string;
  requestedMl: number | null;
  initialPerfume: Perfume;
  initialPrices: DecantPrice[];
}) {
  const id = initialPerfume.id;
  const [perfume, setPerfume] = useState(initialPerfume);
  const [prices, setPrices] = useState(initialPrices);
  const [bulkRules, setBulkRules] = useState<BulkRule[]>([]);
  const [selectedMl, setSelectedMl] = useState<number | null>(() =>
    initialPrices.find((p) => p.ml === requestedMl)?.ml ??
    initialPrices.find((p) => p.available)?.ml ?? initialPrices[0]?.ml ?? requestedMl
  );
  const [selectedOptionState, setSelectedOptionState] = useState<"decant" | "full-bottle">("decant");
  const [quantity, setQuantity] = useState(1);
  const [showRequest, setShowRequest] = useState(false);
  const [reqForm, setReqForm] = useState({ customerName: "", customerPhone: "", desiredMl: 0, quantity: 1 });
  const [wishlisted, setWishlisted] = useState(false);
  const [isFragranceNotesOpen, setIsFragranceNotesOpen] = useState(false);

  const lockedVariant = perfume?.partialDealType === "full_bottle"
    ? "full-bottle"
    : perfume?.partialDealType === "decant"
      ? "decant"
      : null;
  const selectedOption = lockedVariant ?? selectedOptionState;

  const addItem = useCart((s) => s.addItem);
  const { user } = useAuth();
  const router = useRouter();

  const fetchJsonSafe = async <T,>(url: string, fallback: T): Promise<T> => {
    try {
      const response = await fetch(url);
      if (!response.ok) return fallback;
      const text = await response.text();
      if (!text) return fallback;
      return JSON.parse(text) as T;
    } catch {
      return fallback;
    }
  };

  useEffect(() => {
    // Always revalidate on mount: server-rendered props can come from a cached
    // (ISR) page, so prices/stock are re-fetched cache-busted and applied on
    // top without blocking first paint.
    let active = true;
    const bust = Date.now();

    Promise.all([
      fetchJsonSafe<Perfume | null>(`/api/perfumes/${id}?fresh=${bust}`, null),
      fetchJsonSafe<{ prices?: DecantPrice[]; bulkRules?: BulkRule[] }>(`/api/pricing?perfumeId=${id}&fresh=${bust}`, {}),
    ])
      .then(([p, pricing]) => {
        if (!active) return;
        if (p) setPerfume(p);
        if (!Array.isArray(pricing.prices)) return;
        const fresh = pricing.prices;
        setPrices(fresh);
        setBulkRules(pricing.bulkRules ?? []);
        setSelectedMl((prev) => fresh.find((pr) => pr.ml === prev)?.ml ??
          fresh.find((pr) => pr.available)?.ml ?? fresh[0]?.ml ?? null);
      });
    return () => { active = false; };
  }, [id]);

  // Check wishlist status
  useEffect(() => {
    if (!user) return;
    fetch(`/api/wishlist-status?perfumeId=${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data === "object" && typeof (data as { wishlisted?: unknown }).wishlisted === "boolean") {
          setWishlisted((data as { wishlisted: boolean }).wishlisted);
        }
      })
      .catch(() => {});
  }, [user, id]);

  const toggleWishlist = async () => {
    if (!user) {
      toast("Sign in to add to wishlist", "error");
      return;
    }
    const res = await fetch("/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ perfumeId: id }),
    });
    if (!res.ok) {
      toast("Could not update wishlist", "error");
      return;
    }
    setWishlisted(!wishlisted);
    toast(wishlisted ? "Removed from wishlist" : "Added to wishlist", "success");
  };

  const selectedPrice = prices.find((p) => p.ml === selectedMl);
  const images: string[] = perfume ? parseImageList(perfume.images) : [];
  const outOfStock = Number(perfume.totalStockMl || 0) <= 0 || (prices.length > 0 && prices.every((p) => !p.available));

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
  const fullBottleOrderingEnabled = false;

  const handleAddToCart = () => {
    if (!perfume) return;

    if (selectedOption !== "decant" || !selectedPrice?.available) return;

    addItem({
      perfumeId: perfume.id,
      perfumeName: perfume.name,
      ml: selectedPrice.ml,
      isFullBottle: false,
      quantity,
      unitPrice: effectiveUnitPrice,
      image: images[0],
    });
    toast(`${perfume.name} ${selectedPrice.ml}ml added to cart`, "success");
    setQuantity(1);
  };

  const handleBuyNow = () => {
    if (!perfume) return;
    if (selectedOption !== "decant" || !selectedPrice?.available) return;

    addItem({
      perfumeId: perfume.id,
      perfumeName: perfume.name,
      ml: selectedPrice.ml,
      isFullBottle: false,
      quantity,
      unitPrice: effectiveUnitPrice,
      image: images[0],
    });
    router.push("/cart");
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


  const hasOffers = selectedOption === "decant" && prices.some((p) => p.sellingPrice > 0);
  return (
    <div className="px-4 sm:px-6 md:px-[5%] py-7 sm:py-8 pb-24 md:pb-8">
      {hasOffers && (
        <JsonLd value={buildProductGroup(perfume, prices, images, canonicalUrl, skuPrefix)} />
      )}
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-xs text-[var(--text-muted)] mb-6">
        <Link href="/">Home</Link><span aria-hidden="true">/</span>
        <Link href="/shop">Shop</Link><span aria-hidden="true">/</span>
        <Link href={brandPath}>{perfume.brand}</Link><span aria-hidden="true">/</span>
        <span aria-current="page">{perfume.name}</span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr] gap-10">
        {/* Images */}
        <div>
          <div className="aspect-square max-h-[760px] bg-[var(--bg-surface)] rounded overflow-hidden img-zoom relative">
            {images[0] ? (
              <Image src={images[0]} alt={`${perfume.brand} ${perfume.name}`} fill className="object-contain" sizes="(max-width: 768px) 100vw, 50vw" priority />
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
        {/* Slightly tighter vertical rhythm keeps details clear without feeling dense. */}
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--gold)] border border-[var(--border-gold)] px-2 py-1 rounded">
              {perfume.category || "Perfume"}
            </span>
            <button
              onClick={toggleWishlist}
              className="p-2 rounded border border-[var(--border)] hover:border-[var(--gold)] transition-colors"
              title={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
            >
              <Heart size={18} className={wishlisted ? "fill-[var(--error)] text-[var(--error)]" : "text-[var(--text-muted)]"} />
            </button>
          </div>

          <h1 className="font-serif text-3xl md:text-4xl font-light">{perfume.brand} {perfume.name}</h1>

          {perfume.description && <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{perfume.description}</p>}

          {perfume.inspiredBy && (
            <p className="text-xs uppercase tracking-[0.15em] text-[var(--text-muted)]">
              Inspired by: <span className="text-[var(--gold)]">{perfume.inspiredBy}</span>
            </p>
          )}

          <div className="gold-line" />

          {(perfume.fragranceNotes?.top?.length || perfume.fragranceNotes?.middle?.length || perfume.fragranceNotes?.base?.length) ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setIsFragranceNotesOpen((prev) => !prev)}
                aria-expanded={isFragranceNotesOpen}
                aria-controls="fragrance-notes-panel"
                className="w-full flex items-center justify-between border-b border-[var(--border)] px-0 py-2.5 text-left hover:border-[var(--border-gold)] transition-colors"
              >
                <h2 className="font-serif text-2xl font-light">Fragrance Notes</h2>
                <span
                  className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-[var(--border-gold)] text-[var(--gold)]"
                  aria-hidden="true"
                >
                  <ChevronDown size={16} className={`transition-transform ${isFragranceNotesOpen ? "rotate-180" : ""}`} />
                </span>
              </button>

                <div id="fragrance-notes-panel" hidden={!isFragranceNotesOpen} className={isFragranceNotesOpen ? "grid grid-cols-1 sm:grid-cols-3 gap-3" : "hidden"}>
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

          {perfume.season && perfume.season.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-serif text-2xl font-light">Best Seasons</h2>
              <div className="flex flex-wrap gap-2">
                {perfume.season.map((season) => (
                  <span key={season} className="text-sm uppercase tracking-wider px-3 py-1.5 rounded border border-[var(--border-gold)] text-[var(--gold)] bg-[var(--gold-tint)]">
                    {season}
                  </span>
                ))}
              </div>
            </div>
          )}

          <h2 className="font-serif text-2xl font-light">Select Your Size</h2>

          {/* Size Selector */}
          <div>
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-3">Variant Selector</h3>
            <div className="flex gap-2 mb-3">
              {(lockedVariant === null || lockedVariant === "full-bottle") && (
                <button
                  onClick={() => setSelectedOptionState("full-bottle")}
                  disabled={lockedVariant !== null || !fullBottleOrderingEnabled}
                  className={`px-4 py-3 rounded text-sm transition-all ${
                    selectedOption === "full-bottle"
                      ? "bg-[var(--gold)] text-black"
                      : "border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)]"
                  } ${lockedVariant !== null || !fullBottleOrderingEnabled ? "opacity-45 cursor-not-allowed" : "font-sans"}`}
                >
                  <span className="font-sans text-base tracking-wide">Full Bottle (Soon)</span>
                </button>
              )}
              {(lockedVariant === null || lockedVariant === "decant") && (
                <button
                  onClick={() => setSelectedOptionState("decant")}
                  disabled={lockedVariant !== null}
                  className={`px-4 py-3 rounded text-sm transition-all ${
                    selectedOption === "decant"
                      ? "bg-[var(--gold)] text-black"
                      : "border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)]"
                  } ${lockedVariant !== null ? "cursor-default" : "font-sans"}`}
                >
                  <span className="font-sans text-base tracking-wide">Decant</span>
                </button>
              )}
            </div>

            {selectedOption === "decant" && (
              <div className="flex flex-wrap gap-2">
                {prices.map((p) => (
                  <button
                    key={p.ml}
                    onClick={() => {
                      setSelectedOptionState("decant");
                      setSelectedMl(p.ml);
                      const url = new URL(window.location.href);
                      url.searchParams.set("size", `${p.ml}ml`);
                      window.history.replaceState(window.history.state, "", url);
                    }}
                    aria-pressed={selectedMl === p.ml}
                    className={`px-4 py-3 rounded text-sm transition-all font-sans tabular-nums ${
                      selectedOption === "decant" && selectedMl === p.ml
                        ? "bg-[var(--gold)] text-black"
                        : p.available
                        ? "border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)]"
                        : "border border-[var(--border)] text-[var(--text-muted)] opacity-70"
                    }`}
                  >
                    <span className="font-sans text-base uppercase tracking-wide tabular-nums">{p.ml}ml</span>
                    <span className="block text-[10px] uppercase tracking-wider mt-0.5 font-sans tabular-nums">
                      {p.sellingPrice.toLocaleString("en-BD")} BDT{!p.available && " · Out of stock"}
                    </span>
                  </button>
                ))}
              </div>
            )}

          </div>

          {fullBottleEnquiry && (
            <Link href={{ pathname: "/requests", query: { type: "full_bottle", perfumeName: perfume.name, brand: perfume.brand } }}
              rel="nofollow" className="inline-block text-sm underline">
              Ask about a full bottle
            </Link>
          )}

          {/* Quantity */}
          {(selectedOption === "full-bottle" || (selectedPrice && selectedPrice.available)) && (
            <div>
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-3">Quantity</h3>
              <div className="flex items-center gap-3">
                <button
                  aria-label="Decrease quantity"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-11 h-11 border border-[var(--border)] rounded flex items-center justify-center hover:border-[var(--gold)] transition-colors"
                >
                  <Minus size={16} />
                </button>
                <span className="font-serif text-xl w-8 text-center">{quantity}</span>
                <button
                  aria-label="Increase quantity"
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-11 h-11 border border-[var(--border)] rounded flex items-center justify-center hover:border-[var(--gold)] transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Price Display */}
          {selectedOption === "decant" && selectedPrice && (
            <div className="py-3 space-y-3">
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
            <button
              type="button"
              disabled
              title="Full bottle ordering is temporarily disabled"
              className="w-full flex items-center justify-center gap-3 bg-[var(--gold)] text-black py-4 text-xs uppercase tracking-wider font-sans font-semibold tabular-nums opacity-50 cursor-not-allowed"
            >
              <ShoppingBag size={18} /> Full Bottle Ordering Disabled
            </button>
          ) : selectedPrice?.available ? (
            <div className="hidden md:grid md:grid-cols-2 gap-3">
              <button
                onClick={handleAddToCart}
                className="w-full flex items-center justify-center gap-3 bg-[var(--gold)] text-black py-3.5 text-xs uppercase tracking-wider font-sans font-semibold tabular-nums hover:bg-[var(--gold-light)] transition-colors"
              >
                <ShoppingBag size={18} /> Add to Cart
              </button>
              <button
                onClick={handleBuyNow}
                className="w-full flex items-center justify-center gap-3 border border-[var(--gold)] text-[var(--gold)] py-3.5 text-xs uppercase tracking-wider font-sans font-semibold tabular-nums hover:bg-[var(--gold-tint)] transition-colors"
              >
                <Zap size={18} /> Buy Now
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-full py-3.5 text-center bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-muted)] text-xs uppercase tracking-wider">
                {selectedPrice ? `${selectedPrice.ml} ml out of stock` : "No decant size currently available"}
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
          {selectedOption === "decant" && <p className="text-xs text-[var(--text-muted)]">
            Stock: <span className={outOfStock || !selectedPrice?.available ? "text-[var(--error)]" : "text-[var(--success)]"}>
              {outOfStock ? "Out of Stock" : selectedPrice ? `${selectedPrice.ml} ml ${selectedPrice.available ? "in stock" : "out of stock"}` : "No decant size currently available"}
            </span>
          </p>}

        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-elevated)] border-t border-[var(--border)] p-2.5 md:hidden">
        {selectedOption === "decant" && selectedPrice?.available ? (
          <div className="grid grid-cols-2 gap-2">
            <p className="col-span-2 text-center text-xs">{selectedPrice.ml} ml · {totalDisplayPrice.toLocaleString("en-BD")} BDT{quantity > 1 && ` for ${quantity}`}</p>
            <button
              onClick={handleAddToCart}
              className="w-full bg-[var(--gold)] text-black py-3 text-xs uppercase tracking-wider font-sans font-semibold tabular-nums"
            >
              Add to Cart
            </button>
            <button
              onClick={handleBuyNow}
              className="w-full flex items-center justify-center gap-2 border border-[var(--gold)] text-[var(--gold)] py-3 text-xs uppercase tracking-wider font-sans font-semibold tabular-nums"
            >
              <Zap size={16} /> Buy Now
            </button>
          </div>
        ) : selectedOption === "full-bottle" ? (
          <button
            type="button"
            disabled
            title="Full bottle ordering is temporarily disabled"
            className="block w-full text-center bg-[var(--gold)] text-black py-3 text-xs uppercase tracking-wider font-sans font-semibold tabular-nums opacity-50 cursor-not-allowed"
          >
            Full Bottle Ordering Disabled
          </button>
        ) : (
          <div className="flex items-center justify-center w-full py-3 text-xs uppercase tracking-wider font-sans font-semibold text-[var(--text-muted)]">
            {selectedPrice ? `${selectedPrice.ml} ml out of stock` : "No decant size currently available"}
          </div>
        )}
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
    </div>
  );
}
