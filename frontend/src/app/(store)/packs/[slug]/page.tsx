import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PackDetailClient from "@/components/store/PackDetailClient";
import { getPublicPackBySlug, getPublicPacks } from "@/lib/packs-api";
import { SITE_NAME, SITE_URL } from "@/lib/seo-catalog";
import { JsonLd } from "@/components/seo/JsonLd";
import { packDiscountLabel } from "@/types/pack";

export const revalidate = 300;

type RouteProps = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const packs = await getPublicPacks();
  return packs.map((pack) => ({ slug: pack.slug }));
}

function absoluteImage(src: string | undefined): string {
  if (!src) return `${SITE_URL}/valore-logo.png`;
  return src.startsWith("http") ? src : `${SITE_URL}${src}`;
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  const pack = await getPublicPackBySlug(slug);

  if (!pack) {
    return {
      title: "Pack Not Found",
      description: "Browse curated perfume decant packs from Valore Parfums.",
      robots: { index: false },
    };
  }

  // The root layout title template already appends the site name.
  const title = `${pack.name} — ${pack.items.length} × ${pack.decantSizeMl}ml Perfume Pack`;
  const names = pack.items.map((i) => i.name).join(", ");
  const description =
    pack.description?.trim() ||
    `${pack.name}: ${names} — ${pack.decantSizeMl}ml of each in one curated pack. ${
      pack.discountAmount > 0 ? `${packDiscountLabel(pack.discountType, pack.discountValue)}, ` : ""
    }now ৳${pack.finalPrice.toLocaleString("en-BD")}.`;
  const ogImage = absoluteImage(pack.items.find((i) => i.image)?.image);

  return {
    title,
    description,
    alternates: { canonical: `/packs/${pack.slug}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/packs/${pack.slug}`,
      siteName: SITE_NAME,
      type: "website",
      images: [{ url: ogImage, width: 800, height: 800, alt: pack.name }],
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}

export default async function PackPage({ params }: RouteProps) {
  const { slug } = await params;
  const pack = await getPublicPackBySlug(slug);
  if (!pack) notFound();

  const url = `${SITE_URL}/packs/${pack.slug}`;
  return (
    <>
      <JsonLd value={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Packs", item: `${SITE_URL}/packs` },
          { "@type": "ListItem", position: 3, name: pack.name, item: url },
        ],
      }} />
      <PackDetailClient initialPack={pack} canonicalUrl={url} />
    </>
  );
}
