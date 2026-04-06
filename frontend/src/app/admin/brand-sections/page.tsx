"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/Toaster";

type BrandSections = {
  uaeBrands: string[];
  nicheBrands: string[];
  designerBrands: string[];
};

const EMPTY_SECTIONS: BrandSections = {
  uaeBrands: [],
  nicheBrands: [],
  designerBrands: [],
};

function parseBrandInput(value: string): string[] {
  const parts = value
    .split(/\n|,/g)
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(parts)).sort((a, b) => a.localeCompare(b));
}

function toText(value: string[]): string {
  return value.join("\n");
}

export default function BrandSectionsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);
  const [sections, setSections] = useState<BrandSections>(EMPTY_SECTIONS);

  const [uaeText, setUaeText] = useState("");
  const [nicheText, setNicheText] = useState("");
  const [designerText, setDesignerText] = useState("");

  useEffect(() => {
    fetch("/api/brand-sections")
      .then((r) => r.json())
      .then((data) => {
        const nextSections = (data?.brandSections || EMPTY_SECTIONS) as BrandSections;
        setSections(nextSections);
        setUaeText(toText(nextSections.uaeBrands || []));
        setNicheText(toText(nextSections.nicheBrands || []));
        setDesignerText(toText(nextSections.designerBrands || []));
        setAvailableBrands(Array.isArray(data?.availableBrands) ? data.availableBrands : []);
      })
      .catch(() => {
        toast("Failed to load brand sections", "error");
      })
      .finally(() => setLoading(false));
  }, []);

  const usedBrands = useMemo(() => {
    const set = new Set([
      ...sections.uaeBrands,
      ...sections.nicheBrands,
      ...sections.designerBrands,
    ]);
    return set;
  }, [sections]);

  const save = async () => {
    const nextSections: BrandSections = {
      uaeBrands: parseBrandInput(uaeText),
      nicheBrands: parseBrandInput(nicheText),
      designerBrands: parseBrandInput(designerText),
    };

    setSaving(true);
    try {
      const res = await fetch("/api/brand-sections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandSections: nextSections }),
      });
      if (!res.ok) throw new Error("Failed to save");

      const data = await res.json();
      const savedSections = (data?.brandSections || nextSections) as BrandSections;
      setSections(savedSections);
      setUaeText(toText(savedSections.uaeBrands || []));
      setNicheText(toText(savedSections.nicheBrands || []));
      setDesignerText(toText(savedSections.designerBrands || []));
      setAvailableBrands(Array.isArray(data?.availableBrands) ? data.availableBrands : availableBrands);
      toast("Brand sections saved", "success");
    } catch {
      toast("Failed to save brand sections", "error");
    } finally {
      setSaving(false);
    }
  };

  const addToSection = (section: keyof BrandSections, brand: string) => {
    const next = {
      ...sections,
      [section]: Array.from(new Set([...(sections[section] || []), brand])).sort((a, b) => a.localeCompare(b)),
    };
    setSections(next);
    setUaeText(toText(next.uaeBrands));
    setNicheText(toText(next.nicheBrands));
    setDesignerText(toText(next.designerBrands));
  };

  if (loading) {
    return <div className="skeleton h-40 rounded" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-light">Brand Sections</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Assign brand names to UAE, Niche, and Designer. All perfumes of those brands are auto-grouped in shop filters.
        </p>
        <div className="gold-line mt-3" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-4 space-y-2">
          <h2 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">UAE Brands</h2>
          <textarea
            rows={14}
            value={uaeText}
            onChange={(e) => setUaeText(e.target.value)}
            placeholder="One brand per line"
            className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm outline-none focus:border-[var(--gold)]"
          />
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-4 space-y-2">
          <h2 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Niche Brands</h2>
          <textarea
            rows={14}
            value={nicheText}
            onChange={(e) => setNicheText(e.target.value)}
            placeholder="One brand per line"
            className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm outline-none focus:border-[var(--gold)]"
          />
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-4 space-y-2">
          <h2 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Designer Brands (Optional)</h2>
          <textarea
            rows={14}
            value={designerText}
            onChange={(e) => setDesignerText(e.target.value)}
            placeholder="Leave empty to auto-calculate as not UAE and not Niche"
            className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm outline-none focus:border-[var(--gold)]"
          />
        </div>
      </div>

      {/* Removed Available Brands In Inventory hero section as requested */}

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="bg-[var(--gold)] text-black px-5 py-2 text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Brand Sections"}
        </button>
      </div>
    </div>
  );
}
