import type { Metadata } from "next";
import Link from "next/link";
import { buildCanonicalProductPath, getActivePerfumes, parseImageList } from "@/lib/seo-catalog";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Perfume Decants Category | 3ml, 10ml, 15ml, 30ml Bangladesh",
  description: "Shop authentic perfume decants in Bangladesh. Explore 3ml, 10ml, 15ml, and 30ml variants from popular brands.",
  alternates: { canonical: "/category/decants" },
  keywords: ["perfume decant Bangladesh", "3ml 10ml 15ml 30ml decants", "buy perfume samples BD"],
};

export default async function DecantsCategoryPage() {
  const perfumes = await getActivePerfumes();

  return (
    <main className="px-[5%] py-10">
      <header className="max-w-4xl mb-8">
        <h1 className="font-serif text-4xl font-light">Perfume Decants in Bangladesh</h1>
        <p className="mt-3 text-[var(--text-secondary)] max-w-3xl text-sm md:text-base leading-relaxed">
          Discover authentic decants in 3ml, 10ml, 15ml, and 30ml sizes. Each perfume has one canonical page with variant selector and full bottle request option.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {perfumes.map((perfume) => {
          const image = parseImageList(perfume.images)[0];
          return (
            <Link key={perfume.id} href={`/products/${perfume.slug}`} className="border border-[var(--border)] rounded overflow-hidden hover:border-[var(--gold)] transition-colors">
              <div className="aspect-[3/4] bg-[var(--bg-surface)] relative">
                {image ? (
                  <Image src={image} alt={perfume.name} fill className="object-cover" sizes="(max-width: 768px) 50vw, 25vw" loading="lazy" />
                ) : null}
              </div>
              <div className="p-3">
                <h2 className="text-sm font-medium">{perfume.name}</h2>
                <p className="text-xs text-[var(--text-muted)]">{perfume.brand}</p>
              </div>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
