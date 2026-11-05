/** Exercises real MIME generation and Resend SDK serialization without a live network/provider. */
import assert from "node:assert/strict";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports -- Adapter seams intercept only external I/O. */
const nodemailer = require("nodemailer");
const originalTransport = nodemailer.createTransport;
const originalFetch = globalThis.fetch;
let smtpRejected = false;
let smtpInterrupted = false;
let smtpOptions: any;
let generated: any;
let resendMode = "accepted";
let resendRequest: { url: string; options: RequestInit } | undefined;
delete process.env.RESEND_API_KEY;
process.env.GMAIL_USER = "sender@example.test";
process.env.GMAIL_PASS = "synthetic-test-only";
process.env.GMAIL_FROM_EMAIL = "Valore Test <sender@example.test>";
process.env.EMAIL_UNSUBSCRIBE_SECRET =
  "synthetic-adapter-test-only-key-with-32-characters";
nodemailer.createTransport = (options: any) => {
  smtpOptions = options;
  const local = originalTransport({
    streamTransport: true,
    buffer: true,
    newline: "unix",
  });
  return {
    sendMail: async (message: any) => {
      if (smtpInterrupted)
        throw Object.assign(new Error("Synthetic SMTP timeout"), {
          code: "ETIMEDOUT",
        });
      if (smtpRejected)
        throw Object.assign(new Error("Synthetic SMTP refusal"), {
          responseCode: 550,
        });
      generated = await local.sendMail(message);
      return generated;
    },
  };
};

async function main() {
  const smtp = require("../src/lib/email");
  const { normalizeCustomerEmail } = require("../src/lib/customer-directory");
  const {
    parseCustomerMessage,
    generateCustomerMessage,
  } = require("../src/lib/customer-message");
  const destination = normalizeCustomerEmail(" Customer+offer@Example.TEST ");
  const notification = generateCustomerMessage(
    parseCustomerMessage({
      subject: "A customer update",
      message: "Hello & welcome.\n\nUseful information.",
      format: "text",
    }),
    destination,
  );
  const accepted = await smtp.sendEmail(notification);
  assert.equal(accepted.success, true);
  assert.deepEqual(generated.envelope.to, ["customer+offer@example.test"]);
  assert.equal(generated.envelope.from, "sender@example.test");
  const mime = generated.message.toString("utf8");
  assert.match(mime, /^To: customer\+offer@example\.test$/m);
  assert.match(mime, /Content-Type: multipart\/alternative/);
  assert.match(mime, /Hello & welcome/);
  assert.doesNotMatch(mime, /^Bcc:/m);
  assert.equal(smtpOptions.connectionTimeout, 15000);
  assert.equal(smtpOptions.socketTimeout, 30000);
  smtpRejected = true;
  assert.deepEqual(await smtp.sendEmail(notification), {
    success: false,
    error: "Synthetic SMTP refusal",
  });
  smtpInterrupted = true;
  const interruptedSmtp = await smtp.sendEmail(notification);
  assert.equal(interruptedSmtp.success, false);
  assert.equal(interruptedSmtp.uncertain, true);
  console.log(
    "PASS real Nodemailer MIME: one private envelope recipient, text/HTML alternatives, bounded SMTP timeouts, explicit rejection",
  );

  // A fresh module instance selects Resend with a synthetic key; every fetch is intercepted.
  process.env.RESEND_API_KEY = "re_synthetic_test_only";
  process.env.RESEND_FROM_EMAIL = "Valore Test <sender@example.test>";
  globalThis.fetch = (async (
    url: string | URL | Request,
    options: RequestInit = {},
  ) => {
    resendRequest = { url: String(url), options };
    if (resendMode === "network")
      throw new Error("Synthetic network interruption");
    if (resendMode === "malformed") return Response.json({});
    if (resendMode === "server-error") return Response.json({ statusCode: 500, name: "application_error", message: "Synthetic server error" }, { status: 500 });
    if (resendMode === "rejected")
      return Response.json(
        {
          statusCode: 429,
          name: "rate_limit_exceeded",
          message: "Synthetic provider rate limit",
        },
        { status: 429 },
      );
    return Response.json({ id: "synthetic-resend-id" });
  }) as typeof fetch;
  delete require.cache[require.resolve("../src/lib/email")];
  const resend = require("../src/lib/email");
  const key = "customer-message/synthetic-campaign/synthetic-recipient";
  const result = await resend.sendEmail({
    ...notification,
    idempotencyKey: key,
  });
  assert.deepEqual(result, { success: true, messageId: "synthetic-resend-id" });
  assert.equal(new URL(resendRequest!.url).pathname, "/emails");
  assert.equal(
    new Headers(resendRequest!.options.headers).get("idempotency-key"),
    key,
  );
  const payload = JSON.parse(String(resendRequest!.options.body));
  assert.equal(payload.to, destination);
  assert.equal(payload.subject, notification.subject);
  assert.equal(payload.html, notification.html);
  assert.equal(payload.text, notification.text);
  resendMode = "rejected";
  const rejected = await resend.sendEmail(notification);
  assert.equal(rejected.success, false);
  assert.notEqual(rejected.uncertain, true, "An explicit provider rejection is a definite failure");
  resendMode = "network";
  const interrupted = await resend.sendEmail(notification);
  assert.equal(interrupted.success, false);
  assert.equal(interrupted.uncertain, true);
  resendMode = "malformed";
  const malformed = await resend.sendEmail(notification);
  assert.equal(malformed.success, false);
  assert.equal(malformed.uncertain, true);
  resendMode = "server-error";
  const serverError = await resend.sendEmail(notification);
  assert.equal(serverError.success, false);
  assert.equal(serverError.uncertain, true);
  console.log(
    "PASS real Resend SDK: private recipient, idempotency header, exact payload, rate-limit and network failure handling (fetch intercepted)",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    nodemailer.createTransport = originalTransport;
    globalThis.fetch = originalFetch;
  });
