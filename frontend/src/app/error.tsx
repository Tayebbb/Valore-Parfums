"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-[5%] py-16">
      <div className="max-w-xl text-center space-y-5">
        <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--gold)]">Something went wrong</p>
        <h1 className="font-serif text-4xl font-light">We could not load this page</h1>
        <p className="text-sm md:text-base leading-relaxed text-[var(--text-secondary)]">
          A server or rendering error interrupted the page. You can try again, or return to the catalog and continue browsing.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={reset}
            className="rounded bg-[var(--gold)] px-6 py-3 text-xs font-medium uppercase tracking-wider text-black transition-colors hover:bg-[var(--gold-hover)]"
          >
            Try Again
          </button>
          <Link
            href="/shop"
            className="rounded border border-[var(--border)] px-6 py-3 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)] transition-colors hover:border-[var(--gold)] hover:text-[var(--gold)]"
          >
            Browse Shop
          </Link>
        </div>
      </div>
    </div>
  );
}
