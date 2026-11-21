"""Run the audit against a loopback Next production server and stop it after the checks.

Start the repository backend on 127.0.0.1:4318 first. Run this script from the repo root
after building the frontend with API_BASE_URL=http://127.0.0.1:4318 and
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4317.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import requests

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "www.valoreparfums.app-audit"
ORIGIN = "http://127.0.0.1:4317"
if __name__ == "__main__":
    env = dict(os.environ, API_BASE_URL="http://127.0.0.1:4318", NEXT_PUBLIC_API_BASE_URL=ORIGIN)
    live = json.loads((AUDIT / "live-crawl.json").read_text(encoding="utf8"))
    with tempfile.TemporaryFile() as log:
        server = subprocess.Popen(["node", "node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "4317"],
                                  cwd=ROOT / "frontend", env=env, stdout=log, stderr=log)
        try:
            for _ in range(60):
                if server.poll() is not None:
                    raise RuntimeError("Local server failed to start")
                try:
                    if requests.get(ORIGIN + "/robots.txt", timeout=2).ok:
                        break
                except requests.ConnectionError:
                    pass
                time.sleep(0.5)
            subprocess.run([sys.executable, str(AUDIT / "crawl.py"), ORIGIN, "local", *live["urls"]], cwd=ROOT, check=True)
            for script in ["catalog.py", "controls.py", "stock_fixture.py"]:
                subprocess.run([sys.executable, str(AUDIT / "checks" / script), "local"], cwd=ROOT, check=True)
            subprocess.run([sys.executable, str(AUDIT / "checks/mobile.py"), ORIGIN, "local", "--edge", "/products/hawas-ice-edp"], cwd=ROOT, check=True)
        finally:
            server.terminate()
            server.wait(timeout=20)
