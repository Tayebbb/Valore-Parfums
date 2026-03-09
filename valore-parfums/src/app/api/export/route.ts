import { NextResponse } from "next/server";
import { db, Collections } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

function toCSV(headers: string[], rows: string[][]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
}

// Helper: convert Firestore Timestamp to Date
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDate(ts: any): Date {
  return ts?.toDate ? ts.toDate() : new Date(ts);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = snap.docs.map((d) => {
        const o = d.data() as any;
        return [
          d.id.slice(0, 8),
          o.customerName,
          o.customerPhone,
          o.status,
          (o.subtotal ?? 0).toString(),
          (o.discount ?? 0).toString(),
          (o.total ?? 0).toString(),
          (o.profit ?? 0).toString(),
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = snap.docs.map((d) => {
        const p = d.data() as any;
        return [
          p.name,
          p.brand,
          p.category,
          (p.totalStockMl ?? 0).toString(),
          (p.marketPricePerMl ?? 0).toString(),
          p.isActive ? "Active" : "Inactive",
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const o = d.data() as any;
        if (o.status === "Cancelled") continue;
        // Fetch items subcollection (replaces Prisma include)
        const itemsSnap = await db.collection(Collections.orders).doc(d.id).collection("items").get();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cost = itemsSnap.docs.reduce((s, i) => s + ((i.data() as any).costPrice ?? 0), 0);
        rows.push([
          d.id.slice(0, 8),
          toDate(o.createdAt).toLocaleDateString(),
          (o.total ?? 0).toString(),
          cost.toString(),
          (o.profit ?? 0).toString(),
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const order = od.data() as any;
        const itemsSnap = await db.collection(Collections.orders).doc(od.id).collection("items").get();
        for (const id of itemsSnap.docs) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const i = id.data() as any;
          rows.push([
            od.id.slice(0, 8),
            i.perfumeName,
            (i.ml ?? 0).toString(),
            (i.quantity ?? 0).toString(),
            (i.unitPrice ?? 0).toString(),
            (i.totalPrice ?? 0).toString(),
            (i.costPrice ?? 0).toString(),
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const o = d.data() as any;
        const key = o.customerPhone;
        const existing = customerMap.get(key);
        if (existing) {
          existing.orders++;
          existing.spent += o.total ?? 0;
        } else {
          customerMap.set(key, { name: o.customerName, phone: o.customerPhone, email: o.customerEmail, orders: 1, spent: o.total ?? 0 });
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = snap.docs.map((d) => {
        const r = d.data() as any;
        return [
          r.perfumeName,
          r.customerName,
          r.customerPhone,
          (r.desiredMl ?? 0).toString(),
          (r.quantity ?? 0).toString(),
          r.status,
          toDate(r.createdAt).toLocaleDateString(),
        ];
      });
      csv = toCSV(headers, rows);
      filename = "stock_requests.csv";
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
