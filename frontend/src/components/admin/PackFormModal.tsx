"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Plus, Search, X, AlertTriangle } from "lucide-react";
import { toast } from "@/components/ui/Toaster";
import { PACK_MAX_COMPONENTS } from "@/types/pack";
import type { ComponentStatus, PackAdmin, PackDiscountType } from "@/types/pack";

interface PickerPerfume {
  id: string;
  name: string;
  brand: string;
  images?: string | string[];
  totalStockMl?: number;
}

interface DecantSize {
  id: string;
  ml: number;
  enabled: boolean;
}

interface PackFormState {
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
  sortOrder: string;
  decantSizeMl: number | "";
  perfumeIds: string[];
  discountType: PackDiscountType;
  discountValue: string;
}

const STATUS_LABEL: Record<ComponentStatus, string> = {
  available: "Available",
  low_stock: "Low stock",
  insufficient: "Insufficient stock",
  inactive: "Inactive",
  unavailable_size: "Unavailable size",
  missing: "Missing",
};

const STATUS_STYLE: Record<ComponentStatus, string> = {
  available: "bg-[rgba(74,222,128,0.1)] text-[var(--success)]",
  low_stock: "bg-[rgba(251,191,36,0.12)] text-[var(--warning)]",
  insufficient: "bg-[rgba(248,113,113,0.1)] text-[var(--error)]",
  inactive: "bg-[rgba(248,113,113,0.1)] text-[var(--error)]",
  unavailable_size: "bg-[rgba(248,113,113,0.1)] text-[var(--error)]",
  missing: "bg-[rgba(248,113,113,0.1)] text-[var(--error)]",
};

export const fmtBdt = (n: number) => `৳${Math.round(n).toLocaleString("en-BD")}`;

const labelClass = "text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block";
const inputClass =
  "w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/['`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function firstImage(raw?: string | string[]): string {
  if (!raw) return "";
  if (Array.isArray(raw)) return typeof raw[0] === "string" ? raw[0] : "";
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && typeof parsed[0] === "string" ? parsed[0] : "";
  } catch {
    return "";
  }
}

function initialState(pack: PackAdmin | null, nextSortOrder: number): PackFormState {
  if (!pack) {
    return {
      name: "",
      slug: "",
      description: "",
      isActive: true,
      sortOrder: String(nextSortOrder),
      decantSizeMl: "",
      perfumeIds: [],
      discountType: "percentage",
      discountValue: "10",
    };
  }
  return {
    name: pack.name,
    slug: pack.slug,
    description: pack.description,
    isActive: pack.isActive,
    sortOrder: String(pack.sortOrder),
    decantSizeMl: pack.decantSizeMl,
    perfumeIds: pack.items.map((i) => i.perfumeId),
    discountType: pack.discountType,
    discountValue: String(pack.discountValue),
  };
}

interface PackFormModalProps {
  /** null = create. */
  pack: PackAdmin | null;
  nextSortOrder: number;
  onClose: () => void;
  onSaved: () => void;
}

export default function PackFormModal({ pack, nextSortOrder, onClose, onSaved }: PackFormModalProps) {
  const [form, setForm] = useState<PackFormState>(() => initialState(pack, nextSortOrder));
  const [slugTouched, setSlugTouched] = useState(Boolean(pack));
  const [perfumes, setPerfumes] = useState<PickerPerfume[]>([]);
  const [sizes, setSizes] = useState<DecantSize[]>([]);
  const [priceMap, setPriceMap] = useState<Record<string, { ml: number; sellingPrice: number }[]>>({});
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<PackAdmin | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const previewSeq = useRef(0);

  const patch = useCallback((changes: Partial<PackFormState>) => setForm((prev) => ({ ...prev, ...changes })), []);

  // Catalog (active perfumes) + enabled decant sizes
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/perfumes?active=true").then((r) => r.json()),
      fetch("/api/decant-sizes").then((r) => r.json()),
    ])
      .then(([perfumeList, sizeList]) => {
        if (!active) return;
        if (Array.isArray(perfumeList)) setPerfumes(perfumeList);
        if (Array.isArray(sizeList)) {
          setSizes((sizeList as DecantSize[]).filter((s) => s.enabled).sort((a, b) => a.ml - b.ml));
        }
      })
      .catch(() => toast("Could not load perfumes or sizes", "error"));
    return () => {
      active = false;
    };
  }, []);

  // Current normal decant prices for the picker (public batch pricing, chunked to its 50-id cap)
  useEffect(() => {
    if (perfumes.length === 0) return;
    let active = true;
    const ids = perfumes.map((p) => p.id);
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
    Promise.all(
      chunks.map((chunk) =>
        fetch("/api/pricing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ perfumeIds: chunk }),
        }).then((r) => (r.ok ? r.json() : {})),
      ),
    )
      .then((results) => {
        if (!active) return;
        const merged: Record<string, { ml: number; sellingPrice: number }[]> = {};
        for (const result of results) {
          for (const [id, value] of Object.entries(result as Record<string, { prices?: { ml: number; sellingPrice: number }[] }>)) {
            merged[id] = value.prices || [];
          }
        }
        setPriceMap(merged);
      })
      .catch(() => {
        /* picker prices are informational; the preview below is authoritative */
      });
    return () => {
      active = false;
    };
  }, [perfumes]);

  // Live pricing preview (debounced; stale responses are dropped)
  const discountNumber = Number(form.discountValue);
  useEffect(() => {
    if (form.perfumeIds.length === 0 || !form.decantSizeMl) {
      setPreview(null);
      return;
    }
    const seq = ++previewSeq.current;
    setPreviewLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/packs/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            perfumeIds: form.perfumeIds,
            decantSizeMl: form.decantSizeMl,
            discountType: form.discountType,
            discountValue: Number.isFinite(discountNumber) ? discountNumber : 0,
          }),
        });
        if (seq !== previewSeq.current) return;
        setPreview(res.ok ? ((await res.json()) as PackAdmin) : null);
      } catch {
        if (seq === previewSeq.current) setPreview(null);
      } finally {
        if (seq === previewSeq.current) setPreviewLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [form.perfumeIds, form.decantSizeMl, form.discountType, discountNumber]);

  const perfumeById = useMemo(() => new Map(perfumes.map((p) => [p.id, p])), [perfumes]);

  const priceFor = useCallback(
    (perfumeId: string): number | null => {
      if (!form.decantSizeMl) return null;
      return priceMap[perfumeId]?.find((p) => p.ml === form.decantSizeMl)?.sellingPrice ?? null;
    },
    [form.decantSizeMl, priceMap],
  );

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return perfumes
      .filter((p) => !form.perfumeIds.includes(p.id))
      .filter((p) => !q || `${p.brand} ${p.name}`.toLowerCase().includes(q))
      .slice(0, 40);
  }, [perfumes, search, form.perfumeIds]);

  const addPerfume = (id: string) => {
    if (form.perfumeIds.length >= PACK_MAX_COMPONENTS) {
      toast(`A pack can contain at most ${PACK_MAX_COMPONENTS} perfumes`, "info");
      return;
    }
    if (form.perfumeIds.includes(id)) return;
    patch({ perfumeIds: [...form.perfumeIds, id] });
  };

  const removePerfume = (id: string) => patch({ perfumeIds: form.perfumeIds.filter((p) => p !== id) });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const errors: Record<string, string> = {};
    if (form.name.trim().length < 2) errors.name = "Pack name is required";
    if (!form.decantSizeMl) errors.decantSizeMl = "Choose a decant size";
    if (form.perfumeIds.length === 0) errors.perfumeIds = "Select at least one perfume";
    if (!Number.isFinite(discountNumber)) errors.discountValue = "Enter a discount value";
    else if (form.discountType === "percentage" && !(discountNumber > 0 && discountNumber <= 100)) {
      errors.discountValue = "Percentage must be above 0 and at most 100";
    } else if (form.discountType === "fixed" && discountNumber < 0) errors.discountValue = "Fixed discount cannot be negative";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast("Please fix the highlighted fields", "error");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(pack ? `/api/packs/${pack.id}` : "/api/packs", {
        method: pack ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          slug: form.slug.trim() || slugify(form.name),
          description: form.description.trim(),
          isActive: form.isActive,
          sortOrder: Number(form.sortOrder) || 0,
          decantSizeMl: form.decantSizeMl,
          perfumeIds: form.perfumeIds,
          discountType: form.discountType,
          discountValue: discountNumber,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const serverErrors: Record<string, string> = {};
        for (const err of (data?.errors || []) as { field: string; message: string }[]) {
          serverErrors[err.field] = err.message;
        }
        setFieldErrors(serverErrors);
        toast(data?.error || "Failed to save pack", "error");
        return;
      }
      toast(pack ? "Pack updated" : "Pack created", "success");
      onSaved();
    } catch {
      toast("Network error while saving the pack", "error");
    } finally {
      setSaving(false);
    }
  };

  const errorText = (field: string) =>
    fieldErrors[field] ? <p className="mt-1 text-xs text-[var(--error)]">{fieldErrors[field]}</p> : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <button type="button" aria-label="Close" className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative my-auto w-full max-w-5xl bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-5 sm:p-6 animate-fade-up"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-serif text-xl font-light">{pack ? `Edit ${pack.name}` : "Create Pack"}</h2>
          <button type="button" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="grid lg:grid-cols-[1.25fr_1fr] gap-6">
          {/* ── Left: configuration ───────────────────────── */}
          <div className="space-y-6">
            <section>
              <h3 className="text-[10px] uppercase tracking-[0.25em] text-[var(--gold)] mb-3">Basic information</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Pack name</label>
                  <input
                    className={inputClass}
                    value={form.name}
                    placeholder="Winter Pack"
                    onChange={(e) => {
                      const name = e.target.value;
                      patch({ name, ...(slugTouched ? {} : { slug: slugify(name) }) });
                    }}
                  />
                  {errorText("name")}
                </div>
                <div>
                  <label className={labelClass}>Slug</label>
                  <input
                    className={inputClass}
                    value={form.slug}
                    placeholder="winter-pack"
                    onChange={(e) => {
                      setSlugTouched(true);
                      patch({ slug: slugify(e.target.value) });
                    }}
                  />
                  {errorText("slug")}
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Description</label>
                  <textarea
                    className={`${inputClass} resize-none`}
                    rows={3}
                    value={form.description}
                    placeholder="Three rich fragrances for colder evenings."
                    onChange={(e) => patch({ description: e.target.value })}
                  />
                  {errorText("description")}
                </div>
                <div>
                  <label className={labelClass}>Display order</label>
                  <input
                    type="number"
                    className={inputClass}
                    value={form.sortOrder}
                    onChange={(e) => patch({ sortOrder: e.target.value })}
                  />
                  {errorText("sortOrder")}
                </div>
                <label className="flex items-center gap-2 text-sm self-end pb-2">
                  <input
                    type="checkbox"
                    className="accent-[var(--gold)]"
                    checked={form.isActive}
                    onChange={(e) => patch({ isActive: e.target.checked })}
                  />
                  Active (visible to customers)
                </label>
              </div>
            </section>

            <section>
              <h3 className="text-[10px] uppercase tracking-[0.25em] text-[var(--gold)] mb-3">Pack configuration</h3>
              <label className={labelClass}>Decant size (each perfume)</label>
              <div className="flex flex-wrap gap-2">
                {sizes.map((size) => (
                  <button
                    key={size.id}
                    type="button"
                    onClick={() => patch({ decantSizeMl: size.ml })}
                    className={`px-4 py-2 text-sm rounded border transition-colors ${
                      form.decantSizeMl === size.ml
                        ? "border-[var(--gold)] bg-[var(--gold-tint)] text-[var(--gold)]"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)]"
                    }`}
                  >
                    {size.ml}ml
                  </button>
                ))}
                {sizes.length === 0 ? <p className="text-xs text-[var(--text-muted)]">No enabled decant sizes found.</p> : null}
                {pack && form.decantSizeMl && !sizes.some((s) => s.ml === form.decantSizeMl) ? (
                  <span className="px-4 py-2 text-sm rounded border border-[var(--gold)] bg-[var(--gold-tint)] text-[var(--gold)]">
                    {form.decantSizeMl}ml (disabled)
                  </span>
                ) : null}
              </div>
              {errorText("decantSizeMl")}

              <label className={`${labelClass} mt-5`}>
                Perfumes ({form.perfumeIds.length}/{PACK_MAX_COMPONENTS})
              </label>
              {form.perfumeIds.length > 0 ? (
                <ul className="space-y-2 mb-3">
                  {form.perfumeIds.map((id) => {
                    const perfume = perfumeById.get(id);
                    const fromPreview = preview?.items.find((i) => i.perfumeId === id);
                    const fromPack = pack?.items.find((i) => i.perfumeId === id);
                    const price = priceFor(id) ?? fromPreview?.unitPrice ?? null;
                    const name = perfume?.name || fromPreview?.name || fromPack?.name || id;
                    const brand = perfume?.brand || fromPreview?.brand || fromPack?.brand || "";
                    const image = firstImage(perfume?.images) || fromPreview?.image || fromPack?.image || "";
                    return (
                      <li key={id} className="flex items-center gap-3 rounded border border-[var(--border)] bg-[var(--bg-card)] p-2">
                        <div className="relative w-10 h-10 rounded bg-[var(--bg-surface)] overflow-hidden flex-shrink-0">
                          {image ? <Image src={image} alt="" fill className="object-cover" sizes="40px" /> : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{name}</p>
                          <p className="text-[11px] text-[var(--text-muted)] truncate">
                            {brand}
                            {perfume?.totalStockMl !== undefined ? ` · ${perfume.totalStockMl}ml in stock` : ""}
                            {form.decantSizeMl ? ` · ${form.decantSizeMl}ml selected` : ""}
                          </p>
                        </div>
                        {price !== null ? <span className="font-serif text-sm text-[var(--gold)]">{fmtBdt(price)}</span> : null}
                        <button
                          type="button"
                          onClick={() => removePerfume(id)}
                          className="p-1.5 text-[var(--text-muted)] hover:text-[var(--error)]"
                          aria-label={`Remove ${name}`}
                        >
                          <X size={14} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {errorText("perfumeIds")}

              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  className={`${inputClass} pl-9`}
                  placeholder="Search perfumes by brand or name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <ul className="mt-2 max-h-56 overflow-y-auto rounded border border-[var(--border)] divide-y divide-[var(--border)]">
                {candidates.map((p) => {
                  const price = priceFor(p.id);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => addPerfume(p.id)}
                        disabled={form.perfumeIds.length >= PACK_MAX_COMPONENTS}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[var(--gold-tint)] transition-colors disabled:opacity-40"
                      >
                        <div className="relative w-9 h-9 rounded bg-[var(--bg-surface)] overflow-hidden flex-shrink-0">
                          {firstImage(p.images) ? <Image src={firstImage(p.images)} alt="" fill className="object-cover" sizes="36px" /> : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{p.name}</p>
                          <p className="text-[11px] text-[var(--text-muted)] truncate">
                            {p.brand} · {p.totalStockMl ?? 0}ml in stock
                          </p>
                        </div>
                        {price !== null ? <span className="text-xs text-[var(--text-secondary)]">{fmtBdt(price)}</span> : null}
                        <Plus size={14} className="text-[var(--gold)]" />
                      </button>
                    </li>
                  );
                })}
                {candidates.length === 0 ? (
                  <li className="px-3 py-4 text-center text-xs text-[var(--text-muted)]">
                    {perfumes.length === 0 ? "Loading perfumes…" : "No matching perfumes"}
                  </li>
                ) : null}
              </ul>
            </section>

            <section>
              <h3 className="text-[10px] uppercase tracking-[0.25em] text-[var(--gold)] mb-3">Discount</h3>
              <div className="inline-flex rounded border border-[var(--border)] overflow-hidden mb-3">
                {(["percentage", "fixed"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => patch({ discountType: type })}
                    className={`px-4 py-2 text-xs uppercase tracking-wider transition-colors ${
                      form.discountType === type
                        ? "bg-[var(--gold)] text-black"
                        : "text-[var(--text-secondary)] hover:bg-[var(--gold-tint)]"
                    }`}
                  >
                    {type === "percentage" ? "Percentage" : "Fixed BDT"}
                  </button>
                ))}
              </div>
              <div className="max-w-[220px] relative">
                <input
                  type="number"
                  min={0}
                  max={form.discountType === "percentage" ? 100 : undefined}
                  step="any"
                  className={`${inputClass} pr-10`}
                  value={form.discountValue}
                  onChange={(e) => patch({ discountValue: e.target.value })}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]">
                  {form.discountType === "percentage" ? "%" : "৳"}
                </span>
              </div>
              {errorText("discountValue")}
              {errorText("discountType")}
            </section>
          </div>

          {/* ── Right: live preview ───────────────────────── */}
          <aside className="lg:sticky lg:top-4 self-start">
            <div className="rounded border border-[var(--border-gold)] bg-[var(--bg-card)] p-4">
              <h3 className="text-[10px] uppercase tracking-[0.25em] text-[var(--gold)] mb-3">Current calculated price</h3>

              {!preview ? (
                <p className="text-sm text-[var(--text-muted)]">
                  {previewLoading ? "Calculating…" : "Choose a decant size and at least one perfume to see the price."}
                </p>
              ) : (
                <div className={previewLoading ? "opacity-60 transition-opacity" : "transition-opacity"}>
                  <ul className="space-y-2">
                    {preview.items.map((item) => (
                      <li key={item.perfumeId} className="flex items-start justify-between gap-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate">
                            {item.name} <span className="text-[var(--text-muted)]">{preview.decantSizeMl}ml</span>
                          </p>
                          <span className={`inline-block mt-0.5 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${STATUS_STYLE[item.status]}`}>
                            {STATUS_LABEL[item.status]} · {item.stockMl}ml
                          </span>
                        </div>
                        <span className="font-serif">{fmtBdt(item.unitPrice)}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="my-3 border-t border-[var(--border)]" />
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Original</span>
                      <span>{fmtBdt(preview.originalPrice)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-400">
                      <span>
                        {preview.discountType === "percentage" ? `${preview.discountValue}% discount` : "Fixed discount"}
                      </span>
                      <span>−{fmtBdt(preview.discountAmount)}</span>
                    </div>
                    <div className="flex items-baseline justify-between border-t border-[var(--border)] pt-2">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Customer pays</span>
                      <span className="font-serif text-2xl text-[var(--gold-light)]">{fmtBdt(preview.finalPrice)}</span>
                    </div>
                  </div>

                  <p className="mt-3 text-[11px] text-[var(--text-muted)]">Total cost of components: {fmtBdt(preview.totalCost)}</p>

                  {preview.warnings.length > 0 ? (
                    <ul className="mt-3 space-y-1.5">
                      {preview.warnings.map((warning) => (
                        <li
                          key={warning}
                          className="flex items-start gap-2 rounded border border-[rgba(251,191,36,0.35)] bg-[rgba(251,191,36,0.07)] px-2.5 py-2 text-xs text-[var(--warning)]"
                        >
                          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                          <span>{warning}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <p
                    className={`mt-3 text-xs ${preview.available ? "text-[var(--success)]" : "text-[var(--error)]"}`}
                  >
                    {preview.available
                      ? "Available to customers right now."
                      : "Not currently purchasable (see component status above). The pack stays configured."}
                  </p>
                </div>
              )}

              <p className="mt-4 border-t border-[var(--border)] pt-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
                <strong className="text-[var(--text-secondary)]">Note:</strong> Pack price is calculated from current
                perfume pricing at purchase time. It is not a fixed, stored price.
              </p>
            </div>
          </aside>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-[var(--border)] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs uppercase tracking-wider border border-[var(--border)] rounded text-[var(--text-secondary)] hover:border-[var(--gold)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 text-xs uppercase tracking-wider bg-[var(--gold)] text-black rounded font-medium hover:bg-[var(--gold-light)] transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : pack ? "Save changes" : "Create pack"}
          </button>
        </div>
      </form>
    </div>
  );
}
