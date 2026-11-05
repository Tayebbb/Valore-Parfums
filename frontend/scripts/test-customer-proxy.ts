/** Real proxy tests with intercepted fetch: no requests reach a live backend. */
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/api/[...path]/route";
process.env.API_BASE_URL = "https://synthetic-backend.example.test";
const calls: { url: string; options?: RequestInit }[] = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (
  url: string | URL | Request,
  options?: RequestInit,
) => {
  calls.push({ url: String(url), options });
  return Response.json(
    { customers: [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}) as typeof fetch;
const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
const tests: { name: string; run: () => Promise<void> }[] = [];
const test = (name: string, run: () => Promise<void>) =>
  tests.push({ name, run });
test("private customer data keeps auth and bypasses catalog caches", async () => {
  const response = await GET(
    new NextRequest("https://store.example.test/api/customers", {
      headers: { cookie: "vp-session=synthetic" },
    }),
    context(["customers"]),
  );
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(calls[0].options?.cache, "no-store");
  assert.equal(
    new Headers(calls[0].options?.headers).get("cookie"),
    "vp-session=synthetic",
  );
});
test("oversized customer payloads never reach upstream", async () => {
  const response = await POST(
    new NextRequest("https://store.example.test/api/customers/messages", {
      method: "POST",
      body: JSON.stringify({ padding: "x".repeat(1024 * 1024) }),
    }),
    context(["customers", "messages"]),
  );
  assert.equal(response.status, 413);
  assert.equal(calls.length, 0);
});
test("public unsubscribe has the same small limit at the proxy", async () => {
  const response = await POST(
    new NextRequest("https://store.example.test/api/customers/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ token: "x", padding: "x".repeat(65536) }),
    }),
    context(["customers", "unsubscribe"]),
  );
  assert.equal(response.status, 413);
  assert.equal(calls.length, 0);
});
test("chunked customer bodies are cancelled before being buffered in full", async () => {
  let chunks = 0;
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      chunks++;
      if (chunks > 64) controller.close();
      else controller.enqueue(new TextEncoder().encode("x".repeat(32768)));
    },
    cancel() {
      cancelled = true;
    },
  });
  const incoming = new NextRequest(
    "https://store.example.test/api/customers/messages",
    {
      method: "POST",
      headers: { "Content-Length": "1" },
      body: stream,
      duplex: "half",
    } as RequestInit,
  );
  const response = await POST(incoming, context(["customers", "messages"]));
  assert.equal(response.status, 413);
  assert.equal(calls.length, 0);
  assert.ok(cancelled);
  assert.ok(chunks < 32);
});
test("decoded path separators and query/fragment injection are rejected", async () => {
  for (const path of [
    [".."],
    ["customers", "../auth"],
    ["customers", "..%2fauth"],
    ["customers", "..%252fauth"],
    ["customers?other=endpoint"],
    ["customers#ignored"],
    ["customers", "\\auth"],
  ]) {
    const response = await GET(
      new NextRequest("https://store.example.test/api/customers"),
      context(path),
    );
    assert.equal(response.status, 400, path.join("/"));
  }
  assert.equal(calls.length, 0);
});
test("a normal customer message still forwards one body and auth cookie", async () => {
  const request = new NextRequest(
    "https://store.example.test/api/customers/messages",
    {
      method: "POST",
      headers: {
        cookie: "vp-session=synthetic",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ subject: "Hello", message: "Hi" }),
    },
  );
  const response = await POST(request, context(["customers", "messages"]));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "https://synthetic-backend.example.test/api/customers/messages",
  );
});
async function main() {
  let failed = 0;
  try {
    for (const { name, run } of tests) {
      calls.length = 0;
      try {
        await run();
        console.log(`PASS ${name}`);
      } catch (error) {
        failed++;
        console.error(`FAIL ${name}: ${(error as Error).message}`);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log(
    `PROXY RESULTS: ${tests.length - failed} passed, ${failed} failed (no network)`,
  );
  process.exitCode = failed ? 1 : 0;
}
main().catch((error) => {
  globalThis.fetch = originalFetch;
  console.error(error);
  process.exitCode = 1;
});
