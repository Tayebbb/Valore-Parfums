# Mobile shopping, performance and accessibility

**Field measurements unavailable.** The public PageSpeed Insights request returned HTTP 429. CrUX returned HTTP 403 and the Google credential check found no API key or Search Console access. Bangladesh real-user p75 LCP, INP and CLS are unknown. No ranking or conversion lift can be inferred from this comparison.

**Mobile lab method.** Three sandboxed Chromium 148 Pixel 7 emulations per template, Asia/Dhaka timezone, fresh context, cache disabled, 4× CPU slowdown, 150 ms latency, 1.6 Mbps down and 750 kbps up. The observer recorded LCP and layout shifts through two seconds after load. Measurements ran on this computer. Timezone and throttling do not reproduce Bangladesh network routing. Localhost and the production CDN have different latency, cache and image optimization behavior. The performance table is a regression reference.

| Template | Live LCP median | Local LCP median | Live / local CLS | Live raw → mobile main links | Local raw → mobile main links |
|---|---:|---:|---:|---:|---:|
| / | 2.380 s | 1.636 s | 0 / 0 | 23 → 23 | 23 → 23 |
| /shop | 4.260 s | 2.376 s | 0 / 0 | 0 → 26 | 26 → 26 |
| /category/decants | 3.036 s | 1.872 s | 0 / 0 | 26 → 26 | 26 → 26 |
| /products/hawas-ice-edp | 2.052 s | 1.448 s | 0 / 0 | 1 → 1 | 4 → 4 |
| /guides/decant-vs-full-bottle | 1.712 s | 1.388 s | 0 / 0 | 13 → 13 | 1 → 1 |
| /blog/best-winter-perfumes-for-men-in-bangladesh | 1.744 s | 1.156 s | 0 / 0 | 13 → 13 | 9 → 9 |
| /decants-bangladesh | 1.756 s | 1.176 s | 0 / 0 | 13 → 13 | 1 → 1 |
| /packs | 3.040 s | 1.812 s | 0 / 0 | 16 → 16 | 16 → 16 |
| /packs/winter-pack | 2.540 s | 1.884 s | 0 / 0 | 5 → 5 | 6 → 6 |

**Live interaction sample.** Filter, sort and size controls generated observed event durations of 16 ms. These are individual lab interactions; field INP requires real visit data.

**Local interaction sample.** Filter, sort and size controls generated observed event durations of 16–24 ms. These are individual lab interactions; field INP requires real visit data.

The original shop delivered zero main links before JavaScript and 26 after mobile rendering. The fixed shop delivers the same 26 links at both stages, including 24 product destinations. Direct 10 ml entry now matches initial HTML, hydrated selection, cart unit price and the corresponding offer. Both versions completed add-to-cart and checkout entry. The old guide reaches the canonical blog article locally via a redirect. Additional mobile probes covered brand, blog index, process guide, full-bottle category and shop page 2. The nine main templates showed no horizontal overflow.

All nine live CLS medians were zero. Live shop LCP was 4.260 s, while the decant category and pack listing also exceeded 2.5 s. The main shop now supplies the listing on the server and prioritizes its first product image. Inspect production field data after deployment before assigning a mobile CWV pass.

The mobile home Lighthouse 13.6.0 browsing audit recorded 1/2 live and 2/2 locally. The live header lacked accessible names on icon controls. The site has no llms.txt, UCP profile or AI resource manifest in either environment. Their absence alone does not block ordinary search or shopping. The public store uses Organization schema and social profile links. Location and GBP/map ranking were not scored for this online storefront.

[Live lab data](../evidence/live-mobile-templates.json) · [Local lab data](../evidence/local-mobile-templates.json) · [Local mobile shopping](../evidence/local-mobile-shopping.json) · [Screenshots](../screenshots/) · [Live Lighthouse](../evidence/live-lighthouse-agentic.json) · [Local Lighthouse](../evidence/local-lighthouse-agentic.json)
