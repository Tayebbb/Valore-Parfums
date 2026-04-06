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
    <main className="px-[5%] py-10 max-w-5xl mx-auto">
      <h1 className="font-serif text-4xl font-light">Perfume Buying Blog</h1>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">SEO-focused buying guides, comparison posts, and top perfume lists with direct product links.</p>

      <section className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        {blogPosts.map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`} className="border border-[var(--border)] rounded p-4 hover:border-[var(--gold)] transition-colors">
            <h2 className="font-serif text-2xl font-light">{post.title}</h2>
            <p className="text-sm text-[var(--text-secondary)] mt-2">{post.excerpt}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
