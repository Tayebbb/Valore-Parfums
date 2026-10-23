import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

async function main() {
  const modulePath = resolve(process.argv[2] || "src/lib/seo-catalog.ts");
  const { buildProductJsonLd } = await import(pathToFileURL(modulePath).href);
  const product = {
    id: "test-perfume",
    name: "Test Perfume",
    brand: "Test Brand",
    images: "/perfume.jpg",
  };
  const offers = {
    decantOffers: [{ ml: 5, price: 500, available: true, availability: "https://schema.org/InStock", url: "https://www.valoreparfums.app/products/test-perfume?ml=5" }],
    fullBottleOffer: { ml: 100, price: 8000, available: false, availability: "https://schema.org/BackOrder", url: "https://www.valoreparfums.app/products/test-perfume" },
  };

  for (const metadata of [{}, { rating: 4.9, reviewCount: 1 }, { reviews: [{ rating: 5 }] }]) {
    const perfume = { ...product, ...metadata };
    const schema = buildProductJsonLd(perfume, offers);
    assert.equal(schema["@type"], "Product");
    assert.equal(schema.name, "Test Perfume by Test Brand");
    assert.equal("aggregateRating" in schema, false, "Do not mark up ratings absent from the visible product page");
    assert.equal("review" in schema, false, "Do not invent product reviews");
    assert.equal(schema.offers.length, 2, "Keep offers for product rich-result eligibility");
    assert.equal(schema.offers[0].price, "500");
    assert.equal(schema.offers[0].priceCurrency, "BDT");
    assert.equal(schema.offers[0].availability, "https://schema.org/InStock");
    assert.equal(schema.offers[1].availability, "https://schema.org/BackOrder");
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(schema)));
  }
  console.log(`PASS: ${modulePath} emits factual Product/Offer markup without unsupported reviews or ratings`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
