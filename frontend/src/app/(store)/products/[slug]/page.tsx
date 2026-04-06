import { notFound, redirect } from "next/navigation";
import { buildCanonicalProductPath, getActivePerfumes, resolvePerfumeSlug } from "@/lib/seo-catalog";

type RouteProps = {
  params: Promise<{ slug: string }>;
};

async function getPerfumeByProductSlug(slug: string) {
  const perfumes = await getActivePerfumes();
  return (
    perfumes.find((perfume) => {
      const canonicalSlug = `${perfume.brandSlug || ""}-${resolvePerfumeSlug(perfume)}`.replace(/^-+|-+$/g, "");
      const legacySlug = resolvePerfumeSlug(perfume);
      return slug === canonicalSlug || slug === legacySlug;
    }) || null
  );
}

export default async function ProductPage({ params }: RouteProps) {
  const { slug } = await params;
  const product = await getPerfumeByProductSlug(slug);

  if (!product) notFound();

  redirect(buildCanonicalProductPath(product));
}
