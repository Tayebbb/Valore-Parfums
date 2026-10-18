import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

async function main() {
  const response = await proxy(new NextRequest("https://www.valoreparfums.app/"));
  const policy = response.headers.get("content-security-policy");
  assert.ok(policy, "Responses must have a Content Security Policy");

  const directives = new Map(
    policy.split(";").map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/);
      return [name, sources];
    }),
  );
  const toolbarSources = {
    "script-src": ["https://vercel.live"],
    "connect-src": ["https://vercel.live", "wss://ws-us3.pusher.com"],
    "img-src": ["https://vercel.live", "https://vercel.com"],
    "frame-src": ["https://vercel.live"],
    "style-src": ["https://vercel.live"],
    "font-src": ["https://vercel.live", "https://assets.vercel.com"],
  };
  for (const [directive, sources] of Object.entries(toolbarSources)) {
    for (const source of sources) {
      assert.ok(directives.get(directive)?.includes(source), `${directive} must allow ${source}`);
    }
  }

  assert.deepEqual(directives.get("object-src"), ["'none'"]);
  assert.deepEqual(directives.get("frame-ancestors"), ["'none'"]);
  assert.deepEqual(directives.get("base-uri"), ["'self'"]);
  for (const sources of directives.values()) {
    assert.ok(!sources.includes("*"), "The policy must not allow all origins");
  }
  console.log("PASS: Vercel Toolbar resources are allowed and CSP restrictions remain in place");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
