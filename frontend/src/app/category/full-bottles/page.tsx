import type { Metadata } from "next";
import Link from "next/link";
import { buildCanonicalProductPath, getActivePerfumes } from "@/lib/seo-catalog";
import { PaginationNav } from "@/components/ui/PaginationNav";

export const revalidate = 300;
const PAGE_SIZE = 24;

export const metadata: Metadata = {
  title: "Full Bottle Perfume Requests Bangladesh | Authentic Sourcing",
  description: "Request full bottle perfumes in Bangladesh after testing decants. Authentic sourcing with guided recommendations.",
  alternates: { canonical: "/category/full-bottles" },
  keywords: ["full bottle perfume Bangladesh", "request full bottle perfume", "authentic bottle sourcing"],
};

export default async function FullBottleCategoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const perfumes = (await getActivePerfumes()).filter((item) => item.fullBottleAvailable ?? true);
  const { page } = await searchParams;
  const requestedPage = Math.max(1, Number.parseInt(page || "1", 10) || 1);
  const totalPages = Math.max(1, Math.ceil(perfumes.length / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const paginatedPerfumes = perfumes.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <main className="px-4 sm:px-6 md:px-[5%] py-8 sm:py-10 max-w-5xl mx-auto">
      <h1 className="font-serif text-3xl md:text-4xl font-light leading-tight">Full Bottle Perfumes on Request</h1>
      <p className="mt-4 text-text-secondary text-sm md:text-base leading-relaxed">
        Try first, then upgrade. Every perfume below supports full bottle request from its canonical product page. Start with decants to validate performance and then submit your request with one click.
      </p>

      <section className="mt-7 sm:mt-8">
        <h2 className="font-serif text-2xl font-light mb-4">Popular Full Bottle Requests</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {paginatedPerfumes.map((perfume) => (
            <Link key={perfume.id} href={buildCanonicalProductPath(perfume)} className="border border-border bg-card/35 rounded px-3.5 py-2.5 hover:border-gold transition-colors">
              <p className="text-sm font-medium">{perfume.name}</p>
              <p className="text-xs text-text-muted">Request full bottle of {perfume.brand}</p>
            </Link>
          ))}
        </div>

        <PaginationNav basePath="/category/full-bottles" currentPage={currentPage} totalPages={totalPages} />
      </section>
    </main>
  );
}
