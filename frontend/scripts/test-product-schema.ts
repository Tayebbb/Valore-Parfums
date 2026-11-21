import assert from "node:assert/strict";
import { buildProductGroup } from "../src/lib/product-group";

const perfume = { id: "test-id", brand: "Test Brand", name: "Test EDP", rating: 4.9, reviewCount: 1 };
const url = "https://www.valoreparfums.app/products/test-edp";
const prices = [
  { ml: 5, sellingPrice: 259, available: true },
  { ml: 10, sellingPrice: 479, available: false },
];
const schema = buildProductGroup(perfume, prices, ["/perfume.jpg"], url, "test-edp");
assert.equal(schema["@type"], "ProductGroup");
assert.equal(schema.productGroupID, perfume.id);
assert.deepEqual(schema.hasVariant.map((v) => v.size), ["5 ml", "10 ml"]);
for (const [i, variant] of schema.hasVariant.entries()) {
  const price = prices[i];
  assert.equal(variant["@type"], "Product");
  assert.equal(variant.offers.price, price.sellingPrice);
  assert.equal(variant.offers.priceCurrency, "BDT");
  assert.equal(variant.offers.url, url + "?size=" + price.ml + "ml");
  assert.equal(variant.offers.availability, "https://schema.org/" + (price.available ? "InStock" : "OutOfStock"));
  assert.equal(variant.image[0], "https://www.valoreparfums.app/perfume.jpg");
}
for (const key of ["aggregateRating", "reviewCount", "shippingDetails", "hasMerchantReturnPolicy", "PreOrder", "priceValidUntil"]) {
  assert.ok(!JSON.stringify(schema).includes(key), "Unexpected unverified field " + key);
}
console.log("PASS ProductGroup matches both offered sizes, stock, prices and deep links");
