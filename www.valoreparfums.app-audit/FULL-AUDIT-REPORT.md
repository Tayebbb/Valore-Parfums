# Valore Parfums storefront SEO audit

**Deployment awaits approval.** The live baseline is 21 November 2026, and the fixed storefront was tested locally on 22 November in Asia/Dhaka. All 28 active fragrances can now be reached from the homepage through ordinary HTML links. All 84 size offers and all eight packs passed local catalog-to-page checks. Organic traffic, Google indexation and sales impact have yet to be measured.

The supplied homepage returned HTTP 200 at **https://www.valoreparfums.app/** with zero redirects. The apex returned 308 to www, and the live robots host, sitemap URLs, Open Graph URL and product canonicals use www. The live homepage itself lacked a canonical tag. The fixed homepage, metadata, schema and sitemap consistently identify www, including when tested on loopback. [Live storefront](https://www.valoreparfums.app/) · [Live sitemap](https://www.valoreparfums.app/sitemap.xml)

## Coverage and outcomes

| Check | Live baseline | Local production build |
|---|---:|---:|
| URL candidates discovered / fetched by crawl | 123 / 101 | 127 / 107 |
| Excluded by robots during crawl | 22 | 20 |
| Active fragrances / packs | 28 / 8 | 28 / 8 |
| Active products reachable from home without JavaScript | 19 / 28 | **28 / 28** |
| Sitemap URLs reachable from home without JavaScript | 30 / 50 | **64 / 64** |
| Product anchors in initial shop HTML, pages 1 and 2 | 0 and 0 | **24 and 4** |
| Formerly broken pack destinations | 4 returned 404 | **4 permanent redirects to the correct product** |
| Mobile home Lighthouse agentic browsing | 1 / 2 | 2 / 2 |

Two separate sources identified the active catalog. The live shop serialized 28 product IDs, and the catalog API contained 36 records, of which 28 were active. The active sets matched. All 28 were in the live sitemap. When category and brand routes were independently seeded, every product already had some inbound anchor. Nine had **no path from the homepage**. The 500-page limit was never reached. The full inventory records source membership, redirect chains, canonicals, status, directives, H1s and outlinks per URL. [Coverage by page type](findings/coverage.md) · [Live URL ledger](live-crawl.json) · [Local URL ledger](local-crawl.json)

## Findings, causes and acceptance checks

| Priority and example | Reproducible live behavior and cause | Fixed behavior verified locally |
|---|---|---|
| High · /shop and /shop?page=2 | Fetch HTML before executing JS. Only a loading skeleton appeared. The client rendered results later, and page 2 pointed its canonical at page 1. | HTML carries 24 + 4 distinct product links, linked pagination and self-canonicals. Explicit price sorting uses available BDT offers. Mobile For Her plus name sort still returns the four matching fragrances. |
| High · /products/hawas-ice-edp?size=10ml | Direct entry showed 5 ml and BDT 259. The selector ignored the URL, and static markup diverged from the hydrated pricing state. | Direct entry and hydration select 10 ml at BDT 479. Switching sizes updates the shareable URL. The matching Product child retains its BDT offer and stock through cart entry. |
| High · /products/hawas-ice-edp | The offer builder published a full-bottle preorder, seven-day returns, fixed validity and BDT 80 shipping throughout Bangladesh. The bottle control was disabled, and configured delivery fees are BDT 80 or 120 by zone. | Only actual size offers appear. A separate enquiry has no purchase offer. A simulated 10 ml price/stock change updates visible and machine-readable data together. No unsupported return, shipping, rating or GTIN claim was added. |
| High · /packs/summer-pack and /products/212-men | Pack item links came from stored slugs while the detail page expected slugs derived from current names. Four linked destinations returned 404. | The pack links to the canonical item. /products/212-men, /products/aquatica, /products/givenchy and /products/khamrah-qahwa each return 308 and land on the matching product. |
| High · /blog, /category/decants and /brand/lattafa | No static navigation path to several categories and guides. The sitemap omitted brand hubs and the blog index. | Footer, blog index and product breadcrumbs expose the hubs to shoppers and crawlers. All 13 current brand hubs and all 64 sitemap destinations are home-reachable. |
| Medium · /login, /checkout and /admin | Seven shopper utility routes inherited index/follow. Several were also crawl-blocked, preventing observation of any later noindex. Staff routes redirect anonymous users. | Utility routes send X-Robots-Tag noindex, nofollow and permit the crawler to read it. Staff routes remain protected and crawl-blocked. Direct anonymous probes of admin and investor retain their login redirects. |
| Medium · /brand/audit-missing-house, /shop?sort=price-asc | A nonexistent brand rendered an indexable 200. Filter and sort views inherited index/follow. | Missing brand, missing product and invalid/out-of-range page return 404. Filter and sort return usable results with noindex, follow and a base-shop canonical. Pagination without filters has a distinct canonical. |
| Medium · /decants-bangladesh and the Lattafa article | Repeated marketing advice and unrelated product links displaced buying information. Twelve distinct long paragraphs occurred across three different pages. The guide/blog pair reused the same article. | The samples share zero long paragraphs. The Lattafa and winter articles link matching active catalog records. The old guide permanently redirects to the comparison article. Each buying landing page has a canonical. |
| Medium · /products/hawas-ice-edp, / and /shop | Product and shop titles repeated the retailer name. A shared logo H1 competed with page headings, and mobile navigation and cart controls lacked names. | Product H1 identifies house, fragrance and recorded concentration. The title uses the site name once. The logo is no longer a heading. Named controls pass the home Lighthouse browsing accessibility check. |

Catalog and checkout tests exercised the normal anonymous purchase path through checkout entry. Hawas Ice 10 ml appeared in the cart at BDT 479 and the checkout page opened. **No order was placed.** All 28 products were in stock, so the sold-out test used controlled browser and server-side fixtures. Brand, volume, price, currency, availability, variant destination and breadcrumbs were checked against the local storefront using real catalog data. [Catalog and buyer intent](findings/catalog-and-intent.md) · [Local route probes](evidence/local-route-controls.json) · [Mobile results](findings/mobile.md)

## Live baseline score

**38/100** on the tests below, using the seo-audit category weights. This diagnostic score is specific to these checks. It does not predict rankings, Google indexation or organic revenue. Field performance and external account data were unavailable.

| Category and weight | Live checks passed | What was counted |
|---|---:|---|
| Technical 22% | 2 / 6 | Canonical host redirect and missing-product 404 passed. Full home reachability, private noindex, page-two canonical and missing-brand 404 failed. |
| Content 23% | 2 / 5 | Fragrance identity and visible catalog notes passed. Distinct guide copy, topical Lattafa recommendations and catalog-backed size copy failed. |
| On-page 20% | 1 / 5 | Named product H1 passed. One H1 per PDP, unique retailer suffix, home canonical and raw shop product links failed. |
| Structured data 10% | 2 / 6 | BDT offers and omission of unsupported ratings passed. Size deep links, refreshed stock, supported delivery/returns and exclusion of disabled full bottles failed. |
| Performance 10% | 5 / 9 | Five of nine mobile lab template medians had LCP at or below 2.5 seconds. This is the lab proxy for scoring. |
| AI search readiness 10% | 1 / 2 | Live Lighthouse browsing passed layout stability and failed the accessibility-tree audit. |
| Images 5% | 2 / 3 | Loaded product hero and named product hero passed. Pack image links lacked a useful pack name. |

For the catalog and shopping review, the observed baseline scored **41/100** using the ecommerce skill weights. Schema used the 2/6 check above. Titles and meta passed product identity and failed the duplicate suffix and factual sizes (1/3). Images and content used the 2/3 and 2/5 checks above. Internal linking passed product-to-shop navigation and failed complete home reachability and working pack links (1/3). Technical used the 2/6 checks above. Google Shopping rankings, feed acceptance and competitive pricing were unavailable.

## Implementation and approval

Both production builds passed. The verification included changed-file ESLint, the product schema regression, security headers, six API proxy tests, sold-out initial HTML, all-catalog offer comparisons, repeated live/local page checks and the mobile cart smoke test. Existing dashboard, withdrawal and documentation work was preserved. The code uses the existing backend pricing engine and store checkout. [Changed files](findings/files.md) · [28-day measurement plan and owner backlog](ACTION-PLAN.md)
