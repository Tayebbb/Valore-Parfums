import { notFound } from "next/navigation";

export const CATALOG_PAGE_SIZE = 24;
export type CatalogQuery = Record<string, string | string[] | undefined>;

export function catalogPage(query: CatalogQuery) {
  const value = query.page;
  if (value === undefined) return 1;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) notFound();
  const page = Number(value);
  if (!Number.isSafeInteger(page)) notFound();
  return page;
}

export function catalogPagePath(base: string, page: number) {
  return page > 1 ? `${base}?page=${page}` : base;
}

export function paginateCatalog<T>(items: T[], page: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / CATALOG_PAGE_SIZE));
  if (page > totalPages) notFound();
  const start = (page - 1) * CATALOG_PAGE_SIZE;
  return { totalPages, items: items.slice(start, start + CATALOG_PAGE_SIZE) };
}
