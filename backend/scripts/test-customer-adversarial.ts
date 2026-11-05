/** Adversarial tests for the real routes/auth/transactions. Synthetic data; no network/email/database writes. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports -- Isolated external dependency doubles. */
type Row = Record<string, any>;
const rows = new Map<string, Row>();
let writes = 0;
let failDeliveryCommit = false;
let queue = Promise.resolve();
let cookie = "";
const realNow = Date.now;
let now = realNow();
Date.now = () => now;
const clone = <T>(value: T): T =>
  value === undefined ? value : structuredClone(value);
const snapshot = (path: string) => ({
  id: path.split("/").pop(),
  exists: rows.has(path),
  data: () => clone(rows.get(path)),
});
const doc = (path: string): any => ({
  path,
  id: path.split("/").pop(),
  get: async () => snapshot(path),
  collection: (name: string) => collection(`${path}/${name}`),
  set: async (value: Row, options?: Row) => {
    writes++;
    rows.set(
      path,
      clone(options?.merge ? { ...rows.get(path), ...value } : value),
    );
  },
});
const collection = (path: string, maximum = Infinity, order = ""): any => ({
  doc: (id: string) => doc(`${path}/${id}`),
  select: () => collection(path, maximum, order),
  orderBy: (field: string) => collection(path, maximum, field),
  limit: (count: number) => collection(path, count, order),
  get: async () => ({
    docs: [...rows.keys()]
      .filter(
        (key) =>
          key.startsWith(`${path}/`) &&
          !key.slice(path.length + 1).includes("/"),
      )
      .sort((a, b) =>
        order
          ? String(rows.get(b)?.[order]).localeCompare(
              String(rows.get(a)?.[order]),
            )
          : a.localeCompare(b),
      )
      .slice(0, maximum)
      .map(snapshot),
  }),
});
const db = {
  collection,
  runTransaction(callback: (tx: any) => Promise<unknown>) {
    const run = queue.then(async () => {
      const pending: {
        path: string;
        value: Row;
        create?: boolean;
        update?: boolean;
      }[] = [];
      const result = await callback({
        get: async (ref: any) => {
          assert.equal(
            pending.length,
            0,
            "Firestore requires reads before writes",
          );
          return snapshot(ref.path);
        },
        create: (ref: any, value: Row) =>
          pending.push({ path: ref.path, value, create: true }),
        set: (ref: any, value: Row) => pending.push({ path: ref.path, value }),
        update: (ref: any, value: Row) =>
          pending.push({ path: ref.path, value, update: true }),
      });
      if (
        failDeliveryCommit &&
        pending.some(
          (write) =>
            write.path.includes("/deliveries/") &&
            write.value.status === "sent",
        )
      ) {
        failDeliveryCommit = false;
        throw new Error("Synthetic commit failure after provider acceptance");
      }
      for (const write of pending) {
        if (write.create) assert(!rows.has(write.path));
        if (write.update) assert(rows.has(write.path));
      }
      for (const write of pending) {
        rows.set(
          write.path,
          clone(
            write.update
              ? { ...rows.get(write.path), ...write.value }
              : write.value,
          ),
        );
        writes++;
      }
      return result;
    });
    queue = run.then(
      () => {},
      () => {},
    );
    return run;
  },
};
for (const [path, exports] of [
  [
    "../src/lib/prisma",
    { db, Collections: { orders: "orders", settings: "settings" } },
  ],
  [
    "next/headers",
    {
      cookies: async () => ({
        get: () => (cookie ? { value: cookie } : undefined),
      }),
    },
  ],
] as const) {
  const resolved = require.resolve(path);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
  } as NodeJS.Module;
}
delete process.env.RESEND_API_KEY;
delete process.env.GMAIL_USER;
delete process.env.GMAIL_PASS;
process.env.SESSION_SIGNING_KEY =
  "adversarial-test-session-key-never-used-in-production";
process.env.EMAIL_UNSUBSCRIBE_SECRET =
  "adversarial-test-unsubscribe-key-never-used-in-production";
const {
  signSessionToken,
  verifySessionToken,
} = require("../src/lib/session-token");
const {
  buildCustomerDirectory,
  normalizeCustomerEmail,
} = require("../src/lib/customer-directory");
const {
  generateCustomerMessage,
  parseCustomerMessage,
  createUnsubscribeToken,
  verifyUnsubscribeToken,
  customerEmailId,
} = require("../src/lib/customer-message");
const email = require("../src/lib/email");
const directory = require("../src/app/api/customers/route");
const messages = require("../src/app/api/customers/messages/route");
const delivery = require("../src/app/api/customers/messages/[id]/route");
const preview = require("../src/app/api/customers/preview/route");
const unsubscribe = require("../src/app/api/customers/unsubscribe/route");
const middleware = require("../src/proxy");
const { NextRequest } = require("next/server");
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://www.valoreparfums.app/api/customers/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const dispatch = (id: string) => delivery.POST(request({}), context(id));
const body = {
  subject: "Customer update",
  message: "Hello & welcome.\n\nA useful update.",
  format: "text",
  audience: "all",
};
const sent: Row[] = [];
let adminToken: string;
const fakeProvider = () =>
  email.initializeEmailProvider({
    send: async (notification: Row) => {
      sent.push(clone(notification));
      return { success: true, messageId: randomUUID() };
    },
  });
async function reset() {
  await queue;
  rows.clear();
  writes = 0;
  sent.length = 0;
  cookie = adminToken;
  failDeliveryCommit = false;
  now = realNow();
  fakeProvider();
}
const seed = (count = 1) => {
  for (let i = 0; i < count; i++)
    rows.set(`orders/${i}`, {
      customerEmail: `customer${i}@example.test`,
      customerName: `Customer ${i}`,
      createdAt: "2026-11-01T00:00:00Z",
    });
};
async function create(overrides: Row = {}) {
  const response = await messages.POST(
    request({ ...body, requestId: randomUUID(), ...overrides }),
  );
  assert.ok(response.ok, `Creation failed: ${await response.clone().text()}`);
  return response.json();
}
const tests: { name: string; run: () => Promise<void> | void }[] = [];
const test = (name: string, run: () => Promise<void> | void) =>
  tests.push({ name, run });

test("real auth rejects guest, customer, investor, expired and forged admin cookies on every private route", async () => {
  const user = {
    id: "test",
    name: "Test",
    email: "test@example.test",
    role: "customer",
  };
  const signedCustomer = await signSessionToken(user);
  const candidates = [
    "",
    "garbage",
    JSON.stringify({ ...user, role: "admin" }),
    signedCustomer.replace('"customer"', '"admin"'),
    signedCustomer,
    await signSessionToken({ ...user, role: "investor" }),
  ];
  const expiry = await signSessionToken({ ...user, role: "admin" });
  now += 31 * 86400000;
  assert.equal(await verifySessionToken(expiry), null);
  cookie = expiry;
  for (const invoke of [
    () => directory.GET(),
    () => messages.GET(),
    () => messages.POST(request(body)),
    () => preview.POST(request(body)),
    () => delivery.GET(request({}), context(randomUUID())),
    () => dispatch(randomUUID()),
  ])
    assert.equal((await invoke()).status, 401);
  now = realNow();
  candidates.push(expiry.replace(/.$/, "z"));
  for (const candidate of candidates) {
    cookie = candidate;
    for (const invoke of [
      () => directory.GET(),
      () => messages.GET(),
      () => messages.POST(request(body)),
      () => preview.POST(request(body)),
      () => delivery.GET(request({}), context(randomUUID())),
      () => dispatch(randomUUID()),
    ])
      assert.equal((await invoke()).status, 401);
  }
});
test("cross-origin writes and preflights are blocked by the actual middleware", async () => {
  for (const method of ["POST", "PUT", "DELETE", "OPTIONS"]) {
    const response = await middleware.proxy(
      new NextRequest("https://www.valoreparfums.app/api/customers/messages", {
        method,
        headers: {
          origin: "https://attacker.test",
          host: "www.valoreparfums.app",
          "x-forwarded-for": `test-${method}`,
        },
      }),
    );
    assert.equal(response.status, 403);
  }
});
test("malformed JSON, wrong types, invalid formats and untrusted recipients are rejected", async () => {
  seed();
  for (const invalid of [
    null,
    [],
    {},
    true,
    { ...body, subject: 42 },
    { ...body, format: "javascript" },
    { ...body, message: [] },
    { ...body, subject: "\r\nBcc: bad@example.test" },
    { ...body, message: "x".repeat(50001) },
  ])
    assert.equal((await messages.POST(request(invalid))).status, 400);
  const raw = new Request("https://local.test", {
    method: "POST",
    body: "{broken",
  });
  assert.equal((await messages.POST(raw)).status, 400);
  assert.equal(
    (
      await messages.POST(
        request({
          ...body,
          requestId: randomUUID(),
          audience: "selected",
          emails: ["outside@example.test"],
        }),
      )
    ).status,
    400,
  );
});
test("request IDs are UUIDs, not arbitrary 36-character strings", async () => {
  seed();
  assert.equal(
    (await messages.POST(request({ ...body, requestId: "-".repeat(36) })))
      .status,
    400,
  );
});
test("ambiguous address syntax cannot change SMTP recipients or defeat deduplication", () => {
  for (const invalid of [
    "a(comment)@example.test",
    'a"b@example.test',
    "a\\b@example.test",
    "a@example..test",
    "a@-example.test",
    "a@example.test\u0000",
    "a".repeat(65) + "@example.test",
  ])
    assert.equal(normalizeCustomerEmail(invalid), "", invalid);
  assert.equal(
    normalizeCustomerEmail(" Alice+offer@Example.TEST "),
    "alice+offer@example.test",
  );
});
test("a malformed legacy date cannot take down the entire directory", () => {
  const result = buildCustomerDirectory([
    { customerEmail: "valid@example.test", createdAt: { toString: 123 } },
    { customerEmail: "second@example.test", createdAt: "2026-11-01" },
  ]);
  assert.equal(result.length, 2);
});
test("plain-text alternatives preserve characters instead of HTML entities", () => {
  const notification = generateCustomerMessage(
    parseCustomerMessage(body),
    "customer0@example.test",
  );
  assert.ok(notification.text.includes("Hello & welcome."));
});
test("HTML injection corpus stays inert, including event handlers, encoded schemes, SVG and CSS URLs", () => {
  const payloads = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    '<svg onload=alert(1)><a xlink:href="javascript:alert(1)">bad</a></svg>',
    '<a href="jav&#x61;script:alert(1)">bad</a>',
    '<a href="data:text/html,x">bad</a>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '<p style="background-image:url(javascript:alert(1));position:fixed;z-index:999999">bad</p>',
    '<form action="https://attacker.test"><input name="token"></form>',
    '<meta http-equiv="refresh" content="0;url=https://attacker.test">',
  ];
  for (let i = 0; i < 400; i++) {
    const data = parseCustomerMessage({
      ...body,
      format: "html",
      message: `<p>Visible message ${i}</p>${payloads[i % payloads.length]}`,
    });
    const output = generateCustomerMessage(data, "customer0@example.test").html;
    assert.doesNotMatch(
      output,
      /<script|<svg|<iframe|<form|<input|<meta http-equiv|onerror|onload|javascript:|data:text\/html|position:fixed|z-index:/i,
    );
  }
});
test("unsubscribe tokens reject noncanonical encoding as well as forged signatures", () => {
  const token = createUnsubscribeToken("customer0@example.test");
  assert.equal(verifyUnsubscribeToken(token + "!"), null);
  assert.equal(verifyUnsubscribeToken(token + "="), null);
  for (let i = 0; i < 250; i++)
    assert.equal(
      verifyUnsubscribeToken(randomUUID() + "." + randomUUID()),
      null,
    );
});
test("repeated public unsubscribe is idempotent and does not amplify database writes", async () => {
  const token = createUnsubscribeToken("customer0@example.test");
  await unsubscribe.POST(request({ token }));
  const before = rows.get(
    `customerEmailPreferences/${customerEmailId("customer0@example.test")}`,
  )?.unsubscribedAt;
  const count = writes;
  now += 5000;
  await Promise.all(
    Array.from({ length: 100 }, () => unsubscribe.POST(request({ token }))),
  );
  assert.equal(
    rows.get(
      `customerEmailPreferences/${customerEmailId("customer0@example.test")}`,
    )?.unsubscribedAt,
    before,
  );
  assert.equal(writes, count);
});
test("oversized JSON is rejected before parsing, including ignored properties", async () => {
  seed();
  const response = await messages.POST(
    request({
      ...body,
      requestId: randomUUID(),
      padding: "x".repeat(1024 * 1024),
    }),
  );
  assert.equal(response.status, 413);
});
test("streaming limits do not trust missing or dishonest Content-Length", async () => {
  seed();
  let chunksRead = 0;
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      chunksRead++;
      if (chunksRead > 128) controller.close();
      else controller.enqueue(new TextEncoder().encode("x".repeat(32768)));
    },
    cancel() {
      cancelled = true;
    },
  });
  const incoming = new Request("https://local.test", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": "1" },
    body: stream,
    duplex: "half",
  } as RequestInit);
  const response = await messages.POST(incoming);
  assert.equal(response.status, 413);
  assert.ok(cancelled);
  assert.ok(chunksRead < 32, `Read ${chunksRead} chunks before rejecting`);
});
test("public unsubscribe also bounds body size before JSON parsing", async () => {
  const response = await unsubscribe.POST(
    request({ token: "x", padding: "x".repeat(65536) }),
  );
  assert.equal(response.status, 413);
});
test("250 duplicate creation requests create exactly one campaign", async () => {
  seed();
  const requestId = randomUUID();
  const results = await Promise.all(
    Array.from({ length: 250 }, () =>
      messages.POST(request({ ...body, requestId })),
    ),
  );
  assert.ok(results.every((response) => response.ok));
  assert.equal(
    [...rows.keys()].filter((path) => /^customerMessages\/[^/]+$/.test(path))
      .length,
    1,
  );
  assert.equal(
    (
      await messages.POST(
        request({ ...body, requestId, subject: "Another message" }),
      )
    ).status,
    409,
  );
});
test("uppercase and lowercase forms of one request UUID remain idempotent", async () => {
  seed();
  const requestId = randomUUID();
  const results = await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      messages.POST(
        request({
          ...body,
          requestId: i % 2 ? requestId.toUpperCase() : requestId,
        }),
      ),
    ),
  );
  assert.ok(results.every((response) => response.ok));
  assert.equal(
    [...rows.keys()].filter((path) => /^customerMessages\/[^/]+$/.test(path))
      .length,
    1,
  );
  const details = await delivery.GET(
    request({}),
    context(requestId.toUpperCase()),
  );
  assert.equal(details.status, 200);
  assert.equal((await details.json()).id, requestId);
  await dispatch(requestId.toUpperCase());
  await dispatch(requestId);
  assert.equal(
    sent.length,
    1,
    "Case variations cannot dispatch the same campaign twice",
  );
});
test("250 simultaneous dispatches cannot duplicate one recipient", async () => {
  seed();
  const campaign = await create();
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  email.initializeEmailProvider({
    send: async (notification: Row) => {
      sent.push(notification);
      started();
      await pending;
      return { success: true, messageId: "accepted" };
    },
  });
  const first = dispatch(campaign.id);
  await entered;
  try {
    await Promise.all(Array.from({ length: 250 }, () => dispatch(campaign.id)));
    assert.equal(sent.length, 1);
  } finally {
    release();
    await first;
  }
  for (let i = 0; i < 10; i++) await dispatch(campaign.id);
  assert.equal(sent.length, 1);
});
test("competing campaigns share the provider throttle instead of bursting together", async () => {
  seed();
  const campaigns = await Promise.all(
    Array.from({ length: 50 }, () => create()),
  );
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  email.initializeEmailProvider({
    send: async (notification: Row) => {
      sent.push(notification);
      started();
      await pending;
      return { success: true, messageId: "accepted" };
    },
  });
  const running = Promise.all(
    campaigns.map((campaign: Row) => dispatch(campaign.id)),
  );
  await entered;
  await new Promise((resolve) => setImmediate(resolve));
  try {
    assert.equal(
      sent.length,
      1,
      `Provider received ${sent.length} concurrent emails`,
    );
  } finally {
    release();
    await running;
  }
  const summaries = await (await messages.GET()).json();
  assert.ok(summaries.messages.every((campaign: Row) => campaign.sent <= 1));
});
test("crash after provider acceptance does not resend on resume", async () => {
  seed();
  const campaign = await create();
  failDeliveryCommit = true;
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal((await dispatch(campaign.id)).status, 500);
  } finally {
    console.error = originalError;
  }
  assert.equal(sent.length, 1);
  now += 121000;
  const resumed = await (await dispatch(campaign.id)).json();
  assert.equal(resumed.uncertain, 1);
  assert.equal(resumed.done, true);
  assert.equal(sent.length, 1);
});
test("late opt-outs are skipped and addresses remain private", async () => {
  seed(3);
  const campaign = await create();
  const token = createUnsubscribeToken("customer1@example.test");
  await unsubscribe.POST(request({ token }));
  let result = campaign;
  for (let i = 0; !result.done && i < 12; i++) {
    now += 1000;
    result = await (await dispatch(campaign.id)).json();
  }
  assert.equal(result.done, true);
  assert.equal(result.sent, 2);
  assert.equal(result.skipped, 1);
  assert.ok(
    sent.every(
      (notification) =>
        typeof notification.to === "string" &&
        !notification.to.includes(",") &&
        notification.to !== "customer1@example.test",
    ),
  );
});
test("ambiguous provider failures are marked for review instead of definite rejection", async () => {
  seed();
  const campaign = await create();
  email.initializeEmailProvider({
    send: async (notification: Row) => {
      sent.push(notification);
      return {
        success: false,
        uncertain: true,
        error: "Connection lost after submission",
      };
    },
  });
  const result = await (await dispatch(campaign.id)).json();
  assert.equal(result.done, true);
  assert.equal(result.uncertain, 1);
  assert.equal(result.failed, 0);
  await dispatch(campaign.id);
  assert.equal(sent.length, 1);
});
test("200,000 repeat orders collapse correctly without quadratic grouping", () => {
  const orders = Array.from({ length: 200000 }, (_, i) => ({
    customerEmail: `${i % 2 ? " USER" : "user"}${i % 5000}@Example.TEST${i % 2 ? " " : ""}`,
    createdAt: "2026-11-01T00:00:00Z",
  }));
  const started = performance.now();
  const customers = buildCustomerDirectory(orders);
  const elapsed = performance.now() - started;
  assert.equal(customers.length, 5000);
  assert.equal(
    customers.reduce(
      (total: number, customer: Row) => total + customer.orderCount,
      0,
    ),
    200000,
  );
  assert.ok(customers.every((customer: Row) => customer.orderCount === 40));
  console.log(
    `  DIRECTORY STRESS: 200,000 orders / 5,000 unique emails in ${Math.round(elapsed)}ms`,
  );
});
test("maximum 5,000-recipient campaign completes through real routes with failures and late opt-outs", async () => {
  seed(5000);
  const campaign = await create();
  let optedOut = 0;
  for (let i = 0; i < 5000; i += 97) {
    const address = `customer${i}@example.test`;
    rows.set(`customerEmailPreferences/${customerEmailId(address)}`, {
      email: address,
      unsubscribed: true,
    });
    optedOut++;
  }
  let rejected = 0;
  email.initializeEmailProvider({
    send: async (notification: Row) => {
      sent.push({
        to: notification.to,
        idempotencyKey: notification.idempotencyKey,
      });
      const success = sent.length % 17 !== 0;
      if (!success) rejected++;
      return {
        success,
        messageId: success ? "synthetic-accepted" : undefined,
        error: success ? undefined : "Synthetic provider rejection",
      };
    },
  });
  let result = campaign;
  const started = performance.now();
  for (let i = 0; !result.done && i < 5010; i++) {
    now += 1000;
    const response = await dispatch(campaign.id);
    assert.equal(response.status, 200);
    result = await response.json();
  }
  assert.equal(result.done, true);
  assert.equal(result.skipped, optedOut);
  assert.equal(result.failed, rejected);
  assert.equal(result.sent + result.failed + result.skipped, 5000);
  assert.equal(
    new Set(sent.map((notification) => notification.to)).size,
    sent.length,
    "Every attempted address occurs exactly once",
  );
  assert.equal(
    new Set(sent.map((notification) => notification.idempotencyKey)).size,
    sent.length,
  );
  await dispatch(campaign.id);
  assert.equal(
    sent.length + optedOut,
    5000,
    "Replaying a completed large campaign sends nothing else",
  );
  console.log(
    `  DELIVERY STRESS: ${result.total} recipients, ${result.sent} accepted, ${result.failed} rejected, ${result.skipped} late opt-outs in ${Math.round(performance.now() - started)}ms`,
  );
});
test("recipient count and document byte limits reject oversized campaigns without partial writes", async () => {
  seed(5001);
  assert.equal(
    (await messages.POST(request({ ...body, requestId: randomUUID() }))).status,
    400,
  );
  assert.equal(writes, 0);
  rows.clear();
  for (let i = 0; i < 4000; i++)
    rows.set(`orders/${i}`, {
      customerEmail: `u${String(i).padStart(63, "0")}@${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(56)}.test`,
    });
  const response = await messages.POST(
    request({ ...body, requestId: randomUUID() }),
  );
  assert.equal(response.status, 400);
  assert.equal(writes, 0);
});
test("maximum-length deeply nested HTML remains bounded and safe", () => {
  const input =
    "<div>".repeat(4500) + "Visible content" + "</div>".repeat(4500);
  const started = performance.now();
  const parsed = parseCustomerMessage({
    ...body,
    format: "html",
    message: input,
  });
  const output = generateCustomerMessage(parsed, "customer0@example.test");
  assert.match(output.html, /Visible content/);
  assert.match(output.text, /Visible content/);
  console.log(
    `  HTML STRESS: 4,500 nested elements in ${Math.round(performance.now() - started)}ms`,
  );
});

async function main() {
  adminToken = await signSessionToken({
    id: "admin",
    name: "Admin",
    email: "admin@example.test",
    role: "admin",
  });
  let failed = 0;
  const selectedTests = tests.filter(
    (entry) =>
      !process.env.CUSTOMER_TEST_FILTER ||
      entry.name.includes(process.env.CUSTOMER_TEST_FILTER),
  );
  assert.ok(selectedTests.length, "No tests matched the requested filter");
  for (const { name, run } of selectedTests) {
    await reset();
    const started = performance.now();
    try {
      await run();
      console.log(
        `PASS ${name} (${Math.round(performance.now() - started)}ms)`,
      );
    } catch (error) {
      failed++;
      console.error(`FAIL ${name}: ${(error as Error).message}`);
    }
  }
  Date.now = realNow;
  console.log(
    `ADVERSARIAL RESULTS: ${selectedTests.length - failed} passed, ${failed} failed; synthetic storage/provider only`,
  );
  process.exitCode = failed ? 1 : 0;
}
main().catch((error) => {
  Date.now = realNow;
  console.error(error);
  process.exitCode = 1;
});
