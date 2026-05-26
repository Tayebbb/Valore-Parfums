"use client";

import Link from "next/link";

interface PaginationNavProps {
  basePath: string;
  currentPage: number;
  totalPages: number;
  query?: Record<string, string | number | boolean | undefined>;
  pageParamName?: string;
  className?: string;
}

function buildHref(basePath: string, page: number, query: PaginationNavProps["query"], pageParamName: string) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    params.set(key, String(value));
  }

  if (page > 1) {
    params.set(pageParamName, String(page));
  } else {
    params.delete(pageParamName);
  }

  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

function getPageItems(currentPage: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items: Array<number | "ellipsis"> = [1];
  const left = Math.max(2, currentPage - 1);
  const right = Math.min(totalPages - 1, currentPage + 1);

  if (left > 2) items.push("ellipsis");
  for (let page = left; page <= right; page += 1) items.push(page);
  if (right < totalPages - 1) items.push("ellipsis");
  items.push(totalPages);

  return items;
}

export function PaginationNav({
  basePath,
  currentPage,
  totalPages,
  query,
  pageParamName = "page",
  className = "",
}: PaginationNavProps) {
  if (totalPages <= 1) return null;

  const pageItems = getPageItems(currentPage, totalPages);
  const previousPage = Math.max(1, currentPage - 1);
  const nextPage = Math.min(totalPages, currentPage + 1);
  const previousHref = buildHref(basePath, previousPage, query, pageParamName);
  const nextHref = buildHref(basePath, nextPage, query, pageParamName);

  return (
    <nav className={`mt-8 flex flex-col items-center gap-3 ${className}`} aria-label="Pagination">
      <div className="flex items-center gap-2">
        {currentPage > 1 ? (
          <Link
            href={previousHref}
            className="rounded-full border border-border bg-card px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary transition-colors hover:border-border-hover hover:text-gold"
          >
            Previous
          </Link>
        ) : (
          <span className="rounded-full border border-border bg-card px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted opacity-50">
            Previous
          </span>
        )}

        <div className="flex items-center gap-1">
          {pageItems.map((item, index) => {
            if (item === "ellipsis") {
              return (
                <span key={`ellipsis-${index}`} className="px-2 text-sm text-text-muted">
                  ...
                </span>
              );
            }

            const isCurrent = item === currentPage;
            const href = buildHref(basePath, item, query, pageParamName);
            return isCurrent ? (
              <span
                key={item}
                aria-current="page"
                className="min-w-9 rounded-full border border-gold bg-gold px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-black"
              >
                {item}
              </span>
            ) : (
              <Link
                key={item}
                href={href}
                className="min-w-9 rounded-full border border-border bg-card px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary transition-colors hover:border-border-hover hover:text-gold"
              >
                {item}
              </Link>
            );
          })}
        </div>

        {currentPage < totalPages ? (
          <Link
            href={nextHref}
            className="rounded-full border border-border bg-card px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary transition-colors hover:border-border-hover hover:text-gold"
          >
            Next
          </Link>
        ) : (
          <span className="rounded-full border border-border bg-card px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted opacity-50">
            Next
          </span>
        )}
      </div>

      <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">
        Page {currentPage} of {totalPages}
      </p>
    </nav>
  );
}
