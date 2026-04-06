"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "@/components/ui/Toaster";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface Bottle {
  id: string;
  ml: number;
  costPerBottle: number;
  availableCount: number;
  lowStockThreshold: number;
}

export default function BottlesPage() {
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ ml: 0, costPerBottle: 0, availableCount: 0, lowStockThreshold: 10 });

  const load = () =>
    fetch("/api/bottles")
      .then((r) => r.json())
      .then(setBottles)
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.ml) return toast("ML is required", "error");
    if (editId) {
      await fetch(`/api/bottles/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      toast("Bottle updated", "success");
    } else {
      await fetch("/api/bottles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      toast("Bottle added", "success");
    }
    setEditId(null);
    setForm({ ml: 0, costPerBottle: 0, availableCount: 0, lowStockThreshold: 10 });
    load();
  };

  const edit = (b: Bottle) => {
    setEditId(b.id);
    setForm({ ml: b.ml, costPerBottle: b.costPerBottle, availableCount: b.availableCount, lowStockThreshold: b.lowStockThreshold });
  };

  const remove = async (id: string) => {
    await fetch(`/api/bottles/${id}`, { method: "DELETE" });
    toast("Bottle removed", "success");
    load();
    setDeleteId(null);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-serif text-3xl font-light">Bottle Inventory</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Manage decant bottle availability and costs</p>
        <div className="gold-line mt-3" />
      </div>

      {/* Form */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">
          {editId ? "Edit Bottle" : "Add New Bottle"}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">ML Size</label>
            <input
              type="number"
              value={form.ml || ""}
              onChange={(e) => setForm({ ...form, ml: parseFloat(e.target.value) || 0 })}
              disabled={!!editId}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none disabled:opacity-50"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Cost/Bottle (BDT)</label>
            <input
              type="number"
              value={form.costPerBottle || ""}
              onChange={(e) => setForm({ ...form, costPerBottle: parseFloat(e.target.value) || 0 })}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Available Count</label>
            <input
              type="number"
              value={form.availableCount || ""}
              onChange={(e) => setForm({ ...form, availableCount: parseInt(e.target.value) || 0 })}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Low Stock Alert</label>
            <input
              type="number"
              value={form.lowStockThreshold || ""}
              onChange={(e) => setForm({ ...form, lowStockThreshold: parseInt(e.target.value) || 10 })}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <button
            onClick={save}
            className="bg-[var(--gold)] text-black px-5 py-2 text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors"
          >
            {editId ? "Update" : "Add"}
          </button>
          {editId && (
            <button
              onClick={() => { setEditId(null); setForm({ ml: 0, costPerBottle: 0, availableCount: 0, lowStockThreshold: 10 }); }}
              className="px-5 py-2 text-xs uppercase tracking-wider border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)] transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-14 rounded" />)}
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {bottles.map((b) => (
              <div key={b.id} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-serif text-lg">{b.ml} ml</p>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mt-1">Bottle Size</p>
                  </div>
                  <div className="text-right">
                    <p className="font-serif text-[var(--gold)]">{b.costPerBottle} BDT</p>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mt-1">Cost</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-[var(--border)] pt-3">
                  <span className="text-[var(--text-muted)]">Available</span>
                  <span className={`font-mono flex items-center gap-2 ${b.availableCount <= b.lowStockThreshold ? "text-[var(--warning)]" : ""}`}>
                    {b.availableCount <= b.lowStockThreshold && <AlertTriangle size={14} className="text-[var(--warning)]" />}
                    {b.availableCount}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
                  <button onClick={() => edit(b)} className="p-2 text-[var(--text-muted)] hover:text-[var(--gold)] transition-colors">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => setDeleteId(b.id)} className="p-2 text-[var(--text-muted)] hover:text-[var(--error)] transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <table className="hidden md:table w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Bottle Size</th>
                <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Cost (BDT)</th>
                <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Available</th>
                <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Actions</th>
              </tr>
            </thead>
            <tbody>
              {bottles.map((b) => (
                <tr key={b.id} className="border-b border-[var(--border)] hover:bg-[var(--gold-tint)] transition-colors">
                  <td className="py-3 px-4 font-serif text-base">{b.ml} ml</td>
                  <td className="py-3 px-4 text-right font-serif text-[var(--gold)]">{b.costPerBottle} BDT</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {b.availableCount <= b.lowStockThreshold && (
                        <AlertTriangle size={14} className="text-[var(--warning)]" />
                      )}
                      <span className={`font-mono ${b.availableCount <= b.lowStockThreshold ? "text-[var(--warning)]" : ""}`}>
                        {b.availableCount}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => edit(b)} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--gold)] transition-colors">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => setDeleteId(b.id)} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--error)] transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete Bottle Entry"
        message="This will permanently remove the bottle entry from inventory."
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) void remove(deleteId);
        }}
      />
    </div>
  );
}
