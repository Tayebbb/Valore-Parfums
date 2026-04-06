"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/Toaster";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface DecantSize {
  id: string;
  ml: number;
  enabled: boolean;
}

export default function DecantSizesPage() {
  const [sizes, setSizes] = useState<DecantSize[]>([]);
  const [newMl, setNewMl] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = () =>
    fetch("/api/decant-sizes")
      .then((r) => r.json())
      .then(setSizes)
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const addSize = async () => {
    const ml = parseFloat(newMl);
    if (!ml || ml <= 0) return toast("Enter a valid ML value", "error");
    if (sizes.some((s) => s.ml === ml)) return toast("This size already exists", "error");

    await fetch("/api/decant-sizes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ml, enabled: true }),
    });
    setNewMl("");
    toast(`${ml}ml size added`, "success");
    load();
  };

  const toggleSize = async (id: string, enabled: boolean) => {
    await fetch(`/api/decant-sizes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    toast(enabled ? "Size enabled" : "Size disabled", "info");
    load();
  };

  const removeSize = async (id: string) => {
    await fetch(`/api/decant-sizes/${id}`, { method: "DELETE" });
    toast("Size removed", "success");
    load();
    setDeleteId(null);
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="font-serif text-3xl font-light">Decant Sizes</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Control available ML sizes for decants</p>
        <div className="gold-line mt-3" />
      </div>

      {/* Add new */}
      <div className="flex items-center gap-3">
        <input
          type="number"
          placeholder="Enter ML (e.g. 5)"
          value={newMl}
          onChange={(e) => setNewMl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addSize()}
          className="bg-[var(--bg-input)] border border-[var(--border)] rounded px-4 py-2.5 text-sm w-48 focus:border-[var(--gold)] focus:bg-[var(--gold-tint)] outline-none transition-colors"
        />
        <button
          onClick={addSize}
          className="flex items-center gap-2 bg-[var(--gold)] text-black px-4 py-2.5 text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors"
        >
          <Plus size={16} /> Add Size
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-14 rounded" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {sizes.map((size) => (
            <div
              key={size.id}
              className={`flex items-center justify-between bg-[var(--bg-card)] border border-[var(--border)] rounded px-5 py-3 transition-colors ${
                size.enabled ? "" : "opacity-50"
              }`}
            >
              <div className="flex items-center gap-4">
                <input
                  type="checkbox"
                  checked={size.enabled}
                  onChange={(e) => toggleSize(size.id, e.target.checked)}
                  className="w-4 h-4 accent-[var(--gold)]"
                />
                <span className="font-serif text-lg">{size.ml} ml</span>
              </div>
              <button
                onClick={() => setDeleteId(size.id)}
                className="text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {sizes.length === 0 && (
            <p className="text-center py-8 text-[var(--text-secondary)]">No sizes configured yet</p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Remove Decant Size"
        message="This will remove the decant size from available options."
        confirmLabel="Remove"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) void removeSize(deleteId);
        }}
      />
    </div>
  );
}
