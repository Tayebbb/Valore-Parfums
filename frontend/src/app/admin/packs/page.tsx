"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Boxes, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/Toaster";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import PackImage from "@/components/store/PackImage";
import PackFormModal, { fmtBdt } from "@/components/admin/PackFormModal";
import { packDiscountLabel } from "@/types/pack";
import type { ComponentStatus, PackAdmin } from "@/types/pack";

const STATUS_LABEL: Record<ComponentStatus, string> = {
  available: "Available",
  low_stock: "Low stock",
  insufficient: "Insufficient stock",
  inactive: "Inactive",
  unavailable_size: "Unavailable size",
  missing: "Missing",
};

const STATUS_DOT: Record<ComponentStatus, string> = {
  available: "bg-[var(--success)]",
  low_stock: "bg-[var(--warning)]",
  insufficient: "bg-[var(--error)]",
  inactive: "bg-[var(--error)]",
  unavailable_size: "bg-[var(--error)]",
  missing: "bg-[var(--error)]",
};

export default function AdminPacksPage() {
  const [packs, setPacks] = useState<PackAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PackAdmin | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PackAdmin | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/packs/admin", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (Array.isArray(data)) setPacks(data);
    } catch {
      toast("Could not load packs", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (pack: PackAdmin) => {
    setEditing(pack);
    setFormOpen(true);
  };

  const toggleActive = async (pack: PackAdmin) => {
    setBusyId(pack.id);
    // Optimistic, reverted on failure (same pattern as the inventory page)
    setPacks((prev) => prev.map((p) => (p.id === pack.id ? { ...p, isActive: !pack.isActive } : p)));
    try {
      const res = await fetch(`/api/packs/${pack.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !pack.isActive }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Failed to update pack");
      toast(pack.isActive ? "Pack deactivated" : "Pack activated", "success");
    } catch (error) {
      setPacks((prev) => prev.map((p) => (p.id === pack.id ? { ...p, isActive: pack.isActive } : p)));
      toast(error instanceof Error ? error.message : "Failed to update pack", "error");
    } finally {
      setBusyId(null);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= packs.length) return;
    const next = [...packs];
    [next[index], next[target]] = [next[target], next[index]];
    setPacks(next);
    try {
      const res = await fetch("/api/packs/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: next.map((p) => p.id) }),
      });
      if (!res.ok) throw new Error();
      load();
    } catch {
      toast("Could not save the new order", "error");
      load();
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const pack = deleteTarget;
    setDeleteTarget(null);
    setBusyId(pack.id);
    try {
      const res = await fetch(`/api/packs/${pack.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Failed to delete pack");
      toast("Pack deleted", "success");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to delete pack", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-light">Packs</h1>
          <div className="gold-line mt-3" />
          <p className="mt-3 max-w-xl text-xs text-[var(--text-muted)] leading-relaxed">
            Curated bundles of perfumes at one decant size. The pack price is always calculated from each perfume&apos;s
            current price, then the pack discount is applied — nothing here is a fixed price.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-[var(--gold)] text-black px-4 py-2 text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors flex-shrink-0"
        >
          <Plus size={16} /> Create Pack
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-32 rounded" />
          ))}
        </div>
      ) : packs.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-[var(--border)] rounded">
          <Boxes size={40} className="mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="font-serif text-2xl text-[var(--text-secondary)]">No packs yet</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Create your first curated pack, e.g. a Winter Pack.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {packs.map((pack, index) => (
            <li
              key={pack.id}
              className={`bg-[var(--bg-card)] border rounded p-4 transition-opacity ${
                pack.isActive ? "border-[var(--border)]" : "border-dashed border-[var(--border)] opacity-70"
              } ${busyId === pack.id ? "pointer-events-none opacity-60" : ""}`}
            >
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative w-full md:w-28 h-40 md:h-28 rounded overflow-hidden flex-shrink-0">
                  <PackImage images={pack.items.map((i) => i.image)} fallbackLetter={pack.name[0]} sizes="112px" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-serif text-xl">{pack.name}</h3>
                    <span
                      className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${
                        pack.isActive ? "bg-[rgba(74,222,128,0.1)] text-[var(--success)]" : "bg-[rgba(248,113,113,0.1)] text-[var(--error)]"
                      }`}
                    >
                      {pack.isActive ? "Active" : "Inactive"}
                    </span>
                    <span
                      className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${
                        pack.available ? "bg-[rgba(74,222,128,0.1)] text-[var(--success)]" : "bg-[rgba(251,191,36,0.12)] text-[var(--warning)]"
                      }`}
                    >
                      {pack.available ? "Purchasable" : "Currently unavailable"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    /packs/{pack.slug} · {pack.items.length} × {pack.decantSizeMl}ml · order {pack.sortOrder}
                  </p>

                  <ul className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-x-6 gap-y-1">
                    {pack.items.map((item) => (
                      <li key={item.perfumeId} className="flex items-center gap-2 text-sm min-w-0">
                        <span
                          className={`h-2 w-2 rounded-full flex-shrink-0 ${STATUS_DOT[item.status]}`}
                          title={`${STATUS_LABEL[item.status]} — ${item.stockMl}ml in stock`}
                        />
                        <span className="truncate">{item.name}</span>
                        <span className="ml-auto flex-shrink-0 text-xs text-[var(--text-muted)]">
                          {item.status === "available" ? "" : `${STATUS_LABEL[item.status]} · `}
                          {fmtBdt(item.unitPrice)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {pack.warnings.length > 0 ? (
                    <ul className="mt-3 space-y-1">
                      {pack.warnings.map((warning) => (
                        <li key={warning} className="flex items-start gap-1.5 text-xs text-[var(--warning)]">
                          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                          {warning}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="md:w-56 flex-shrink-0 rounded border border-[var(--border)] bg-[var(--bg-surface)] p-3 self-start">
                  <div className="flex justify-between text-xs text-[var(--text-muted)]">
                    <span>Original</span>
                    <span>{fmtBdt(pack.originalPrice)}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-emerald-400">
                    <span>{packDiscountLabel(pack.discountType, pack.discountValue)}</span>
                    <span>−{fmtBdt(pack.discountAmount)}</span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between border-t border-[var(--border)] pt-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Now</span>
                    <span className="font-serif text-xl text-[var(--gold-light)]">{fmtBdt(pack.finalPrice)}</span>
                  </div>
                  <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">Cost {fmtBdt(pack.totalCost)} · live price</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
                <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-[var(--gold)]"
                    checked={pack.isActive}
                    onChange={() => toggleActive(pack)}
                  />
                  Active
                </label>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="p-1.5 text-[var(--text-muted)] hover:text-[var(--gold)] disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    onClick={() => move(index, 1)}
                    disabled={index === packs.length - 1}
                    className="p-1.5 text-[var(--text-muted)] hover:text-[var(--gold)] disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    onClick={() => openEdit(pack)}
                    className="p-1.5 text-[var(--text-muted)] hover:text-[var(--gold)]"
                    aria-label={`Edit ${pack.name}`}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(pack)}
                    className="p-1.5 text-[var(--text-muted)] hover:text-[var(--error)]"
                    aria-label={`Delete ${pack.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {formOpen ? (
        <PackFormModal
          pack={editing}
          nextSortOrder={packs.length}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            load();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete pack?"
        message={`"${deleteTarget?.name ?? ""}" will be removed from the storefront. Perfumes and past orders are not affected — old orders keep their own record of this pack.`}
        confirmLabel="Delete pack"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
