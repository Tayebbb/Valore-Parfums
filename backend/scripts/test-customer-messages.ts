/** Isolated integration tests: real routes and transactions, fake Firestore/email. No external writes. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildCustomerDirectory } from "../src/lib/customer-directory";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports -- External dependency doubles. */
type Row = Record<string, any>;
const rows = new Map<string, Row>();
const snapshot = (path: string) => ({
  id: path.split("/").pop(),
  exists: rows.has(path),
  data: () => rows.get(path),
});
const ref = (path: string): any => ({
  path,
  id: path.split("/").pop(),
  get: async () => snapshot(path),
  collection: (name: string) => collection(`${path}/${name}`),
  set: async (value: Row, options?: Row) =>
    rows.set(path, options?.merge ? { ...rows.get(path), ...value } : value),
});
const collection = (path: string, maximum = Infinity): any => ({
  doc: (id: string) => ref(`${path}/${id}`),
  select: () => collection(path, maximum),
  orderBy: () => collection(path, maximum),
  limit: (count: number) => collection(path, count),
  get: async () => ({
    docs: [...rows.keys()]
      .filter(
        (key) =>
          key.startsWith(`${path}/`) &&
          !key.slice(path.length + 1).includes("/"),
      )
      .slice(0, maximum)
      .map(snapshot),
  }),
});
let queue: Promise<unknown> = Promise.resolve();
const fakeDb = {
  collection,
  runTransaction(callback: (tx: any) => Promise<unknown>) {
    const run = queue.then(async () => {
      const writes: (() => void)[] = [];
      const result = await callback({
        get: async (reference: any) => snapshot(reference.path),
        create: (reference: any, data: Row) =>
          writes.push(() => {
            assert(!rows.has(reference.path));
            rows.set(reference.path, data);
          }),
        set: (reference: any, data: Row) =>
          writes.push(() => rows.set(reference.path, data)),
        update: (reference: any, data: Row) =>
          writes.push(() =>
            rows.set(reference.path, { ...rows.get(reference.path), ...data }),
          ),
      });
      writes.forEach((write) => write());
      return result;
    });
    queue = run.catch(() => {});
    return run;
  },
};
let admin: Row | null = {
  id: "admin",
  name: "Admin",
  email: "admin@example.test",
  role: "admin",
};
for (const [path, exports] of [
  ["../src/lib/auth", { requireAdmin: async () => admin }],
  ["../src/lib/prisma", { db: fakeDb, Collections: { orders: "orders" } }],
] as const) {
  const resolved = require.resolve(path);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
  } as NodeJS.Module;
}
// Never initialize a live email provider, even on a developer machine with credentials.
delete process.env.RESEND_API_KEY;
delete process.env.GMAIL_USER;
delete process.env.GMAIL_PASS;
process.env.EMAIL_UNSUBSCRIBE_SECRET =
  "customer-tests-only-signing-key-32-characters";
const email = require("../src/lib/email");
const {
  parseCustomerMessage,
  generateCustomerMessage,
  createUnsubscribeToken,
  verifyUnsubscribeToken,
  customerEmailId,
} = require("../src/lib/customer-message");
const directoryRoute = require("../src/app/api/customers/route");
const messagesRoute = require("../src/app/api/customers/messages/route");
const deliveryRoute = require("../src/app/api/customers/messages/[id]/route");
const previewRoute = require("../src/app/api/customers/preview/route");
const unsubscribeRoute = require("../src/app/api/customers/unsubscribe/route");
const request = (body: Row) =>
  new Request("http://localhost/api/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const message = {
  subject: "A Valore update",
  message: "Hello & welcome!\n\nA second paragraph.",
  format: "text",
};
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const deliver = (id: string) => deliveryRoute.POST(request({}), context(id));
const sent: Row[] = [];

async function main() {
  const orders = Array.from({ length: 100 }, (_, i) => ({
    customerEmail: i % 2 ? "  Alice@Example.test " : "alice@example.test",
    customerName: "Alice",
    createdAt: "2026-11-01",
  }));
  const directory = buildCustomerDirectory([
    ...orders,
    {
      recipientEmail: "legacy@example.test",
      createdAt: { toDate: () => new Date("2026-10-01") },
    },
    { customerEmail: "lead@example.test", entryType: "request" },
    { customerEmail: "stock@example.test", orderSource: "stock_request" },
    { customerEmail: "invalid" },
  ]);
  assert.equal(directory.length, 2);
  assert.equal(directory[0].email, "alice@example.test");
  assert.equal(
    directory[0].orderCount,
    100,
    "100 orders produce exactly one normalized email",
  );
  assert.equal(directory[1].lastOrderAt, "2026-10-01T00:00:00.000Z");
  assert.throws(() =>
    parseCustomerMessage({
      ...message,
      subject: "Header\r\nBcc:bad@example.test",
    }),
  );
  assert.throws(() =>
    parseCustomerMessage({
      ...message,
      message: "<script>alert(1)</script>",
      format: "html",
    }),
  );
  assert.throws(() =>
    parseCustomerMessage({ ...message, message: "x".repeat(50001) }),
  );
  const formatted = generateCustomerMessage(
    parseCustomerMessage(message),
    "alice@example.test",
  );
  assert.match(formatted.html, /VALORE PARFUMS/);
  assert.match(formatted.html, /Hello &amp; welcome!/);
  assert.match(formatted.html, /Unsubscribe from promotional emails/);
  const clean = generateCustomerMessage(
    parseCustomerMessage({
      ...message,
      format: "html",
      message:
        '<p style="color:#123456;position:fixed" onclick="alert(1)">Offer <strong>today</strong></p><script>alert(1)</script><a href="javascript:alert(1)">Link</a><img src="https://example.test/image.png" onerror="alert(1)">',
    }),
    "alice@example.test",
  );
  assert.match(clean.html, /<strong>today<\/strong>/);
  assert.match(clean.html, /color:#123456/);
  assert.doesNotMatch(
    clean.html,
    /onclick|onerror|javascript:|<script|position:fixed/,
  );
  const token = createUnsubscribeToken("alice@example.test");
  assert.equal(verifyUnsubscribeToken(token), "alice@example.test");
  assert.equal(verifyUnsubscribeToken(`${token}x`), null);
  assert.equal(verifyUnsubscribeToken("bad.token"), null);

  const unauth = async () => {
    admin = null;
    assert.equal((await directoryRoute.GET()).status, 401);
    assert.equal((await messagesRoute.GET()).status, 401);
    assert.equal((await messagesRoute.POST(request({}))).status, 401);
    assert.equal((await previewRoute.POST(request(message))).status, 401);
    assert.equal((await deliver(randomUUID())).status, 401);
    assert.equal(
      (await deliveryRoute.GET(request({}), context(randomUUID()))).status,
      401,
    );
    admin = {
      id: "admin",
      name: "Admin",
      email: "admin@example.test",
      role: "admin",
    };
  };
  await unauth();
  for (let i = 0; i < orders.length; i++) rows.set(`orders/${i}`, orders[i]);
  rows.set("orders/bob", {
    customerEmail: "bob@example.test",
    customerName: "Bob",
    createdAt: "2026-10-31",
  });
  rows.set("orders/carol", {
    customerEmail: "carol@example.test",
    customerName: "Carol",
    createdAt: "2026-10-30",
  });
  rows.set("orders/lead", {
    customerEmail: "lead@example.test",
    entryType: "request",
  });
  rows.set(
    `customerEmailPreferences/${customerEmailId("carol@example.test")}`,
    { email: "carol@example.test", unsubscribed: true },
  );
  assert.equal(
    (
      await messagesRoute.POST(
        request({ ...message, requestId: randomUUID(), audience: "all" }),
      )
    ).status,
    503,
    "Missing email setup is visible",
  );
  email.initializeEmailProvider({
    send: async (notification: Row) => {
      sent.push(notification);
      return { success: true, messageId: "test-only" };
    },
  });
  const listing = await (await directoryRoute.GET()).json();
  assert.equal(listing.customers.length, 3);
  assert.equal(listing.canSend, true);
  assert.equal(
    listing.customers.find(
      (customer: Row) => customer.email === "carol@example.test",
    ).unsubscribed,
    true,
  );
  assert.equal((await previewRoute.POST(request(message))).status, 200);
  const id = randomUUID();
  const body = { ...message, audience: "all", requestId: id };
  const [first, retry] = await Promise.all([
    messagesRoute.POST(request(body)),
    messagesRoute.POST(request(body)),
  ]);
  assert.equal(
    (await first.json()).total,
    2,
    "Already unsubscribed customers aren't queued",
  );
  assert.equal(
    (await retry.json()).id,
    id,
    "Creation retries share the same message",
  );
  assert.equal(
    [...rows.keys()].filter((key) => key.startsWith("customerMessages/"))
      .length,
    1,
  );
  assert.equal(
    (await messagesRoute.POST(request({ ...body, subject: "Changed" }))).status,
    409,
  );
  assert.equal(
    (
      await messagesRoute.POST(
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
  const selected = await (
    await messagesRoute.POST(
      request({
        ...body,
        requestId: randomUUID(),
        audience: "selected",
        emails: ["Alice@Example.test", " alice@example.test "],
      }),
    )
  ).json();
  assert.equal(
    selected.total,
    1,
    "Selected recipients are deduplicated again on the server",
  );

  let release!: () => void;
  let started!: () => void;
  const startedSending = new Promise<void>((resolve) => {
    started = resolve;
  });
  email.initializeEmailProvider({
    send: async (notification: Row) => {
      sent.push(notification);
      started();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { success: true, messageId: "accepted" };
    },
  });
  const inFlight = deliver(id);
  await startedSending;
  const concurrent = await (await deliver(id)).json();
  assert.equal(concurrent.sent, 0);
  assert.equal(
    sent.length,
    1,
    "Concurrent dispatches cannot send the same recipient twice",
  );
  release();
  assert.equal((await (await inFlight).json()).sent, 1);
  assert.equal(sent[0].to, "alice@example.test");
  assert.equal(
    typeof sent[0].to,
    "string",
    "Recipient addresses are never exposed in a shared To list",
  );
  assert.match(sent[0].idempotencyKey, /^customer-message\//);
  assert.equal(
    (
      await unsubscribeRoute.POST(
        request({ token: createUnsubscribeToken("bob@example.test") }),
      )
    ).status,
    200,
  );
  const complete = await (await deliver(id)).json();
  assert.equal(complete.done, true);
  assert.equal(
    complete.skipped,
    1,
    "Unsubscribe between queueing and delivery is honored",
  );
  assert.equal(sent.length, 1);
  await deliver(id);
  assert.equal(sent.length, 1, "Completed campaigns never send again");
  assert.equal(
    (await unsubscribeRoute.POST(request({ token: "forged" }))).status,
    400,
  );
  assert.equal((await unsubscribeRoute.POST(request({ token }))).status, 200);
  assert.equal(
    (await unsubscribeRoute.POST(request({ token }))).status,
    200,
    "Repeated unsubscribe is harmless",
  );
  assert.equal((await directoryRoute.GET()).status, 200);

  email.initializeEmailProvider({
    send: async () => ({ success: false, error: "Provider rejected test" }),
  });
  const failure = await (await deliver(selected.id)).json();
  // Alice unsubscribed after this selected message was queued, so it skips too.
  assert.equal(failure.skipped, 1);
  rows.delete(
    `customerEmailPreferences/${customerEmailId("alice@example.test")}`,
  );
  const failedId = randomUUID();
  await messagesRoute.POST(
    request({
      ...body,
      requestId: failedId,
      audience: "selected",
      emails: ["alice@example.test"],
    }),
  );
  // A different campaign must also respect the shared provider cooldown.
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.equal((await (await deliver(failedId)).json()).failed, 1);
  const results = await (
    await deliveryRoute.GET(request({}), context(failedId))
  ).json();
  assert.equal(results.issues[0].error, "Provider rejected test");
  const interruptedId = randomUUID();
  await messagesRoute.POST(
    request({
      ...body,
      requestId: interruptedId,
      audience: "selected",
      emails: ["alice@example.test"],
    }),
  );
  rows.set(
    `customerMessages/${interruptedId}/deliveries/${customerEmailId("alice@example.test")}`,
    {
      email: "alice@example.test",
      status: "sending",
      claimedAt: Date.now() - 121000,
    },
  );
  const interrupted = await (await deliver(interruptedId)).json();
  assert.equal(
    interrupted.uncertain,
    1,
    "A crashed delivery is reported for review, never resent automatically",
  );
  assert.equal(interrupted.done, true);
  assert.equal((await messagesRoute.GET()).status, 200);
  assert.equal((await deliver(randomUUID())).status, 404);
  console.log(
    "PASS: customer deduplication, auth, HTML safety, signed unsubscribe, recipient privacy, idempotency, concurrency, resume, late opt-out, and delivery failures (no external writes)",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
