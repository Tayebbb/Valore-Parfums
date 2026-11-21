import type { Metadata } from "next";
import Link from "next/link";
import { blogPosts, landingPages } from "@/lib/seo-content";

export const metadata: Metadata = {
  title: "Perfume Buying Guides for Bangladesh",
  description: "Perfume buying guides, decant vs full bottle comparisons, and curated lists for Bangladesh buyers.",
  alternates: { canonical: "/blog" },
};

export default function BlogIndexPage() {
  return (
    <main className="px-4 sm:px-6 md:px-[5%] py-8 sm:py-10 max-w-5xl mx-auto">
      <h1 className="font-serif text-3xl md:text-4xl font-light leading-tight">Perfume Buying Blog</h1>
      <p className="mt-3 text-sm md:text-base text-[var(--text-secondary)] leading-relaxed max-w-3xl">Compare decant and full bottle options, explore fragrances by brand or season, and choose a size to try.</p>

      <section className="mt-7 grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {blogPosts.map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`} className="border border-[var(--border)] bg-[var(--bg-card)]/35 rounded p-3.5 sm:p-4 hover:border-[var(--gold)] transition-colors">
            <h2 className="font-serif text-xl md:text-2xl font-light leading-snug">{post.title}</h2>
            <p className="text-sm md:text-base text-[var(--text-secondary)] mt-1.5 leading-relaxed">{post.excerpt}</p>
          </Link>
        ))}
      </section>
      <nav aria-label="Shopping guides" className="mt-8">
        <h2 className="font-serif text-2xl">Shopping guides</h2>
        <ul className="mt-3 space-y-2">
          {landingPages.map((guide) => (
            <li key={guide.slug}><Link className="underline" href={`/${guide.slug}`}>{guide.title}</Link></li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
