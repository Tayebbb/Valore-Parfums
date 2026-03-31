"use client";

import { useEffect, useState, use } from "react";
import { useCart } from "@/store/cart";
import { useAuth } from "@/store/auth";
import { toast } from "@/components/ui/Toaster";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Minus, Plus, ShoppingBag, Heart } from "lucide-react";

interface Perfume {
  id: string;
  name: string;
  brand: string;
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

export default function PerfumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [perfume, setPerfume] = useState<Perfume | null>(null);
  const [prices, setPrices] = useState<PriceOption[]>([]);
  const [bulkRules, setBulkRules] = useState<BulkRule[]>([]);
  const [selectedMl, setSelectedMl] = useState<number | null>(null);
  const [selectedOption, setSelectedOption] = useState<"decant" | "full-bottle">("decant");
  const [fullBottleSize, setFullBottleSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showRequest, setShowRequest] = useState(false);
  const [reqForm, setReqForm] = useState({ customerName: "", customerPhone: "", desiredMl: 0, quantity: 1 });
  const [wishlisted, setWishlisted] = useState(false);

  const addItem = useCart((s) => s.addItem);
  const { user } = useAuth();

  useEffect(() => {
    Promise.all([
      fetch(`/api/perfumes/${id}`).then((r) => r.json()),
      fetch(`/api/pricing?perfumeId=${id}`).then((r) => r.json()),
    ]).then(([p, pricing]) => {
      setPerfume(p);
      setPrices(pricing.prices || []);
      setBulkRules(pricing.bulkRules || []);
      const firstAvail = (pricing.prices || []).find((pr: PriceOption) => pr.available);
      if (firstAvail) setSelectedMl(firstAvail.ml);
    }).finally(() => setLoading(false));
  }, [id]);

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
  const images: string[] = perfume ? JSON.parse(perfume.images || "[]") : [];
  const outOfStock = perfume && perfume.totalStockMl <= 0;

  // Calculate bulk discount for current quantity
  const activeBulkRule = bulkRules.find((r) => quantity >= r.minQuantity);
  const bulkDiscountPercent = activeBulkRule?.discountPercent ?? 0;
  const decantUnitPrice = selectedPrice ? Math.ceil(selectedPrice.sellingPrice * (1 - bulkDiscountPercent / 100)) : 0;
  const effectiveUnitPrice = selectedOption === "full-bottle" ? 0 : decantUnitPrice;
  const totalDisplayPrice = effectiveUnitPrice * quantity;

  const handleAddToCart = () => {
    if (!perfume) return;

    if (selectedOption === "decant" && !selectedPrice) return;
    if (selectedOption === "full-bottle" && !fullBottleSize.trim()) {
      toast("Please enter desired bottle size (e.g., 50ml, 100ml)", "error");
      return;
    }

    addItem({
      perfumeId: perfume.id,
      perfumeName: perfume.name,
      ml: selectedOption === "full-bottle" ? 0 : (selectedPrice?.ml ?? 0),
      isFullBottle: selectedOption === "full-bottle",
      fullBottleSize: selectedOption === "full-bottle" ? fullBottleSize.trim() : undefined,
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
    if (selectedOption === "full-bottle") setFullBottleSize("");
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

          <h1 className="font-serif text-4xl font-light">{perfume.name}</h1>

          {perfume.brand && (
            <p className="text-sm text-[var(--text-secondary)]">by {perfume.brand}</p>
          )}

          {perfume.inspiredBy && (
            <p className="text-xs uppercase tracking-[0.15em] text-[var(--text-muted)]">
              Inspired by: <span className="text-[var(--gold)]">{perfume.inspiredBy}</span>
            </p>
          )}

          <div className="gold-line" />

          {perfume.description && (
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{perfume.description}</p>
          )}

          {(perfume.fragranceNotes?.top?.length || perfume.fragranceNotes?.middle?.length || perfume.fragranceNotes?.base?.length) ? (
            <div className="space-y-3">
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Fragrance Notes</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded border border-[var(--border)] bg-[var(--bg-surface)] p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">Top</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(perfume.fragranceNotes?.top || []).map((note) => (
                      <span key={`top-${note}`} className="text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-[var(--border-gold)] text-[var(--gold)] bg-[var(--gold-tint)]">
                        {note}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded border border-[var(--border)] bg-[var(--bg-surface)] p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">Middle</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(perfume.fragranceNotes?.middle || []).map((note) => (
                      <span key={`middle-${note}`} className="text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-[var(--border-gold)] text-[var(--gold)] bg-[var(--gold-tint)]">
                        {note}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded border border-[var(--border)] bg-[var(--bg-surface)] p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">Base</p>
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
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-3">Select Size</h3>
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

            {selectedOption === "full-bottle" && (
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] block">
                  Desired Bottle Size *
                </label>
                <input
                  type="text"
                  placeholder="e.g., 50ml, 100ml"
                  value={fullBottleSize}
                  onChange={(e) => setFullBottleSize(e.target.value)}
                  className="w-full md:w-[320px] bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] focus:bg-[var(--gold-tint)] outline-none transition-colors"
                />
                <p className="text-xs text-[var(--text-muted)]">
                  Price is not fixed for Full Bottle requests. Admin will confirm pricing manually after order placement.
                </p>
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

          {/* Add to Cart */}
          {selectedOption === "full-bottle" || selectedPrice?.available ? (
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
        </div>
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
