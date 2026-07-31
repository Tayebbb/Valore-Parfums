# Valore Parfums — Copilot Project State

> **This file is loaded automatically by GitHub Copilot at the start of every session.**
> It must always reflect the current, working state of the codebase.
>
> **AGENT DIRECTIVE (mandatory, no user prompt required):**
> After completing any code change, feature, bug fix, refactor, migration, backfill, or
> configuration change in this repository, **update this file in the same turn** before
> ending your response. Bump `Last updated`, add / edit / prune sections to reflect the
> new state, and rewrite any invalidated rule. Keep it under ~600 lines. Do not ask the
> user for permission to update this file — it is part of the change.

- **Last updated:** 2026-07-31
- **Default branch:** `main`
- **Repo:** `Tayebbb/Valore-Parfums`
- **Site:** https://www.valoreparfums.app

---

## 1. Repo Layout

Monorepo with two independent Next.js 16 apps plus docs.

| Path                          | Purpose                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `backend/`                    | Next.js API-only server. Deployed to **Render**. Firebase Admin SDK.                   |
| `frontend/`                   | Next.js storefront + admin panel. Deployed to **Netlify**. Proxies `/api/*` → backend. |
| `README.md`                   | Full production reference (schemas, business logic, API map).                          |
| `MOBILE_AUDIT_REPORT.md`      | Mobile-specific audit notes.                                                           |
| `netlify.toml`, `render.yaml` | Deploy configs.                                                                        |
| `valore-parfums/`             | **Ignore** — legacy scaffolding, not built.                                            |

Local dev:

```
cd backend  && npm run dev   # http://localhost:3001
cd frontend && npm run dev   # http://localhost:3000
```

Frontend proxies every `/api/*` call to `NEXT_PUBLIC_API_BASE_URL` (see §5).

---

## 2. Tech Stack

| Layer         | Tech                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------- |
| Framework     | Next.js 16.1.6 App Router, React 19.2.3, TypeScript 5                                              |
| DB            | Cloud Firestore via `firebase-admin` 13.7.0 (server-only)                                          |
| Auth          | Custom PBKDF2 password + HMAC-signed session cookie (`vp-session`); Google OAuth via Firebase Auth |
| Images        | Cloudinary (v2 SDK)                                                                                |
| Email         | Resend (preferred) with Nodemailer / Gmail SMTP fallback                                           |
| State         | Zustand v5 (cart, auth, theme). Cart + theme persisted to `localStorage`.                          |
| Styling       | Tailwind v4, CSS-variable theming                                                                  |
| Caching       | Per-process `Map` + Next.js `unstable_cache` (`perfumes` tag, 300 s TTL)                           |
| Rate limiting | In-memory per-IP (`backend/src/lib/rate-limit.ts`)                                                 |
| CSRF          | Double-submit cookie (`backend/src/lib/csrf.ts`)                                                   |

---

## 3. Firestore

Collections (see `backend/src/lib/firebase-admin.ts::Collections`):

`perfumes`, `perfumeReviews`, `notesLibrary`, `decantSizes`, `bottles`, `settings`,
`bulkPricingRules`, `orders`, `orderItems`, `vouchers`, `stockRequests`, `users`,
`wishlists`, `notifications`, `withdrawals`, `pickupLocations`, `requests`,
`fullBottleLeads`, `blogPosts`, `ownerAccounts`, `profitTransactions`, `auditLogs`.

**Subcollections:** `orders/{orderId}/items` — order line items. Queried via
`collectionGroup("items")` in `dashboard`, `owner-accounts`, `withdrawals`, and the
backfill scripts.

**Singleton docs:**

- `settings/default` — pricing, delivery fees, payment accounts, owner config
  (`owner1Name`/`owner2Name`/`owner1Share`, `ownerProfitPercent`, `packagingCost`,
  `bkash*`, `bank*`, `tierMargins`, `lowStockAlertMl`).
- `settings/globalOperationalSettings` — pickup config, cancellation preset reasons.

**Security model:** Firestore rules deny all client access. Everything goes through
Admin SDK server-side. Client Firebase SDK is only used for Google OAuth
(`frontend/src/lib/firebase-client.ts`). Full README schema in §4 of `README.md`.

---

## 4. Backend API Map (`backend/src/app/api/`)

Auth guards: `getSessionUser()` for any logged-in user, `requireAdmin()` for admin.
Emitted status codes: 401 (no session), 403 (not admin), 400 (bad input).

### Auth

| Route               | Methods | Guard        | Notes                                           |
| ------------------- | ------- | ------------ | ----------------------------------------------- |
| `/api/auth/login`   | POST    | rate-limited | PBKDF2, upgrades legacy SHA-256 hashes on login |
| `/api/auth/signup`  | POST    | rate-limited | Creates `users` doc with `role: "customer"`     |
| `/api/auth/google`  | POST    | none         | Verifies Firebase ID token, upserts user        |
| `/api/auth/me`      | GET     | session      | Returns session user or 401                     |
| `/api/auth/profile` | GET/PUT | session      | Update name / phone                             |
| `/api/auth/logout`  | POST    | none         | Clears `vp-session` cookie                      |

### Perfumes

| Route                  | Methods          | Guard           | Notes                                                                                   |
| ---------------------- | ---------------- | --------------- | --------------------------------------------------------------------------------------- |
| `/api/perfumes`        | GET, POST        | POST admin      | 20 s in-memory list cache. POST auto-sets `isPersonalCollection = (owner !== "Store")`. |
| `/api/perfumes/[id]`   | GET, PUT, DELETE | mutations admin | PUT auto-syncs `isPersonalCollection` when `owner` changes.                             |
| `/api/perfumes/search` | GET              | none            | `?q=` search over name / brand / notes                                                  |

### Orders

| Route                             | Methods   | Guard                          | Notes                                                                                                      |
| --------------------------------- | --------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `/api/orders`                     | GET, POST | admin (list) / public (create) | Create computes pricing snapshot, deducts stock, sends email, fires admin webhook. `?user=me` returns own. |
| `/api/orders/my`                  | GET       | session                        | Own orders (matches userId, placedByEmail, customerEmail)                                                  |
| `/api/orders/[id]`                | GET, PUT  | session (GET) / admin (PUT)    | PUT sends status-specific email                                                                            |
| `/api/orders/[id]/cancel`         | POST      | admin                          | Requires `cancelReason`; sends cancellation email                                                          |
| `/api/orders/[id]/verify-payment` | POST      | admin                          | Marks manual bKash / bank payment received                                                                 |

### Pricing & Config

| Route                  | Methods                | Guard           | Notes                                                                |
| ---------------------- | ---------------------- | --------------- | -------------------------------------------------------------------- |
| `/api/pricing`         | GET, POST              | none            | Effective decant prices per perfume. **Source of truth** — see §7.4. |
| `/api/checkout-config` | GET                    | none            | Delivery fees, payment account info, pickup locations. 60 s cache.   |
| `/api/settings`        | GET, PUT               | admin           | Store settings doc                                                   |
| `/api/global-settings` | GET, PUT               | admin           | Pickup + cancellation config                                         |
| `/api/bulk-pricing`    | GET, POST, PUT, DELETE | mutations admin | Quantity-based discount rules                                        |
| `/api/brand-sections`  | GET, PUT               | mutations admin | UAE / niche / designer groupings                                     |

### Finance & Owners

| Route                 | Methods   | Guard | Notes                                                                                                        |
| --------------------- | --------- | ----- | ------------------------------------------------------------------------------------------------------------ |
| `/api/dashboard`      | GET       | admin | All KPI aggregates. Uses `collectionGroup("items")`. Recomputes personal-collection earnings from item data. |
| `/api/owner-accounts` | GET       | admin | Per-owner balance from completed items; prefers item-based recompute over stored ledger fields.              |
| `/api/withdrawals`    | GET, POST | admin | Withdrawal ledger. `POST` supports Profit / Store Revenue with source (Bkash / Bank / COD).                  |

### Catalog Support

| Route                            | Methods          | Guard          | Notes                            |
| -------------------------------- | ---------------- | -------------- | -------------------------------- |
| `/api/bottles`, `/[id]`          | GET / POST / PUT | admin (writes) | Atomiser inventory by ml         |
| `/api/decant-sizes`, `/[id]`     | GET / POST / PUT | admin (writes) | Enable / disable ml sizes        |
| `/api/notes-library`             | GET              | none           | Canonical fragrance notes        |
| `/api/reviews`                   | GET, POST        | POST session   | Product reviews                  |
| `/api/pickup-locations`, `/[id]` | GET / POST / PUT | admin (writes) | Pickup points                    |
| `/api/vouchers`, `/[id]`         | GET / POST / PUT | admin          | Discount codes                   |
| `/api/vouchers/validate`         | POST             | none           | Applies at checkout              |
| `/api/catalog-summary`           | GET              | none           | Lightweight perfume list, cached |
| `/api/merchant/feed`             | GET              | none           | Google Merchant XML feed         |

### Requests, Uploads, Misc

| Route                               | Methods          | Guard                        | Notes                          |
| ----------------------------------- | ---------------- | ---------------------------- | ------------------------------ |
| `/api/requests`, `/[id]`            | GET / POST / PUT | session (user) / admin (all) | Customer sourcing requests     |
| `/api/stock-requests`, `/[id]`      | GET / POST       | admin                        | Restock / stock-request orders |
| `/api/full-bottle-requests`         | GET, POST        | POST public / GET admin      | Full-bottle lead capture       |
| `/api/wishlist`, `/wishlist-status` | GET, POST        | session                      | Wishlist per user              |
| `/api/notifications`, `/[id]`       | GET, POST        | session                      | User notifications             |
| `/api/uploads/perfume-image`        | POST             | admin                        | Cloudinary upload              |
| `/api/uploads/payment-qr`           | POST             | admin                        | Payment QR upload              |
| `/api/export`                       | GET              | admin                        | CSV / JSON export              |
| `/api/test-email`                   | POST             | admin                        | Diagnostic                     |

Never add a mutating admin endpoint without `requireAdmin()`.

---

## 5. Frontend (`frontend/src/`)

### Storefront routes (`app/(store)/`)

`/`, `/shop`, `/cart`, `/checkout`, `/login`, `/signup`, `/wishlist`, `/track`,
`/requests`, `/partials`, `/products/[slug]`, `/perfume/[id]` (legacy id fallback).

### SEO / content routes

`/blog`, `/blog/[postSlug]`, `/brand/[brand]`, `/brand/[brand]/[perfume]`,
`/category/decants`, `/category/full-bottles`,
`/buy-perfume-samples`, `/decants-bangladesh`, `/affordable-perfume-decants`,
`/niche-perfume-decants`, `/full-bottle-perfume-bd`, `/sterile-decant-process`,
`/guides/decant-vs-full-bottle`.

### Admin routes (`app/admin/`)

`/admin` (dashboard), `/admin/orders`, `/admin/inventory`, `/admin/settings`,
`/admin/vouchers`, `/admin/decant-sizes`, `/admin/bottles`, `/admin/requests`,
`/admin/stock-requests`, `/admin/notifications`, `/admin/notes-library`,
`/admin/brand-sections`, `/admin/export`, `/admin/reports`, `/admin/pickup-locations`.
Server-side redirect in `admin/layout.tsx` checks session role before render.

### Special

`layout.tsx`, `error.tsx`, `not-found.tsx`, `robots.ts`, `sitemap.ts`.

### API proxy

`frontend/src/app/api/[...path]/route.ts` forwards every `/api/*` call to the
backend using env var fallback: `API_BASE_URL` → `NEXT_PUBLIC_API_BASE_URL` →
`BACKEND_URL`. Session cookies are forwarded.

**Exceptions (frontend-only handlers)** under `frontend/src/app/api/auth/*` handle
login / signup / google / logout to keep `Set-Cookie` domain correct in production.
Do **not** add new API handlers here unless they only touch frontend concerns.

### Zustand stores (`store/`)

| Store      | Hook       | State                                                                            |
| ---------- | ---------- | -------------------------------------------------------------------------------- |
| `auth.ts`  | `useAuth`  | `user`, `loading`. 30 s TTL cache on `/api/auth/me`, monotonic version tracking. |
| `cart.ts`  | `useCart`  | `items[]`, `addItem`, `removeItem`, `updateQuantity`, `subtotal`. Persisted.     |
| `theme.ts` | `useTheme` | `theme`, `toggle`, `setTheme`. Persisted.                                        |

### Components (`components/`)

- `admin/` — `CourierSlip.tsx`, `CourierSlipModal.tsx`.
- `checkout/` — `OrderSummaryPanel.tsx`, `PaymentMethodSelector.tsx`, `StickyPlaceOrderBar.tsx`.
- `store/` — `PerfumeDetailClient.tsx`.
- `seo/` — `SeoRichContentPage.tsx` (blogs / guides).
- `ui/` — `ConfirmDialog.tsx`, `DecisionDrawer.tsx`, `PaginationNav.tsx`, `Toaster.tsx`, `CopyOrderIdButton.tsx`.
- root — `ThemeInitializer.tsx`.

---

## 6. Shared Libraries

### `backend/src/lib/`

| File                   | Purpose                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `auth.ts`              | PBKDF2 hash / verify, session cookie sign / verify, `getSessionUser`, `requireAdmin`                  |
| `finance.ts`           | Minor-unit math, `computeItemBreakdown`, `buildOrderPricingSnapshot`, `splitProfitMinor`              |
| `ownerEarnings.ts`     | `calculatePersonalBottleEarnings` (85/15 split with liquid-cost recovery)                             |
| `products.ts`          | Decant price + stock helpers                                                                          |
| `utils.ts`             | `calculateSellingPrice`, `getBrandTier`, `getTierProfitMargin`, `splitProfit`, `DEFAULT_TIER_MARGINS` |
| `orderStatusConfig.ts` | Status transitions + email triggers (duplicated in frontend)                                          |
| `email.ts`             | Resend / Nodemailer dispatch + all templates                                                          |
| `cloudinary.ts`        | Upload / delete / URL parsing                                                                         |
| `image-utils.ts`       | `parseImageList`, `sanitizeCloudinaryImagesField`, `sanitizeCloudinaryUrl`                            |
| `fragrance-notes.ts`   | Canonical notes + `buildStructuredNotes`                                                              |
| `seo-catalog.ts`       | `getPerfumeOffers`, `getActivePerfumes`, slug / URL builders (duplicated in frontend)                 |
| `validation.ts`        | Input validators                                                                                      |
| `audit-log.ts`         | `logAuditAction` + `AUDIT_ACTIONS`                                                                    |
| `rate-limit.ts`        | Per-IP limiter                                                                                        |
| `csrf.ts`              | Double-submit cookie CSRF                                                                             |
| `firebase-admin.ts`    | Admin SDK init + `Collections`, `serializeDoc`                                                        |
| `prisma.ts`            | Passthrough re-export of `db` + `Collections` (legacy name)                                           |

### `frontend/src/lib/`

Mirrors backend for: `auth`, `finance`, `email`, `seo-catalog`, `seo-content`,
`orderStatusConfig`, `validation`, `fragrance-notes`, `image-utils`, `utils`,
`products`, `firebase-admin` (legacy copy — client should use `firebase-client.ts`).
Frontend-only: `public-api.ts` (`toPublicApiUrl`), `fetch-with-timeout.ts`,
`fetch-hooks.ts`, `safe-storage.ts`.

**Duplication policy:** When editing any duplicated file, update **both** copies in
the same commit. Priority pairs: `seo-catalog.ts`, `orderStatusConfig.ts`,
`utils.ts` (tier margins), `finance.ts`, `validation.ts`.

---

## 7. Critical Business Rules (must not regress)

### 7.1 Personal-collection earnings split

When `ownerName !== "Store"` and `isPersonalCollection === true` on an order item:

- Bottle owner earnings = `productCost + 0.85 × profit`
- Other owner earnings = `0.15 × profit`
- **`productCost` is DERIVED, never read directly from `perfume.purchasePricePerMl`:**
  - On create (`orders/route.ts`): `productCost = unitCost − (packagingCost + bottleCost)` per unit.
  - On recompute (dashboard / owner-accounts / withdrawals / backfill):
    `productCost = item.costPrice − (packaging + bottle) × qty`; fallback to
    `snap.costPricePerMl × item.ml × qty` when derived value is 0.
- Source: `backend/src/lib/ownerEarnings.ts::calculatePersonalBottleEarnings`.
- Manual admin full-bottle orders are always attributed to `owner: "Store"`
  regardless of the perfume's owner.

### 7.2 Store-owned items split

Store items split profit `owner1Share` / `100 − owner1Share` (default 60/40) between
`owner1Name` (Tayeb) and `owner2Name` (Enid).

### 7.3 Personal-collection auto-flag

`POST /api/perfumes` and `PUT /api/perfumes/[id]` auto-set
`isPersonalCollection = (owner !== "Store")`. Backfill existing docs / items with
`backend/scripts/set-personal-collection.ts --apply`.

### 7.4 Pricing source of truth

`backend/src/app/api/pricing/route.ts` defines:
`effectiveMarketPricePerMl = isPersonalCollection ? purchasePricePerMl : marketPricePerMl`.

`getPerfumeOffers` in **both** `frontend/src/lib/seo-catalog.ts` and
`backend/src/lib/seo-catalog.ts` follow the same rule (used for storefront pages,
sitemap, merchant feed). Any new UI or export that shows a decant price **must**
either call `/api/pricing` or reuse `getPerfumeOffers` — do not re-implement the
formula. Deviation causes storefront ↔ admin / manual-order price mismatch.

### 7.5 Order status & email flow

`backend/src/lib/orderStatusConfig.ts` owns the state machine. Flows:

- Delivery: `order_placed → processing → out_for_delivery → completed`
- Pickup: `order_placed → processing → ready_for_pickup → completed`
- Manual payment: `order_placed → pending_bkash_verification | pending_bank_verification → processing | paid → …`
- Terminal states: `completed`, `cancelled`. Only `completed → cancelled` is allowed after terminal.
- Each transition triggers a specific email template in `email.ts`
  (`orderPlaced`, `orderConfirmed`, `orderPaid`, `readyForPickup`, `outForDelivery`,
  `completed`, `cancelled`). See also `/memories/repo/order-status-email-flow.md`.

### 7.6 Revenue / withdrawals

- Store revenue is one bucket; Bkash / Bank / COD are balance breakdown cards only.
- Revenue and profit **exclude delivery fees** for all payment methods.
- Withdrawable Store Revenue per source = completed revenue
  − personal-collection payouts − store-owned distributed profit
  − completed store-revenue withdrawals for that source.
- COD is a payment source inside Store Revenue, not a separate withdrawal bucket.

### 7.7 Auth / admin gating

Every mutating admin endpoint calls `requireAdmin()`. Admin panel pages additionally
check role in `admin/layout.tsx` server component. Never rely on client-side role flags.

---

## 8. Environment Variables

### Backend (`backend/.env.local` + Render env in prod)

| Key                                                                                          | Meaning                                              |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `FIREBASE_PROJECT_ID` (or `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `GOOGLE_CLOUD_PROJECT`)         | GCP / Firebase project                               |
| `FIREBASE_CLIENT_EMAIL`                                                                      | Service account email                                |
| `FIREBASE_PRIVATE_KEY`                                                                       | Service account key (`\\n` escaped)                  |
| `SESSION_SIGNING_KEY`                                                                        | HMAC key for session cookies (**must set in prod**)  |
| `CLOUDINARY_URL` or `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` | Cloudinary creds                                     |
| `CLOUDINARY_FOLDER`                                                                          | Upload folder (default `valore-parfums`)             |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`                                                        | Preferred email provider                             |
| `GMAIL_USER`, `GMAIL_PASS`                                                                   | Nodemailer / SMTP fallback                           |
| `OWNER1_EMAIL`, `OWNER2_EMAIL`                                                               | Admin alert recipients                               |
| `ADMIN_ALERT_WEBHOOK_URL`                                                                    | Slack / Discord webhook on new manual-payment orders |
| `ALLOWED_ORIGINS` (or `ALLOWED_ORIGIN`)                                                      | CORS whitelist (comma-separated)                     |
| `NODE_ENV`                                                                                   | Controls secure cookie flag + logs                   |

### Frontend (`frontend/.env.local` + Netlify env)

| Key                                                                                                                                  | Meaning                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL`                                                                                                           | Backend URL for `/api/*` proxy                                                |
| `NEXT_PUBLIC_SITE_URL`                                                                                                               | Canonical site URL for SEO (falls back to Netlify `URL` / `DEPLOY_PRIME_URL`) |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase web SDK (Google OAuth)                                               |
| `NEXT_PUBLIC_ENV`                                                                                                                    | Optional environment flag                                                     |
| `SESSION_SIGNING_KEY`                                                                                                                | Needed by frontend session verifier (must match backend)                      |

---

## 9. Scripts (`backend/scripts/`)

Run with `cd backend && npx tsx scripts/<name>.ts [--apply]`. Everything is dry-run
until `--apply` is passed. Env comes from `backend/.env.local`.

| Script                                                                                   | Purpose                                                                                                                |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `set-personal-collection.ts`                                                             | Flag non-Store perfumes as `isPersonalCollection` + patch existing order items.                                        |
| `backfill-personal-collection-earnings.ts`                                               | Recompute `ownerProfit` / `otherOwnerProfit` on personal-collection items with the corrected `productCost` derivation. |
| `reset-order-financials.ts`                                                              | **Destructive.** Zero order + owner totals.                                                                            |
| `purge-orders.ts`                                                                        | **Destructive.** Full wipe of order data. Use with caution.                                                            |
| `check-finances.ts`                                                                      | Read-only reconciliation of stored vs recomputed totals.                                                               |
| `check-perfumes.ts` / `check-stock.ts` / `check-settings.ts` / `check-store-perfumes.ts` | Read-only inspection helpers.                                                                                          |
| `clean-margins.ts` / `fix-bottles.ts` / `fix-decant-sizes.ts`                            | Historical one-shot data fixers (already run).                                                                         |

---

## 10. Conventions & Gotchas

- **Never** compute personal-collection `productCost` from
  `perfume.purchasePricePerMl` alone — it is 0 for manual admin orders. Derive from
  `unitCost` / `costPrice` (see §7.1).
- **Every price-rendering path** must go through `/api/pricing` or `getPerfumeOffers`.
  Two independent formulas caused the storefront ↔ admin mismatch fixed on 2026-07-18.
- **`seo-catalog.ts` exists twice** (frontend + backend) — always edit both together.
- **`orderStatusConfig.ts` exists twice** — always edit both.
- **`unstable_cache`** with tag `perfumes` has a 5-minute TTL. Storefront price
  changes may lag until a perfume mutation triggers `revalidateTag("perfumes", "max")`
  or the TTL elapses.
- **Do not add API handlers under `frontend/src/app/api/`** except for the existing
  `auth/*` handlers that need cookie-domain control.
- **Withdrawable balance** = per-payment-source completed revenue − personal-collection
  payouts − store-owned distributed profit − completed store-revenue withdrawals.
- **`requireAdmin()` guards** must never be removed without an equivalent check
  elsewhere. Same for `requireValidCsrfToken()` on state-changing endpoints.
- **Emails**: adding a status must add a template in `email.ts` AND a trigger in
  `orderStatusConfig.ts` AND update `/memories/repo/order-status-email-flow.md`.
- **Firestore item shape**: order items in `orders/{id}/items` must always store
  `pricingSnapshot` (with `packagingCost`, `bottleCost`, `costPricePerMl`, `marketPricePerMl`)
  so recompute paths (dashboard / owner-accounts / backfill) work.
- **Session cookies** are signed with `SESSION_SIGNING_KEY`. Rotating the key logs
  every user out — coordinate.

---

## 11. Recent Changes Log (most recent first)

- **2026-07-31** — Added `validFrom`, `hasMerchantReturnPolicy`, and `shippingDetails`
  to every `Offer` node in product JSON-LD (both `frontend/src/lib/seo-catalog.ts`
  and `backend/src/lib/seo-catalog.ts`) to resolve Google Search Console "Merchant
  listings structured data" warnings. New shared exports: `OFFER_VALID_FROM`
  (`"2024-01-01"`) and `buildOfferPolicyNodes()` (7-day BD return window, BDT 80
  shipping, 0–1d handling + 1–3d transit). Update both copies when policy changes.
- **2026-07-18** — Expanded this file to a full project state doc (routes, libs,
  env, scripts, conventions).
- **2026-07-18** — Auto-derive `isPersonalCollection` from `owner` on perfume
  create/update (`perfumes/route.ts`, `perfumes/[id]/route.ts`).
- **2026-07-18** — Added `backend/scripts/backfill-personal-collection-earnings.ts`.
  Ran on 2026-07-18; 1 item recomputed on order `d64ad3b2-…` (Tayeb 62.9 → 200.9).
- **2026-07-18** — Aligned `seo-catalog.ts` (frontend + backend) with `/api/pricing`
  so personal-collection perfumes price off `purchasePricePerMl` on storefront /
  sitemap / merchant feed. Added `isPersonalCollection` to the `PerfumeDocument`
  interface in both copies.
- **2026-07-18** — Fixed personal-collection earnings for manual admin orders:
  `orders/route.ts`, `orders/[id]/route.ts`, `dashboard/route.ts`,
  `owner-accounts/route.ts`, `withdrawals/route.ts` now derive `productCost` from
  the unit / stored cost minus packaging + bottle instead of `purchasePricePerMl × ml`.

---

## 12. When Working on This Repo

1. Read this file first. Consult `README.md` for schema depth or feature walkthroughs.
2. Check `/memories/repo/*.md` for narrow feature notes:
   `personal-collection-earnings.md`, `order-status-email-flow.md`,
   `revenue-buckets.md`, `checkout-auth-separation.md`,
   `product-page-implementation.md`, `backend-cors-configuration.md`,
   `order-financial-reset.md`.
3. Prefer editing existing files. Do not create new markdown docs unless the user asks.
4. Run `get_errors` on every file you edit; keep the tree green.
5. If you touch a duplicated file (§6), update both copies in the same change.
6. **After finishing your change, update §11 (Recent Changes Log) and any affected
   rule in §7 or §10, and bump `Last updated`.** This is not optional.
