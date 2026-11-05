# Customer messaging security and stress tests

Date: 6 November 2026 (Asia/Dhaka).

Scope: the customer directory, promotional messaging, unsubscribe flow, shared frontend API proxy, and installed dependencies in the root project and both apps. Tests use the real route functions, session verification, transaction callbacks, HTML sanitizer, and email SDKs. Firestore is replaced by a local transactional double; external email/network calls are intercepted. No production customer data is modified and no real emails are sent.

## Reproduced failures and fixes

| Failure | Fix |
| --- | --- |
| Large JSON with ignored properties was accepted; chunked requests were read completely before rejection. | Bound the stream before parsing: 512 KiB for messaging/preview, 4 KiB for unsubscribe. Apply the same limits at the frontend proxy and backend; do not trust Content-Length. Oversized input returns 413. |
| Fifty separate campaigns could enter the email provider concurrently. | Use one Firestore-backed delivery lease and cooldown across promotional campaigns and server instances. Retain per-recipient claims and conservative recovery after an interrupted send. |
| Arbitrary 36-character strings were accepted as request IDs. | Validate UUID structure. |
| Uppercase and lowercase forms of one UUID created two campaigns. | Normalize IDs on creation, lookup, and dispatch. Thirty concurrent case-varied retries now share one campaign and one delivery. |
| Ambiguous email syntax, including comments and quoted forms, was accepted by the directory. | Accept bare dot-atom email addresses with bounded local/domain lengths and valid domain labels, preventing SMTP parser reinterpretation. Keep case/whitespace deduplication and plus-addresses. |
| A malformed legacy date crashed the directory. | Isolate invalid dates to that row and retain the customer with an unknown date. |
| Noncanonical base64url forms of an otherwise valid unsubscribe token were accepted. | Require canonical payload/signature encodings before constant-time HMAC verification. Forged signatures were already rejected. |
| Repeated unsubscribe requests rewrote the preference and its original timestamp. | Make the preference update transactionally idempotent. One hundred concurrent repeats produce no additional writes. |
| Provider connection errors were recorded as definite rejections, and a malformed provider success response could be counted as accepted. | Distinguish explicit API/SMTP rejection from ambiguous delivery. Network interruptions, API server errors, and missing provider message IDs are recorded for review and never automatically resent. |
| Plain-text email alternatives displayed HTML entities literally. | Derive decoded plain text through an HTML parser while preserving paragraph and line breaks. |
| Proxy route segments could inject separators, query strings, fragments, or another URI-decoding pass. | Reject those segments before constructing or fetching the upstream URL. |

Progress writes now update counters instead of rewriting the complete recipient array. Selected-audience membership uses a Set instead of repeatedly scanning the selected list.

## Dependency security

The initial npm audits reported 26 vulnerable packages in the backend tree, 27 in the frontend tree, and two in the root tree. These counts overlap across trees and are not distinct CVE counts. Patched dependencies include Next.js 16.4.5, Sharp 0.35.5, and Nodemailer 10.3.1. Targeted transitive overrides patch gRPC, minimatch, glob, and the tsx/esbuild toolchain. Both application manifests require the patched framework/image-library version floors.

The framework/image updates address the upstream [Next.js image optimization advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw). The email-library update includes the [Nodemailer recipient parsing fixes](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-8c8m-p3m8-cjg8). These are published dependency findings; no attempt was made to exploit a live server.

The React Hooks lint plugin stays at the project's previous 7.0.1 version. The updated 7.1.x plugin introduced compiler-related lint failures across existing screens, outside this security change. No lint rule was disabled; the runtime/framework and vulnerable transitive dependencies remain patched, and the resulting dependency audit is clean.

## Adversarial coverage

- Real session verification: missing, forged, tampered, expired, customer, and investor sessions; all private routes retain their admin guard.
- Actual middleware rejects cross-origin mutations and preflight requests.
- Malformed JSON, wrong field types, invalid formats, subject header injection, outside recipients, malformed UUIDs, and oversized payloads.
- Four hundred HTML attack cases: scripts, event handlers, encoded JavaScript/data URLs, SVG, forms, iframes, and unsafe CSS.
- Two hundred fifty forged unsubscribe tokens, malformed token encodings, and concurrent repeated opt-outs.
- Two hundred fifty concurrent creation retries and 250 competing dispatch requests for one campaign; one campaign/recipient attempt remains.
- Fifty competing campaigns share the provider gate.
- Crash injection after provider acceptance but before the delivery commit; resume marks an uncertain result without sending another copy.
- Late unsubscribe, private per-recipient addressing, provider rejection, and completed-campaign replay.
- Two hundred thousand orders collapse into exactly 5,000 unique customers with correct order counts.
- A 5,000-recipient campaign completes through the actual routes with 4,657 synthetic acceptances, 291 expected provider rejections, and 52 late opt-outs. Every attempted address and idempotency key occurs once. Test time advances between attempts; this is not a live email-throughput benchmark.
- Recipient-count and document-byte limits reject oversized campaigns without partial writes.
- Maximum-length HTML with 4,500 nested elements remains bounded and produces safe HTML/plain text.
- Real Nodemailer generates a multipart email with one envelope recipient. The real Resend SDK sends the expected serialized payload and idempotency header to an intercepted fetch. Both adapters distinguish explicit rejection from ambiguous network failure; malformed success responses are not counted as accepted.
- Frontend proxy checks preserve private cookies/no-store caching, reject oversized/chunked bodies before forwarding, block route injection, and forward normal messages correctly.

## Verification limits

These checks exercise application logic and failure handling locally. They do not measure a hosted Firestore deployment, provider delivery quotas, inbox placement, hosting/WAF behavior, or internet-scale denial-of-service resistance. The existing general middleware request limiter is process-local; the new promotional provider gate is durable and shared. A successful synthetic provider response does not establish real inbox delivery. The changes remain local until deployed.

Both checked-in Firestore rule files deny all direct client reads and writes; server requests use the Admin SDK. A separate read-only retrieval of the deployed Firestore rules was attempted using the existing project credentials. It returned `security-rules/not-found`, so the active hosted rules could not be confirmed. This does not establish that access is public. No deployed rules or production data were changed.

## Final local verification

Both apps installed successfully from their lockfiles using `npm ci`. The local checks pass:

| Check | Result |
| --- | --- |
| Backend customer adversarial suite | 24 cases passed |
| Frontend customer proxy suite | 6 cases passed |
| Customer messaging regression suite | Passed |
| SMTP MIME and Resend SDK adapter suite | Passed; external I/O intercepted |
| Investment and pack engines | 117 checks passed in each suite |
| Upload and payment custody regressions | Passed |
| CSP and product-schema regressions | Passed |
| TypeScript in both apps | Passed |
| Lint in both apps | Passed; warnings are confined to pre-existing code |
| Production builds | Both passed on Next.js 16.4.5 |
| npm audit: root, backend, frontend | Zero known vulnerabilities in every tree |

Run from `backend`: `npx tsx scripts/test-customer-messages.ts`, `npx tsx scripts/test-customer-adversarial.ts`, and `npx tsx scripts/test-customer-email-adapters.ts`. Run from `frontend`: `npx tsx scripts/test-customer-proxy.ts`. CI now runs these regressions and dependency security checks.
