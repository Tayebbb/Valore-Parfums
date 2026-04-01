import { NextResponse } from "next/server";
import { db, Collections } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

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
      // Firestore has no "not equal" filter with include — fetch all, filter in memory
      const snap = await db.collection(Collections.orders).orderBy("createdAt", "desc").get();
      const headers = ["Order ID", "Date", "Revenue", "Cost", "Profit"];
      const rows: string[][] = [];
      for (const d of snap.docs) {
        const o = asRecord(d.data());
        if (asString(o.status) === "Cancelled") continue;
        // Fetch items subcollection (replaces Prisma include)
        const itemsSnap = await db.collection(Collections.orders).doc(d.id).collection("items").get();
        const cost = itemsSnap.docs.reduce((s, i) => {
          const item = asRecord(i.data());
          return s + asNumber(item.costPrice);
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
      // Firestore: items are subcollections — iterate orders and collect items
      const ordersSnap = await db.collection(Collections.orders).orderBy("createdAt", "desc").get();
      const headers = ["Order ID", "Perfume", "ML", "Qty", "Unit Price", "Total", "Cost", "Date"];
      const rows: string[][] = [];
      for (const od of ordersSnap.docs) {
        const order = asRecord(od.data());
        const itemsSnap = await db.collection(Collections.orders).doc(od.id).collection("items").get();
        for (const id of itemsSnap.docs) {
          const i = asRecord(id.data());
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
