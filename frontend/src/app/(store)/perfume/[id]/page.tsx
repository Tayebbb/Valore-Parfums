import { redirect } from "next/navigation";
import { buildCanonicalProductPath, getPerfumeById } from "@/lib/seo-catalog";

export default async function LegacyPerfumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfume = await getPerfumeById(id);
  if (!perfume) {
    redirect("/shop");
  }

  redirect(buildCanonicalProductPath(perfume));
}
