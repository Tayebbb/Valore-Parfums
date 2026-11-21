import type { Metadata } from "next";
import Link from "next/link";
import { buildCanonicalProductPath, getActivePerfumes, SITE_URL } from "@/lib/seo-catalog";
import { PaginationNav } from "@/components/ui/PaginationNav";

import { catalogPage, catalogPagePath, paginateCatalog, type CatalogQuery } from "@/lib/catalog-pagination";

export const revalidate = 300;
type CategoryProps = { searchParams: Promise<CatalogQuery> };

export async function generateMetadata({ searchParams }: CategoryProps): Promise<Metadata> {
  const page = catalogPage(await searchParams);
  return {
    title: `Full Bottle Perfume Requests in Bangladesh${page > 1 ? ` – Page ${page}` : ""}`,
    description: "Browse fragrances with a full bottle request option in Bangladesh. Choose a fragrance to ask about sourcing and availability.",
    alternates: { canonical: catalogPagePath("/category/full-bottles", page) },
  };
}

export default async function FullBottleCategoryPage({ searchParams }: CategoryProps) {
  const perfumes = (await getActivePerfumes()).filter((item) => item.fullBottleAvailable ?? true);
  const currentPage = catalogPage(await searchParams);
  const { items: paginatedPerfumes, totalPages } = paginateCatalog(perfumes, currentPage);

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
              { "@type": "ListItem", position: 2, name: "Full Bottle Perfumes", item: `${SITE_URL}/category/full-bottles` },
            ],
          }),
        }}
      />
      <main className="px-4 sm:px-6 md:px-[5%] py-8 sm:py-10 max-w-5xl mx-auto">
      <h1 className="font-serif text-3xl md:text-4xl font-light leading-tight">Full Bottle Perfumes on Request</h1>
      <p className="mt-4 text-text-secondary text-sm md:text-base leading-relaxed">
        Select a fragrance to ask about a full bottle. You can also check decant sizes if you want to try it first.
      </p>

      <section className="mt-7 sm:mt-8">
        <h2 className="font-serif text-2xl font-light mb-4">Fragrances to request</h2>
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
    </>
  );
}
