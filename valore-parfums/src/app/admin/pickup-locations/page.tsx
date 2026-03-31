"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/ui/Toaster";
import { MapPin, Plus, Pencil, Trash2, X } from "lucide-react";

interface PickupLocation {
  id: string;
  name: string;
  address: string;
  phone: string;
  notes: string;
  active: boolean;
  createdAt: string;
}

const emptyForm = { name: "", address: "", phone: "", notes: "" };

export default function PickupLocationsPage() {
  const [locations, setLocations] = useState<PickupLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const load = () =>
    fetch("/api/pickup-locations?all=1")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setLocations(data); })
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const resetForm = () => { setForm(emptyForm); setEditingId(null); setShowForm(false); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.address.trim()) {
      toast("Name and address are required", "error");
      return;
    }

    setSubmitting(true);
    const url = editingId ? `/api/pickup-locations/${editingId}` : "/api/pickup-locations";
    const method = editingId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      toast(editingId ? "Location updated" : "Location added", "success");
      resetForm();
      load();
    } else {
      const err = await res.json();
      toast(err.error || "Failed to save", "error");
    }
    setSubmitting(false);
  };

  const startEdit = (loc: PickupLocation) => {
    setForm({ name: loc.name, address: loc.address, phone: loc.phone, notes: loc.notes });
    setEditingId(loc.id);
    setShowForm(true);
  };

  const toggleActive = async (loc: PickupLocation) => {
    await fetch(`/api/pickup-locations/${loc.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !loc.active }),
    });
    toast(loc.active ? "Location deactivated" : "Location activated", "success");
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this pickup location?")) return;
    const res = await fetch(`/api/pickup-locations/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast("Location deleted", "success");
      load();
    } else {
      toast("Failed to delete", "error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-light">Pickup Locations</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Manage customer pickup points</p>
          <div className="gold-line mt-3" />
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--gold)] text-black text-[10px] uppercase tracking-wider rounded hover:bg-[var(--gold-hover)] transition-colors"
        >
          <Plus size={14} /> Add Location
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={resetForm} />
          <div className="relative bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg w-full max-w-md p-6 animate-fade-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-xl font-light">{editingId ? "Edit Location" : "Add Location"}</h2>
              <button onClick={resetForm} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={200}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
                  placeholder="e.g. Dhanmondi Pickup Point"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Address *</label>
                <textarea
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  maxLength={500}
                  rows={3}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none resize-none"
                  placeholder="Full address"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Phone</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  maxLength={20}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
                  placeholder="Contact number"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Notes</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  maxLength={500}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
                  placeholder="e.g. Available Mon-Sat"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-[var(--gold)] text-black text-[10px] uppercase tracking-wider rounded hover:bg-[var(--gold-hover)] transition-colors disabled:opacity-50"
              >
                {submitting ? "Saving..." : editingId ? "Update Location" : "Add Location"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Locations List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-24 rounded" />)}
        </div>
      ) : locations.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-secondary)]">
          <MapPin size={40} className="mx-auto mb-3 opacity-30" />
          <p>No pickup locations yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {locations.map((loc) => (
            <div
              key={loc.id}
              className={`bg-[var(--bg-card)] border rounded p-5 transition-colors ${
                loc.active ? "border-[var(--border)]" : "border-[var(--border)] opacity-50"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <MapPin size={16} className="text-[var(--gold)] flex-shrink-0" />
                  <h3 className="font-serif text-lg">{loc.name}</h3>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleActive(loc)}
                    className={`px-2 py-0.5 text-[9px] uppercase tracking-wider rounded ${
                      loc.active
                        ? "bg-[rgba(74,222,128,0.1)] text-[var(--success)]"
                        : "bg-[rgba(248,113,113,0.1)] text-[var(--error)]"
                    }`}
                  >
                    {loc.active ? "Active" : "Inactive"}
                  </button>
                  <button onClick={() => startEdit(loc)} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--gold)] transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDelete(loc.id)} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--error)] transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <p className="text-sm text-[var(--text-secondary)] mb-1">{loc.address}</p>
              {loc.phone && <p className="text-xs text-[var(--text-muted)]">📞 {loc.phone}</p>}
              {loc.notes && <p className="text-xs text-[var(--text-muted)] mt-1 italic">{loc.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
