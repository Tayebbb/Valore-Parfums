import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-[5%] py-16">
      <div className="max-w-xl text-center space-y-5">
        <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--gold)]">404</p>
        <h1 className="font-serif text-4xl font-light">Page not found</h1>
        <p className="text-sm md:text-base leading-relaxed text-[var(--text-secondary)]">
          The page may have moved or the link may be outdated. Start from the collection to find the right fragrance.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/shop"
            className="rounded bg-[var(--gold)] px-6 py-3 text-xs font-medium uppercase tracking-wider text-black transition-colors hover:bg-[var(--gold-hover)]"
          >
            Go to Shop
          </Link>
          <Link
            href="/"
            className="rounded border border-[var(--border)] px-6 py-3 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)] transition-colors hover:border-[var(--gold)] hover:text-[var(--gold)]"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
