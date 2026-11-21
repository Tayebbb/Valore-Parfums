"""Render an entirely sold-out product in production SSR using a loopback-only pricing fixture."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import requests
from bs4 import BeautifulSoup

audit = Path(__file__).resolve().parents[1]
root = audit.parent
results = json.loads((audit/"evidence/local-catalog-check.json").read_text(encoding="utf8"))
item = next(r for r in results["products"] if r["path"] == "/products/hawas-ice-edp")
class SoldOutPricing(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/api/pricing":
            self.send_error(404)
            return
        payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        prices = [{"ml":p["ml"],"sellingPrice":p["BDT"],"available":False} for p in item["sizes"]]
        body = json.dumps({i:{"prices":prices} for i in payload["perfumeIds"]}).encode()
        self.send_response(200)
        self.send_header("Content-Type","application/json")
        self.send_header("Content-Length",str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *args):
        pass

with ThreadingHTTPServer(("127.0.0.1",0),SoldOutPricing) as fixture, tempfile.TemporaryFile() as log:
    threading.Thread(target=fixture.serve_forever,daemon=True).start()
    env=dict(os.environ,API_BASE_URL="http://127.0.0.1:"+str(fixture.server_port))
    port="4321"
    server=subprocess.Popen(["node","node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p",port],cwd=root/"frontend",env=env,stdout=log,stderr=log)
    try:
        for _ in range(30):
            if server.poll() is not None:
                raise RuntimeError("Test storefront unavailable")
            try:
                response=requests.get("http://127.0.0.1:"+port+item["path"]+"?size=10ml",timeout=15)
                break
            except requests.ConnectionError:
                time.sleep(.4)
        response.raise_for_status()
        soup=BeautifulSoup(response.content,"html.parser")
        groups=[json.loads(t.get_text()) for t in soup.select('script[type="application/ld+json"]')]
        group=next(g for g in groups if g.get("@type")=="ProductGroup")
        offers=[v["offers"] for v in group["hasVariant"]]
        assert len(offers)==3 and all(o["availability"].endswith("/OutOfStock") for o in offers)
        buttons=[b.get_text(" ",strip=True) for b in soup.select("main button")]
        assert "Request Stock" in buttons and "Add to Cart" not in buttons
        selected=soup.select_one("button[aria-pressed=true]").get_text(" ",strip=True)
        assert "479" in selected and "out of stock" in selected.lower()
        evidence={"fixture":"Only the server-side pricing service was replaced. All three catalog sizes unavailable.","status":response.status_code,"path":item["path"]+"?size=10ml","selected":selected,"offers":offers,"buttons":buttons}
        (audit/"evidence/local-sold-out-html.json").write_text(json.dumps(evidence,indent=2),encoding="utf8")
        print("PASS sold-out direct-entry HTML, all three offers, stock request, unavailable cart")
    finally:
        server.terminate()
        server.wait(timeout=20)
        fixture.shutdown()
