"use client";

import { forwardRef } from "react";
import type { PaymentType } from "@/types/payment";

export interface CourierSlipOrderItem {
  perfumeName: string;
  ml: number;
  isFullBottle?: boolean;
  fullBottleSize?: string;
  quantity: number;
}

export interface CourierSlipData {
  orderId: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  area?: string;
  city?: string;
  deliveryNote?: string;
  internalNote?: string;
  courierNote?: string;
  paymentType: PaymentType;
  total: number;
  deliveryFee: number;
  amountToCollect: number;
  isCOD: boolean;
  items: CourierSlipOrderItem[];
}

interface CourierSlipProps {
  data: CourierSlipData;
}

/* ───────── helpers ───────── */

const fmt = (value: number): string =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/* ───────── component ─────────
 *
 * Rendered at a fixed A4 portrait pixel size (794 × 1123 px @ 96dpi) so that
 * `html2canvas` captures it deterministically regardless of viewport. The slip
 * is rendered with inline white/black styling — independent from the admin
 * dark theme — because couriers print it on plain paper.
 */

export const CourierSlip = forwardRef<HTMLDivElement, CourierSlipProps>(function CourierSlip(
  { data },
  ref,
) {
  const {
    orderId,
    createdAt,
    customerName,
    customerPhone,
    deliveryAddress,
    area,
    city,
    deliveryNote,
    internalNote,
    courierNote,
    paymentType,
    total,
    deliveryFee,
    amountToCollect,
    isCOD,
    items,
  } = data;

  const fullAddress = [deliveryAddress, area, city].filter(Boolean).join(", ");

  return (
    <div
      ref={ref}
      style={{
        width: "794px",
        minHeight: "1123px",
        padding: "40px 44px",
        background: "#ffffff",
        color: "#0b0b0b",
        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        boxSizing: "border-box",
        lineHeight: 1.35,
      }}
    >
      {/* ── Header ── */}
      <div style={{ textAlign: "center", borderBottom: "2px solid #0b0b0b", paddingBottom: 18 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/valore%20jpg.jpg"
          alt="Valore Parfums"
          crossOrigin="anonymous"
          style={{ height: 110, width: "auto", margin: "0 auto", display: "block", imageRendering: "auto" }}
        />
        <p
          style={{
            margin: "6px 0 0",
            fontStyle: "italic",
            fontSize: 13,
            letterSpacing: 1,
            color: "#222",
          }}
        >
          Luxury &middot; Made Accessible.
        </p>
      </div>

      {/* ── Order meta ── */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, fontSize: 12 }}>
        <div>
          <p style={{ margin: 0, color: "#444", letterSpacing: 1, fontSize: 10, textTransform: "uppercase" }}>Order ID</p>
          <p style={{ margin: "2px 0 0", fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>{orderId}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: 0, color: "#444", letterSpacing: 1, fontSize: 10, textTransform: "uppercase" }}>Order Date</p>
          <p style={{ margin: "2px 0 0", fontSize: 12, fontWeight: 600 }}>{formatDate(createdAt)}</p>
        </div>
      </div>

      {/* ── Ship-to ── */}
      <div style={{ marginTop: 22 }}>
        <p
          style={{
            margin: 0,
            fontSize: 11,
            letterSpacing: 2,
            color: "#444",
            textTransform: "uppercase",
            borderBottom: "1px solid #d0d0d0",
            paddingBottom: 4,
          }}
        >
          Ship To
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8, fontSize: 14 }}>
          <tbody>
            <tr>
              <td style={{ width: 90, padding: "4px 0", color: "#555", fontSize: 12 }}>NAME:</td>
              <td style={{ padding: "4px 0", fontWeight: 600 }}>{customerName || "—"}</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 0", color: "#555", fontSize: 12, verticalAlign: "top" }}>ADDRESS:</td>
              <td style={{ padding: "4px 0" }}>{fullAddress || "—"}</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 0", color: "#555", fontSize: 12 }}>PHONE:</td>
              <td style={{ padding: "4px 0", fontFamily: "monospace", fontWeight: 600 }}>{customerPhone || "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── COD highlight (must be the most visually dominant block when there
              is anything to collect — for COD this is the default, but admin
              can also force a non-zero collect amount on a prepaid order). ── */}
      {amountToCollect > 0 && (
        <div
          style={{
            marginTop: 22,
            padding: "22px 24px",
            background: "#000000",
            color: "#ffffff",
            borderRadius: 6,
            textAlign: "center",
            border: "4px solid #000000",
            boxShadow: "inset 0 0 0 2px #ffffff",
          }}
        >
          <p style={{ margin: 0, fontSize: 13, letterSpacing: 4, textTransform: "uppercase", color: "#f0c674" }}>
            {isCOD ? "Cash on Delivery" : `Collect on Delivery · ${paymentType}`}
          </p>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 56,
              lineHeight: 1.1,
              fontWeight: 800,
              letterSpacing: 1,
            }}
          >
            COLLECT ৳{fmt(amountToCollect)}
          </p>
        </div>
      )}

      {/* ── Order summary ── */}
      <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, fontSize: 13 }}>
        <div>
          <p style={{ margin: 0, fontSize: 11, letterSpacing: 2, color: "#444", textTransform: "uppercase" }}>
            Payment Type
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700 }}>{paymentType}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: 0, fontSize: 11, letterSpacing: 2, color: "#444", textTransform: "uppercase" }}>
            Order Total
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700 }}>৳{fmt(total)}</p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 11, letterSpacing: 2, color: "#444", textTransform: "uppercase" }}>
            Delivery Charge
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 14 }}>৳{fmt(deliveryFee)}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: 0, fontSize: 11, letterSpacing: 2, color: "#444", textTransform: "uppercase" }}>
            Amount to Collect
          </p>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 18,
              fontWeight: 800,
              color: amountToCollect > 0 ? "#000" : "#888",
            }}
          >
            ৳{fmt(amountToCollect)}
          </p>
        </div>
      </div>

      {/* ── Items ── */}
      {items.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              letterSpacing: 2,
              color: "#444",
              textTransform: "uppercase",
              borderBottom: "1px solid #d0d0d0",
              paddingBottom: 4,
            }}
          >
            Items
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6, fontSize: 12 }}>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} style={{ borderBottom: "1px dashed #e0e0e0" }}>
                  <td style={{ padding: "5px 0", width: 30, color: "#666" }}>{idx + 1}.</td>
                  <td style={{ padding: "5px 0" }}>{it.perfumeName}</td>
                  <td style={{ padding: "5px 0", textAlign: "right", color: "#444" }}>
                    {it.isFullBottle ? `Full Bottle ${it.fullBottleSize || ""}` : `${it.ml}ml`}
                  </td>
                  <td style={{ padding: "5px 0", textAlign: "right", width: 40, fontWeight: 600 }}>
                    × {it.quantity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Notes ── */}
      {(deliveryNote || internalNote || courierNote) && (
        <div style={{ marginTop: 22 }}>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              letterSpacing: 2,
              color: "#444",
              textTransform: "uppercase",
              borderBottom: "1px solid #d0d0d0",
              paddingBottom: 4,
            }}
          >
            Notes
          </p>
          {deliveryNote && (
            <p style={{ margin: "8px 0 0", fontSize: 12 }}>
              <strong>Delivery:</strong> {deliveryNote}
            </p>
          )}
          {internalNote && (
            <p style={{ margin: "6px 0 0", fontSize: 12 }}>
              <strong>Internal:</strong> {internalNote}
            </p>
          )}
          {courierNote && (
            <p style={{ margin: "6px 0 0", fontSize: 12 }}>
              <strong>Courier:</strong> {courierNote}
            </p>
          )}
        </div>
      )}

      {/* ── Footer ── */}
      <div
        style={{
          marginTop: 32,
          paddingTop: 14,
          borderTop: "1px solid #d0d0d0",
          textAlign: "center",
          fontSize: 11,
          color: "#444",
        }}
      >
        <p style={{ margin: 0, fontStyle: "italic", fontSize: 13, color: "#0b0b0b" }}>
          Thank you for choosing Valore Parfums.
        </p>
        <p style={{ margin: "4px 0 0", letterSpacing: 3, fontSize: 10, textTransform: "uppercase" }}>
          We hope every spritz brings you joy
        </p>
        <p style={{ margin: "6px 0 0" }}>
          📞 01777844618 &nbsp;·&nbsp; ✉ valoreparfums@gmail.com &nbsp;·&nbsp; 🌐 www.valoreparfums.app
        </p>
      </div>
    </div>
  );
});

CourierSlip.displayName = "CourierSlip";
