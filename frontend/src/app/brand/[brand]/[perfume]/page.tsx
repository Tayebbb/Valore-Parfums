import { redirect } from "next/navigation";
import { buildProductSlug, getPerfumeByBrandAndSlug } from "@/lib/seo-catalog";

type RouteProps = {
  params: Promise<{ brand: string; perfume: string }>;
};

export default async function LegacyBrandProductPage({ params }: RouteProps) {
  const { brand, perfume } = await params;
  const product = await getPerfumeByBrandAndSlug(brand, perfume);
  
  if (!product) {
    redirect("/shop");
  }

  const slug = buildProductSlug(product);
  redirect(`/products/${slug}`);
}
