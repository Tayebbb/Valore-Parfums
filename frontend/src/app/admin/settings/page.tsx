"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/ui/Toaster";
import { Plus, Trash2 } from "lucide-react";

type TierMargins = Record<string, Record<string, number>>;

const DEFAULT_TIER_MARGINS: TierMargins = {
  Budget:  { "3": 37, "5": 37, "6": 37, "10": 27, "15": 22, "30": 17 },
  Premium: { "3": 32, "5": 32, "6": 32, "10": 22, "15": 17, "30": 12 },
  Luxury:  { "3": 45, "5": 45, "6": 45, "10": 35, "15": 27, "30": 27 },
};

interface Settings {
  packagingCost: number;
  deliveryFeeInsideDhaka: number;
  deliveryFeeOutsideDhaka: number;
  bkashAccountName: string;
  bkashAccountNumber: string;
  bkashAccountType: string;
  bkashQrImageUrl: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankAccountType: string;
  bankDistrict: string;
  bankBranch: string;
  bankQrImageUrl: string;
  tierMargins: string;
  currency: string;
  lowStockAlertMl: number;
  owner1Name: string;
  owner2Name: string;
  owner1Share: number;
  owner2Share: number;
  ownerProfitPercent: number;
}

interface BulkRule {
  id: string;
  minQuantity: number;
  discountPercent: number;
  isActive: boolean;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    packagingCost: 20,
    deliveryFeeInsideDhaka: 80,
    deliveryFeeOutsideDhaka: 150,
    bkashAccountName: "Valore Parfums",
    bkashAccountNumber: "",
    bkashAccountType: "Personal",
    bkashQrImageUrl: "",
    bankName: "",
    bankAccountName: "",
    bankAccountNumber: "",
    bankAccountType: "",
    bankDistrict: "",
    bankBranch: "",
    bankQrImageUrl: "",
    tierMargins: JSON.stringify(DEFAULT_TIER_MARGINS),
    currency: "BDT",
    lowStockAlertMl: 20,
    owner1Name: "Tayeb",
    owner2Name: "Enid",
    owner1Share: 60,
    owner2Share: 40,
    ownerProfitPercent: 85,
  });
  const [tierMargins, setTierMargins] = useState<TierMargins>(DEFAULT_TIER_MARGINS);
  const [bulkRules, setBulkRules] = useState<BulkRule[]>([]);
  const [newRule, setNewRule] = useState({ minQuantity: 2, discountPercent: 5 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingBkashQr, setUploadingBkashQr] = useState(false);
  const [uploadingBankQr, setUploadingBankQr] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/bulk-pricing").then((r) => r.json()),
    ]).then(([s, rules]) => {
      const legacyDeliveryFee = Number(s.deliveryFee ?? 80);
      setSettings((prev) => ({
        ...prev,
        ...s,
        deliveryFeeInsideDhaka: Number(s.deliveryFeeInsideDhaka ?? legacyDeliveryFee),
        deliveryFeeOutsideDhaka: Number(s.deliveryFeeOutsideDhaka ?? legacyDeliveryFee),
      }));
      try {
        setTierMargins(JSON.parse(s.tierMargins || "{}"));
      } catch {
        setTierMargins(DEFAULT_TIER_MARGINS);
      }
      setBulkRules(rules);
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...settings,
        // Keep legacy field for compatibility with older clients.
        deliveryFee: settings.deliveryFeeInsideDhaka,
        tierMargins: JSON.stringify(tierMargins),
      };
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      toast("Settings saved — prices updated automatically", "success");
    } catch {
      toast("Failed to save settings", "error");
    }
    setSaving(false);
  };

  const updateMargin = (tier: string, ml: string, value: number) => {
    setTierMargins((prev) => ({
      ...prev,
      [tier]: { ...prev[tier], [ml]: value },
    }));
  };

  const uploadBkashQr = async (file: File) => {
    setUploadingBkashQr(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads/payment-qr", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Upload failed");
      }

      setSettings((prev) => ({ ...prev, bkashQrImageUrl: data.imageUrl || "" }));
      toast("bKash QR uploaded", "success");
    } catch {
      toast("Failed to upload bKash QR", "error");
    }
    setUploadingBkashQr(false);
  };

  const uploadBankQr = async (file: File) => {
    setUploadingBankQr(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads/payment-qr", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload failed");
      setSettings((prev) => ({ ...prev, bankQrImageUrl: data.imageUrl || "" }));
      toast("Bank QR uploaded", "success");
    } catch {
      toast("Failed to upload Bank QR", "error");
    }
    setUploadingBankQr(false);
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-xl">
        <h1 className="font-serif text-3xl font-light">Settings</h1>
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-20 rounded" />)}
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-xl">
      <div>
        <h1 className="font-serif text-3xl font-light">Settings</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Configure pricing, packaging, and system alerts</p>
        <div className="gold-line mt-3" />
      </div>

      {/* Brand Tier Margins */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Brand Tier Profit Margins</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-4">Margins are automatically applied based on the full bottle market price. Edit values below.</p>
        <div className="space-y-5">
          {/* Budget */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded px-4 py-3">
            <p className="text-xs font-medium text-[var(--text-primary)] mb-3">Budget Tier <span className="text-[var(--text-muted)]">(Bottle &lt; 3,000 BDT)</span></p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {["3", "10", "15", "30"].map((ml) => (
                <div key={ml}>
                  <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">{ml === "3" ? "3–6" : ml}ml</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={tierMargins.Budget?.[ml] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? 0 : parseFloat(e.target.value);
                        updateMargin("Budget", ml, v);
                        if (ml === "3") { updateMargin("Budget", "5", v); updateMargin("Budget", "6", v); }
                      }}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1.5 text-sm focus:border-[var(--gold)] outline-none"
                    />
                    <span className="text-xs text-[var(--text-muted)]">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Premium */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded px-4 py-3">
            <p className="text-xs font-medium text-[var(--text-primary)] mb-3">Premium Tier <span className="text-[var(--text-muted)]">(3,000 – 8,000 BDT)</span></p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {["3", "10", "15", "30"].map((ml) => (
                <div key={ml}>
                  <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">{ml === "3" ? "3–6" : ml}ml</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={tierMargins.Premium?.[ml] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? 0 : parseFloat(e.target.value);
                        updateMargin("Premium", ml, v);
                        if (ml === "3") { updateMargin("Premium", "5", v); updateMargin("Premium", "6", v); }
                      }}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1.5 text-sm focus:border-[var(--gold)] outline-none"
                    />
                    <span className="text-xs text-[var(--text-muted)]">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Luxury */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded px-4 py-3">
            <p className="text-xs font-medium text-[var(--text-primary)] mb-3">Luxury Tier <span className="text-[var(--text-muted)]">(Bottle &gt; 8,000 BDT)</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {["3", "10", "15"].map((ml) => (
                <div key={ml}>
                  <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">{ml === "3" ? "3–6" : ml === "15" ? "15+" : ml}ml</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={tierMargins.Luxury?.[ml] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? 0 : parseFloat(e.target.value);
                        updateMargin("Luxury", ml, v);
                        if (ml === "3") { updateMargin("Luxury", "5", v); updateMargin("Luxury", "6", v); }
                        if (ml === "15") { updateMargin("Luxury", "30", v); }
                      }}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1.5 text-sm focus:border-[var(--gold)] outline-none"
                    />
                    <span className="text-xs text-[var(--text-muted)]">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Packaging Cost */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Packaging Cost</h3>
        <div>
          <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Cost per Order (BDT)</label>
          <input
            type="number"
            value={settings.packagingCost || ""}
            onChange={(e) => setSettings({ ...settings, packagingCost: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
            className="w-32 bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
          />
        </div>
      </div>

      {/* Delivery Fee */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Delivery Fees by Zone</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Inside Dhaka (BDT)</label>
            <input
              type="number"
              value={settings.deliveryFeeInsideDhaka || ""}
              onChange={(e) => setSettings({ ...settings, deliveryFeeInsideDhaka: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Outside Dhaka (BDT)</label>
            <input
              type="number"
              value={settings.deliveryFeeOutsideDhaka || ""}
              onChange={(e) => setSettings({ ...settings, deliveryFeeOutsideDhaka: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
            />
          </div>
        </div>
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">bKash Manual Payment</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Account Name</label>
            <input
              type="text"
              value={settings.bkashAccountName}
              onChange={(e) => setSettings({ ...settings, bkashAccountName: e.target.value })}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Account Number</label>
            <input
              type="text"
              value={settings.bkashAccountNumber}
              onChange={(e) => setSettings({ ...settings, bkashAccountNumber: e.target.value })}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
              placeholder="01XXXXXXXXX"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Account Type</label>
            <input
              type="text"
              value={settings.bkashAccountType}
              onChange={(e) => setSettings({ ...settings, bkashAccountType: e.target.value })}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
              placeholder="Personal / Merchant"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">QR Code Image</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadBkashQr(file);
              }}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm file:mr-3 file:border-0 file:bg-[var(--gold)] file:text-black file:px-3 file:py-1.5 file:rounded file:text-xs file:uppercase"
            />
            <p className="text-xs text-[var(--text-muted)] mt-1">{uploadingBkashQr ? "Uploading QR..." : "Upload a clear QR for quick scan payments."}</p>
          </div>
        </div>

        {settings.bkashQrImageUrl ? (
          <div className="mt-4 border border-[var(--border)] rounded p-3 bg-[var(--bg-surface)] inline-block">
            <img
              src={settings.bkashQrImageUrl}
              alt="bKash QR"
              className="w-40 h-40 object-contain rounded"
            />
          </div>
        ) : null}
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Bank Manual Payment</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Bank Name</label>
            <input
              type="text"
              value={settings.bankName}
              onChange={(e) => setSettings({ ...settings, bankName: e.target.value })}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Account Name</label>
            <input
              type="text"
              value={settings.bankAccountName}
              onChange={(e) => setSettings({ ...settings, bankAccountName: e.target.value })}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Account Number</label>
            <input
              type="text"
              value={settings.bankAccountNumber}
              onChange={(e) => setSettings({ ...settings, bankAccountNumber: e.target.value })}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Account Type</label>
            <input
              type="text"
              value={settings.bankAccountType}
              onChange={(e) => setSettings({ ...settings, bankAccountType: e.target.value })}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">District</label>
            <input
              type="text"
              value={settings.bankDistrict}
              onChange={(e) => setSettings({ ...settings, bankDistrict: e.target.value })}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Branch</label>
            <input
              type="text"
              value={settings.bankBranch}
              onChange={(e) => setSettings({ ...settings, bankBranch: e.target.value })}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Optional Bank QR Image</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadBankQr(file);
              }}
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm file:mr-3 file:border-0 file:bg-[var(--gold)] file:text-black file:px-3 file:py-1.5 file:rounded file:text-xs file:uppercase"
            />
            <p className="text-xs text-[var(--text-muted)] mt-1">{uploadingBankQr ? "Uploading QR..." : "Optional for faster scan-based payment."}</p>
          </div>
        </div>

        {settings.bankQrImageUrl ? (
          <div className="mt-4 border border-[var(--border)] rounded p-3 bg-[var(--bg-surface)] inline-block">
            <img src={settings.bankQrImageUrl} alt="Bank QR" className="w-40 h-40 object-contain rounded" />
          </div>
        ) : null}
      </div>

      {/* Bulk Pricing Rules */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Bulk Pricing Rules</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-4">Offer discounts when customers buy multiple quantities.</p>

        {/* Existing rules */}
        {bulkRules.length > 0 && (
          <div className="space-y-2 mb-4">
            {bulkRules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded px-4 py-2.5">
                <span className="text-sm text-[var(--text-secondary)] flex-1">
                  Buy <strong className="text-[var(--text-primary)]">{rule.minQuantity}+</strong> items → <strong className="text-[var(--gold)]">{rule.discountPercent}% off</strong>
                </span>
                <button
                  onClick={async () => {
                    await fetch(`/api/bulk-pricing?id=${rule.id}`, { method: "DELETE" });
                    setBulkRules(bulkRules.filter((r) => r.id !== rule.id));
                    toast("Rule removed", "success");
                  }}
                  className="text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new rule */}
        <div className="flex items-end gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Min Qty</label>
            <input
              type="number"
              value={newRule.minQuantity || ""}
              onChange={(e) => setNewRule({ ...newRule, minQuantity: e.target.value === "" ? 0 : parseInt(e.target.value) })}
              className="w-20 bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Discount %</label>
            <input
              type="number"
              value={newRule.discountPercent || ""}
              onChange={(e) => setNewRule({ ...newRule, discountPercent: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
              className="w-20 bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
            />
          </div>
          <button
            onClick={async () => {
              if (newRule.minQuantity < 2) return toast("Min quantity must be at least 2", "error");
              if (newRule.discountPercent <= 0) return toast("Discount must be > 0%", "error");
              const res = await fetch("/api/bulk-pricing", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newRule),
              });
              const rule = await res.json();
              setBulkRules([...bulkRules, rule].sort((a, b) => a.minQuantity - b.minQuantity));
              setNewRule({ minQuantity: 2, discountPercent: 5 });
              toast("Bulk rule added", "success");
            }}
            className="flex items-center gap-1.5 bg-[var(--gold)] text-black px-4 py-2 text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors"
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {/* Pricing Formula Preview */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Pricing Formula</h3>
        <div className="space-y-2 text-sm text-[var(--text-secondary)]">
          <p><strong className="text-[var(--text-primary)]">Selling Price</strong> = (Market Price/ML × ML) × (1 + Tier Margin%) + Bottle Cost + Packaging ({settings.packagingCost} BDT)</p>
          <p><strong className="text-[var(--text-primary)]">Total Cost</strong> = (Market Price/ML × ML) + Bottle Cost + Packaging</p>
          <p><strong className="text-[var(--text-primary)]">Profit</strong> = Selling Price − Total Cost</p>
          <p className="text-xs text-[var(--text-muted)] mt-2">Prices are psychologically rounded to end in 9 (e.g. 249, 389, 529)</p>
        </div>
      </div>

      {/* Low Stock Alert */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Low Stock Alert Threshold</h3>
        <div>
          <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Alert when below (ml)</label>
          <input
            type="number"
            value={settings.lowStockAlertMl || ""}
            onChange={(e) => setSettings({ ...settings, lowStockAlertMl: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
            className="w-32 bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
          />
        </div>
      </div>

      {/* Currency */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Currency</h3>
        <input
          type="text"
          value={settings.currency}
          onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
          className="w-32 bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
        />
      </div>

      {/* Owners & Profit Share */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Owners & Profit Share</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-4">Configure the two owners and their respective profit split percentage.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Owner 1 Name</label>
              <input
                type="text"
                value={settings.owner1Name}
                onChange={(e) => setSettings({ ...settings, owner1Name: e.target.value })}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Profit Share (%)</label>
              <input
                type="number"
                value={settings.owner1Share || ""}
                onChange={(e) => {
                  const val = e.target.value === "" ? 0 : parseFloat(e.target.value);
                  setSettings({ ...settings, owner1Share: val, owner2Share: 100 - val });
                }}
                min={0}
                max={100}
                className="w-32 bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
              />
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Owner 2 Name</label>
              <input
                type="text"
                value={settings.owner2Name}
                onChange={(e) => setSettings({ ...settings, owner2Name: e.target.value })}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Profit Share (%)</label>
              <input
                type="number"
                value={settings.owner2Share || ""}
                onChange={(e) => {
                  const val = e.target.value === "" ? 0 : parseFloat(e.target.value);
                  setSettings({ ...settings, owner2Share: val, owner1Share: 100 - val });
                }}
                min={0}
                max={100}
                className="w-32 bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
              />
            </div>
          </div>
        </div>
        {/* Visual Bar */}
        <div className="mt-4">
          <div className="flex justify-between text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
            <span>{settings.owner1Name} ({settings.owner1Share}%)</span>
            <span>{settings.owner2Name} ({settings.owner2Share}%)</span>
          </div>
          <div className="h-3 bg-[var(--bg-surface)] rounded-full overflow-hidden flex">
            <div className="h-full bg-[var(--gold)] rounded-l-full transition-all" style={{ width: `${settings.owner1Share}%` }} />
            <div className="h-full bg-[var(--success)] rounded-r-full transition-all" style={{ width: `${settings.owner2Share}%` }} />
          </div>
          {settings.owner1Share + settings.owner2Share !== 100 && (
            <p className="text-xs text-[var(--error)] mt-2">⚠ Shares must add up to 100% (currently {settings.owner1Share + settings.owner2Share}%)</p>
          )}
        </div>
      </div>

      {/* Bottle Owner Profit Split */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-4">Bottle Owner Profit Split</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-4">When a perfume owned by one person is sold, the profit is split between the bottle owner and the other owner.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Bottle Owner Gets (%)</label>
            <input
              type="number"
              value={settings.ownerProfitPercent || ""}
              onChange={(e) => setSettings({ ...settings, ownerProfitPercent: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
              min={0}
              max={100}
              className="w-32 bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--gold)] outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1 block">Other Owner Gets (%)</label>
            <input
              type="number"
              value={100 - (settings.ownerProfitPercent || 0)}
              disabled
              className="w-32 bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm opacity-60 cursor-not-allowed outline-none"
            />
          </div>
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
            <span>Bottle Owner ({settings.ownerProfitPercent}%)</span>
            <span>Other Owner ({100 - settings.ownerProfitPercent}%)</span>
          </div>
          <div className="h-3 bg-[var(--bg-surface)] rounded-full overflow-hidden flex">
            <div className="h-full bg-[var(--gold)] rounded-l-full transition-all" style={{ width: `${settings.ownerProfitPercent}%` }} />
            <div className="h-full bg-[var(--success)] rounded-r-full transition-all" style={{ width: `${100 - settings.ownerProfitPercent}%` }} />
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-2">e.g. If {settings.owner1Name} owns the bottle, {settings.owner1Name} gets {settings.ownerProfitPercent}% and {settings.owner2Name} gets {100 - settings.ownerProfitPercent}%</p>
        </div>
      </div>

      {/* Save */}
      <button
        onClick={save}
        disabled={saving}
        className="bg-[var(--gold)] text-black px-8 py-3 text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}
