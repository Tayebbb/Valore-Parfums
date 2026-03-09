import { NextResponse } from "next/server";
import { db, Collections, serializeDoc } from "@/lib/prisma";

// GET /api/perfumes/search?q=...&category=...&season=...&brand=...&sort=...
// Updated: Firestore doesn't support OR/contains queries natively,
// so we fetch all active perfumes and filter in memory.
// For production scale, consider Algolia or Typesense.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").toLowerCase();
  const category = searchParams.get("category") || "";
  const season = searchParams.get("season") || "";
  const bestSeller = searchParams.get("bestSeller");
  const brand = searchParams.get("brand") || "";
  const sort = searchParams.get("sort") || "newest";

  // Fetch all active perfumes (Firestore has no text-search operator)
  const snap = await db.collection(Collections.perfumes).where("isActive", "==", true).get();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let perfumes: any[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Apply filters in memory (replaces Prisma where clauses)
  if (category) perfumes = perfumes.filter((p) => p.category === category);
  if (season) perfumes = perfumes.filter((p) => p.season === season);
  if (bestSeller === "true") perfumes = perfumes.filter((p) => p.isBestSeller);
  if (brand) perfumes = perfumes.filter((p) => p.brand === brand);

  // Text search across multiple fields (replaces Prisma contains/OR)
  if (q) {
    perfumes = perfumes.filter((p) =>
      p.name?.toLowerCase().includes(q) ||
      p.brand?.toLowerCase().includes(q) ||
      p.inspiredBy?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q),
    );
  }

  // Sort (replaces Prisma orderBy)
  if (sort === "name-asc") perfumes.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  else if (sort === "name-desc") perfumes.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
  else if (sort === "price-asc") perfumes.sort((a, b) => (a.marketPricePerMl || 0) - (b.marketPricePerMl || 0));
  else if (sort === "price-desc") perfumes.sort((a, b) => (b.marketPricePerMl || 0) - (a.marketPricePerMl || 0));
  else {
    // newest: sort by createdAt descending
    perfumes.sort((a, b) => {
      const da = a.createdAt?.toDate?.() || new Date(0);
      const db2 = b.createdAt?.toDate?.() || new Date(0);
      return db2.getTime() - da.getTime();
    });
  }

  // Get all distinct brands (replaces Prisma distinct)
  const brandSet = new Set<string>();
  snap.docs.forEach((d) => {
    const b = d.data().brand;
    if (b) brandSet.add(b);
  });
  const brands = Array.from(brandSet).sort();

  return NextResponse.json({ perfumes: perfumes.map(serializeDoc), brands });
}
