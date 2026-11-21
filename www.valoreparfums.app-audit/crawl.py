"""Run from the repository root: python www.valoreparfums.app-audit/crawl.py ORIGIN LABEL.

Public HTML only. Inspect homepage-reachable anchors separately from sitemap/catalog seeds.
Requires requests and beautifulsoup4.
"""
import json
import re
import sys
import time
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit

import requests
from bs4 import BeautifulSoup

origin, label = sys.argv[1:3]
origin = origin.rstrip("/")
out = Path(__file__).parent
live = "www.valoreparfums.app"
local = urlsplit(origin).netloc
ua = {"User-Agent": "ValoreStorefrontAudit/1.0", "Accept": "text/html"}
robots = requests.get(origin + "/robots.txt", headers=ua, timeout=30)
robots.raise_for_status()
rules = []
applies = False
for line in robots.text.splitlines():
    key, _, value = line.partition(":")
    key, value = key.strip().lower(), value.strip()
    if key == "user-agent":
        applies = value == "*"
    if applies and key in {"allow", "disallow"} and value:
        rules.append((value, key == "allow"))


def allowed(path):
    return max(((len(prefix), allow) for prefix, allow in rules if path.startswith(prefix)), default=(0, True))[1]


def normalize(url, base="/"):
    parts = urlsplit(urljoin(origin + base, url))
    if parts.scheme not in {"http", "https"} or parts.netloc not in {local, live}:
        return None
    return urlunsplit(("", "", parts.path or "/", parts.query, ""))


def kind(path):
    plain = path.split("?")[0]
    if path == "/":
        return "home"
    if plain.startswith("/shop"):
        return "shop views" if "?" in path else "shop"
    if plain.startswith(("/perfume/", "/brand/")) and plain.count("/") > (1 if plain.startswith("/perfume/") else 2):
        return "legacy aliases"
    if plain.startswith("/products/"):
        return "product variants" if "?" in path else "products"
    if plain == "/packs":
        return "pack index"
    if plain.startswith("/packs/"):
        return "packs"
    if plain.startswith("/brand/"):
        return "brand"
    if plain.startswith("/category/"):
        return "categories"
    if plain.startswith(("/blog", "/guides/", "/sterile-decant")):
        return "editorial"
    if plain in {"/buy-perfume-samples","/decants-bangladesh","/full-bottle-perfume-bd","/affordable-perfume-decants","/niche-perfume-decants"}:
        return "landing pages"
    if plain.startswith(("/admin", "/investor")):
        return "staff"
    return "utility or redirect"


def fetch(path):
    current, redirects = path, []
    try:
        for hops in range(4):
            if not allowed(current):
                return {"blocked": True, "final": current, "redirects": redirects}
            response = requests.get(origin + current, timeout=30, allow_redirects=False, headers=ua)
            if not response.is_redirect:
                break
            target = normalize(response.headers["Location"], current)
            redirects.append([response.status_code, target or "(external)"])
            if not target or hops == 3:
                return {"status": response.status_code, "redirects": redirects, "final": current}
            current = target
        entry = {"status": response.status_code, "redirects": redirects, "final": current}
        if "text/html" not in response.headers.get("Content-Type", ""):
            return entry
        soup = BeautifulSoup(response.content, "html.parser")
        entry["title"] = soup.title.get_text(strip=True) if soup.title else None
        entry["h1"] = [el.get_text(" ", strip=True) for el in soup.select("h1")]
        entry["canonical"] = [el.get("href") for el in soup.select('link[rel="canonical"]')]
        entry["robots"] = [el.get("content") for el in soup.select('meta[name="robots"]')]
        entry["x_robots"] = response.headers.get("X-Robots-Tag")
        links = {normalize(el["href"], current) for el in soup.select("a[href]") if el["href"] and "nofollow" not in (el.get("rel") or [])}
        entry["links"] = sorted(link for link in links if link and not re.search(r"\.(?:png|jpg|jpeg|webp|svg|ico|pdf)$", link, re.I))
        if path == "/shop":
            flight = "".join(json.loads(el.get_text()[len("self.__next_f.push("):-1])[1]
                             for el in soup.find_all("script") if el.get_text().startswith("self.__next_f.push([1,"))
            match = re.search(r'"initialPerfumes":(\[)', flight)
            if match:
                records, _ = json.JSONDecoder().raw_decode(flight[match.start(1):])
                entry["catalog"] = []
                for item in records:
                    brand = re.sub(r"[^a-z0-9]+", "-", item["brand"].lower().replace("'", "")).strip("-")
                    slug = item["slug"]
                    entry["catalog"].append({"name": item["name"], "brand": item["brand"], "slug": slug,
                                            "brandSlug": brand, "id": item["id"],
                                            "path": item.get("canonicalPath") or "/products/" + slug.removeprefix(brand + "-")})
        return entry
    except (ValueError, requests.RequestException) as exc:
        return {"error": str(exc), "final": current, "redirects": redirects}


sitemap_response = requests.get(origin + "/sitemap.xml", headers=ua, timeout=30)
sitemap_response.raise_for_status()
sitemap = [normalize(el.text) for el in ET.fromstring(sitemap_response.content).findall("{*}url/{*}loc")]
routes = []
for page in Path("frontend/src/app").rglob("page.tsx"):
    parts = [p for p in page.parent.relative_to("frontend/src/app").parts if not p.startswith("(")]
    routes.append("/" + "/".join(parts))
sources = defaultdict(set)
seeds = deque()
pages = {}


def discover(path, source):
    if path and path not in sources:
        seeds.append(path)
    if path:
        sources[path].add(source)


discover("/", "entry")
discover("/shop", "route")
for path in sitemap:
    discover(path, "sitemap")
for route in sorted(routes):
    if "[" not in route:
        discover(route, "route")
for probe in ("/shop?page=2", "/shop?sort=price-asc", "/shop?category=Women", "/products/audit-missing-fragrance", "/brand/audit-missing-house"):
    discover(probe, "test")
for path in sys.argv[3:]:
    discover(path, "comparison")
with ThreadPoolExecutor(max_workers=5) as pool:
    while seeds and len(pages) < 500:
        batch = []
        while seeds and len(batch) < min(5, 500 - len(pages)):
            path = seeds.popleft()
            if allowed(path):
                batch.append(path)
            else:
                pages[path] = {"blocked": True}
        futures = []
        for path in batch:
            futures.append(pool.submit(fetch, path))
            time.sleep(1)
        for path, future in zip(batch, futures):
            entry = pages[path] = future.result()
            if entry.get("status") == 429:
                time.sleep(30)
                pages[path] = entry = fetch(path)
            for link in entry.get("links", []):
                discover(link, "anchor")
            if entry.get("redirects"):
                discover(entry["final"], "redirect")
            for i, item in enumerate(entry.get("catalog", [])):
                discover(item["path"], "catalog")
                discover("/brand/" + item["brandSlug"], "brand catalog")
                if i == 0:
                    discover("/perfume/" + item["id"], "legacy template sample")
                    discover("/brand/" + item["brandSlug"] + "/" + item["slug"], "legacy template sample")
                    discover(item["path"] + "?size=10ml", "variant sample")
reachable, queue = set(), deque(["/"])
while queue:
    path = queue.popleft()
    if path in reachable:
        continue
    reachable.add(path)
    entry = pages.get(path, {})
    if entry.get("redirects"):
        queue.append(entry["final"])
    if entry.get("status") == 200:
        queue.extend(entry.get("links", []))
catalog = pages.get("/shop", {}).get("catalog", [])
inbound = defaultdict(set)
for path, entry in pages.items():
    if entry.get("status") == 200 and not entry.get("redirects"):
        for link in entry.get("links", []):
            if link != path:
                inbound[link].add(path)
by_type = defaultdict(Counter)
for path, src in sorted(sources.items()):
    entry = pages.get(path, {})
    row = by_type[kind(path)]
    row["discovered"] += 1
    key = "blocked" if entry.get("blocked") and not entry.get("redirects") else "crawled" if entry else "over_limit"
    row[key] += 1
    if entry.get("error") or (entry.get("status") or 0) >= 400:
        row["error_or_http_4xx_5xx"] += 1
    if "sitemap" in src:
        row["sitemap"] += 1
    if path in reachable:
        row["home_reachable"] += 1
report = {"origin": origin, "robots": robots.text, "sitemap_urls": sitemap, "route_templates": sorted(routes),
          "catalog_count": len(catalog), "catalog_not_in_sitemap": [i["path"] for i in catalog if i["path"] not in sitemap],
          "catalog_without_inbound": [i["path"] for i in catalog if not inbound[i["path"]]],
          "catalog_unreachable_from_home": [i["path"] for i in catalog if i["path"] not in reachable],
          "counts": by_type, "urls": {p: {"sources": sorted(src), "home_reachable": p in reachable,
                                           **pages.get(p, {})} for p, src in sorted(sources.items())}}
(out / (label + "-crawl.json")).write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")
print(json.dumps({k: v for k, v in report.items() if k in ("catalog_count", "catalog_not_in_sitemap","catalog_without_inbound","catalog_unreachable_from_home","counts")}, indent=2))
