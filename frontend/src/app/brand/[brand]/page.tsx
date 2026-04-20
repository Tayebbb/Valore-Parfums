import type { Metadata } from "next";
import Link from "next/link";
import { getActivePerfumes, buildCanonicalProductPath } from "@/lib/seo-catalog";

export const revalidate = 300;

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
    <main className="px-4 sm:px-6 md:px-[5%] py-8 sm:py-10 max-w-5xl mx-auto">
      <h1 className="font-serif text-3xl md:text-4xl font-light capitalize leading-tight">{brand.replace(/-/g, " ")} Perfume Decants</h1>
      <p className="mt-3 text-sm md:text-base text-[var(--text-secondary)] leading-relaxed max-w-2xl">Authentic decants with full bottle request support.</p>

      <section className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {perfumes.map((perfume) => (
          <Link key={perfume.id} href={buildCanonicalProductPath(perfume)} className="border border-[var(--border)] bg-[var(--bg-card)]/35 rounded p-3.5 sm:p-4 hover:border-[var(--gold)] transition-colors">
            <h2 className="text-sm font-medium">{perfume.name}</h2>
            <p className="text-xs text-[var(--text-muted)]">{perfume.name} decant Bangladesh</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
