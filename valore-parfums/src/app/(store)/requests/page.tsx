"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/store/auth";
import { toast } from "@/components/ui/Toaster";
import { Send, Package, FlaskConical } from "lucide-react";
import Link from "next/link";

interface UserRequest {
  id: string;
  perfumeName: string;
  brand: string;
  type: "decant" | "full_bottle";
  ml: number | null;
  quantity: number;
  notes: string;
  status: string;
  adminNote: string;
  createdAt: string;
}

const mlOptions = [3, 6, 10, 15];

export default function RequestsPage() {
  const { user, loading: authLoading } = useAuth();
  const [requests, setRequests] = useState<UserRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [perfumeName, setPerfumeName] = useState("");
  const [brand, setBrand] = useState("");
  const [type, setType] = useState<"decant" | "full_bottle">("decant");
  const [ml, setMl] = useState(6);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  const load = () => {
    if (!user) return;
    fetch("/api/requests")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setRequests(data); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (user) load(); else setLoading(false); }, [user]);

  const resetForm = () => {
    setPerfumeName("");
    setBrand("");
    setType("decant");
    setMl(6);
    setQuantity(1);
    setNotes("");
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!perfumeName.trim()) {
      toast("Perfume name is required", "error");
      return;
    }
    if (type === "decant" && (!ml || ml <= 0)) {
      toast("Select a decant size", "error");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        perfumeName: perfumeName.trim(),
        brand: brand.trim(),
        type,
        ml: type === "decant" ? ml : null,
        quantity,
        notes: notes.trim(),
      }),
    });

    if (res.ok) {
      toast("Request submitted!", "success");
      resetForm();
      load();
    } else {
      const err = await res.json();
      toast(err.error || "Failed to submit request", "error");
    }
    setSubmitting(false);
  };

  if (authLoading) {
    return (
      <div className="px-[5%] py-20">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="skeleton h-10 w-48 rounded" />
          <div className="skeleton h-40 rounded" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="px-[5%] py-20 text-center">
        <FlaskConical size={48} className="mx-auto mb-4 text-[var(--text-muted)]" />
        <h1 className="font-serif text-3xl font-light mb-3">Requests</h1>
        <p className="text-[var(--text-secondary)] mb-6">Sign in to request decants or full bottles.</p>
        <Link
          href="/login"
          className="inline-block px-6 py-2.5 bg-[var(--gold)] text-black text-[10px] uppercase tracking-wider rounded hover:bg-[var(--gold-hover)] transition-colors"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="px-[5%] py-12">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-3xl font-light">My Requests</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">Request decants or full bottles</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--gold)] text-black text-[10px] uppercase tracking-wider rounded hover:bg-[var(--gold-hover)] transition-colors"
          >
            <Send size={14} /> New Request
          </button>
        </div>
        <div className="gold-line" />

        {/* Request Form */}
        {showForm && (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-6 animate-fade-up">
            <h2 className="font-serif text-xl font-light mb-5">New Request</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type Selection */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Request Type</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setType("decant")}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded border transition-colors ${
                      type === "decant"
                        ? "border-[var(--gold)] bg-[var(--gold-tint)] text-[var(--gold)]"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)]"
                    }`}
                  >
                    <FlaskConical size={16} />
                    <span className="text-xs uppercase tracking-wider">Decant</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setType("full_bottle")}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded border transition-colors ${
                      type === "full_bottle"
                        ? "border-purple-500 bg-[rgba(139,92,246,0.08)] text-purple-400"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:border-purple-500"
                    }`}
                  >
                    <Package size={16} />
                    <span className="text-xs uppercase tracking-wider">Full Bottle</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Perfume Name *</label>
                  <input
                    type="text"
                    value={perfumeName}
                    onChange={(e) => setPerfumeName(e.target.value)}
                    maxLength={200}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
                    placeholder="e.g. Baccarat Rouge 540"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Brand</label>
                  <input
                    type="text"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    maxLength={100}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
                    placeholder="e.g. Maison Francis Kurkdjian"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {type === "decant" && (
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Size (ml) *</label>
                    <div className="flex gap-2">
                      {mlOptions.map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setMl(size)}
                          className={`flex-1 py-2 rounded border text-sm transition-colors ${
                            ml === size
                              ? "border-[var(--gold)] bg-[var(--gold-tint)] text-[var(--gold)]"
                              : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)]"
                          }`}
                        >
                          {size}ml
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Math.min(50, Number(e.target.value))))}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={500}
                  rows={2}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none resize-none"
                  placeholder="Any special requirements..."
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-[var(--gold)] text-black text-[10px] uppercase tracking-wider rounded hover:bg-[var(--gold-hover)] transition-colors disabled:opacity-50"
                >
                  {submitting ? "Submitting..." : "Submit Request"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2.5 border border-[var(--border)] text-[10px] uppercase tracking-wider rounded text-[var(--text-secondary)] hover:border-[var(--gold)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Requests List */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-20 rounded" />)}
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-16">
            <FlaskConical size={48} className="mx-auto mb-4 text-[var(--text-muted)] opacity-30" />
            <p className="text-[var(--text-secondary)]">You haven&apos;t made any requests yet.</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 px-5 py-2 bg-[var(--gold)] text-black text-[10px] uppercase tracking-wider rounded hover:bg-[var(--gold-hover)] transition-colors"
            >
              Make Your First Request
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-serif text-base">{r.perfumeName}</h3>
                      <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        r.type === "full_bottle"
                          ? "bg-[rgba(139,92,246,0.1)] text-purple-400"
                          : "bg-[var(--gold-tint)] text-[var(--gold)]"
                      }`}>
                        {r.type === "full_bottle" ? "Full Bottle" : "Decant"}
                      </span>
                    </div>
                    {r.brand && <p className="text-xs text-[var(--text-muted)]">{r.brand}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-[var(--text-secondary)]">
                      {r.ml && <span>{r.ml}ml</span>}
                      <span>Qty: {r.quantity}</span>
                      <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                    {r.notes && <p className="text-xs text-[var(--text-muted)] mt-1 italic">&ldquo;{r.notes}&rdquo;</p>}
                    {r.adminNote && (
                      <p className="text-xs text-[var(--gold)] mt-1">Admin: {r.adminNote}</p>
                    )}
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full flex-shrink-0 ${
                    r.status === "Pending" ? "status-pending" :
                    r.status === "Approved" ? "bg-[rgba(59,130,246,0.1)] text-blue-400" :
                    r.status === "Fulfilled" ? "status-completed" : "status-cancelled"
                  }`}>
                    {r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
