import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { catalogPage, catalogPagePath, paginateCatalog, type CatalogQuery } from "@/lib/catalog-pagination";
import { getActivePerfumes, buildCanonicalProductPath, SITE_URL } from "@/lib/seo-catalog";
import { PaginationNav } from "@/components/ui/PaginationNav";

export const revalidate = 300;
type BrandProps = { params: Promise<{ brand: string }>; searchParams: Promise<CatalogQuery> };

async function getBrandPerfumes(brand: string) {
  const matches = (await getActivePerfumes()).filter((perfume) => perfume.brandSlug === brand);
  if (!matches.length) notFound();
  return matches;
}

export async function generateMetadata({ params, searchParams }: BrandProps): Promise<Metadata> {
  const { brand } = await params;
  const name = (await getBrandPerfumes(brand))[0].brand;
  const page = catalogPage(await searchParams);
  return {
    title: `${name} Perfume Decants in Bangladesh${page > 1 ? ` – Page ${page}` : ""}`,
    description: `Explore ${name} fragrances and compare available decant sizes and prices in BDT.`,
    alternates: { canonical: catalogPagePath(`/brand/${brand}`, page) },
  };
}

export default async function BrandPage({ params, searchParams }: BrandProps) {
  const { brand } = await params;
  const perfumes = await getBrandPerfumes(brand);
  const name = perfumes[0].brand;
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
              { "@type": "ListItem", position: 2, name: "Shop", item: `${SITE_URL}/shop` },
              { "@type": "ListItem", position: 3, name, item: `${SITE_URL}/brand/${brand}` },
            ],
          }),
        }}
      />
      <main className="px-4 sm:px-6 md:px-[5%] py-8 sm:py-10 max-w-5xl mx-auto">
        <h1 className="font-serif text-3xl md:text-4xl font-light capitalize leading-tight">{name} Perfume Decants</h1>
        <p className="mt-3 text-sm md:text-base text-[var(--text-secondary)] leading-relaxed max-w-2xl">Choose a {name} fragrance to check sizes, prices in BDT and stock.</p>

        <section className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {paginatedPerfumes.map((perfume) => (
            <Link key={perfume.id} href={buildCanonicalProductPath(perfume)} className="border border-[var(--border)] bg-[var(--bg-card)]/35 rounded p-3.5 sm:p-4 hover:border-[var(--gold)] transition-colors">
              <h2 className="text-sm font-medium">{perfume.name}</h2>
              <p className="text-xs text-[var(--text-muted)]">{perfume.category}</p>
            </Link>
          ))}
        </section>

        <PaginationNav basePath={`/brand/${brand}`} currentPage={currentPage} totalPages={totalPages} />
      </main>
    </>
  );
}
