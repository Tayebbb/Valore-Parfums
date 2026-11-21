"""Reconcile public catalog data with each fixed product and pack in initial HTML."""
import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import requests
from bs4 import BeautifulSoup

root = Path(__file__).resolve().parents[1]
front = "http://127.0.0.1:4317"
api = "http://127.0.0.1:4318/api/"
site = "https://www.valoreparfums.app"
live = json.loads((root / "live-crawl.json").read_text(encoding="utf8"))
catalog = requests.get(api + "perfumes", timeout=30).json()
active = {p["id"]: p for p in catalog if p.get("isActive") is not False}
items = live["urls"]["/shop"]["catalog"]
assert {p["id"] for p in items} == active.keys()
priced = requests.post(api + "pricing", json={"perfumeIds": list(active)}, timeout=30).json()
packs = requests.get(api + "packs", timeout=30).json()

def page(path):
    response = requests.get(front + path, timeout=30)
    response.raise_for_status()
    soup = BeautifulSoup(response.content, "html.parser")
    schemas = [json.loads(el.get_text()) for el in soup.select('script[type="application/ld+json"]')]
    return soup, {s.get("@type"):s for s in schemas if isinstance(s.get("@type"), str)}

def check(item):
    path = item["path"]
    soup, schema = page(path)
    perfume = active[item["id"]]
    group = schema["ProductGroup"]
    assert group["productGroupID"] == perfume["id"] and group["brand"]["name"] == perfume["brand"]
    assert " ".join(perfume["name"].split()) in " ".join(soup.select_one("main h1").stripped_strings).strip().replace("  "," "), (path,perfume["name"],soup.select_one("main h1").get_text())
    prices = {p["ml"]: p for p in priced[perfume["id"]]["prices"]}
    assert len(group["hasVariant"]) == len(prices)
    size_rows = []
    for variant in group["hasVariant"]:
        ml = int(variant["size"].split()[0])
        offer = variant["offers"]
        price = prices[ml]
        assert variant["image"] and group["name"].endswith("decant")
        assert offer["url"] == site + path + "?size=" + str(ml) + "ml"
        assert float(offer["price"]) == price["sellingPrice"] and offer["priceCurrency"] == "BDT"
        assert offer["availability"].endswith("/InStock" if price["available"] else "/OutOfStock")
        visible = [b.get_text("",strip=True).replace(",","").replace(" ","") for b in soup.select("button[aria-pressed]")]
        expected = str(ml) + "ml" + str(price["sellingPrice"]) + "BDT"
        assert any(expected in val for val in visible), (expected,visible)
        size_rows.append({"ml": ml,"BDT": offer["price"],"available": price["available"]})
    crumbs = schema["BreadcrumbList"]["itemListElement"]
    assert crumbs[-1]["item"] == site + path and soup.select_one('nav[aria-label="Breadcrumb"] [aria-current="page"]')
    assert soup.select_one('link[rel=canonical]')["href"] == site + path
    return {"path":path,"name":perfume["name"],"brand":perfume["brand"],"sizes":size_rows}

def check_pack(pack):
    path = "/packs/" + pack["slug"]
    soup, schema = page(path)
    offer = schema["Product"]["offers"]
    assert offer["price"] == pack["finalPrice"] and offer["priceCurrency"] == "BDT"
    assert offer["availability"].endswith("/InStock" if pack["available"] else "/OutOfStock")
    assert pack["name"] in soup.select_one("main h1").get_text()
    assert schema["BreadcrumbList"]["itemListElement"][-1]["item"] == site + path
    body = soup.get_text("",strip=True)
    assert f'{pack["finalPrice"]:,}' in body
    return {"path":path,"BDT":pack["finalPrice"],"available":pack["available"],"mlEach":pack["decantSizeMl"],"items":len(pack["items"])}

with ThreadPoolExecutor(max_workers=3) as pool:
    products = list(pool.map(check, items))
    bundles = list(pool.map(check_pack, packs))
evidence = {"records":len(catalog),"active":len(active),"inactive":len(catalog)-len(active),"products":products,"packs":bundles}
(root/"evidence"/"local-catalog-check.json").write_text(json.dumps(evidence, indent=2,ensure_ascii=False), encoding="utf8")
print(len(products), "product groups", sum(len(p["sizes"]) for p in products), "variants", len(bundles), "packs passed")
