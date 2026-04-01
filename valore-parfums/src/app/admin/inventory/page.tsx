"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Search, X } from "lucide-react";
import { toast } from "@/components/ui/Toaster";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface FragranceNotes {
  top: string[];
  middle: string[];
  base: string[];
  all?: string[];
}

interface FragranceNoteIds {
  top: string[];
  middle: string[];
  base: string[];
  all?: string[];
}

interface NotesLibraryNote {
  id: string;
  label: string;
  categoryId?: string;
  categoryLabel?: string;
}

interface NotesLibraryPayload {
  categories: Array<{ id: string; label: string }>;
  notes: NotesLibraryNote[];
  noteLabels: string[];
}

interface Perfume {
  id: string;
  name: string;
  brand: string;
  inspiredBy: string;
  description: string;
  category: string;
  images: string;
  marketPricePerMl: number;
  purchasePricePerMl: number;
  totalStockMl: number;
  lowStockThreshold: number;
  season: string;
  isBestSeller: boolean;
  isActive: boolean;
  owner: string;
  isPersonalCollection: boolean;
  fragranceNotes?: FragranceNotes;
  fragranceNoteIds?: FragranceNoteIds;
}

interface PerfumeForm {
  name: string;
  brand: string;
  inspiredBy: string;
  description: string;
  category: string;
  images: string;
  marketPricePerMl: number;
  purchasePricePerMl: number;
  lowStockThreshold: number;
  season: string;
  isBestSeller: boolean;
  isActive: boolean;
  owner: string;
  isPersonalCollection: boolean;
  fragranceNotes: FragranceNotes;
  fragranceNoteIds: FragranceNoteIds;
  bottleSizeMl: number;
  marketPriceWhole: number;
  purchasePriceWhole: number;
}

const categories = ["Men", "Women", "Unisex", "Oud", "Premium", "Budget"];

const seasons = ["Summer", "Winter", "Spring", "Fall", ""];

const owners = ["Store", "Tayeb", "Enid"];

const emptyNotes: FragranceNotes = { top: [], middle: [], base: [], all: [] };
const emptyNoteIds: FragranceNoteIds = { top: [], middle: [], base: [], all: [] };

function createEmptyPerfumeForm(): PerfumeForm {
  return {
    name: "",
    brand: "",
    inspiredBy: "",
    description: "",
    category: "Unisex",
    images: "[]",
    marketPricePerMl: 0,
    purchasePricePerMl: 0,
    lowStockThreshold: 20,
    season: "",
    isBestSeller: false,
    isActive: true,
    owner: "Store",
    isPersonalCollection: false,
    fragranceNotes: { ...emptyNotes, top: [], middle: [], base: [], all: [] },
    fragranceNoteIds: { ...emptyNoteIds, top: [], middle: [], base: [], all: [] },
    // UI-only fields
    bottleSizeMl: 0,
    marketPriceWhole: 0,
    purchasePriceWhole: 0,
  };
}

function normalizeImages(images: string): string {
  if (!images?.trim()) return "[]";
  try {
    const parsed = JSON.parse(images);
    if (Array.isArray(parsed)) {
      return JSON.stringify(parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0));
    }
  } catch {
    // legacy single URL string support
  }
  return JSON.stringify([images.trim()]);
}

function useDebouncedValue<T>(value: T, delayMs = 120): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debounced;
}

function NoteGroupSelector({
  label,
  selectedIds,
  selectedLabels,
  visibleNotes,
  rawSearch,
  onSearchChange,
  onToggle,
  onRemove,
}: {
  label: string;
  selectedIds: string[];
  selectedLabels: string[];
  visibleNotes: NotesLibraryNote[];
  rawSearch: string;
  onSearchChange: (value: string) => void;
  onToggle: (noteId: string) => void;
  onRemove: (noteId: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">{label}</label>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          type="text"
          value={rawSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={`Search ${label.toLowerCase()}...`}
          className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded pl-10 pr-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--gold)] focus:bg-[var(--gold-tint)] outline-none transition-colors"
        />
      </div>
      <div className="max-h-52 overflow-y-auto rounded border border-[var(--border)] bg-[var(--bg-input)] p-2">
        <div className="flex flex-wrap gap-1.5">
          {visibleNotes.map((note) => {
            const active = selectedIds.includes(note.id);
            return (
              <button
                key={note.id}
                type="button"
                onClick={() => onToggle(note.id)}
                className={`px-2 py-1 rounded text-[10px] uppercase tracking-wider transition-colors border ${
                  active
                    ? "bg-[var(--gold)] text-black border-[var(--gold)]"
                    : "text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--gold)] hover:text-[var(--text-primary)]"
                }`}
              >
                {note.label}
              </button>
            );
          })}
        </div>
        {visibleNotes.length === 0 && (
          <p className="text-xs text-[var(--text-muted)] px-1 py-2">No matching notes found.</p>
        )}
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        Showing {visibleNotes.length} note{visibleNotes.length === 1 ? "" : "s"} · Selected {selectedIds.length}
      </p>
      <div className="flex flex-wrap gap-1.5 min-h-6">
        {selectedIds.length > 0 ? selectedIds.map((noteId, index) => (
          <button
            key={`selected-note-${noteId}`}
            type="button"
            onClick={() => onRemove(noteId)}
            className="text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-[var(--border-gold)] text-[var(--gold)] bg-[var(--gold-tint)] hover:bg-[var(--gold)] hover:text-black transition-colors"
            title="Remove note"
          >
            {selectedLabels[index] || noteId}
          </button>
        )) : <span className="text-xs text-[var(--text-muted)]">No notes selected</span>}
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const [perfumes, setPerfumes] = useState<Perfume[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Perfume | null>(null);
  const [form, setForm] = useState<PerfumeForm>(createEmptyPerfumeForm);
  const [search, setSearch] = useState("");
  const [notesLibrary, setNotesLibrary] = useState<NotesLibraryPayload>({ categories: [], notes: [], noteLabels: [] });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [noteSearchTop, setNoteSearchTop] = useState("");
  const [noteSearchMiddle, setNoteSearchMiddle] = useState("");
  const [noteSearchBase, setNoteSearchBase] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const debouncedNoteSearchTop = useDebouncedValue(noteSearchTop, 120);
  const debouncedNoteSearchMiddle = useDebouncedValue(noteSearchMiddle, 120);
  const debouncedNoteSearchBase = useDebouncedValue(noteSearchBase, 120);

  const load = () =>
    fetch("/api/perfumes")
      .then((r) => r.json())
      .then(setPerfumes)
      .finally(() => setLoading(false));

  const loadNotesLibrary = () =>
    fetch("/api/notes-library")
      .then((r) => r.json())
      .then((data) => {
        const sortedNotes = Array.isArray(data?.notes)
          ? [...data.notes].sort((a, b) => String(a?.label || "").localeCompare(String(b?.label || "")))
          : [];
        setNotesLibrary({
          categories: Array.isArray(data?.categories) ? data.categories : [],
          notes: sortedNotes,
          noteLabels: sortedNotes.map((note) => note.label),
        });
      });

  useEffect(() => {
    load();
    loadNotesLibrary();
  }, []);

  const noteById = useMemo(
    () => Object.fromEntries(notesLibrary.notes.map((note) => [note.id, note])) as Record<string, NotesLibraryNote>,
    [notesLibrary.notes],
  );

  const noteIdByLowerLabel = useMemo(
    () => new Map(notesLibrary.notes.map((note) => [note.label.toLowerCase(), note.id])),
    [notesLibrary.notes],
  );

  const noteLabel = useCallback((id: string) => noteById[id]?.label || id, [noteById]);
  const noteIdByLabel = useCallback((label: string) => noteIdByLowerLabel.get(label.toLowerCase()) || "", [noteIdByLowerLabel]);

  const sortNoteIdsByLabel = useCallback(
    (ids: string[]) => [...ids].sort((a, b) => noteLabel(a).localeCompare(noteLabel(b))),
    [noteLabel],
  );

  const filterNotes = useCallback((query: string) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return notesLibrary.notes;
    return notesLibrary.notes.filter((note) => note.label.toLowerCase().includes(normalized));
  }, [notesLibrary.notes]);

  const visibleTopNotes = useMemo(() => {
    return filterNotes(debouncedNoteSearchTop);
  }, [debouncedNoteSearchTop, filterNotes]);

  const visibleMiddleNotes = useMemo(() => {
    return filterNotes(debouncedNoteSearchMiddle);
  }, [debouncedNoteSearchMiddle, filterNotes]);

  const visibleBaseNotes = useMemo(() => {
    return filterNotes(debouncedNoteSearchBase);
  }, [debouncedNoteSearchBase, filterNotes]);

  const uniqueSortedByLabel = useCallback((ids: string[]) => {
    const unique = Array.from(new Set(ids));
    return sortNoteIdsByLabel(unique);
  }, [sortNoteIdsByLabel]);

  const openNew = () => {
    setEditing(null);
    setForm(createEmptyPerfumeForm());
    setNoteSearchTop("");
    setNoteSearchMiddle("");
    setNoteSearchBase("");
    setShowModal(true);
  };

  const openEdit = (p: Perfume) => {
    const stockMl = Number(p.totalStockMl || 0);
    const bottleSizeMl = stockMl > 0 ? stockMl : 0;
    const marketPricePerMl = Number(p.marketPricePerMl || 0);
    const purchasePricePerMl = Number(p.purchasePricePerMl || 0);

    const topIds = uniqueSortedByLabel(p.fragranceNoteIds?.top || (p.fragranceNotes?.top || []).map(noteIdByLabel).filter(Boolean));
    const middleIds = uniqueSortedByLabel(p.fragranceNoteIds?.middle || (p.fragranceNotes?.middle || []).map(noteIdByLabel).filter(Boolean));
    const baseIds = uniqueSortedByLabel(p.fragranceNoteIds?.base || (p.fragranceNotes?.base || []).map(noteIdByLabel).filter(Boolean));

    const fallbackAll = uniqueSortedByLabel(p.fragranceNoteIds?.all || (p.fragranceNotes?.all || []).map(noteIdByLabel).filter(Boolean));
    const normalizedTop = topIds.length > 0 ? topIds : fallbackAll;
    const allIds = uniqueSortedByLabel([...normalizedTop, ...middleIds, ...baseIds]);

    setEditing(p);
    setForm({
      name: p.name || "",
      brand: p.brand || "",
      inspiredBy: p.inspiredBy || "",
      description: p.description || "",
      category: p.category || "Unisex",
      images: normalizeImages(p.images || "[]"),
      marketPricePerMl,
      purchasePricePerMl,
      lowStockThreshold: Number(p.lowStockThreshold || 20),
      season: p.season || "",
      isBestSeller: p.isBestSeller || false,
      isActive: p.isActive !== false,
      owner: p.owner || "Store",
      isPersonalCollection: p.isPersonalCollection || false,
      fragranceNoteIds: {
        top: normalizedTop,
        middle: middleIds,
        base: baseIds,
        all: allIds,
      },
      fragranceNotes: {
        top: normalizedTop.map(noteLabel),
        middle: middleIds.map(noteLabel),
        base: baseIds.map(noteLabel),
        all: allIds.map(noteLabel),
      },
      bottleSizeMl,
      marketPriceWhole: bottleSizeMl > 0 ? Number((marketPricePerMl * bottleSizeMl).toFixed(2)) : 0,
      purchasePriceWhole: bottleSizeMl > 0 ? Number((purchasePricePerMl * bottleSizeMl).toFixed(2)) : 0,
    });
    setNoteSearchTop("");
    setNoteSearchMiddle("");
    setNoteSearchBase("");
    setShowModal(true);
  };

  useEffect(() => {
    if (!editing || notesLibrary.notes.length === 0) return;
    const hasAnyIds = (form.fragranceNoteIds?.top?.length || 0) + (form.fragranceNoteIds?.middle?.length || 0) + (form.fragranceNoteIds?.base?.length || 0) > 0;
    if (hasAnyIds) return;

    const top = uniqueSortedByLabel([
      ...(form.fragranceNoteIds?.top || []),
      ...(form.fragranceNotes?.top || []).map(noteIdByLabel).filter(Boolean),
      ...(form.fragranceNotes?.all || []).map(noteIdByLabel).filter(Boolean),
    ]);
    const middle = uniqueSortedByLabel([
      ...(form.fragranceNoteIds?.middle || []),
      ...(form.fragranceNotes?.middle || []).map(noteIdByLabel).filter(Boolean),
    ]);
    const base = uniqueSortedByLabel([
      ...(form.fragranceNoteIds?.base || []),
      ...(form.fragranceNotes?.base || []).map(noteIdByLabel).filter(Boolean),
    ]);
    const all = uniqueSortedByLabel([...top, ...middle, ...base]);
    if (all.length === 0) return;

    setForm((prev) => ({
      ...prev,
      fragranceNoteIds: { top, middle, base, all },
      fragranceNotes: {
        top: top.map(noteLabel),
        middle: middle.map(noteLabel),
        base: base.map(noteLabel),
        all: all.map(noteLabel),
      },
    }));
  }, [editing, form.fragranceNoteIds?.base, form.fragranceNoteIds?.base?.length, form.fragranceNoteIds?.middle, form.fragranceNoteIds?.middle?.length, form.fragranceNoteIds?.top, form.fragranceNoteIds?.top?.length, form.fragranceNotes?.all, form.fragranceNotes?.base, form.fragranceNotes?.middle, form.fragranceNotes?.top, noteIdByLabel, noteLabel, notesLibrary.notes.length, uniqueSortedByLabel]);

  const save = async () => {
    if (!form.name) return toast("Name is required", "error");

    try {
      // Build the payload — strip UI-only fields
      const { bottleSizeMl, marketPriceWhole, purchasePriceWhole, ...payload } = form;
      // Auto-compute per-ML if whole bottle fields filled
      if (bottleSizeMl > 0 && marketPriceWhole > 0) {
        payload.marketPricePerMl = parseFloat((marketPriceWhole / bottleSizeMl).toFixed(2));
      }
      if (bottleSizeMl > 0 && purchasePriceWhole > 0) {
        payload.purchasePricePerMl = parseFloat((purchasePriceWhole / bottleSizeMl).toFixed(2));
      }

      // Total stock = bottle size (N/A = 0)
      const effectiveBottleSize = bottleSizeMl > 0 ? bottleSizeMl : 0;
      (payload as Record<string, unknown>).totalStockMl = effectiveBottleSize;

      let res: Response;
      if (editing) {
        res = await fetch(`/api/perfumes/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/perfumes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `Server error (${res.status})`);
      }

      toast(editing ? "Perfume updated" : "Perfume added", "success");
      setShowModal(false);
      load();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast(message, "error");
    }
  };

  const toggleNote = (group: "top" | "middle" | "base", noteId: string) => {
    const current = form.fragranceNoteIds?.[group] || [];
    const next = current.includes(noteId)
      ? current.filter((id) => id !== noteId)
      : [...current, noteId];

    const top = group === "top" ? uniqueSortedByLabel(next) : uniqueSortedByLabel(form.fragranceNoteIds?.top || []);
    const middle = group === "middle" ? uniqueSortedByLabel(next) : uniqueSortedByLabel(form.fragranceNoteIds?.middle || []);
    const base = group === "base" ? uniqueSortedByLabel(next) : uniqueSortedByLabel(form.fragranceNoteIds?.base || []);
    const all = uniqueSortedByLabel([...top, ...middle, ...base]);

    setForm((prev) => ({
      ...prev,
      fragranceNoteIds: {
        top,
        middle,
        base,
        all,
      },
      fragranceNotes: {
        top: top.map(noteLabel),
        middle: middle.map(noteLabel),
        base: base.map(noteLabel),
        all: all.map(noteLabel),
      },
    }));
  };

  const uploadPngImage = async (file: File | null) => {
    if (!file) return;
    const fileType = (file.type || "").toLowerCase();
    const looksLikePng = /\.png$/i.test(file.name);
    if (fileType && fileType !== "image/png" && fileType !== "image/x-png" && !looksLikePng) {
      toast("Please upload a PNG file", "error");
      return;
    }

    try {
      setUploadingImage(true);
      const data = new FormData();
      data.append("file", file);
      const res = await fetch("/api/uploads/perfume-image", { method: "POST", body: data });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Image upload failed");

      setForm((prev) => ({ ...prev, images: JSON.stringify([json.imageUrl]) }));
      toast("Image uploaded and optimized", "success");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Image upload failed";
      toast(message, "error");
    } finally {
      setUploadingImage(false);
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/perfumes/${id}`, { method: "DELETE" });
    toast("Perfume deleted", "success");
    load();
    setDeleteId(null);
  };

  const filtered = perfumes.filter(
    (p) =>
      (p.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.brand || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.inspiredBy || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-light">Inventory</h1>
          <div className="gold-line mt-3" />
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-[var(--gold)] text-black px-4 py-2 text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors"
        >
          <Plus size={16} /> Add Perfume
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          type="text"
          placeholder="Search perfumes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded pl-10 pr-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--gold)] focus:bg-[var(--gold-tint)] outline-none transition-colors"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-14 rounded" />)}
        </div>
      ) : (
        <div>
          <div className="space-y-3 md:hidden">
            {filtered.map((p) => (
              <div key={p.id} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-serif text-base">{p.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{p.brand}</p>
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${p.isActive ? "bg-[rgba(74,222,128,0.1)] text-[var(--success)]" : "bg-[rgba(248,113,113,0.1)] text-[var(--error)]"}`}>
                    {p.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-[var(--bg-card)] rounded p-3 border border-[var(--border)]">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">Inspired By</p>
                    <p className="text-[var(--text-secondary)]">{p.inspiredBy || "—"}</p>
                  </div>
                  <div className="bg-[var(--bg-card)] rounded p-3 border border-[var(--border)] text-right">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">Price/ml</p>
                    <p className="font-serif text-[var(--gold)]">{p.marketPricePerMl}</p>
                  </div>
                  <div className="bg-[var(--bg-card)] rounded p-3 border border-[var(--border)]">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">Category</p>
                    <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-[var(--border-gold)] text-[var(--gold)] inline-flex">
                      {p.category}
                    </span>
                  </div>
                  <div className="bg-[var(--bg-card)] rounded p-3 border border-[var(--border)] text-right">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">Stock</p>
                    <p className={`font-mono ${p.totalStockMl <= p.lowStockThreshold ? "text-[var(--error)]" : ""}`}>{p.totalStockMl} ml</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm border-t border-[var(--border)] pt-3">
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${p.owner === "Store" ? "border-[var(--border)] text-[var(--text-muted)]" : "border-[var(--border-gold)] text-[var(--gold)]"}`}>
                    {p.owner || "Store"}{p.isPersonalCollection ? " · PC" : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(p)} className="p-2 text-[var(--text-muted)] hover:text-[var(--gold)] transition-colors">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => setDeleteId(p.id)} className="p-2 text-[var(--text-muted)] hover:text-[var(--error)] transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Name</th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Inspired By</th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Category</th>
                  <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Price/ml</th>
                  <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Stock (ml)</th>
                  <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Owner</th>
                  <th className="text-center py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Status</th>
                  <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--border)] hover:bg-[var(--gold-tint)] transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-serif text-base">{p.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{p.brand}</p>
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">{p.inspiredBy || "—"}</td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-[var(--border-gold)] text-[var(--gold)]">
                        {p.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-serif text-[var(--gold)]">{p.marketPricePerMl}</td>
                    <td className="py-3 px-4 text-right font-mono">
                      <span className={p.totalStockMl <= p.lowStockThreshold ? "text-[var(--error)]" : ""}>
                        {p.totalStockMl}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${p.owner === "Store" ? "border-[var(--border)] text-[var(--text-muted)]" : "border-[var(--border-gold)] text-[var(--gold)]"}`}>
                        {p.owner || "Store"}{p.isPersonalCollection ? " · PC" : ""}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${p.isActive ? "bg-[rgba(74,222,128,0.1)] text-[var(--success)]" : "bg-[rgba(248,113,113,0.1)] text-[var(--error)]"}`}>
                        {p.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(p)} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--gold)] transition-colors">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => setDeleteId(p.id)} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--error)] transition-colors">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-12 text-[var(--text-secondary)]">
                {search ? "No perfumes match your search" : "No perfumes yet. Add your first one!"}
              </div>
            )}
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-[var(--text-secondary)] md:hidden">
              {search ? "No perfumes match your search" : "No perfumes yet. Add your first one!"}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete Perfume"
        message="This will permanently remove the perfume entry and its inventory data."
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) void remove(deleteId);
        }}
      />

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 animate-fade-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-serif text-xl font-light">{editing ? "Edit Perfume" : "Add New Perfume"}</h2>
              <button onClick={() => setShowModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Perfume Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] focus:bg-[var(--gold-tint)] outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Brand</label>
                <input
                  type="text"
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] focus:bg-[var(--gold-tint)] outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Inspired By</label>
                <input
                  type="text"
                  value={form.inspiredBy}
                  onChange={(e) => setForm({ ...form, inspiredBy: e.target.value })}
                  placeholder="e.g. Stronger With You Leather"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm placeholder:text-[var(--text-muted)] focus:border-[var(--gold)] focus:bg-[var(--gold-tint)] outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] outline-none"
                >
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Market Price (Full Bottle BDT)</label>
                <input
                  type="number"
                  value={form.marketPriceWhole || ""}
                  onChange={(e) => {
                    const whole = e.target.value === "" ? 0 : parseFloat(e.target.value);
                    const perMl = form.bottleSizeMl > 0 ? parseFloat((whole / form.bottleSizeMl).toFixed(2)) : 0;
                    setForm({ ...form, marketPriceWhole: whole, marketPricePerMl: perMl });
                  }}
                  placeholder="e.g. 18000"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] focus:bg-[var(--gold-tint)] outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Purchase Price (Full Bottle BDT)</label>
                <input
                  type="number"
                  value={form.purchasePriceWhole || ""}
                  onChange={(e) => {
                    const whole = e.target.value === "" ? 0 : parseFloat(e.target.value);
                    const perMl = form.bottleSizeMl > 0 ? parseFloat((whole / form.bottleSizeMl).toFixed(2)) : 0;
                    setForm({ ...form, purchasePriceWhole: whole, purchasePricePerMl: perMl });
                  }}
                  placeholder="e.g. 5000"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] focus:bg-[var(--gold-tint)] outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Bottle Size (ML)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={form.bottleSizeMl || ""}
                    disabled={form.bottleSizeMl === -1}
                    onChange={(e) => {
                      const ml = e.target.value === "" ? 0 : parseFloat(e.target.value);
                      const mktPerMl = ml > 0 && form.marketPriceWhole > 0 ? parseFloat((form.marketPriceWhole / ml).toFixed(2)) : form.marketPricePerMl;
                      const purPerMl = ml > 0 && form.purchasePriceWhole > 0 ? parseFloat((form.purchasePriceWhole / ml).toFixed(2)) : form.purchasePricePerMl;
                      setForm({ ...form, bottleSizeMl: ml, marketPricePerMl: mktPerMl, purchasePricePerMl: purPerMl });
                    }}
                    placeholder={form.bottleSizeMl === -1 ? "N/A" : "e.g. 100"}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] focus:bg-[var(--gold-tint)] outline-none transition-colors disabled:opacity-50"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] whitespace-nowrap cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.bottleSizeMl === -1}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setForm({ ...form, bottleSizeMl: -1 });
                        } else {
                          setForm({ ...form, bottleSizeMl: 0 });
                        }
                      }}
                      className="w-3.5 h-3.5 accent-[var(--gold)]"
                    />
                    N/A
                  </label>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Total Stock: <strong className="text-[var(--gold)]">{form.bottleSizeMl > 0 ? `${form.bottleSizeMl} ml` : "—"}</strong>
                </p>
              </div>
              {/* Auto-calculated per-ML display */}
              <div className="md:col-span-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">Auto-Calculated per ML</p>
                <div className="flex gap-6 text-sm">
                  <span className="text-[var(--text-secondary)]">
                    Market: <strong className="text-[var(--gold)]">{form.marketPricePerMl ? `${form.marketPricePerMl} BDT/ml` : "—"}</strong>
                  </span>
                  <span className="text-[var(--text-secondary)]">
                    Purchase: <strong className="text-[var(--gold)]">{form.purchasePricePerMl ? `${form.purchasePricePerMl} BDT/ml` : "—"}</strong>
                  </span>
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Season</label>
                <select
                  value={form.season}
                  onChange={(e) => setForm({ ...form, season: e.target.value })}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] outline-none"
                >
                  <option value="">No Season</option>
                  {seasons.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Owner</label>
                <select
                  value={form.owner}
                  onChange={(e) => setForm({ ...form, owner: e.target.value })}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] outline-none"
                >
                  {owners.map((o) => <option key={o} value={o}>{o === "Store" ? "Store (Platform)" : o}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Low Stock Threshold (ml)</label>
                <input
                  type="number"
                  value={form.lowStockThreshold || ""}
                  onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] focus:bg-[var(--gold-tint)] outline-none transition-colors"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Perfume Image (PNG)</label>
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/png,.png"
                    onChange={(e) => uploadPngImage(e.target.files?.[0] || null)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm file:mr-3 file:rounded file:border-0 file:bg-[var(--gold)] file:px-3 file:py-1 file:text-xs file:uppercase file:tracking-wider file:text-black"
                  />
                  <p className="text-xs text-[var(--text-muted)]">
                    Upload PNG only. The image is auto-processed with a premium neutral backdrop and compressed for fast loading.
                  </p>
                  {uploadingImage && <p className="text-xs text-[var(--gold)]">Processing image...</p>}
                  {(() => {
                    try {
                      const current = JSON.parse(form.images || "[]") as string[];
                      if (!current[0]) return null;
                      return (
                        <p className="text-xs text-[var(--text-secondary)] truncate">
                          Current image: {current[0]}
                        </p>
                      );
                    } catch {
                      return null;
                    }
                  })()}
                </div>
              </div>
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                <NoteGroupSelector
                  label="Top Notes"
                  selectedIds={form.fragranceNoteIds?.top || []}
                  selectedLabels={form.fragranceNotes?.top || []}
                  visibleNotes={visibleTopNotes}
                  rawSearch={noteSearchTop}
                  onSearchChange={setNoteSearchTop}
                  onToggle={(noteId) => toggleNote("top", noteId)}
                  onRemove={(noteId) => toggleNote("top", noteId)}
                />
                <NoteGroupSelector
                  label="Middle Notes"
                  selectedIds={form.fragranceNoteIds?.middle || []}
                  selectedLabels={form.fragranceNotes?.middle || []}
                  visibleNotes={visibleMiddleNotes}
                  rawSearch={noteSearchMiddle}
                  onSearchChange={setNoteSearchMiddle}
                  onToggle={(noteId) => toggleNote("middle", noteId)}
                  onRemove={(noteId) => toggleNote("middle", noteId)}
                />
                <NoteGroupSelector
                  label="Base Notes"
                  selectedIds={form.fragranceNoteIds?.base || []}
                  selectedLabels={form.fragranceNotes?.base || []}
                  visibleNotes={visibleBaseNotes}
                  rawSearch={noteSearchBase}
                  onSearchChange={setNoteSearchBase}
                  onToggle={(noteId) => toggleNote("base", noteId)}
                  onRemove={(noteId) => toggleNote("base", noteId)}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2.5 text-sm focus:border-[var(--gold)] focus:bg-[var(--gold-tint)] outline-none resize-none transition-colors"
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.isBestSeller}
                  onChange={(e) => setForm({ ...form, isBestSeller: e.target.checked })}
                  className="w-4 h-4 accent-[var(--gold)]"
                />
                <label className="text-sm text-[var(--text-secondary)]">Best Seller</label>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.isPersonalCollection}
                  onChange={(e) => setForm({ ...form, isPersonalCollection: e.target.checked })}
                  className="w-4 h-4 accent-[var(--gold)]"
                />
                <label className="text-sm text-[var(--text-secondary)]">Personal Collection</label>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="w-4 h-4 accent-[var(--gold)]"
                />
                <label className="text-sm text-[var(--text-secondary)]">Active (visible in store)</label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-[var(--border)]">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-xs uppercase tracking-wider border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--gold)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={save}
                className="px-6 py-2 bg-[var(--gold)] text-black text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors"
              >
                {editing ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
