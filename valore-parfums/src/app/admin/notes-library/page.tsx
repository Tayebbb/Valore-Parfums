"use client";

import { useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { toast } from "@/components/ui/Toaster";

interface NotesLibraryCategory {
  id: string;
  label: string;
  emphasis?: "high" | "trending" | "core";
  notes: string[];
}

export default function NotesLibraryPage() {
  const [categories, setCategories] = useState<NotesLibraryCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/notes-library")
      .then((r) => r.json())
      .then((data) => setCategories(Array.isArray(data?.categories) ? data.categories : []))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    try {
      setSaving(true);
      const res = await fetch("/api/notes-library", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync-canonical" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to save notes library");
      setCategories(Array.isArray(data?.categories) ? data.categories : categories);
      toast("Canonical notes library synced", "success");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to save notes library";
      toast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-light">Notes Library</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Preloaded canonical fragrance note taxonomy for consistent, scalable perfume data.
          </p>
          <div className="gold-line mt-3" />
        </div>
        <button
          onClick={save}
          disabled={saving || loading}
          className="flex items-center gap-2 bg-[var(--gold)] text-black px-4 py-2 text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors disabled:opacity-60"
        >
          <RefreshCcw size={14} /> {saving ? "Syncing..." : "Sync Canonical"}
        </button>
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
        {loading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, idx) => <div key={idx} className="skeleton h-8 rounded" />)}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-[var(--text-muted)]">
              Floral and Gourmand are visually prioritized because they strongly influence customer preference and conversion.
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {categories.map((category) => {
                const style = category.emphasis === "high"
                  ? "border-[var(--gold)] bg-[var(--gold-tint)]"
                  : category.emphasis === "trending"
                    ? "border-[rgba(245,158,11,0.5)] bg-[rgba(245,158,11,0.08)]"
                    : "border-[var(--border)] bg-[var(--bg-surface)]";

                return (
                  <div key={category.id} className={`rounded border p-3 ${style}`}>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-secondary)] mb-2">{category.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {category.notes.map((note) => (
                        <span
                          key={`${category.id}-${note}`}
                          className="inline-flex items-center text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-[var(--border-gold)] text-[var(--gold)] bg-[var(--gold-tint)]"
                        >
                          {note}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
