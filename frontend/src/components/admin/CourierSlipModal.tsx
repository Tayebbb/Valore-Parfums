"use client";

import { useCallback, useRef, useState } from "react";
import { CourierSlip, type CourierSlipData } from "./CourierSlip";

interface CourierSlipModalProps {
  open: boolean;
  data: CourierSlipData | null;
  onClose: () => void;
}

/**
 * Modal that renders the courier slip preview and provides Download PDF / Print actions.
 * PDF capture uses html2canvas + jsPDF. Both libraries are loaded dynamically to keep
 * the admin bundle lean and avoid SSR issues (they reference `window`).
 */
export function CourierSlipModal({ open, data, onClose }: CourierSlipModalProps) {
  const slipRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState<"pdf" | "print" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = useCallback(async () => {
    if (!data) return;
    const node = slipRef.current;
    if (!node) return;

    setBusy("pdf");
    setError(null);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: node.scrollWidth,
        windowHeight: node.scrollHeight,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (imgHeight <= pdfHeight) {
        pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight, undefined, "FAST");
      } else {
        // Tall content — paginate across A4 pages.
        let remaining = imgHeight;
        let position = 0;
        while (remaining > 0) {
          pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight, undefined, "FAST");
          remaining -= pdfHeight;
          if (remaining > 0) {
            position -= pdfHeight;
            pdf.addPage();
          }
        }
      }

      pdf.save(`courier-slip-${data.orderId}.pdf`);
    } catch (err) {
      console.error("[CourierSlip] PDF generation failed", err);
      setError("Failed to generate PDF. Please try again or use Print.");
    } finally {
      setBusy(null);
    }
  }, [data]);

  const handlePrint = useCallback(() => {
    const node = slipRef.current;
    if (!node) return;

    setBusy("print");
    try {
      const printWindow = window.open("", "_blank", "width=900,height=1200");
      if (!printWindow) {
        setError("Could not open print window. Please allow popups for this site.");
        return;
      }

      printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>courier-slip-${data?.orderId ?? ""}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style>
</head>
<body>${node.outerHTML}</body>
</html>`);
      printWindow.document.close();

      // Wait for images (logo) to finish loading before triggering print.
      const triggerPrint = () => {
        printWindow.focus();
        printWindow.print();
        // The user dismisses the print dialog; close the window after a tick.
        setTimeout(() => {
          try {
            printWindow.close();
          } catch {
            /* ignore */
          }
        }, 300);
      };

      const images = Array.from(printWindow.document.images);
      if (images.length === 0) {
        triggerPrint();
      } else {
        let remaining = images.length;
        const tick = () => {
          remaining -= 1;
          if (remaining <= 0) triggerPrint();
        };
        images.forEach((img) => {
          if (img.complete) tick();
          else {
            img.addEventListener("load", tick, { once: true });
            img.addEventListener("error", tick, { once: true });
          }
        });
      }
    } finally {
      setBusy(null);
    }
  }, [data]);

  if (!open || !data) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg w-full max-w-4xl p-4 sm:p-6 animate-fade-up max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 gap-3">
          <div>
            <h2 className="font-serif text-xl font-light">Courier Slip Preview</h2>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mt-1">
              Order {data.orderId}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              type="button"
              onClick={handleDownload}
              disabled={busy !== null}
              className="px-3 py-2 text-[10px] uppercase tracking-wider bg-[var(--gold)] text-black rounded hover:bg-[var(--gold-light)] transition-colors disabled:opacity-50"
            >
              {busy === "pdf" ? "Generating…" : "Download PDF"}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={busy !== null}
              className="px-3 py-2 text-[10px] uppercase tracking-wider border border-[var(--gold)] text-[var(--gold)] rounded hover:bg-[var(--gold-tint)] transition-colors disabled:opacity-50"
            >
              {busy === "print" ? "Preparing…" : "Print"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={busy !== null}
              className="px-3 py-2 text-[10px] uppercase tracking-wider border border-[var(--border)] rounded hover:border-[var(--gold)] transition-colors disabled:opacity-50"
            >
              Close
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 text-xs text-[var(--error)] border border-[var(--error)] rounded bg-[rgba(248,113,113,0.08)]">
            {error}
          </div>
        )}

        <div className="bg-[#1a1a1a] p-3 sm:p-6 rounded overflow-x-auto">
          <div className="mx-auto shadow-2xl" style={{ width: "794px", maxWidth: "100%" }}>
            <CourierSlip ref={slipRef} data={data} />
          </div>
        </div>
      </div>
    </div>
  );
}
