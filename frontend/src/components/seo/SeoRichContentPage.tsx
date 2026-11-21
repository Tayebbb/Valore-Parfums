import Link from "next/link";
import type { Metadata } from "next";
import { getActivePerfumes, buildCanonicalProductPath, SITE_NAME, SITE_URL } from "@/lib/seo-catalog";

interface ContentSection {
  heading: string;
  paragraphs: string[];
}

interface SeoRichContentPageProps {
  title: string;
  intro: string;
  sections: ContentSection[];
  ctaText: string;
  ctaHref: string;
  matchingProducts?: { heading: string; brand?: string; season?: string; category?: string };
}

export function buildSeoMetadata(metaTitle: string, metaDescription: string, keywords: string[], canonicalPath?: string): Metadata {
  const canonical = canonicalPath ? `${SITE_URL}${canonicalPath}` : undefined;
  return {
    title: metaTitle,
    description: metaDescription,
    keywords,
    ...(canonical ? { alternates: { canonical } } : {}),
    openGraph: {
      title: metaTitle,
      description: metaDescription,
      siteName: SITE_NAME,
      type: "article",
      ...(canonical ? { url: canonical } : {}),
      images: [{ url: `${SITE_URL}/valore-logo.png`, width: 512, height: 512, alt: "Valore Parfums" }],
    },
    twitter: {
      card: "summary_large_image",
      title: metaTitle,
      description: metaDescription,
      images: [`${SITE_URL}/valore-logo.png`],
    },
  };
}

export async function SeoRichContentPage({ title, intro, sections, ctaText, ctaHref, matchingProducts }: SeoRichContentPageProps) {
  const perfumes = matchingProducts ? await getActivePerfumes() : [];
  const matches = perfumes.filter((perfume) => {
    if (!matchingProducts) return false;
    const seasons = Array.isArray(perfume.season) ? perfume.season : [perfume.season];
    return (!matchingProducts.brand || perfume.brand === matchingProducts.brand)
      && (!matchingProducts.category || perfume.category === matchingProducts.category)
      && (!matchingProducts.season || seasons.includes(matchingProducts.season));
  });

  return (
    <main className="px-4 sm:px-6 md:px-[5%] py-8 sm:py-10 max-w-5xl mx-auto">
      <header className="mb-7 sm:mb-8">
        <h1 className="font-serif text-3xl md:text-5xl font-light leading-tight">{title}</h1>
        <p className="mt-3 sm:mt-4 text-[var(--text-secondary)] leading-relaxed text-sm md:text-base max-w-3xl">{intro}</p>
      </header>

      <div className="space-y-8 sm:space-y-10">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="font-serif text-2xl md:text-3xl font-light mb-3">{section.heading}</h2>
            <div className="space-y-3.5 text-[15px] md:text-base text-[var(--text-secondary)] leading-relaxed max-w-[72ch]">
              {section.paragraphs.map((paragraph, idx) => (
                <p key={`${section.heading}-${idx}`}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      {matches.length > 0 && <section className="mt-10 sm:mt-12">
        <h2 className="font-serif text-2xl md:text-3xl font-light mb-4">{matchingProducts?.heading}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {matches.map((perfume) => (
            <Link
              key={perfume.id}
              href={buildCanonicalProductPath(perfume)}
              className="border border-[var(--border)] bg-[var(--bg-card)]/35 rounded px-3.5 py-2.5 text-sm hover:border-[var(--gold)] transition-colors"
            >
              {perfume.brand} · {perfume.name}
            </Link>
          ))}
        </div>
      </section>}

      <section className="mt-8 sm:mt-10 border border-[var(--border)] rounded p-5 sm:p-6 bg-[var(--bg-card)]/55">
        <Link
          href={ctaHref}
          className="inline-flex items-center justify-center bg-[var(--gold)] text-black px-6 py-3 text-xs uppercase tracking-wider font-medium rounded hover:bg-[var(--gold-light)] transition-colors"
        >
          {ctaText}
        </Link>
      </section>
    </main>
  );
}
