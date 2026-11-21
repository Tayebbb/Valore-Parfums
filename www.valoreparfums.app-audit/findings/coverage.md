# Coverage by page type

The crawl started at the supplied www homepage. It followed crawlable links, seeded sitemap entries, enumerated application templates and expanded catalog, brand and pack URLs. The local pass also seeded every path in the live ledger. Both passes respected robots.txt, followed up to three redirects and spaced requests one second apart with at most five in flight. Each row counts unique requested paths including their query strings. Direct anonymous visibility probes and lab sessions are reported separately.

| Page type | Live discovered / fetched / robots-excluded | Local discovered / fetched / robots-excluded | Live / local HTTP errors | Mobile page samples per environment |
|---|---:|---:|---:|---|
| home | 1 / 1 / 0 | 1 / 1 / 0 | 0 / 0 | 1 |
| shop | 1 / 1 / 0 | 1 / 1 / 0 | 0 / 0 | 1 |
| shop views | 17 / 17 / 0 | 18 / 18 / 0 | 0 / 0 | 3 (page 2, Women, Women sorted) |
| categories | 4 / 4 / 0 | 4 / 4 / 0 | 0 / 0 | 2 indexes |
| brand | 14 / 14 / 0 | 14 / 14 / 0 | 0 / 1 | 1 (Lattafa) |
| products | 33 / 33 / 0 | 33 / 33 / 0 | 5 / 1 | 1 (Hawas Ice) |
| product variants | 1 / 1 / 0 | 2 / 2 / 0 | 0 / 0 | 1 (10 ml direct entry) |
| packs | 8 / 8 / 0 | 8 / 8 / 0 | 0 / 0 | 1 (Winter Pack) |
| pack index | 1 / 1 / 0 | 1 / 1 / 0 | 0 / 0 | 1 |
| legacy aliases | 2 / 2 / 0 | 4 / 4 / 0 | 0 / 0 | 0 |
| editorial | 6 / 6 / 0 | 6 / 6 / 0 | 0 / 0 | 4 (index, comparison guide, winter article, process) |
| landing pages | 5 / 5 / 0 | 5 / 5 / 0 | 0 / 0 | 1 |
| utility or redirect | 10 / 6 / 4 | 10 / 10 / 0 | 0 / 0 | 2 (cart and checkout) |
| staff | 20 / 2 / 18 | 20 / 0 / 20 | 0 / 0 | 0 |

The sitemap grew from 50 to 64 URLs. The local sitemap adds 13 brand hubs, the blog index and the process page, and omits the permanently redirected comparison guide. The live 33 product-path tests comprise 28 catalog entries, four broken pack aliases and an intentional missing-product probe. Locally the four aliases resolve to the intended product. The only remaining crawl 404s are the deliberately missing product and brand. No requests exhausted the cap or timed out. Product detail reconciliation added 28 product groups, 84 size offers and eight packs beyond the mobile samples.

The application contains 50 page-file templates, including eight with dynamic segments. Public dynamic routes were expanded or sampled through catalog IDs, current and historic slugs, brands, packs and posts. Authenticated staff investment IDs and individual shopper requests were outside the public inventory. Account flows live at /login, /signup, /requests, /track and /wishlist. The crawl count excludes API endpoints, fragments, arbitrary query permutations and nofollow enquiry forms. Additional mobile tests exercised the 10 ml selection, cart and checkout. No signed-in user data was accessed.

**Nine live products missing a home-link path**

- /products/club-de-nuit-intense-man-edp
- /products/bois-blanc-edp
- /products/hayaati-edp
- /products/212-men-nyc-edt
- /products/fakhar-black-edp
- /products/dynasty-edp
- /products/aquatica-edp
- /products/nocturno-edp
- /products/amber-oud-gold-edition-edp

Each appears in the fixed home-linked catalog. [Live ledger](../live-crawl.json) · [Local ledger](../local-crawl.json) · [Catalog reconciliation](../evidence/local-catalog-check.json) · [Redirect evidence](../evidence/host.json)
