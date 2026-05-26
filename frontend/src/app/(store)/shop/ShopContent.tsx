"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, X, SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import { buildCanonicalProductPath } from "@/lib/product-path";
import { toPublicApiUrl } from "@/lib/public-api";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { calculateSellingPrice, getBrandTier, getTierProfitMargin } from "@/lib/utils";
import { PaginationNav } from "@/components/ui/PaginationNav";

export interface Perfume {
  id: string;
  name: string;
  brand: string;
  slug: string;
  canonicalPath?: string;
  inspiredBy: string;
  category: string;
  images: string;
  totalStockMl: number;
  season: string[];
  isBestSeller: boolean;
  totalOrders?: number;
  marketPricePerMl: number;
  fragranceNotes?: {
    top?: string[];
    middle?: string[];
    base?: string[];
    all?: string[];
  };
  fragranceNoteIds?: {
    top?: string[];
    middle?: string[];
    base?: string[];
    all?: string[];
  };
  keyNotes?: string[];
}

interface NotesCategory {
  id: string;
  label: string;
  emphasis?: "high" | "trending" | "core";
  notes: string[];
}

interface PriceInfo {
  ml: number;
  sellingPrice: number;
  available: boolean;
}

const DEFAULT_CARD_SIZE_ML = 5;
const DEFAULT_PACKAGING_COST = 20;

function getStartingPriceEstimate(perfume: Perfume): number {
  const marketPricePerMl = Number(perfume.marketPricePerMl || 0);
  if (marketPricePerMl <= 0) return 0;

  const tier = getBrandTier(Math.max(1, marketPricePerMl * 100));
  const margin = getTierProfitMargin(tier, DEFAULT_CARD_SIZE_ML);
  return calculateSellingPrice(marketPricePerMl, DEFAULT_CARD_SIZE_ML, 0, DEFAULT_PACKAGING_COST, margin);
}

function PerfumeCard({ perfume, prices }: { perfume: Perfume; prices?: PriceInfo[] }) {
  const images: string[] = JSON.parse(perfume.images || "[]");
  const lowestPrice = (prices || []).filter((p) => p.available).sort((a, b) => a.sellingPrice - b.sellingPrice)[0];
  const estimatedStartingPrice = getStartingPriceEstimate(perfume);
  const displayStartingPrice = lowestPrice?.sellingPrice || estimatedStartingPrice;
  const outOfStock = perfume.totalStockMl <= 0;
  const isDynamicBestSeller = Number(perfume.totalOrders || 0) > 0 || perfume.isBestSeller;

  return (
    <Link href={perfume.canonicalPath || buildCanonicalProductPath(perfume)}>
      <div className="bg-card border border-border rounded overflow-hidden card-hover group">
        <div className="aspect-square bg-surface relative img-zoom">
          {images[0] ? (
            <Image src={images[0]} alt={perfume.name} fill className="object-cover" sizes="(max-width: 768px) 50vw, 33vw" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="font-serif text-4xl text-text-muted">{perfume.name?.[0] || "P"}</span>
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
        {/* Keep card text compact so product browsing feels lighter. */}
        <div className="p-3.5">
          <h3 className="font-serif text-lg font-light leading-tight">{perfume.name}</h3>
          <p className="text-sm md:text-base leading-relaxed font-medium text-text-muted mt-0.5">{perfume.brand}</p>
          <div className="mt-2.5">
            {displayStartingPrice > 0 ? (
              <p className="font-serif text-base md:text-xl leading-snug font-medium text-gold-light">
                From {displayStartingPrice.toLocaleString("en-BD")} BDT
              </p>
            ) : (
              <p className="text-base md:text-lg leading-snug font-medium text-text-secondary">
                Unavailable
              </p>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ── Filter Section Accordion ── */
function FilterSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border pb-3 mb-3 last:border-b-0 last:mb-0 last:pb-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full text-left group"
      >
        <span className="text-[10px] uppercase tracking-[0.2em] text-text-secondary font-medium group-hover:text-gold transition-colors">
          {title}
        </span>
        {open ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
      </button>
      {open && <div className="mt-2.5">{children}</div>}
    </div>
  );
}

const MAX_PRICE = 20000;
const PAGE_SIZE = 24;

/* ── Price Range Slider ── */
function PriceRangeSlider({ min, max, value, onChange }: {
  min: number; max: number; value: [number, number]; onChange: (v: [number, number]) => void;
}) {
  const [localMin, setLocalMin] = useState(String(value[0]));
  const [localMax, setLocalMax] = useState(String(value[1]));
  const [editingMin, setEditingMin] = useState(false);
  const [editingMax, setEditingMax] = useState(false);

  const minInputValue = editingMin ? localMin : String(value[0]);
  const maxInputValue = editingMax ? localMax : String(value[1]);

  const pct = (v: number) => max > min ? ((v - min) / (max - min)) * 100 : 0;

  const applyMin = () => {
    const raw = localMin.replace(/[^0-9]/g, "");
    if (!raw) { setLocalMin(String(min)); onChange([min, value[1]]); setEditingMin(false); return; }
    const n = Math.max(min, Math.min(parseInt(raw, 10), value[1]));
    setLocalMin(String(n));
    onChange([n, value[1]]);
    setEditingMin(false);
  };

  const applyMax = () => {
    const raw = localMax.replace(/[^0-9]/g, "");
    if (!raw) { setLocalMax(String(max)); onChange([value[0], max]); setEditingMax(false); return; }
    const n = Math.min(max, Math.max(parseInt(raw, 10), value[0]));
    setLocalMax(String(n));
    onChange([value[0], n]);
    setEditingMax(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent, apply: () => void) => {
    if (e.key === "Enter") { e.preventDefault(); apply(); }
  };

  // The midpoint determines which invisible slider gets pointer events
  const midPct = (pct(value[0]) + pct(value[1])) / 2;

  return (
    <div className="space-y-3">
      {/* Manual inputs */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="text-[9px] uppercase tracking-wider text-text-muted mb-1 block">Min</label>
          <input
            type="text"
            inputMode="numeric"
            value={minInputValue}
            onFocus={() => {
              setEditingMin(true);
              setLocalMin(String(value[0]));
            }}
            onChange={(e) => setLocalMin(e.target.value)}
            onBlur={applyMin}
            onKeyDown={(e) => handleKeyDown(e, applyMin)}
            className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-gold transition-colors text-center"
          />
        </div>
        <span className="text-text-muted text-xs mt-4">–</span>
        <div className="flex-1">
          <label className="text-[9px] uppercase tracking-wider text-text-muted mb-1 block">Max</label>
          <input
            type="text"
            inputMode="numeric"
            value={maxInputValue}
            onFocus={() => {
              setEditingMax(true);
              setLocalMax(String(value[1]));
            }}
            onChange={(e) => setLocalMax(e.target.value)}
            onBlur={applyMax}
            onKeyDown={(e) => handleKeyDown(e, applyMax)}
            className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-gold transition-colors text-center"
          />
        </div>
        <span className="text-[9px] text-text-muted mt-4">BDT</span>
      </div>
      {/* Slider track + thumbs */}
      <div className="relative h-6 flex items-center">
        {/* Background track */}
        <div className="absolute left-0 right-0 h-1.5 bg-surface rounded-full" />
        {/* Active range highlight */}
        <div
          className="absolute h-1.5 bg-gold rounded-full"
          style={{ left: `${pct(value[0])}%`, right: `${100 - pct(value[1])}%` }}
        />
        {/* Min range input — pointer events only on left half */}
        <input
          type="range"
          min={min}
          max={max}
          step={100}
          value={value[0]}
          onChange={(e) => onChange([Math.min(Number(e.target.value), value[1]), value[1]])}
          className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer z-10"
          style={{ clipPath: `inset(0 ${100 - midPct}% 0 0)` }}
        />
        {/* Max range input — pointer events only on right half */}
        <input
          type="range"
          min={min}
          max={max}
          step={100}
          value={value[1]}
          onChange={(e) => onChange([value[0], Math.max(Number(e.target.value), value[0])])}
          className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer z-10"
          style={{ clipPath: `inset(0 0 0 ${midPct}%)` }}
        />
        {/* Visual thumb indicators */}
        <div
          className="absolute w-4 h-4 rounded-full bg-gold border-2 border-card shadow-md -translate-x-1/2 pointer-events-none z-20"
          style={{ left: `${pct(value[0])}%` }}
        />
        <div
          className="absolute w-4 h-4 rounded-full bg-gold border-2 border-card shadow-md -translate-x-1/2 pointer-events-none z-20"
          style={{ left: `${pct(value[1])}%` }}
        />
      </div>
    </div>
  );
}

function ShopContent({ initialPerfumes }: { initialPerfumes?: Perfume[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const qParam = searchParams.get("q") || "";
  const categoryParam = searchParams.get("category") || "";
  const seasonParam = searchParams.get("season") || "";
  const bestSellerParam = searchParams.get("bestSeller") || "";
  const brandParam = searchParams.get("brand") || "";
  const dealParam = searchParams.get("deal") || "";
  const notesParam = searchParams.get("notes") || "";
  const sortParam = searchParams.get("sort") || "newest";
  const selectedNotes = notesParam.split(",").map((n) => n.trim()).filter(Boolean);

  // If the server passed initial perfumes and no URL filters are active on mount,
  // we skip the first client-side fetch — products are already server-rendered.
  const skipInitialFetch = useRef(
    Boolean(initialPerfumes && initialPerfumes.length > 0) &&
    !qParam && !categoryParam && !seasonParam && !bestSellerParam && !brandParam && !dealParam && !notesParam,
  );

  const [perfumes, setPerfumes] = useState<Perfume[]>(initialPerfumes ?? []);
  const [priceMap, setPriceMap] = useState<Record<string, PriceInfo[]>>({});
  const [allBrands, setAllBrands] = useState<string[]>(() => {
    if (!initialPerfumes) return [];
    return [...new Set(
      initialPerfumes.map((p) => p.brand).filter((b) => b && b.toLowerCase() !== "valore parfums"),
    )].sort();
  });
  const [allNotes, setAllNotes] = useState<string[]>([]);
  const [noteCategories, setNoteCategories] = useState<NotesCategory[]>([]);
  const [loading, setLoading] = useState(!initialPerfumes || initialPerfumes.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(qParam);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, MAX_PRICE]);
  const fetchControllerRef = useRef<AbortController | null>(null);
  const fetchSeqRef = useRef(0);

  const categories = ["Men", "Women", "Unisex", "Oud"];
  const seasons = ["Summer", "Winter", "Spring", "Fall", "All Year"];
  const sortOptions = [
    { value: "newest", label: "Newest First" },
    { value: "name-asc", label: "Name A→Z" },
    { value: "name-desc", label: "Name Z→A" },
    { value: "price-asc", label: "Price: Low to High" },
    { value: "price-desc", label: "Price: High to Low" },
  ];

  const fetchPerfumes = useCallback(async () => {
    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;
    const seq = ++fetchSeqRef.current;

    setLoading(true);
    const params = new URLSearchParams();
    if (qParam) params.set("q", qParam);
    if (categoryParam) params.set("category", categoryParam);
    if (seasonParam) params.set("season", seasonParam);
    if (bestSellerParam) params.set("bestSeller", bestSellerParam);
    if (brandParam) params.set("brand", brandParam);
    if (dealParam) params.set("deal", dealParam);
    if (notesParam) params.set("notes", notesParam);
    if (sortParam) params.set("sort", sortParam);

    try {
      // Use fetch with timeout for mobile stability
      const perfumeRes = await fetchWithTimeout(toPublicApiUrl(`/api/perfumes/search?${params.toString()}`), {
        timeout: 12000,
        retries: 1,
        signal: controller.signal,
      });
      if (!perfumeRes.ok) {
        if (seq !== fetchSeqRef.current) return;
        console.error("Perfume search API returned:", perfumeRes.status);
        setError(`Failed to load perfumes (${perfumeRes.status})`);
        setPerfumes([]);
        setAllBrands([]);
        setPriceMap({});
        return;
      }
      const data = await perfumeRes.json();
      if (seq !== fetchSeqRef.current) return;

      const p = Array.isArray(data?.perfumes) ? (data.perfumes as Perfume[]) : [];
      setPerfumes(p);
      setError(null);
      const brandList = Array.isArray(data?.brands) ? (data.brands as string[]) : [];
      setAllBrands(brandList.filter((b) => b.toLowerCase() !== "valore parfums"));

      const ids = p.map((pf) => pf.id);
      if (ids.length === 0) {
        setPriceMap({});
        return;
      }

      // Use fetch with timeout for pricing API
      const pricingRes = await fetchWithTimeout(toPublicApiUrl("/api/pricing"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfumeIds: ids }),
        timeout: 10000,
        retries: 1,
        signal: controller.signal,
      });
      if (!pricingRes.ok) {
        if (seq !== fetchSeqRef.current) return;
        console.warn("Pricing API returned:", pricingRes.status);
        setPriceMap({});
        return;
      }
      const map = await pricingRes.json();
      if (seq !== fetchSeqRef.current) return;

      const parsed: Record<string, PriceInfo[]> = {};
      for (const [id, val] of Object.entries((map && typeof map === "object") ? map : {})) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parsed[id] = (val as any).prices || [];
      }
      setPriceMap(parsed);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Failed to load perfumes";
      console.error("Shop fetch error:", err);
      if (seq === fetchSeqRef.current) {
        setError(errMsg);
        setPerfumes([]);
        setAllBrands([]);
        setPriceMap({});
      }
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  }, [qParam, categoryParam, seasonParam, bestSellerParam, brandParam, dealParam, notesParam, sortParam]);

  useEffect(() => {
    // Use fetch with timeout for notes library
    fetchWithTimeout(toPublicApiUrl("/api/notes-library"), {
      timeout: 8000,
      retries: 1,
    })
      .then((r) => r.json())
      .then((data) => {
        const notes = Array.isArray(data?.noteLabels) ? data.noteLabels : [];
        setAllNotes(notes);
        setNoteCategories(Array.isArray(data?.categories) ? data.categories : []);
      })
      .catch(() => {
        setAllNotes([]);
        setNoteCategories([]);
      });
  }, []);

  useEffect(() => {
    // Skip the very first fetch if server-rendered initial data covers the current view
    // (no URL filters active). Subsequent filter changes still re-fetch as normal.
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    skipInitialFetch.current = false;

    const timer = window.setTimeout(() => {
      fetchPerfumes();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      fetchControllerRef.current?.abort();
    };
  }, [fetchPerfumes]);

  useEffect(() => {
    if (perfumes.length === 0 || Object.keys(priceMap).length > 0) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const ids = perfumes.map((perfume) => perfume.id);
        const pricingRes = await fetchWithTimeout(toPublicApiUrl("/api/pricing"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ perfumeIds: ids }),
          timeout: 10000,
          retries: 1,
          signal: controller.signal,
        });

        if (!pricingRes.ok) return;
        const map = await pricingRes.json();
        const parsed: Record<string, PriceInfo[]> = {};

        for (const [id, val] of Object.entries((map && typeof map === "object") ? map : {})) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          parsed[id] = (val as any).prices || [];
        }

        if (!controller.signal.aborted) {
          setPriceMap(parsed);
        }
      } catch {
        // Keep the estimated starting price if pricing lookup fails.
      }
    }, 0);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [perfumes, priceMap]);

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    const nextQuery = params.toString();
    router.push(nextQuery ? `/shop?${nextQuery}` : "/shop");
  };

  const toggleNote = (note: string) => {
    const active = new Set(selectedNotes);
    if (active.has(note)) active.delete(note);
    else active.add(note);

    const next = Array.from(active).sort((a, b) => a.localeCompare(b));
    updateFilter("notes", next.join(","));
  };

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateFilter("q", val.trim());
    }, 300);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    updateFilter("q", searchInput.trim());
  };

  const clearAll = () => {
    router.push("/shop");
    setSearchInput("");
    setPriceRange([0, MAX_PRICE]);
  };

  const pageParam = Number(searchParams.get("page") || "1");
  const requestedPage = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;

  const hasFilters = qParam || categoryParam || seasonParam || bestSellerParam || brandParam || dealParam || notesParam;

  // Price-filter client side (API handles the rest)
  const filteredPerfumes = perfumes.filter((p) => {
    const priceEstimate = p.marketPricePerMl * 10; // estimate for 10ml
    return priceEstimate >= priceRange[0] && priceEstimate <= priceRange[1];
  });

  const totalPages = Math.max(1, Math.ceil(filteredPerfumes.length / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const paginatedPerfumes = filteredPerfumes.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    if (requestedPage <= totalPages) return;

    const params = new URLSearchParams(searchParams.toString());
    if (totalPages > 1) {
      params.set("page", String(totalPages));
    } else {
      params.delete("page");
    }

    const nextQuery = params.toString();
    router.replace(nextQuery ? `/shop?${nextQuery}` : "/shop");
  }, [requestedPage, router, searchParams, totalPages]);

  // Build title
  let title = "All Fragrances";
  if (bestSellerParam) title = "Best Sellers";
  else if (dealParam === "partials" || dealParam === "partial") title = "Partial Deals";
  else if (categoryParam) title = `${categoryParam} Fragrances`;
  else if (seasonParam) title = `${seasonParam} Collection`;
  else if (brandParam) title = brandParam;
  else if (qParam) title = `Results for "${qParam}"`;

  const activeFilterCount = [categoryParam, seasonParam, bestSellerParam, brandParam, dealParam].filter(Boolean).length + selectedNotes.length;

  /* ── Sidebar Content (shared between desktop & mobile) ── */
  const filtersContent = (
    <div className="space-y-0">
      {/* Search in sidebar */}
      <div className="pb-4 mb-4 border-b border-border">
        <form onSubmit={handleSearch} className="flex items-center bg-input border border-border rounded overflow-hidden">
          <Search size={14} className="text-text-muted ml-3 shrink-0" />
          <input
            type="text"
            placeholder="Search..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="flex-1 bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-text-muted"
          />
          {searchInput && (
            <button type="button" onClick={() => { handleSearchChange(""); }} className="pr-2 text-text-muted hover:text-text-primary">
              <X size={14} />
            </button>
          )}
        </form>
      </div>

      {/* Price Range - at top */}
      <FilterSection title="Price Range (est. 10ml)">
        <PriceRangeSlider
          min={0}
          max={MAX_PRICE}
          value={priceRange}
          onChange={setPriceRange}
        />
      </FilterSection>

      {/* Category */}
      <FilterSection title="Category">
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => updateFilter("category", "")}
            className={`text-left text-sm px-2.5 py-1 rounded transition-colors ${
              !categoryParam ? "bg-gold-tint text-gold font-medium" : "text-text-secondary hover:text-text-primary hover:bg-surface"
            }`}
          >
            All Categories
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => updateFilter("category", c)}
              className={`text-left text-sm px-2.5 py-1 rounded transition-colors ${
                categoryParam === c ? "bg-gold-tint text-gold font-medium" : "text-text-secondary hover:text-text-primary hover:bg-surface"
              }`}
            >
              {c === "Men" ? "For Him" : c === "Women" ? "For Her" : c}
            </button>
          ))}
        </div>
      </FilterSection>

      {/* Season */}
      <FilterSection title="Season">
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => updateFilter("season", "")}
            className={`text-left text-sm px-2.5 py-1 rounded transition-colors ${
              !seasonParam ? "bg-gold-tint text-gold font-medium" : "text-text-secondary hover:text-text-primary hover:bg-surface"
            }`}
          >
            All Seasons
          </button>
          {seasons.map((s) => (
            <button
              key={s}
              onClick={() => updateFilter("season", s)}
              className={`text-left text-sm px-2.5 py-1 rounded transition-colors ${
                seasonParam === s ? "bg-gold-tint text-gold font-medium" : "text-text-secondary hover:text-text-primary hover:bg-surface"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </FilterSection>

      {/* Brands */}
      <FilterSection title="Brand" defaultOpen={!!brandParam}>
        <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
          <button
            onClick={() => updateFilter("brand", "")}
            className={`flex items-center w-full text-left text-sm px-2.5 py-1 rounded transition-colors ${
              !brandParam ? "bg-gold-tint text-gold font-medium" : "text-text-secondary hover:text-text-primary hover:bg-surface"
            }`}
          >
            All Brands
          </button>
          {allBrands.map((b) => (
            <button
              key={b}
              onClick={() => updateFilter("brand", b)}
              className={`flex items-center w-full text-left text-sm px-2.5 py-1 rounded transition-colors ${
                brandParam === b ? "bg-gold-tint text-gold font-medium" : "text-text-secondary hover:text-text-primary hover:bg-surface"
              }`}
            >
              <span className="truncate">{b}</span>
            </button>
          ))}
          {allBrands.length === 0 && (
            <p className="text-xs text-text-muted px-3 py-1">No brands yet</p>
          )}
        </div>
      </FilterSection>

      {/* Best Seller Toggle */}
      <FilterSection title="Special">
        <label className="flex items-center gap-2.5 cursor-pointer group px-2.5 py-1">
          <div className="relative">
            <input
              type="checkbox"
              checked={!!bestSellerParam}
              onChange={() => updateFilter("bestSeller", bestSellerParam ? "" : "true")}
              className="sr-only peer"
            />
            <div className="w-8 h-4.5 bg-surface border border-border rounded-full peer-checked:bg-gold transition-colors" />
            <div className="absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-text-muted rounded-full transition-all peer-checked:translate-x-3.5 peer-checked:bg-black" />
          </div>
          <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">
            Best Sellers Only
          </span>
        </label>
      </FilterSection>

      {/* Fragrance Notes */}
      <FilterSection title="Fragrance Notes" defaultOpen={selectedNotes.length > 0}>
        <div className="max-h-56 overflow-y-auto pr-1 space-y-2">
          {noteCategories.map((category) => {
            const style = category.emphasis === "high"
              ? "border-[var(--gold)] bg-[var(--gold-tint)]"
              : category.emphasis === "trending"
                ? "border-[rgba(245,158,11,0.45)] bg-[rgba(245,158,11,0.08)]"
                : "border-[var(--border)] bg-[var(--bg-surface)]";

            return (
              <div key={category.id} className={`rounded border p-2 ${style}`}>
                <p className="text-[10px] uppercase tracking-[0.16em] text-text-secondary mb-2">{category.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {category.notes.map((note) => {
                    const active = selectedNotes.includes(note);
                    return (
                      <button
                        key={note}
                        onClick={() => toggleNote(note)}
                        className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border transition-colors ${
                          active
                            ? "border-gold text-black bg-gold"
                            : "border-border text-text-secondary hover:text-text-primary hover:border-gold"
                        }`}
                      >
                        {note}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {noteCategories.length === 0 && allNotes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allNotes.map((note) => {
                const active = selectedNotes.includes(note);
                return (
                  <button
                    key={note}
                    onClick={() => toggleNote(note)}
                    className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border transition-colors ${
                      active
                        ? "border-gold text-black bg-gold"
                        : "border-border text-text-secondary hover:text-text-primary hover:border-gold"
                    }`}
                  >
                    {note}
                  </button>
                );
              })}
            </div>
          )}
          {noteCategories.length === 0 && allNotes.length === 0 && (
            <p className="text-xs text-text-muted">No fragrance notes available</p>
          )}
        </div>
      </FilterSection>

      {/* Clear Filters */}
      {hasFilters && (
        <div className="pt-4 mt-2 border-t border-border">
          <button
            onClick={clearAll}
            className="w-full text-center text-sm text-error hover:underline py-2"
          >
            Clear All Filters
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="px-4 sm:px-6 md:px-[5%] py-6 sm:py-8">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.4em] text-gold mb-2">Our Collection</p>
          <h1 className="font-serif text-4xl font-light italic">{title}</h1>
          {!loading && (
            <p className="text-sm text-text-muted mt-1">
              {filteredPerfumes.length === 0
                ? "No fragrances"
                : `${Math.min(filteredPerfumes.length, (currentPage - 1) * PAGE_SIZE + 1)}-${Math.min(currentPage * PAGE_SIZE, filteredPerfumes.length)} of ${filteredPerfumes.length} fragrances`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Sort Dropdown */}
          <select
            value={sortParam}
            onChange={(e) => updateFilter("sort", e.target.value)}
            className="bg-card border border-border rounded px-3 py-2 text-sm text-text-secondary outline-none cursor-pointer hover:border-gold transition-colors"
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Mobile filter toggle */}
          <button
            onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
            className={`lg:hidden flex items-center gap-2 px-4 py-2 text-sm border rounded transition-colors ${
              mobileFiltersOpen ? "bg-gold text-black border-gold" : "border-border text-text-secondary hover:border-gold"
            }`}
          >
            <SlidersHorizontal size={15} />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-gold text-black text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-medium">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Active Filter Chips */}
      {hasFilters && (
        <div className="flex flex-wrap gap-2 mb-6">
          {qParam && (
            <span className="filter-chip">
              Search: {qParam}
              <button onClick={() => { setSearchInput(""); updateFilter("q", ""); }}><X size={12} /></button>
            </span>
          )}
          {categoryParam && (
            <span className="filter-chip">
              {categoryParam === "Men" ? "For Him" : categoryParam === "Women" ? "For Her" : categoryParam}
              <button onClick={() => updateFilter("category", "")}><X size={12} /></button>
            </span>
          )}
          {seasonParam && (
            <span className="filter-chip">
              {seasonParam}
              <button onClick={() => updateFilter("season", "")}><X size={12} /></button>
            </span>
          )}
          {brandParam && (
            <span className="filter-chip">
              {brandParam}
              <button onClick={() => updateFilter("brand", "")}><X size={12} /></button>
            </span>
          )}
          {dealParam && (
            <span className="filter-chip">
              Partial Deals
              <button onClick={() => updateFilter("deal", "")}><X size={12} /></button>
            </span>
          )}
          {bestSellerParam && (
            <span className="filter-chip">
              Best Sellers
              <button onClick={() => updateFilter("bestSeller", "")}><X size={12} /></button>
            </span>
          )}
          {selectedNotes.map((note) => (
            <span key={note} className="filter-chip">
              Note: {note}
              <button onClick={() => toggleNote(note)}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}

      {/* Mobile Filters Panel */}
      {mobileFiltersOpen && (
        <div className="lg:hidden mb-8 p-4 bg-card border border-border rounded animate-fade-up">
          {filtersContent}
        </div>
      )}

      {/* Main Layout: Sidebar + Grid */}
      <div className="flex gap-6 lg:gap-8">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-24 bg-card border border-border rounded p-4">
            <h2 className="text-xs uppercase tracking-[0.2em] text-gold mb-4 font-medium">Filters</h2>
            {filtersContent}
          </div>
        </aside>

        {/* Product Grid */}
        <div className="flex-1 min-w-0">
          {error ? (
            <div className="text-center py-20 bg-surface border border-red-500/20 rounded p-8">
              <p className="font-serif text-2xl text-red-500 mb-2">Failed to Load Perfumes</p>
              <p className="text-sm text-text-secondary mb-6">{error}</p>
              <button
                onClick={() => router.refresh()}
                className="bg-gold text-black px-6 py-2 text-xs uppercase tracking-wider font-medium hover:bg-(--gold-hover) transition-colors rounded"
              >
                Try Again
              </button>
            </div>
          ) : loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
              {[...Array(9)].map((_, i) => (
                <div key={i}>
                  <div className="skeleton aspect-square rounded" />
                  <div className="skeleton h-4 mt-3 rounded w-3/4" />
                  <div className="skeleton h-3 mt-2 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : filteredPerfumes.length === 0 ? (
            <div className="text-center py-20">
              <p className="font-serif text-2xl text-text-muted">No perfumes found</p>
              <p className="text-sm text-text-muted mt-2 mb-6">Try adjusting your search or filters</p>
              {hasFilters && (
                <button onClick={clearAll} className="text-sm text-gold hover:underline">Clear all filters</button>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                {paginatedPerfumes.map((perfume, i) => (
                  <div key={perfume.id} className="animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                    <PerfumeCard perfume={perfume} prices={priceMap[perfume.id]} />
                  </div>
                ))}
              </div>

              <PaginationNav
                basePath="/shop"
                currentPage={currentPage}
                totalPages={totalPages}
                query={{
                  q: qParam || undefined,
                  category: categoryParam || undefined,
                  season: seasonParam || undefined,
                  bestSeller: bestSellerParam || undefined,
                  brand: brandParam || undefined,
                  deal: dealParam || undefined,
                  notes: notesParam || undefined,
                  sort: sortParam || undefined,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ShopContent;
