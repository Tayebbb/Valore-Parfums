import { notFound, permanentRedirect } from "next/navigation";
import { buildCanonicalProductPath, getActivePerfumes } from "@/lib/seo-catalog";

export default async function LegacyPerfumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfume = (await getActivePerfumes()).find((item) => item.id === id);
  if (!perfume) notFound();
  permanentRedirect(buildCanonicalProductPath(perfume));
}
