import type { Metadata } from "next";
import Link from "next/link";
import { getActivePerfumes, buildCanonicalProductPath, SITE_URL } from "@/lib/seo-catalog";
import { PaginationNav } from "@/components/ui/PaginationNav";

export const revalidate = 300;
const PAGE_SIZE = 24;

export async function generateMetadata({ params }: { params: Promise<{ brand: string }> }): Promise<Metadata> {
  const { brand } = await params;
  const brandName = brand.replace(/-/g, " ");
  return {
    title: `${brandName} Perfume Decants Bangladesh | Authentic Samples`,
    description: `Shop ${brandName} perfume decants and request full bottles in Bangladesh.`,
    alternates: { canonical: `/brand/${brand}` },
  };
}

export default async function BrandPage({ params, searchParams }: { params: Promise<{ brand: string }>; searchParams: Promise<{ page?: string }> }) {
  const { brand } = await params;
  const { page } = await searchParams;
  const perfumes = (await getActivePerfumes()).filter((item) => item.brandSlug === brand);
  const requestedPage = Math.max(1, Number.parseInt(page || "1", 10) || 1);
  const totalPages = Math.max(1, Math.ceil(perfumes.length / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const paginatedPerfumes = perfumes.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
              { "@type": "ListItem", position: 2, name: "Brands", item: `${SITE_URL}/shop` },
              { "@type": "ListItem", position: 3, name: brand.replace(/-/g, " "), item: `${SITE_URL}/brand/${brand}` },
            ],
          }),
        }}
      />
      <main className="px-4 sm:px-6 md:px-[5%] py-8 sm:py-10 max-w-5xl mx-auto">
        <h1 className="font-serif text-3xl md:text-4xl font-light capitalize leading-tight">{brand.replace(/-/g, " ")} Perfume Decants</h1>
        <p className="mt-3 text-sm md:text-base text-[var(--text-secondary)] leading-relaxed max-w-2xl">Authentic decants with full bottle request support.</p>

        <section className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {paginatedPerfumes.map((perfume) => (
            <Link key={perfume.id} href={buildCanonicalProductPath(perfume)} className="border border-[var(--border)] bg-[var(--bg-card)]/35 rounded p-3.5 sm:p-4 hover:border-[var(--gold)] transition-colors">
              <h2 className="text-sm font-medium">{perfume.name}</h2>
              <p className="text-xs text-[var(--text-muted)]">{perfume.name} decant Bangladesh</p>
            </Link>
          ))}
        </section>

        <PaginationNav basePath={`/brand/${brand}`} currentPage={currentPage} totalPages={totalPages} />
      </main>
    </>
  );
}
