import type { Metadata } from "next";
import Link from "next/link";
import { buildCanonicalProductPath, getActivePerfumes, parseImageList, SITE_URL } from "@/lib/seo-catalog";
import Image from "next/image";
import { PaginationNav } from "@/components/ui/PaginationNav";

import { catalogPage, catalogPagePath, paginateCatalog, type CatalogQuery } from "@/lib/catalog-pagination";

export const revalidate = 300;
type CategoryProps = { searchParams: Promise<CatalogQuery> };

export async function generateMetadata({ searchParams }: CategoryProps): Promise<Metadata> {
  const page = catalogPage(await searchParams);
  return {
    title: `Perfume Decants by Brand in Bangladesh${page > 1 ? ` – Page ${page}` : ""}`,
    description: "Browse fragrances by name and brand. Open a fragrance to compare decant sizes, current prices in BDT and availability.",
    alternates: { canonical: catalogPagePath("/category/decants", page) },
  };
}

export default async function DecantsCategoryPage({ searchParams }: CategoryProps) {
  const perfumes = await getActivePerfumes();
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
              { "@type": "ListItem", position: 2, name: "Perfume Decants", item: `${SITE_URL}/category/decants` },
            ],
          }),
        }}
      />
      <main className="px-4 sm:px-6 md:px-[5%] py-8 sm:py-10">
        <header className="max-w-4xl mb-8">
          <h1 className="font-serif text-3xl md:text-4xl font-light leading-tight">Perfume Decants in Bangladesh</h1>
          <p className="mt-3 text-text-secondary max-w-3xl text-sm md:text-base leading-relaxed">
            Browse by fragrance and perfume house. Select a fragrance to compare available decant sizes and prices in BDT.
          </p>
        </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {paginatedPerfumes.map((perfume) => {
          const image = parseImageList(perfume.images)[0];
          return (
            <Link key={perfume.id} href={buildCanonicalProductPath(perfume)} className="border border-border rounded overflow-hidden hover:border-gold transition-colors">
              <div className="aspect-square bg-surface relative">
                {image ? (
                  <Image src={image} alt={perfume.name} fill className="object-cover" sizes="(max-width: 768px) 50vw, 25vw" loading="lazy" />
                ) : null}
              </div>
              <div className="p-3">
                <h2 className="text-sm font-medium">{perfume.name}</h2>
                <p className="text-xs text-text-muted">{perfume.brand}</p>
              </div>
            </Link>
          );
        })}

        <PaginationNav basePath="/category/decants" currentPage={currentPage} totalPages={totalPages} className="col-span-full" />
      </section>
    </main>
    </>
  );
}
