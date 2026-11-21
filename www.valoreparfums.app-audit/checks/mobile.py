"""Repeat the anonymous mobile storefront checks. Requires Playwright, Chromium and BeautifulSoup."""

import argparse
import json
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from statistics import median
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
PRODUCT = "/products/hawas-ice-edp"
TEMPLATES = {
    "home": "/",
    "shop": "/shop",
    "category": "/category/decants",
    "product": PRODUCT,
    "guide": "/guides/decant-vs-full-bottle",
    "blog": "/blog/best-winter-perfumes-for-men-in-bangladesh",
    "landing": "/decants-bangladesh",
    "packs": "/packs",
    "pack": "/packs/winter-pack",
}

# Layout instability session windows follow the web-vitals CLS definition.
OBSERVER = """
window.storePerf = {lcp: null, cls: 0, events: []};
let start = -Infinity, last = -Infinity, sum = 0;
new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
        window.storePerf.lcp = Math.round(entry.startTime);
        window.storePerf.lcpElement = entry.element?.tagName;
    }
}).observe({type: 'largest-contentful-paint', buffered: true});
new PerformanceObserver(list => {
    for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        if (e.startTime - last >= 1000 || e.startTime - start >= 5000) {
            start = e.startTime;
            sum = 0;
        }
        last = e.startTime;
        sum += e.value;
        window.storePerf.cls = Math.max(window.storePerf.cls, sum);
    }
}).observe({type: 'layout-shift', buffered: true});
new PerformanceObserver(list => {
    for (const e of list.getEntries()) {
        if (e.interactionId) window.storePerf.events.push({type: e.name, ms: e.duration});
    }
}).observe({type: 'event', buffered: true, durationThreshold: 16});
"""


def summarize(html):
    soup = BeautifulSoup(html, "html.parser")
    main = soup.find("main") or soup
    hrefs = [a.get("href", "") for a in main.select("a[href]")]
    schema = []
    for tag in soup.select('script[type="application/ld+json"]'):
        try:
            schema.append(json.loads(tag.get_text()))
        except ValueError:
            schema.append({"parseError": True})
    return {
        "title": soup.title.get_text(strip=True) if soup.title else None,
        "canonical": [c.get("href") for c in soup.select('link[rel~="canonical"]')],
        "robots": [c.get("content") for c in soup.select('meta[name="robots"]')],
        "h1": [h.get_text(" ", strip=True) for h in main.select("h1")],
        "mainLinks": len(hrefs),
        "productLinks": sorted({u for u in hrefs if urlsplit(u).path.startswith("/products/")}),
        "images": len(main.select("img")),
        "imagesWithoutAlt": sum(not i.get("alt", "").strip() for i in main.select("img")),
        "schemaTypes": [s.get("@type") for s in schema if isinstance(s, dict)],
        "productSchema": [s for s in schema if isinstance(s, dict) and s.get("@type") in ("Product", "ProductGroup")],
    }


def write(path, data):
    path.parent.mkdir(exist_ok=True, parents=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf8")


def measure(args, job):
    template, path = job
    out = {"path": path, "labRuns": []}
    with sync_playwright() as driver:
        browser = driver.chromium.launch(chromium_sandbox=True)
        out["chromium"] = browser.version
        for run in range(args.runs):
            context = browser.new_context(**driver.devices["Pixel 7"], locale="en-GB", timezone_id="Asia/Dhaka")
            page = context.new_page()
            cdp = context.new_cdp_session(page)
            cdp.send("Network.enable")
            cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
            cdp.send("Network.emulateNetworkConditions", {
                "offline": False, "latency": 150, "downloadThroughput": 1600000 / 8,
                "uploadThroughput": 750000 / 8, "connectionType": "cellular4g",
            })
            cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
            page.add_init_script(OBSERVER)
            try:
                response = page.goto(urljoin(args.origin, path), wait_until="load", timeout=90000)
                page.wait_for_timeout(2000)
                perf = page.evaluate("window.storePerf")
                out["labRuns"].append({"lcpMs": perf["lcp"], "lcpElement": perf.get("lcpElement"), "cls": round(perf["cls"], 4)})
                if run == 0:
                    out.update({
                        "status": response.status, "finalURL": page.url,
                        "xRobotsTag": response.headers.get("x-robots-tag"), "raw": summarize(response.body()),
                        "rendered": summarize(page.content()),
                        "horizontalOverflow": page.evaluate("document.documentElement.scrollWidth > innerWidth"),
                        "renderedMainPhoto": page.locator("main img").evaluate_all(
                            "(imgs)=>imgs.slice(0,2).map(i=>({alt:i.alt,complete:i.complete,naturalWidth:i.naturalWidth}))"
                        ),
                    })
                    shot = ROOT / "screenshots" / f"{args.label}-{template}-mobile.jpg"
                    shot.parent.mkdir(parents=True, exist_ok=True)
                    page.screenshot(path=str(shot), type="jpeg", quality=65, timeout=15000)
            except Exception as exc:
                out.setdefault("errors", []).append(str(exc)[:400])
            finally:
                context.close()
        browser.close()
    for field in ("lcpMs", "cls"):
        values = [r[field] for r in out["labRuns"] if r.get(field) is not None]
        if values:
            out[field + "Median"] = median(values)
    print(args.label, template, out.get("status"), out.get("lcpMsMedian"), flush=True)
    return template, out


def shop_smoke(args):
    out = {}
    with sync_playwright() as driver:
        browser = driver.chromium.launch(chromium_sandbox=True)
        page = browser.new_page(**driver.devices["Pixel 7"], locale="en-GB", timezone_id="Asia/Dhaka")
        page.add_init_script(OBSERVER)
        page.set_default_timeout(12000)
        def visit(path):
            page.goto(urljoin(args.origin, path), wait_until="load", timeout=45000)
            page.wait_for_timeout(700)
        def main():
            return page.locator("main").inner_text()
        def cards():
            return page.locator('main a[href*="/products/"]').evaluate_all(
                "(ns)=>ns.map(n=>({url:n.pathname,text:n.innerText})).filter(p=>p.text)"
            )
        def women_cards():
            page.wait_for_function("""() => {
                const cards = [...document.querySelectorAll('main a[href*="/products/"]')];
                return cards.length > 0 && cards.every(a => /women/i.test(a.innerText));
            }""")
            return cards()
        try:
            visit("/shop")
            out["shopBefore"] = cards()
            page.get_by_role("button", name="Filters", exact=True).click()
            page.get_by_role("button", name="For Her", exact=True).click()
            page.wait_for_timeout(900)
            out["filtered"] = {"url": page.url, "cards": women_cards()}
            page.locator("main select:visible").first.select_option(label="Name A→Z")
            page.wait_for_timeout(900)
            out["sorted"] = {"url": page.url, "cards": women_cards()}
            out["filterAndSortEventTiming"] = page.evaluate("window.storePerf.events")
        except Exception as exc:
            out["filterError"] = str(exc)[:500]
        try:
            visit(PRODUCT)
            out["ordinaryBefore"] = {"main": main(), "schema": summarize(page.content())["productSchema"]}
            page.get_by_role("button", name=re.compile(r"10\s*ml", re.I)).first.click()
            page.wait_for_timeout(400)
            out["ordinaryAfter"] = {"url": page.url, "main": main(), "schema": summarize(page.content())["productSchema"]}
            out["variantEventTiming"] = page.evaluate("window.storePerf.events")
            page.get_by_role("button", name="Add to Cart", exact=True).locator("visible=true").last.click()
            visit("/cart")
            out["cart"] = main()
            page.locator('main a[href="/checkout"]:visible').first.click()
            page.wait_for_url("**/checkout", timeout=10000)
            page.wait_for_timeout(500)
            out["checkout"] = {"url": page.url, "h1": page.locator("main h1").all_inner_texts(), "body": main()[:450]}
            visit(PRODUCT + "?size=10ml")
            out["deepLink"] = {"url": page.url, "main": main(), "schema": summarize(page.content())["productSchema"]}
        except Exception as exc:
            out["purchaseError"] = str(exc)[:500]
        if args.edge:
            visit(args.edge)
            out["edge"] = {"url": page.url, "body": main()[:900], "schema": summarize(page.content())["productSchema"],
                           "buttons": page.locator("main button:visible").evaluate_all("(ns)=>ns.map(n=>[n.innerText,n.disabled])")}
        desktop = browser.new_page(viewport={"width": 1440, "height": 900})
        for name, path in (("home", "/"), ("product", PRODUCT)):
            desktop.goto(urljoin(args.origin, path), wait_until="load", timeout=45000)
            desktop.wait_for_timeout(600)
            shot = ROOT / "screenshots" / f"{args.label}-{name}-desktop.jpg"
            shot.parent.mkdir(parents=True, exist_ok=True)
            desktop.screenshot(path=str(shot), type="jpeg", quality=65)
        browser.close()
    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("origin")
    parser.add_argument("label")
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--workers", type=int, default=1)
    parser.add_argument("--edge")
    parser.add_argument("--smoke-only", action="store_true")
    args = parser.parse_args()
    evidence = ROOT / "evidence"
    smoke = shop_smoke(args)
    write(evidence / f"{args.label}-mobile-shopping.json", smoke)
    if not args.smoke_only:
        report = {}
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for name, result in pool.map(lambda job: measure(args, job), TEMPLATES.items()):
                report[name] = result
                write(evidence / f"{args.label}-mobile-templates.json", report)
