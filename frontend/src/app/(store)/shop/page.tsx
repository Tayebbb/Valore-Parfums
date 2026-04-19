"use client";

import { useEffect, useState, Suspense, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, X, SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import { buildCanonicalProductPath } from "@/lib/product-path";
import { toPublicApiUrl } from "@/lib/public-api";

interface Perfume {
  id: string;
  name: string;
  brand: string;
  slug: string;
  canonicalPath?: string;
  inspiredBy: string;
  category: string;
  images: string;
  totalStockMl: number;
  season: string;
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

function PerfumeCard({ perfume, prices }: { perfume: Perfume; prices?: PriceInfo[] }) {
  const images: string[] = JSON.parse(perfume.images || "[]");
  const lowestPrice = (prices || []).filter((p) => p.available).sort((a, b) => a.sellingPrice - b.sellingPrice)[0];
  const outOfStock = perfume.totalStockMl <= 0;
  const isDynamicBestSeller = Number(perfume.totalOrders || 0) > 0 || perfume.isBestSeller;

  return (
    <Link href={perfume.canonicalPath || buildCanonicalProductPath(perfume)}>
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded overflow-hidden card-hover group">
        <div className="aspect-[3/4] bg-[var(--bg-surface)] relative img-zoom">
          {images[0] ? (
            <Image src={images[0]} alt={perfume.name} fill className="object-cover" sizes="(max-width: 768px) 50vw, 33vw" />
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
          <p className="text-sm md:text-base leading-relaxed font-medium text-[var(--text-muted)] mt-0.5">{perfume.brand}</p>
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

/* ── Filter Section Accordion ── */
function FilterSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[var(--border)] pb-4 mb-4 last:border-b-0 last:mb-0 last:pb-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full text-left group"
      >
        <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-secondary)] font-medium group-hover:text-[var(--gold)] transition-colors">
          {title}
        </span>
        {open ? <ChevronUp size={14} className="text-[var(--text-muted)]" /> : <ChevronDown size={14} className="text-[var(--text-muted)]" />}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

const MAX_PRICE = 20000;

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
          <label className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1 block">Min</label>
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
            className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--gold)] transition-colors text-center"
          />
        </div>
        <span className="text-[var(--text-muted)] text-xs mt-4">–</span>
        <div className="flex-1">
          <label className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1 block">Max</label>
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
            className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--gold)] transition-colors text-center"
          />
        </div>
        <span className="text-[9px] text-[var(--text-muted)] mt-4">BDT</span>
      </div>
      {/* Slider track + thumbs */}
      <div className="relative h-6 flex items-center">
        {/* Background track */}
        <div className="absolute left-0 right-0 h-1.5 bg-[var(--bg-surface)] rounded-full" />
        {/* Active range highlight */}
        <div
          className="absolute h-1.5 bg-[var(--gold)] rounded-full"
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
          className="absolute w-4 h-4 rounded-full bg-[var(--gold)] border-2 border-[var(--bg-card)] shadow-md -translate-x-1/2 pointer-events-none z-20"
          style={{ left: `${pct(value[0])}%` }}
        />
        <div
          className="absolute w-4 h-4 rounded-full bg-[var(--gold)] border-2 border-[var(--bg-card)] shadow-md -translate-x-1/2 pointer-events-none z-20"
          style={{ left: `${pct(value[1])}%` }}
        />
      </div>
    </div>
  );
}

function ShopContent() {
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

  const [perfumes, setPerfumes] = useState<Perfume[]>([]);
  const [priceMap, setPriceMap] = useState<Record<string, PriceInfo[]>>({});
  const [allBrands, setAllBrands] = useState<string[]>([]);
  const [allNotes, setAllNotes] = useState<string[]>([]);
  const [noteCategories, setNoteCategories] = useState<NotesCategory[]>([]);
  const [loading, setLoading] = useState(true);
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
      const perfumeRes = await fetch(toPublicApiUrl(`/api/perfumes/search?${params.toString()}`), { signal: controller.signal });
      if (!perfumeRes.ok) {
        if (seq !== fetchSeqRef.current) return;
        setPerfumes([]);
        setAllBrands([]);
        setPriceMap({});
        return;
      }
      const data = await perfumeRes.json();
      if (seq !== fetchSeqRef.current) return;

      const p = Array.isArray(data?.perfumes) ? (data.perfumes as Perfume[]) : [];
      setPerfumes(p);
      const brandList = Array.isArray(data?.brands) ? (data.brands as string[]) : [];
      setAllBrands(brandList.filter((b) => b.toLowerCase() !== "valore parfums"));

      const ids = p.map((pf) => pf.id);
      if (ids.length === 0) {
        setPriceMap({});
        return;
      }

      const pricingRes = await fetch(toPublicApiUrl("/api/pricing"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfumeIds: ids }),
        signal: controller.signal,
      });
      if (!pricingRes.ok) {
        if (seq !== fetchSeqRef.current) return;
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
    } catch {
      if (seq === fetchSeqRef.current) {
        setPriceMap({});
      }
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  }, [qParam, categoryParam, seasonParam, bestSellerParam, brandParam, dealParam, notesParam, sortParam]);

  useEffect(() => {
    fetch(toPublicApiUrl("/api/notes-library"))
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
    const timer = window.setTimeout(() => {
      fetchPerfumes();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      fetchControllerRef.current?.abort();
    };
  }, [fetchPerfumes]);

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/shop?${params.toString()}`);
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

  const hasFilters = qParam || categoryParam || seasonParam || bestSellerParam || brandParam || dealParam || notesParam;

  // Price-filter client side (API handles the rest)
  const filteredPerfumes = perfumes.filter((p) => {
    const priceEstimate = p.marketPricePerMl * 10; // estimate for 10ml
    return priceEstimate >= priceRange[0] && priceEstimate <= priceRange[1];
  });

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
      <div className="pb-4 mb-4 border-b border-[var(--border)]">
        <form onSubmit={handleSearch} className="flex items-center bg-[var(--bg-input)] border border-[var(--border)] rounded overflow-hidden">
          <Search size={14} className="text-[var(--text-muted)] ml-3 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="flex-1 bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-[var(--text-muted)]"
          />
          {searchInput && (
            <button type="button" onClick={() => { handleSearchChange(""); }} className="pr-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
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
            className={`text-left text-sm px-3 py-1.5 rounded transition-colors ${
              !categoryParam ? "bg-[var(--gold-tint)] text-[var(--gold)] font-medium" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
            }`}
          >
            All Categories
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => updateFilter("category", c)}
              className={`text-left text-sm px-3 py-1.5 rounded transition-colors ${
                categoryParam === c ? "bg-[var(--gold-tint)] text-[var(--gold)] font-medium" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
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
            className={`text-left text-sm px-3 py-1.5 rounded transition-colors ${
              !seasonParam ? "bg-[var(--gold-tint)] text-[var(--gold)] font-medium" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
            }`}
          >
            All Seasons
          </button>
          {seasons.map((s) => (
            <button
              key={s}
              onClick={() => updateFilter("season", s)}
              className={`text-left text-sm px-3 py-1.5 rounded transition-colors ${
                seasonParam === s ? "bg-[var(--gold-tint)] text-[var(--gold)] font-medium" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
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
            className={`flex items-center w-full text-left text-sm px-3 py-1.5 rounded transition-colors ${
              !brandParam ? "bg-[var(--gold-tint)] text-[var(--gold)] font-medium" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
            }`}
          >
            All Brands
          </button>
          {allBrands.map((b) => (
            <button
              key={b}
              onClick={() => updateFilter("brand", b)}
              className={`flex items-center w-full text-left text-sm px-3 py-1.5 rounded transition-colors ${
                brandParam === b ? "bg-[var(--gold-tint)] text-[var(--gold)] font-medium" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
              }`}
            >
              <span className="truncate">{b}</span>
            </button>
          ))}
          {allBrands.length === 0 && (
            <p className="text-xs text-[var(--text-muted)] px-3 py-1">No brands yet</p>
          )}
        </div>
      </FilterSection>

      {/* Best Seller Toggle */}
      <FilterSection title="Special">
        <label className="flex items-center gap-2.5 cursor-pointer group px-3 py-1.5">
          <div className="relative">
            <input
              type="checkbox"
              checked={!!bestSellerParam}
              onChange={() => updateFilter("bestSeller", bestSellerParam ? "" : "true")}
              className="sr-only peer"
            />
            <div className="w-8 h-4.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-full peer-checked:bg-[var(--gold)] transition-colors" />
            <div className="absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-[var(--text-muted)] rounded-full transition-all peer-checked:translate-x-3.5 peer-checked:bg-black" />
          </div>
          <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
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
                <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-secondary)] mb-2">{category.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {category.notes.map((note) => {
                    const active = selectedNotes.includes(note);
                    return (
                      <button
                        key={note}
                        onClick={() => toggleNote(note)}
                        className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border transition-colors ${
                          active
                            ? "border-[var(--gold)] text-black bg-[var(--gold)]"
                            : "border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--gold)]"
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
                        ? "border-[var(--gold)] text-black bg-[var(--gold)]"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--gold)]"
                    }`}
                  >
                    {note}
                  </button>
                );
              })}
            </div>
          )}
          {noteCategories.length === 0 && allNotes.length === 0 && (
            <p className="text-xs text-[var(--text-muted)]">No fragrance notes available</p>
          )}
        </div>
      </FilterSection>

      {/* Clear Filters */}
      {hasFilters && (
        <div className="pt-4 mt-2 border-t border-[var(--border)]">
          <button
            onClick={clearAll}
            className="w-full text-center text-sm text-[var(--error)] hover:underline py-2"
          >
            Clear All Filters
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="px-[5%] py-10">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--gold)] mb-2">Our Collection</p>
          <h1 className="font-serif text-4xl font-light italic">{title}</h1>
          {!loading && (
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {filteredPerfumes.length} fragrance{filteredPerfumes.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Sort Dropdown */}
          <select
            value={sortParam}
            onChange={(e) => updateFilter("sort", e.target.value)}
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text-secondary)] outline-none cursor-pointer hover:border-[var(--gold)] transition-colors"
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Mobile filter toggle */}
          <button
            onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
            className={`lg:hidden flex items-center gap-2 px-4 py-2 text-sm border rounded transition-colors ${
              mobileFiltersOpen ? "bg-[var(--gold)] text-black border-[var(--gold)]" : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)]"
            }`}
          >
            <SlidersHorizontal size={15} />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-[var(--gold)] text-black text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-medium">
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
            <span className="flex items-center gap-1.5 px-3 py-1 text-xs bg-[var(--gold-tint)] text-[var(--gold)] rounded border border-[var(--gold)]/20">
              Search: {qParam}
              <button onClick={() => { setSearchInput(""); updateFilter("q", ""); }}><X size={12} /></button>
            </span>
          )}
          {categoryParam && (
            <span className="flex items-center gap-1.5 px-3 py-1 text-xs bg-[var(--gold-tint)] text-[var(--gold)] rounded border border-[var(--gold)]/20">
              {categoryParam === "Men" ? "For Him" : categoryParam === "Women" ? "For Her" : categoryParam}
              <button onClick={() => updateFilter("category", "")}><X size={12} /></button>
            </span>
          )}
          {seasonParam && (
            <span className="flex items-center gap-1.5 px-3 py-1 text-xs bg-[var(--gold-tint)] text-[var(--gold)] rounded border border-[var(--gold)]/20">
              {seasonParam}
              <button onClick={() => updateFilter("season", "")}><X size={12} /></button>
            </span>
          )}
          {brandParam && (
            <span className="flex items-center gap-1.5 px-3 py-1 text-xs bg-[var(--gold-tint)] text-[var(--gold)] rounded border border-[var(--gold)]/20">
              {brandParam}
              <button onClick={() => updateFilter("brand", "")}><X size={12} /></button>
            </span>
          )}
          {dealParam && (
            <span className="flex items-center gap-1.5 px-3 py-1 text-xs bg-[var(--gold-tint)] text-[var(--gold)] rounded border border-[var(--gold)]/20">
              Partial Deals
              <button onClick={() => updateFilter("deal", "")}><X size={12} /></button>
            </span>
          )}
          {bestSellerParam && (
            <span className="flex items-center gap-1.5 px-3 py-1 text-xs bg-[var(--gold-tint)] text-[var(--gold)] rounded border border-[var(--gold)]/20">
              Best Sellers
              <button onClick={() => updateFilter("bestSeller", "")}><X size={12} /></button>
            </span>
          )}
          {selectedNotes.map((note) => (
            <span key={note} className="flex items-center gap-1.5 px-3 py-1 text-xs bg-[var(--gold-tint)] text-[var(--gold)] rounded border border-[var(--gold)]/20">
              Note: {note}
              <button onClick={() => toggleNote(note)}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}

      {/* Mobile Filters Panel */}
      {mobileFiltersOpen && (
        <div className="lg:hidden mb-8 p-5 bg-[var(--bg-card)] border border-[var(--border)] rounded animate-fade-up">
          {filtersContent}
        </div>
      )}

      {/* Main Layout: Sidebar + Grid */}
      <div className="flex gap-8">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-64 flex-shrink-0">
          <div className="sticky top-24 bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
            <h2 className="text-xs uppercase tracking-[0.2em] text-[var(--gold)] mb-5 font-medium">Filters</h2>
            {filtersContent}
          </div>
        </aside>

        {/* Product Grid */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
              {[...Array(9)].map((_, i) => (
                <div key={i}>
                  <div className="skeleton aspect-[3/4] rounded" />
                  <div className="skeleton h-4 mt-3 rounded w-3/4" />
                  <div className="skeleton h-3 mt-2 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : filteredPerfumes.length === 0 ? (
            <div className="text-center py-20">
              <p className="font-serif text-2xl text-[var(--text-muted)]">No perfumes found</p>
              <p className="text-sm text-[var(--text-muted)] mt-2 mb-6">Try adjusting your search or filters</p>
              {hasFilters && (
                <button onClick={clearAll} className="text-sm text-[var(--gold)] hover:underline">Clear all filters</button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
              {filteredPerfumes.map((perfume, i) => (
                <div key={perfume.id} className="animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                  <PerfumeCard perfume={perfume} prices={priceMap[perfume.id]} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={
      <div className="px-[5%] py-10">
        <div className="flex gap-8">
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <div className="skeleton h-96 rounded" />
          </aside>
          <div className="flex-1">
            <div className="skeleton h-10 w-64 mb-8 rounded" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
              {[...Array(9)].map((_, i) => (
                <div key={i}>
                  <div className="skeleton aspect-[3/4] rounded" />
                  <div className="skeleton h-4 mt-3 rounded w-3/4" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    }>
      <ShopContent />
    </Suspense>
  );
}
