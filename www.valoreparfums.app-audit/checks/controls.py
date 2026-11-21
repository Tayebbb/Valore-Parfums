"""Probe representative route controls directly, independently of crawl exclusions."""
import json
from pathlib import Path
from urllib.parse import urlsplit
import requests
from bs4 import BeautifulSoup
root = Path(__file__).resolve().parents[1]
baseline = json.loads((root/"evidence/live-route-controls.json").read_text(encoding="utf-8-sig"))
out = []
for item in baseline + [{"path":p} for p in ["/shop?page=999","/shop?page=-1","/category/decants?page=2","/brand/audit-missing-house","/products/hawas-ice-edp?size=10ml","/admin/orders","/investor/statement"]]:
    path = item["path"]
    response = requests.get("http://127.0.0.1:4317"+path,allow_redirects=False,timeout=30)
    soup = BeautifulSoup(response.content, "html.parser")
    meta = lambda selector, attr:[el.get(attr) for el in soup.select(selector)]
    row = {"path":path,"status":response.status_code,"robots":meta('meta[name=robots]', 'content'),"xrobots":response.headers.get("X-Robots-Tag"),"location":response.headers.get("Location"),"canonical":meta('link[rel=canonical]','href')}
    if path.split("/")[1] in {"cart","wishlist","checkout","requests","login","signup","track","admin","investor","unsubscribe"}:
        assert row["xrobots"] == "noindex, nofollow", row
    if path.startswith(("/admin","/investor")):
        assert response.is_redirect and urlsplit(row["location"]).path == "/login", row
    if path in ("/no-such-fragrance-audit","/shop?page=999","/shop?page=-1","/brand/audit-missing-house"):
        assert response.status_code == 404, row
    out.append(row)
(root/"evidence/local-route-controls.json").write_text(json.dumps(out, indent=2),encoding="utf8")
print(len(out),"route control probes passed")
