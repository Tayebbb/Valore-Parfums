"""Check a stock change without changing catalog data. Only the browser pricing response is replaced."""
import json
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

audit = Path(__file__).resolve().parents[1]
with sync_playwright() as driver:
    browser = driver.chromium.launch(chromium_sandbox=True)
    for label, origin in [("live", "https://www.valoreparfums.app"), ("local", "http://127.0.0.1:4317")]:
        if len(sys.argv) > 1 and label != sys.argv[1]:
            continue
        result = {}
        for case in ["mixed", "sold-out"]:
            ctx = browser.new_context(**driver.devices["Pixel 7"])
            page = ctx.new_page()
            def pricing(route):
                api = route.fetch()
                data = api.json()
                for price in data["prices"]:
                    price["available"] = case == "mixed" and price["ml"] != 10
                    price["inStock"] = price["available"]
                    if price["ml"] == 10:
                        price["sellingPrice"] = 481
                route.fulfill(response=api, json=data)
            page.route("**/api/pricing?perfumeId=*", pricing)
            page.goto(origin + "/products/hawas-ice-edp?size=10ml", wait_until="load", timeout=45000)
            page.get_by_role("button", name=re.compile("481 BDT")).first.wait_for(timeout=20000)
            button = page.get_by_role("button", name=re.compile("481 BDT")).first
            if button.is_enabled():
                button.click()
            body = page.locator("main").inner_text()
            groups = page.locator('script[type="application/ld+json"]').evaluate_all("(els) => els.map(e=>JSON.parse(e.textContent)).filter(x=>['ProductGroup','Product'].includes(x['@type']))")
            schema = groups[0]
            offers = [p["offers"] for p in schema.get("hasVariant",[])] or schema["offers"]
            test_offer = next(p for p in offers if "?size=10ml" in p["url"])
            state = {"url":page.url,"injected10mlBDT":481,"injected10mlAvailable":False,"schema10ml":{k:test_offer[k] for k in ("price","availability")},"canAdd":page.get_by_role("button",name="Add to Cart",exact=True).count()>0,"stockText":[v for v in body.splitlines() if "stock" in v.lower()],"selectedButton":page.locator('button[aria-pressed=true]').all_text_contents()}
            result[case] = state
            ctx.close()
        (audit/"evidence"/(label+"-stock-fixture.json")).write_text(json.dumps(result,indent=2),encoding="utf8")
        print(label,result,flush=True)
        if label=="local":
            assert all(v["schema10ml"]=={"price":481,"availability":"https://schema.org/OutOfStock"} and not v["canAdd"] for v in result.values())
    browser.close()
