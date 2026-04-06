import { redirect } from "next/navigation";
import { getPerfumeById } from "@/lib/seo-catalog";
import { buildProductSlug } from "@/lib/seo-catalog";

export default async function LegacyPerfumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfume = await getPerfumeById(id);
  if (!perfume) {
    redirect("/shop");
  }

  const slug = buildProductSlug(perfume);
  redirect(`/products/${slug}`);
}
