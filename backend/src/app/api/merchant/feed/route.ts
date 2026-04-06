import { NextResponse } from "next/server";
import { buildCanonicalProductUrl, getActivePerfumes, getPerfumeOffers, parseImageList, SITE_URL } from "@/lib/seo-catalog";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const perfumes = await getActivePerfumes();
  const items = await Promise.all(
    perfumes.map(async (perfume) => {
      const offers = await getPerfumeOffers(perfume);
      const firstInStock = offers.decantOffers.find((offer) => offer.available) || offers.decantOffers[0];
      const imageRaw = parseImageList(perfume.images)[0] || "";
      const image = imageRaw.startsWith("http") ? imageRaw : imageRaw ? `${SITE_URL}${imageRaw}` : "";

      return {
        id: perfume.id,
        title: `${perfume.name} by ${perfume.brand} Decant`,
        description: perfume.description || `Authentic ${perfume.name} decants in Bangladesh with full bottle request option.`,
        link: buildCanonicalProductUrl(perfume),
        image,
        price: firstInStock?.price || 0,
        availability: firstInStock?.available ? "in stock" : "out of stock",
        brand: perfume.brand,
      };
    }),
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Valore Parfums Merchant Feed</title>
    <link>${xmlEscape(SITE_URL)}</link>
    <description>Perfume decants and full bottle requests in Bangladesh</description>
    ${items
      .map(
        (item) => `
    <item>
      <g:id>${xmlEscape(item.id)}</g:id>
      <g:title>${xmlEscape(item.title)}</g:title>
      <g:description>${xmlEscape(item.description)}</g:description>
      <g:link>${xmlEscape(item.link)}</g:link>
      <g:image_link>${xmlEscape(item.image)}</g:image_link>
      <g:condition>new</g:condition>
      <g:availability>${xmlEscape(item.availability)}</g:availability>
      <g:price>${xmlEscape(`${item.price} BDT`)}</g:price>
      <g:brand>${xmlEscape(item.brand)}</g:brand>
      <g:google_product_category>Health &amp; Beauty &gt; Personal Care &gt; Cosmetics &gt; Perfume &amp; Cologne</g:google_product_category>
    </item>`,
      )
      .join("")}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400",
    },
  });
}
