import type { Metadata } from "next";
import Link from "next/link";
import { buildCanonicalProductPath, getActivePerfumes } from "@/lib/seo-catalog";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Full Bottle Perfume Requests Bangladesh | Authentic Sourcing",
  description: "Request full bottle perfumes in Bangladesh after testing decants. Authentic sourcing with guided recommendations.",
  alternates: { canonical: "/category/full-bottles" },
  keywords: ["full bottle perfume Bangladesh", "request full bottle perfume", "authentic bottle sourcing"],
};

export default async function FullBottleCategoryPage() {
  const perfumes = (await getActivePerfumes()).filter((item) => item.fullBottleAvailable ?? true);

  return (
    <main className="px-[5%] py-10 max-w-5xl mx-auto">
      <h1 className="font-serif text-4xl font-light">Full Bottle Perfumes on Request</h1>
      <p className="mt-4 text-[var(--text-secondary)] text-sm md:text-base leading-relaxed">
        Try first, then upgrade. Every perfume below supports full bottle request from its canonical product page. Start with decants to validate performance and then submit your request with one click.
      </p>

      <section className="mt-8">
        <h2 className="font-serif text-2xl font-light mb-4">Popular Full Bottle Requests</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {perfumes.slice(0, 24).map((perfume) => (
            <Link key={perfume.id} href={buildCanonicalProductPath(perfume)} className="border border-[var(--border)] rounded px-4 py-3 hover:border-[var(--gold)] transition-colors">
              <p className="text-sm font-medium">{perfume.name}</p>
              <p className="text-xs text-[var(--text-muted)]">Request full bottle of {perfume.brand}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
