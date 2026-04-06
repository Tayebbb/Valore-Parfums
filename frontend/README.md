# Valore Parfums

Valore Parfums is a full-stack fragrance commerce platform for decants and full-bottle selling. It includes a customer storefront, a full admin back office, and a Firestore-backed operations workflow for orders, inventory, pricing, vouchers, notifications, and finance.

## Recently Added

- Google sign-in for customers (UI + API + Firebase token verification).
- Customer profile API for saved checkout details (delivery/pickup info reuse).
- Checkout UX overhaul:
  - sectioned flow and improved mobile experience
  - sticky mobile place-order bar
  - reusable payment selector and summary components
  - direct buy-now path from product flow
- Track page status normalization to keep legacy statuses consistent for customers.
- Admin order status UX updates:
  - direct status updates (no intermediate confirmation drawer)
  - display label alignment (Processing shown as Confirmed)
  - Sourcing removed from selectable order statuses
- Admin cancellation reason picker (dropdown + custom reason) with reason passed to API.
- Cancellation email improvements:
  - dark-mode-safe refund status block
  - conditional refund messaging (paid vs unpaid)
- Admin full-bottle pricing upgrade:
  - separate buying and selling input fields
  - live per-line profit preview
  - backend recalculation using both values
- Requests history reliability improvement (lookup by userId and userEmail fallback).

## Tech Stack

- Framework: Next.js 16 (App Router), React 19
- Language: TypeScript (strict mode)
- Styling: Tailwind CSS v4, PostCSS
- State Management: Zustand (auth, cart, theme)
- Backend: Firebase Admin SDK + Firestore
- Auth (client): Firebase Web SDK (Google popup)
- Email: Nodemailer (Gmail SMTP provider)
- Charts: Recharts
- Utilities: date-fns, uuid
- Image Processing: sharp

## Feature Catalog

### Storefront

- Home storefront with featured perfumes and live pricing.
- Shop with filtering/sorting.
- Perfume details page with fragrance notes (top, middle, base).
- Decant-first cart logic with ML-aware variant handling.
- Full-bottle request ordering path with bottle-size support.
- Wishlist add/remove.
- Theme persistence (light/dark).

- Responsive navigation with desktop dropdowns and mobile expandable menu
- Category, season, and brand shortcuts in nav
- Announcement marquee with session-cached data
- Global search modal with debounced API search
- Dynamic cart item count indicator
- Skeleton and empty states for loading/empty pages
- Product cards: out-of-stock, best-seller, and category labels
- Sticky mobile checkout bar
- Copy order ID utility in tracking and admin

### Auth and Accounts

- Email/password signup and login with secure sessions.
- Google sign-in using Firebase token exchange.
- Session-backed user retrieval (me endpoint).
- Profile endpoint for saved delivery/pickup details used by checkout.
- Guest checkout support.

- Password hashing with PBKDF2 and legacy hash migration
- Google sign-in via popup and ID token exchange
- Role-aware session model (customer/admin)
- Profile API for getting/updating name, phone, and saved delivery info

### Checkout and Payments

- Delivery and pickup checkout modes.
- Delivery zone fee handling (Inside Dhaka / Outside Dhaka).
- Admin-configured pickup locations.
- Payment methods:
  - Cash on Delivery
  - bKash manual
  - Bank manual
- Manual payment metadata capture and admin verification flow.
- Voucher validation and discount application.
- Order creation for both signed-in and guest customers.
- Optional admin webhook alerts for manual payment submissions.

- Direct Buy Now path from product page
- Payment-method-specific form validation (bKash/bank fields)
- Voucher compatibility logic for full-bottle/manual pricing
- Checkout profile auto-fill from saved user profile
- Mobile sticky place-order bar

### Orders, Tracking, and Cancellation

- Full order lifecycle with status transitions.
- Order tracking page (active/past buckets + normalized status display).
- Admin order management with direct status transitions.
- Manual payment verification endpoint.
- Cancellation workflows with:
  - required reason
  - stock restoration
  - voucher usage rollback
  - profit reversal when applicable
  - cancellation email and admin notification

- Status normalization for legacy labels in tracking UI
- Payment-method-specific status stepper (COD/bKash/Bank)
- Rich order cards with line items, size labels, and fallback image logic
- Voucher/discount display in tracking totals
- Auto-refresh polling and visibility-change refresh for order history

### Inventory and Pricing

- Perfume catalog CRUD.
- Bottle inventory CRUD.
- Decant size CRUD.
- Notes library management.
- Bulk pricing rules CRUD.
- Dynamic pricing calculations from margin/tier rules.
- Stock decrement on order placement.
- Stock restoration on cancellation.

- Owner assignment per perfume (Store/individual owner)
- Personal-collection mode (pricing override)
- Note ID and label indexing for robust search/filter
- Top/middle/base note selectors with searchable chips
- Key-note generation and note index persistence
- PNG-oriented perfume image upload pipeline
- Inventory list with search across name/brand/inspired-by
- Bottle/decant size management with enable/disable and deletion
- Pickup location management with active toggle
- Notification/announcement management with active toggle and preview
- Voucher management: code, type, value, min order, usage, expiry, active state
- Bulk pricing rule management (min quantity, discount percent)
- Tier margins by brand tier and size buckets
- Packaging cost, delivery fee, payment account/QR config
- Owner names/shares/profit settings

### Customer and Procurement Requests

- Customer request creation (decant/full bottle).
- Admin request pipeline with pricing fields and status progression.
- Procurement/stock request pipeline for out-of-stock demand.
- My Requests page with improved historical retrieval coverage.

- Request validation differs by type (ml required for decant, bottle size for full bottle)
- Request creation auto-creates linked placeholder order and item
- Stock request creation also creates linked sourcing order records
- Admin can update request status and map to order status
- Admin can set buying/selling price for request fulfillment
- Request fulfillment auto-calculates profit and distributes to owner accounts

### Admin Back Office

- Dashboard metrics and reporting APIs.
- Panels for inventory, bottles, decant sizes, orders, vouchers, requests, stock requests, pickup locations, notifications, notes library, settings, exports.
- Financial tooling for owner accounts and withdrawals.

- Unified admin orders center with tabbed modes (orders, requests, procurement)
- Status filters with counts, payment-method filters, date-range filters, size-type filters
- Sort by newest, oldest, highest total, highest profit
- Quick filter for pending bank verifications
- Status transition engine with normalization for legacy/new labels
- Mandatory cancellation reason validation for cancelled transitions
- Full bottle manual line-item pricing updates by admin
- Manual line-item buying price support for full-bottle profitability
- Order subtotal/discount/total/profit recomputation after manual updates
- Voucher remove/recompute support at order level
- Manual payment verification endpoint for bKash and bank
- Payment audit trail storage with verifier, time, and note
- Status-driven email dispatch from order updates
- Cancellation flow restores stock and bottle counts, reverses profits, decrements voucher usage
- Admin notifications for key events (cancellations, manual payments)

### Financial and Profit Accounting

- Owner account tracking and ledger entries.
- Profit split logic across owners.
- Withdrawal recording/history.
- Profit reversal entries on cancellation when applicable.
- Full-bottle admin pricing supports buy/sell entry and recalculated profit.

- Per-item cost, profit, ownerProfit, and otherOwnerProfit tracking
- Dispatch/completion-stage profit crediting to owner accounts
- Cross-owner share distribution logic
- Store-owned item profit split by configured owner shares
- Profit transaction ledger with typed entries (sale, store-share, cross-owner-share, withdrawal, request_profit)
- Owner account summary endpoint with available-balance computation
- Withdrawal creation endpoint with positive amount validation, owner identity enforcement, balance sufficiency checks
- Negative transaction entry for withdrawals
- Request fulfillment profit split flow credited to both owners

### Notifications and Email

- In-app notification records for admin/store events.
- Automated Email For every updates
- Email templates for:
  - order received/confirmed
  - payment verified
  - shipped/dispatched
  - delivered
  - cancelled
- Cancellation email includes reason and conditional refund policy text.

- Announcement notification system for storefront
- Status-triggered email sends on order transitions and payment verification
- Cancellation email supports paid vs unpaid messaging and conditional refund
- Shared email shell ensures consistent branding
- Email rendering hardened for dark/light mode readability
- Footer website link is clickable across all email templates

### Security and Validation

- Session and role checks for protected endpoints.
- PBKDF2 password hashing with legacy-hash verification fallback.
- Admin route protection.
- Proxy-layer security headers, CORS, and rate limiting.
- Shared validation utilities used in critical APIs.

- Middleware/proxy enforces admin route protection
- Security headers set globally (frame, content type, referrer, permissions, etc.)
- HSTS in production
- API CORS handling with configurable allowed origin
- API route-level in-memory rate limiting
- Firestore rules deny direct client reads/writes by default
- Input validation and field bounds across key write endpoints
- Sanitization and truncation patterns for user-provided strings

### Performance and Data Access Patterns

- Multiple API caches with TTL for hot endpoints (perfumes, pricing config/results, notifications, checkout config)
- Batched Firestore access patterns to reduce N+1 reads
- Collection-group reads for order item aggregation
- Sorted in-memory fallback patterns where Firestore composite indexes are not assumed
- Frontend render optimization with memoized components and debounced inputs
- Conditional polling and snapshot checks in tracking UI

## API Surface (Implemented)

### Maintenance and Data-Fix Tooling

- Settings audit script for margins/sizes/bottles
- Stock/brand consistency audit script with optional brand-fix apply mode
- Tier-margins cleanup script for invalid legacy sizes
- Bottle cleanup script for removing deprecated bottle sizes
- Decant-size migration script (5ml to 6ml conversion path and 30ml removal)

### Admin Routing Decisions

- Dedicated admin requests and stock-requests pages route to unified orders management
- Admin notes-library route redirects to inventory where note assignment is integrated
- Auth:
  - POST /api/auth/signup
  - POST /api/auth/login
  - POST /api/auth/logout
  - GET /api/auth/me
  - POST /api/auth/google
  - GET /api/auth/profile
  - PUT /api/auth/profile
- Perfumes: list/create/update/read/search
- Bottles: list/create/update/delete
- Decant Sizes: list/create/update/delete
- Notes Library: get/update
- Bulk Pricing: get/create/update/delete
- Pricing: dynamic pricing lookup
- Orders: list/create/get/update/my
- Orders Payment Verify: verify manual payment
- Orders Cancel: explicit cancellation workflow
- Checkout Config: get
- Vouchers: list/create/validate
- Wishlist: get/toggle
- Stock Requests: get/create/update
- Requests: get/create/update
- Pickup Locations: get/create/update/delete
- Notifications: get/create/update/delete
- Settings: get/update
- Owner Accounts: get
- Withdrawals: get/create
- Dashboard: get
- Export: get
- Uploads: payment QR and perfume image uploads

## Known Gaps / Missing Features

These are not fully implemented yet and should be considered backlog:

- No automated test suite is configured in scripts (unit/integration/e2e).
- No CI workflow is included in this repository.
- Password reset/forgot-password flow is not present in current auth endpoints.
- Email verification flow is not present in current auth endpoints.
- Real-time payment gateway integration is not present (manual payment verification is used).
- Full-bottle customer-facing instant pricing is still admin-driven after request/order placement.
- Production deployment runbook (infrastructure, scaling, backup/restore) is not documented in this README yet.

## Project Structure

- Store pages: src/app/(store)
- Admin pages: src/app/admin
- API routes: src/app/api
- Shared backend logic: src/lib
- Client stores: src/store

## Environment Variables

### Server

- FIREBASE_PROJECT_ID
- FIREBASE_CLIENT_EMAIL
- FIREBASE_PRIVATE_KEY
- GMAIL_USER
- GMAIL_PASS
- GMAIL_FROM_EMAIL (optional)
- ALLOWED_ORIGIN (recommended in production)

### Client (required for Google sign-in)

- NEXT_PUBLIC_FIREBASE_API_KEY
- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
- NEXT_PUBLIC_FIREBASE_DATABASE_URL
- NEXT_PUBLIC_FIREBASE_PROJECT_ID
- NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
- NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
- NEXT_PUBLIC_FIREBASE_APP_ID
- NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID

See .env.example for the current template.

## Quick Start

1. Install dependencies

```bash
npm install
```

2. Run development server

```bash
npm run dev
```

3. Open local URLs

- Storefront: http://localhost:3000
- Admin: http://localhost:3000/admin
