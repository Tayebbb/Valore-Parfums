# Action plan and measurement

## Before deployment approval

The local implementation addresses product discovery, size and stock accuracy, broken pack links, structured data, search visibility and duplicate buyer content. Review the [full report](FULL-AUDIT-REPORT.md), then choose a deployment date. The checked-in changes require the storefront to reach its configured backend for public search, pricing and packs. No catalog migration is required.

## At an approved release

1. Record the production release time in Asia/Dhaka, commit and any simultaneous campaigns, price, assortment or stock changes.
2. Confirm apex redirects to www. Fetch robots.txt and sitemap.xml. Repeat the home-link crawl, compare both shop pages, and check that a private route sends noindex and an unknown product returns 404.
3. Check Hawas Ice at both size URLs, a formerly broken pack link, a brand page and a real sold-out size when one becomes available. Check one product and one pack with Google's Rich Results Test. Inspect the canonical product and page 2 in Search Console and submit the canonical sitemap.
4. Verify analytics purchase attribution with the store's existing implementation. A transaction ID should be unique, the currency should be BDT, and orders should reconcile with the store's order records using the documented order status and refund rules.

## Compare two complete 28-day windows

Let D be the production deployment date. Baseline is D−28 through D−1. Observation is D+1 through D+28, with the release day excluded. For example, **if** deployment were 22 November 2026, the baseline would be **25 October–21 November** and observation **23 November–20 December**. The actual release date is pending approval. Preserve the native Search Console date convention and use the same GA4 property timezone in both exports. Record both timezones. Export finalized data after the reporting lag.

| Metric | Definition and comparison |
|---|---|
| Bangladesh organic clicks | Search Console, Web search, country Bangladesh, all devices. Export site-wide totals and the canonical product cohort separately. Compare absolute clicks and percentage change. |
| Non-branded visibility | Define retailer-branded variations before export, including Valore Parfums, Valore Perfumes, the domain and verified common misspellings. Manually review ambiguous terms. Keep manufacturer brands such as Rasasi and Lattafa in the non-retailer-branded set. Compare clicks, impressions and distinct visible queries. Report anonymized or omitted query volume separately where possible. |
| Product impressions and CTR | Filter landing pages to the www host and /products/. Compare the same 28 launch-cohort URLs, the nine previously unreachable products, and all current products as separate groups. Use total clicks divided by total impressions. Report absolute impressions and CTR change in percentage points. Track packs separately. |
| Organic orders | With functioning attribution, use GA4 session default channel group Organic Search, Bangladesh, purchases with distinct transaction IDs, and landing page. Compare organic orders, organic sessions and orders per session. Reconcile with store orders and label any mismatch or tracking change. |
| Crawl and experience | Count reachable active products, indexed canonical samples, merchant report errors, and mobile field p75 LCP, INP and CLS if available. Keep lab samples separate. |

**Cadence.** Save the pre-release export and cohort on D. On days 1 and 7 check crawl, response codes, variants, cart and checkout. On day 14 review query/page splits, indexing and new Merchant or Search Console issues. On day 28 close the window, then export once data is final. Compare weekdays, device mix, stockouts, catalog changes, campaigns, holidays and confirmed Google updates. Keep percentage change undefined when baseline is zero. A change in clicks or orders alone does not establish causation.

**Missing baseline.** Search Console, GA4, Merchant Center and Bangladesh organic order attribution were unavailable for this audit. Public PageSpeed Insights returned 429, and the CrUX request returned 403. An absence of access or field observations is missing data, never zero traffic, zero orders or a CWV pass. If order tracking starts at release, the first 28 days establish the first attributable cohort. [Search Console Performance report](https://support.google.com/webmasters/answer/7576553) · [Core Web Vitals](https://web.dev/articles/vitals)

## Owner backlog

- Confirm delivery/service times, return terms, any genuinely verified reviews, GTINs and missing fragrance concentrations before publishing them.
- Confirm the Niche brand assignments and assortment. Measure demand by query and landing page before adding another collection or merging broader sample and decant pages.
- Provide Search Console, analytics and Merchant Center reporting access. Check a production Rich Results Test, Google-selected canonicals, actual crawl/index status, free listings or feed diagnostics and order attribution after release.
- Monitor production mobile performance on shop, category and pack pages. Local timings serve as regression checks. Production CDN behavior and real Bangladesh sessions require post-release data.
