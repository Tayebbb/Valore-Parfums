import type { Metadata } from "next";
import Link from "next/link";
import { buildCanonicalProductPath, getActivePerfumes, parseImageList, SITE_URL } from "@/lib/seo-catalog";
import Image from "next/image";
import { PaginationNav } from "@/components/ui/PaginationNav";

export const revalidate = 300;
const PAGE_SIZE = 24;

export const metadata: Metadata = {
  title: "Perfume Decants Category | 3ml, 10ml, 15ml, 30ml Bangladesh",
  description: "Shop authentic perfume decants in Bangladesh. Explore 3ml, 10ml, 15ml, and 30ml variants from popular brands.",
  alternates: { canonical: "/category/decants" },
  keywords: ["perfume decant Bangladesh", "3ml 10ml 15ml 30ml decants", "buy perfume samples BD"],
};

export default async function DecantsCategoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const perfumes = await getActivePerfumes();
  const { page } = await searchParams;
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
              { "@type": "ListItem", position: 2, name: "Perfume Decants", item: `${SITE_URL}/category/decants` },
            ],
          }),
        }}
      />
      <main className="px-4 sm:px-6 md:px-[5%] py-8 sm:py-10">
        <header className="max-w-4xl mb-8">
          <h1 className="font-serif text-3xl md:text-4xl font-light leading-tight">Perfume Decants in Bangladesh</h1>
          <p className="mt-3 text-text-secondary max-w-3xl text-sm md:text-base leading-relaxed">
            Discover authentic decants in 3ml, 10ml, 15ml, and 30ml sizes. Each perfume has one canonical page with variant selector and full bottle request option.
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
