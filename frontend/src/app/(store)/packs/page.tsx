import type { Metadata } from "next";
import Link from "next/link";
import PackCard from "@/components/store/PackCard";
import { getPublicPacks } from "@/lib/packs-api";
import { SITE_NAME, SITE_URL } from "@/lib/seo-catalog";

export const revalidate = 300;

// The root layout title template already appends the site name.
const TITLE = "Perfume Packs & Decant Bundles in Bangladesh";
const DESCRIPTION =
  "Curated perfume decant packs from Valore Parfums — several authentic fragrances in one bundle at a special pack price. Discover seasonal, office and date-night sets.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/packs" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/packs`,
    siteName: SITE_NAME,
    type: "website",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default async function PacksPage() {
  const packs = await getPublicPacks();

  return (
    <div className="px-4 sm:px-6 md:px-[5%] py-8 sm:py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
              { "@type": "ListItem", position: 2, name: "Packs", item: `${SITE_URL}/packs` },
            ],
          }),
        }}
      />

      <header className="max-w-2xl">
        <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--gold)] mb-3">Curated Sets</p>
        <h1 className="font-serif text-4xl md:text-5xl font-light">Perfume Packs</h1>
        <div className="gold-line mt-4" />
        <p className="text-sm text-[var(--text-secondary)] mt-4 leading-relaxed">
          Hand-picked fragrances bundled together at a pack price. Every pack is priced from the current price of each
          perfume, with the pack discount applied once — nothing is hidden.
        </p>
      </header>

      {packs.length === 0 ? (
        <div className="text-center py-20">
          <p className="font-serif text-2xl text-[var(--text-muted)]">No packs available right now</p>
          <p className="text-sm text-[var(--text-muted)] mt-2">New curated packs arrive regularly — check back soon.</p>
          <Link
            href="/shop"
            className="mt-6 inline-flex items-center gap-2 border border-[var(--border)] px-6 py-3 text-xs uppercase tracking-wider text-[var(--text-secondary)] hover:border-[var(--gold)] hover:text-[var(--gold)] transition-colors rounded"
          >
            Browse all perfumes
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {packs.map((pack, i) => (
            <div key={pack.id} className="animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <PackCard pack={pack} priority={i === 0} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
