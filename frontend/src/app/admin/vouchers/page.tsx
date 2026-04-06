"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/Toaster";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface Voucher {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  minOrderValue: number;
  usageLimit: number;
  usedCount: number;
  firstOrderOnly: boolean;
  expiresAt: string | null;
  isActive: boolean;
}

const emptyForm = {
  code: "",
  discountType: "percentage",
  discountValue: 10,
  minOrderValue: 0,
  usageLimit: 100,
  firstOrderOnly: false,
  expiresAt: "",
  isActive: true,
};

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = () =>
    fetch("/api/vouchers")
      .then((r) => r.json())
      .then(setVouchers)
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.code) return toast("Code is required", "error");
    const data = {
      ...form,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
    };

    if (editId) {
      await fetch(`/api/vouchers/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      toast("Voucher updated", "success");
    } else {
      await fetch("/api/vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      toast("Voucher created", "success");
    }
    setShowForm(false);
    setEditId(null);
    setForm(emptyForm);
    load();
  };

  const edit = (v: Voucher) => {
    setEditId(v.id);
    setForm({
      code: v.code,
      discountType: v.discountType,
      discountValue: v.discountValue,
      minOrderValue: v.minOrderValue,
      usageLimit: v.usageLimit,
      firstOrderOnly: v.firstOrderOnly,
      expiresAt: v.expiresAt ? v.expiresAt.split("T")[0] : "",
      isActive: v.isActive,
    });
    setShowForm(true);
  };

  const remove = async (id: string) => {
    await fetch(`/api/vouchers/${id}`, { method: "DELETE" });
    toast("Voucher deleted", "success");
    load();
    setDeleteId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-light">Vouchers</h1>
          <div className="gold-line mt-3" />
        </div>
        <button
          onClick={() => { setEditId(null); setForm(emptyForm); setShowForm(true); }}
          className="flex items-center gap-2 bg-[var(--gold)] text-black px-4 py-2 text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors"
        >
          <Plus size={16} /> Create Voucher
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5 animate-fade-up">
          <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">
            {editId ? "Edit Voucher" : "New Voucher"}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Code *</label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g. FRAG10"
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm font-mono focus:border-[var(--gold)] outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Discount Type</label>
              <select
                value={form.discountType}
                onChange={(e) => setForm({ ...form, discountType: e.target.value })}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed (BDT)</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">
                Discount Value {form.discountType === "percentage" ? "(%)" : "(BDT)"}
              </label>
              <input
                type="number"
                value={form.discountValue || ""}
                onChange={(e) => setForm({ ...form, discountValue: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Min Order Value (BDT)</label>
              <input
                type="number"
                value={form.minOrderValue || ""}
                onChange={(e) => setForm({ ...form, minOrderValue: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Usage Limit</label>
              <input
                type="number"
                value={form.usageLimit || ""}
                onChange={(e) => setForm({ ...form, usageLimit: e.target.value === "" ? 0 : parseInt(e.target.value) })}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Expiry Date</label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.firstOrderOnly}
                onChange={(e) => setForm({ ...form, firstOrderOnly: e.target.checked })}
                className="w-4 h-4 accent-[var(--gold)]"
              />
              <label className="text-sm text-[var(--text-secondary)]">First order only</label>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="w-4 h-4 accent-[var(--gold)]"
              />
              <label className="text-sm text-[var(--text-secondary)]">Active</label>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={save} className="bg-[var(--gold)] text-black px-5 py-2 text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors">
              {editId ? "Update" : "Create"}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null); }} className="px-5 py-2 text-xs uppercase tracking-wider border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--gold)] transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-14 rounded" />)}
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {vouchers.map((v) => (
              <div key={v.id} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-[var(--gold)] text-base">{v.code}</p>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mt-1">Code</p>
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${
                    v.isActive ? "bg-[rgba(74,222,128,0.1)] text-[var(--success)]" : "bg-[rgba(248,113,113,0.1)] text-[var(--error)]"
                  }`}>
                    {v.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-[var(--bg-card)] rounded p-3 border border-[var(--border)]">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">Discount</p>
                    <p>{v.discountType === "percentage" ? `${v.discountValue}%` : `${v.discountValue} BDT`}</p>
                  </div>
                  <div className="bg-[var(--bg-card)] rounded p-3 border border-[var(--border)] text-right">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">Uses</p>
                    <p className="font-mono">{v.usedCount}/{v.usageLimit}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-[var(--border)] pt-3">
                  <span className="text-[var(--text-muted)]">Expires</span>
                  <span className="text-[var(--text-secondary)]">{v.expiresAt ? new Date(v.expiresAt).toLocaleDateString() : "Never"}</span>
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
                  <button onClick={() => edit(v)} className="p-2 text-[var(--text-muted)] hover:text-[var(--gold)] transition-colors">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => setDeleteId(v.id)} className="p-2 text-[var(--text-muted)] hover:text-[var(--error)] transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <table className="hidden md:table w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Code</th>
                <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Discount</th>
                <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Uses</th>
                <th className="text-left py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Expires</th>
                <th className="text-center py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Status</th>
                <th className="text-right py-3 px-4 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-normal">Actions</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v) => (
                <tr key={v.id} className="border-b border-[var(--border)] hover:bg-[var(--gold-tint)] transition-colors">
                  <td className="py-3 px-4 font-mono text-[var(--gold)]">{v.code}</td>
                  <td className="py-3 px-4">
                    {v.discountType === "percentage" ? `${v.discountValue}%` : `${v.discountValue} BDT`}
                  </td>
                  <td className="py-3 px-4 text-right font-mono">{v.usedCount}/{v.usageLimit}</td>
                  <td className="py-3 px-4 text-xs text-[var(--text-secondary)]">
                    {v.expiresAt ? new Date(v.expiresAt).toLocaleDateString() : "Never"}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${
                      v.isActive ? "bg-[rgba(74,222,128,0.1)] text-[var(--success)]" : "bg-[rgba(248,113,113,0.1)] text-[var(--error)]"
                    }`}>
                      {v.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => edit(v)} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--gold)] transition-colors">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => setDeleteId(v.id)} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--error)] transition-colors">
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
        title="Delete Voucher"
        message="This will permanently remove the voucher from the system."
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
