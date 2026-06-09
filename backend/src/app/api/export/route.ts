import { NextResponse } from "next/server";
import { db, Collections } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { calculateSellingPrice, getBrandTier, getTierProfitMargin, parseTierMargins } from "@/lib/utils";

async function getOrderItemsMap(orderIds: string[]) {
  if (orderIds.length === 0) return new Map<string, Array<Record<string, unknown> & { id: string }>>();

  const map = new Map<string, Array<Record<string, unknown> & { id: string }>>();
  const BATCH_SIZE = 20;

  for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
    const chunk = orderIds.slice(i, i + BATCH_SIZE);
    await Promise.all(
      chunk.map(async (orderId) => {
        const snap = await db.collection(Collections.orders).doc(orderId).collection("items").get();
        const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as Array<Record<string, unknown> & { id: string }>;
        if (items.length > 0) map.set(orderId, items);
      }),
    );
  }

  return map;
}

function toCSV(headers: string[], rows: string[][]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
}

type FirestoreRecord = Record<string, unknown>;

function asRecord(value: unknown): FirestoreRecord {
  return value && typeof value === "object" ? (value as FirestoreRecord) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function asBoolean(value: unknown): boolean {
  return typeof value === "boolean" ? value : false;
}

// Helper: convert Firestore Timestamp to Date
function toDate(ts: unknown): Date {
  if (ts && typeof ts === "object" && "toDate" in ts && typeof (ts as { toDate?: unknown }).toDate === "function") {
    return (ts as { toDate: () => Date }).toDate();
  }
  return new Date(ts as string | number | Date);
}

export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  let csv = "";
  let filename = "export.csv";

  switch (type) {
    case "orders": {
      // Replaces prisma.order.findMany with include items + orderBy createdAt desc
      const snap = await db.collection(Collections.orders).orderBy("createdAt", "desc").get();
      const headers = ["Order ID", "Customer", "Phone", "Status", "Subtotal", "Discount", "Total", "Profit", "Date"];
      const rows = snap.docs.map((d) => {
        const o = asRecord(d.data());
        return [
          d.id.slice(0, 8),
          asString(o.customerName),
          asString(o.customerPhone),
          asString(o.status),
          asNumber(o.subtotal).toString(),
          asNumber(o.discount).toString(),
          asNumber(o.total).toString(),
          asNumber(o.profit).toString(),
          toDate(o.createdAt).toLocaleDateString(),
        ];
      });
      csv = toCSV(headers, rows);
      filename = "orders.csv";
      break;
    }

    case "stock": {
      // Replaces prisma.perfume.findMany orderBy name asc
      const snap = await db.collection(Collections.perfumes).orderBy("name", "asc").get();
      const headers = ["Name", "Brand", "Category", "Stock (ml)", "Market Price/ml", "Status"];
      const rows = snap.docs.map((d) => {
        const p = asRecord(d.data());
        return [
          asString(p.name),
          asString(p.brand),
          asString(p.category),
          asNumber(p.totalStockMl).toString(),
          asNumber(p.marketPricePerMl).toString(),
          asBoolean(p.isActive) ? "Active" : "Inactive",
        ];
      });
      csv = toCSV(headers, rows);
      filename = "stock.csv";
      break;
    }

    case "profit": {
      // Replaces prisma.order.findMany where status not Cancelled, include items
      const snap = await db.collection(Collections.orders).orderBy("createdAt", "desc").get();
      const orderIds = snap.docs.map((doc) => doc.id);
      const itemsByOrder = await getOrderItemsMap(orderIds);
      const headers = ["Order ID", "Date", "Revenue", "Cost", "Profit"];
      const rows: string[][] = [];
      for (const d of snap.docs) {
        const o = asRecord(d.data());
        if (asString(o.status) === "Cancelled") continue;
        const items = itemsByOrder.get(d.id) || [];
        const cost = items.reduce((s, item) => {
          const entry = asRecord(item);
          return s + asNumber(entry.costPrice);
        }, 0);
        rows.push([
          d.id.slice(0, 8),
          toDate(o.createdAt).toLocaleDateString(),
          asNumber(o.total).toString(),
          cost.toString(),
          asNumber(o.profit).toString(),
        ]);
      }
      csv = toCSV(headers, rows);
      filename = "profit_report.csv";
      break;
    }

    case "transactions": {
      // Replaces prisma.orderItem.findMany with include order, orderBy order.createdAt desc
      const ordersSnap = await db.collection(Collections.orders).orderBy("createdAt", "desc").get();
      const orderIds = ordersSnap.docs.map((doc) => doc.id);
      const itemsByOrder = await getOrderItemsMap(orderIds);
      const headers = ["Order ID", "Perfume", "ML", "Qty", "Unit Price", "Total", "Cost", "Date"];
      const rows: string[][] = [];
      for (const od of ordersSnap.docs) {
        const order = asRecord(od.data());
        const items = itemsByOrder.get(od.id) || [];
        for (const itemDoc of items) {
          const i = asRecord(itemDoc);
          rows.push([
            od.id.slice(0, 8),
            asString(i.perfumeName),
            asNumber(i.ml).toString(),
            asNumber(i.quantity).toString(),
            asNumber(i.unitPrice).toString(),
            asNumber(i.totalPrice).toString(),
            asNumber(i.costPrice).toString(),
            toDate(order.createdAt).toLocaleDateString(),
          ]);
        }
      }
      csv = toCSV(headers, rows);
      filename = "transactions.csv";
      break;
    }

    case "customers": {
      // Replaces prisma.order.findMany orderBy createdAt desc
      const snap = await db.collection(Collections.orders).orderBy("createdAt", "desc").get();
      const customerMap = new Map<string, { name: string; phone: string; email: string; orders: number; spent: number }>();
      for (const d of snap.docs) {
        const o = asRecord(d.data());
        const key = asString(o.customerPhone);
        if (!key) continue;
        const existing = customerMap.get(key);
        if (existing) {
          existing.orders++;
          existing.spent += asNumber(o.total);
        } else {
          customerMap.set(key, {
            name: asString(o.customerName),
            phone: asString(o.customerPhone),
            email: asString(o.customerEmail),
            orders: 1,
            spent: asNumber(o.total),
          });
        }
      }
      const headers = ["Name", "Phone", "Email", "Total Orders", "Total Spent"];
      const rows = Array.from(customerMap.values()).map((c) => [
        c.name, c.phone, c.email, c.orders.toString(), c.spent.toString(),
      ]);
      csv = toCSV(headers, rows);
      filename = "customers.csv";
      break;
    }

    case "stock-requests": {
      // Replaces prisma.stockRequest.findMany orderBy createdAt desc
      const snap = await db.collection(Collections.stockRequests).orderBy("createdAt", "desc").get();
      const headers = ["Perfume", "Customer", "Phone", "ML", "Qty", "Status", "Date"];
      const rows = snap.docs.map((d) => {
        const r = asRecord(d.data());
        return [
          asString(r.perfumeName),
          asString(r.customerName),
          asString(r.customerPhone),
          asNumber(r.desiredMl).toString(),
          asNumber(r.quantity).toString(),
          asString(r.status),
          toDate(r.createdAt).toLocaleDateString(),
        ];
      });
      csv = toCSV(headers, rows);
      filename = "stock_requests.csv";
      break;
    }

    case "payment-reconciliation": {
      const ordersSnap = await db.collection(Collections.orders).orderBy("createdAt", "desc").get();
      const headers = [
        "Order ID",
        "Date",
        "Customer",
        "Phone",
        "Payment Method",
        "Status",
        "Amount",
        "Reference/Txn",
        "Submitted At",
        "Verified At",
        "Verified By",
      ];

      const rows = ordersSnap.docs
        .map((d) => {
          const o = asRecord(d.data());
          const method = asString(o.paymentMethod);
          if (method !== "Bkash Manual" && method !== "Bank Manual") return null;

          const bkash = asRecord(o.bkashPayment);
          const bank = asRecord(o.bankPayment);
          const bkashVerification = asRecord(o.bkashPaymentVerification);
          const bankVerification = asRecord(o.bankPaymentVerification);

          const ref = method === "Bkash Manual"
            ? asString(bkash.transactionNumber)
            : asString(bank.transactionNumber);
          const submittedAt = method === "Bkash Manual"
            ? bkash.submittedAt
            : bank.submittedAt;
          const verification = method === "Bkash Manual" ? bkashVerification : bankVerification;

          return [
            d.id.slice(0, 8),
            toDate(o.createdAt).toLocaleDateString(),
            asString(o.customerName),
            asString(o.customerPhone),
            method,
            asString(o.status),
            asNumber(o.total).toString(),
            ref,
            submittedAt ? toDate(submittedAt).toLocaleString() : "",
            verification.verifiedAt ? toDate(verification.verifiedAt).toLocaleString() : "",
            asString(verification.verifiedBy),
          ];
        })
        .filter((row): row is string[] => Array.isArray(row));

      csv = toCSV(headers, rows);
      filename = "payment_reconciliation.csv";
      break;
    }

    case "price-list":
    case "price-list-pdf": {
      const [perfumesSnap, sizesSnap, bottlesSnap, settingsDoc] = await Promise.all([
        db.collection(Collections.perfumes).where("isActive", "==", true).orderBy("name", "asc").get(),
        db.collection(Collections.decantSizes).get(),
        db.collection(Collections.bottles).get(),
        db.collection(Collections.settings).doc("default").get(),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sizes = sizesSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s: any) => s.enabled === true).sort((a: any, b: any) => a.ml - b.ml) as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bottles = bottlesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const settings = settingsDoc.exists ? settingsDoc.data() as any : {};
      const packagingCost = Number(settings?.packagingCost ?? 20);
      const margins = parseTierMargins(settings?.tierMargins);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const perfumes = perfumesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];

      if (type === "price-list") {
        // CSV: one row per perfume per size
        const mlHeaders = sizes.map((s: { ml: number }) => `${s.ml}ml (BDT)`);
        const headers = ["Name", "Brand", "Category", "Inspired By", ...mlHeaders];
        const rows = perfumes.map((p) => {
          const effectiveMarketPricePerMl = p.isPersonalCollection ? p.purchasePricePerMl : p.marketPricePerMl;
          const fullBottlePrice = effectiveMarketPricePerMl * 100;
          const tier = getBrandTier(fullBottlePrice);
          const prices = sizes.map((size: { ml: number }) => {
            const bottle = bottles.find((b: { ml: number }) => b.ml === size.ml);
            const bottleCost = bottle?.costPerBottle ?? 0;
            const profitMargin = getTierProfitMargin(tier, size.ml, margins);
            const partialType = String(p.partialDealType || "").toLowerCase();
            const isPartialDeal = partialType === "decant" || partialType === "full_bottle";
            const partialSellingPrice = Number(p.partialSellingPrice ?? p.partialSellingPricePerMl ?? 0);
            const inStock = Number(p.totalStockMl) >= size.ml;
            if (!inStock) return "Out of Stock";
            const sellingPrice = isPartialDeal
              ? Math.ceil(Math.max(0, partialSellingPrice))
              : calculateSellingPrice(effectiveMarketPricePerMl, size.ml, bottleCost, packagingCost, profitMargin);
            return sellingPrice.toString();
          });
          return [
            asString(p.name),
            asString(p.brand),
            asString(p.category),
            asString(p.inspiredBy),
            ...prices,
          ];
        });
        csv = toCSV(headers, rows);
        filename = "valore_price_list.csv";
        break;
      }

      // PDF: return styled HTML for browser printing
      // Only show 5ml, 10ml, 15ml — filter from enabled sizes
      const PDF_ML_SIZES = [5, 10, 15];
      const pdfSizes = PDF_ML_SIZES.filter((ml) => sizes.some((s: { ml: number }) => s.ml === ml));

      const tableRows = perfumes.map((p, idx: number) => {
        const effectiveMarketPricePerMl = p.isPersonalCollection ? p.purchasePricePerMl : p.marketPricePerMl;
        const fullBottlePrice = effectiveMarketPricePerMl * 100;
        const tier = getBrandTier(fullBottlePrice);
        const priceCells = pdfSizes.map((ml: number) => {
          const bottle = bottles.find((b: { ml: number }) => b.ml === ml);
          const bottleCost = bottle?.costPerBottle ?? 0;
          const profitMargin = getTierProfitMargin(tier, ml, margins);
          const partialType = String(p.partialDealType || "").toLowerCase();
          const isPartialDeal = partialType === "decant" || partialType === "full_bottle";
          const partialSellingPrice = Number(p.partialSellingPrice ?? p.partialSellingPricePerMl ?? 0);
          const inStock = Number(p.totalStockMl) >= ml;
          if (!inStock) return `<td class="oos">—</td>`;
          const sellingPrice = isPartialDeal
            ? Math.ceil(Math.max(0, partialSellingPrice))
            : calculateSellingPrice(effectiveMarketPricePerMl, ml, bottleCost, packagingCost, profitMargin);
          return `<td>${sellingPrice.toLocaleString("en-BD")}</td>`;
        }).join("");
        const displayName = asString(p.name);
        return `<tr>
          <td class="name-cell"><span class="num">${idx + 1}.</span> ${displayName}</td>
          ${priceCells}
        </tr>`;
      }).join("\n");

      const mlHeaders = pdfSizes.map((ml: number) => `<th>${ml} ml</th>`).join("");
      const dateStr = new Date().toLocaleDateString("en-BD", { year: "numeric", month: "long", day: "numeric" });
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Valore Parfums — Price List</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; background: #fff; color: #1a1a1a; padding: 40px 48px; font-size: 12px; }
  .header { margin-bottom: 28px; }
  .brand-name { font-size: 28px; font-weight: 700; color: #1a1a1a; margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: #555; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: #fff; }
  thead th { padding: 10px 14px; text-align: left; font-size: 12px; font-weight: 700; border-top: 2px solid #1a1a1a; border-bottom: 1px solid #ccc; }
  thead th:not(:first-child) { text-align: left; min-width: 80px; }
  tbody tr { border-bottom: 1px solid #e5e5e5; }
  tbody tr:last-child { border-bottom: 2px solid #1a1a1a; }
  tbody td { padding: 9px 14px; vertical-align: middle; font-size: 12px; }
  tbody td:not(:first-child) { font-variant-numeric: tabular-nums; }
  .name-cell { max-width: 260px; }
  .num { color: #555; }
  .oos { color: #bbb; }
  .footer { margin-top: 20px; font-size: 10px; color: #999; }
  @media print {
    body { padding: 20px 28px; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    @page { margin: 16mm; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="brand-name">Valore Parfums</div>
    <div class="subtitle">Price List &nbsp;·&nbsp; ${dateStr} &nbsp;·&nbsp; Prices in BDT</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Perfume</th>
        ${mlHeaders}
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>
  <div class="footer">Prices are subject to change. All prices include packaging cost. &nbsp;|&nbsp; valore-parfums.com</div>
  <script>window.onload = function(){ window.print(); }</script>
</body>
</html>`;

      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }

    default:
      return NextResponse.json({ error: "Invalid export type" }, { status: 400 });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
