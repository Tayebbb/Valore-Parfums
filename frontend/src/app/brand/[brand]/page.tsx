import type { Metadata } from "next";
import Link from "next/link";
import { getActivePerfumes, buildCanonicalProductPath } from "@/lib/seo-catalog";

export async function generateMetadata({ params }: { params: Promise<{ brand: string }> }): Promise<Metadata> {
  const { brand } = await params;
  const brandName = brand.replace(/-/g, " ");
  return {
    title: `${brandName} Perfume Decants Bangladesh | Authentic Samples`,
    description: `Shop ${brandName} perfume decants and request full bottles in Bangladesh.`,
  };
}

export default async function BrandPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await params;
  const perfumes = (await getActivePerfumes()).filter((item) => item.brandSlug === brand);

  return (
    <main className="px-[5%] py-10 max-w-5xl mx-auto">
      <h1 className="font-serif text-4xl font-light capitalize">{brand.replace(/-/g, " ")} Perfume Decants</h1>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">Authentic decants with full bottle request support.</p>

      <section className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {perfumes.map((perfume) => (
          <Link key={perfume.id} href={`/products/${perfume.slug}`} className="border border-[var(--border)] rounded p-4 hover:border-[var(--gold)] transition-colors">
            <h2 className="text-sm font-medium">{perfume.name}</h2>
            <p className="text-xs text-[var(--text-muted)]">{perfume.name} decant Bangladesh</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
