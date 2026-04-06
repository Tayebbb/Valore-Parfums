"use client";

import { Download } from "lucide-react";

const exportTypes = [
  { type: "orders", label: "Orders", desc: "All orders with customer info, totals & status" },
  { type: "stock", label: "Stock / Inventory", desc: "All perfumes with current stock levels" },
  { type: "profit", label: "Profit Report", desc: "Revenue, cost & profit per order" },
  { type: "transactions", label: "Transactions", desc: "Individual line items across all orders" },
  { type: "payment-reconciliation", label: "Payment Reconciliation", desc: "Manual payment submissions, references, and verification trail" },
  { type: "customers", label: "Customer List", desc: "Unique customers with total orders & spend" },
  { type: "stock-requests", label: "Stock Requests", desc: "Customer stock requests with status" },
];

export default function ExportPage() {
  const download = (type: string) => {
    window.open(`/api/export?type=${type}`, "_blank");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-serif text-3xl font-light">Export Data</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Download business data as CSV files</p>
        <div className="gold-line mt-3" />
      </div>

      <div className="space-y-3">
        {exportTypes.map((item) => (
          <div
            key={item.type}
            className="flex items-center justify-between bg-[var(--bg-card)] border border-[var(--border)] rounded px-5 py-4 card-hover cursor-pointer"
            onClick={() => download(item.type)}
          >
            <div>
              <p className="font-serif text-base">{item.label}</p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">{item.desc}</p>
            </div>
            <button className="flex items-center gap-2 bg-[var(--gold)] text-black px-4 py-2 text-xs uppercase tracking-wider hover:bg-[var(--gold-light)] transition-colors">
              <Download size={14} /> CSV
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
