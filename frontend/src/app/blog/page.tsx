import type { Metadata } from "next";
import Link from "next/link";
import { blogPosts } from "@/lib/seo-content";

export const metadata: Metadata = {
  title: "Perfume Blog Bangladesh | Guides, Comparisons, And Top Lists",
  description: "Perfume buying guides, decant vs full bottle comparisons, and curated lists for Bangladesh buyers.",
  alternates: { canonical: "/blog" },
};

export default function BlogIndexPage() {
  return (
    <main className="px-4 sm:px-6 md:px-[5%] py-8 sm:py-10 max-w-5xl mx-auto">
      <h1 className="font-serif text-3xl md:text-4xl font-light leading-tight">Perfume Buying Blog</h1>
      <p className="mt-3 text-sm md:text-base text-[var(--text-secondary)] leading-relaxed max-w-3xl">SEO-focused buying guides, comparison posts, and top perfume lists with direct product links.</p>

      <section className="mt-7 grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {blogPosts.map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`} className="border border-[var(--border)] bg-[var(--bg-card)]/35 rounded p-3.5 sm:p-4 hover:border-[var(--gold)] transition-colors">
            <h2 className="font-serif text-xl md:text-2xl font-light leading-snug">{post.title}</h2>
            <p className="text-sm md:text-base text-[var(--text-secondary)] mt-1.5 leading-relaxed">{post.excerpt}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
