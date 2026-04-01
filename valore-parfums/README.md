# Valore Parfums

Valore Parfums is a full-stack fragrance commerce platform built for both decant-based and full-bottle selling. It includes a complete storefront experience, an advanced admin control panel, a Firestore-powered backend, and business automation for order lifecycle, pricing, inventory, reporting, and notifications.

## Tech Stack

- Framework: Next.js 16 (App Router), React 19
- Language: TypeScript (strict mode)
- Styling: Tailwind CSS v4, PostCSS
- State Management: Zustand (auth, cart, theme)
- Backend: Firebase Admin SDK + Firestore
- Charts: Recharts
- Utilities: date-fns, uuid
- Image Processing: sharp

## Complete Feature List

### Storefront Features

- Home storefront with featured perfumes and live pricing.
- Shop page with filtering and sorting.
- Product details for each perfume.
- Decant-first shopping with ML-aware item handling.
- Full bottle ordering flow with bottle-size selection.
- Fragrance note display by top, middle, and base.
- Cart system that treats variant combinations correctly.
- Persistent cart and user state via Zustand.
- Theme initialization and persisted theme preference (light/dark).

### Checkout and Payments

- Checkout with delivery or pickup flow.
- Delivery zone pricing for Inside Dhaka and Outside Dhaka.
- Pickup locations from admin-configured live data.
- Payment methods:
  - Cash on Delivery
  - bKash manual payment
  - Bank manual payment
- Payment metadata capture for manual verification.
- Payment audit trail entries during manual verification.
- Voucher application with discount calculations.
- Order creation for both authenticated and guest users.
- Admin webhook alerts for submitted manual payment requests (when configured).

### Customer Account Features

- Signup and login flow with secure sessions.
- Guest checkout support.
- Wishlist add/remove flow.
- Track page for order status lookup.
- Customer perfume request submission.
- Stock request submission for unavailable items.

### Order Lifecycle and Operations

- Order creation with per-item cost/profit calculation.
- Item-level ownership profit split logic.
- Admin order status update pipeline.
- Manual payment verification endpoint.
- Formal order cancellation endpoint:
  - reason required
  - inventory restoration
  - voucher usage rollback
  - profit reversal for completed orders
  - cancellation notification record

### Inventory and Pricing Engine

- Perfume catalog CRUD.
- Bottle inventory CRUD.
- Decant size CRUD.
- Notes library management.
- Bulk pricing rules management.
- Dynamic pricing logic based on margins and rules.
- Stock decrement during order creation.
- Stock restoration on cancellation.

### Admin Dashboard Features

- Admin dashboard metrics API and reporting UI.
- Inventory management panel.
- Bottles management panel.
- Decant sizes management panel.
- Orders management panel.
- Vouchers management panel.
- Requests management panel.
- Stock requests management panel.
- Pickup locations management panel.
- Notifications management panel.
- Settings management panel.
- Export panel for operational data extraction.
- Notes library management panel.
- Financial owner-account and withdrawal tooling.

### Financial Features

- Owner account tracking.
- Profit transactions ledger.
- Owner share split calculations.
- Withdrawal recording and history retrieval.
- Profit reversal entries on cancellation when applicable.

### Notifications and Communication

- Global in-app notification records for admin/store alerts.
- Email notification system via SendGrid-compatible API:
  - order confirmation email
  - payment verified email
  - order shipped email
  - cancellation email
- Non-blocking async email dispatch from order workflows.

### Security and Hardening

- Session-based authentication and role checks.
- Password hashing with PBKDF2 and legacy-hash compatibility upgrade path.
- Admin route protection.
- Security headers in proxy layer.
- API CORS headers in proxy layer.
- API rate limiting in proxy layer with retry headers.
- Input validation utilities for strings, numbers, email, phone, and composed payload validation.
- Integrated validation in critical order endpoints.

### API Surface (Implemented)

- Auth: signup, login, logout, me
- Perfumes: list/create/update/read/search
- Bottles: list/create/update/delete
- Decant Sizes: list/create/update/delete
- Notes Library: get/update
- Bulk Pricing: get/create/update/delete
- Pricing: get dynamic pricing data
- Orders: list/create/get/update/my
- Orders Payment Verify: verify manual payment
- Orders Cancel: formal cancellation workflow
- Checkout Config: get
- Vouchers: list/create
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
- Uploads: payment QR and perfume image upload endpoints

### File and Media Handling

- Payment QR upload endpoint.
- Perfume image upload endpoint.
- Server-side image processing and optimization.

## Project Structure Highlights

- Store pages under src/app/(store)
- Admin pages under src/app/admin
- API routes under src/app/api
- Shared backend logic under src/lib
- Client-side stores under src/store

## Environment Variables

Configure these before production deployment:

- FIREBASE_PROJECT_ID
- FIREBASE_CLIENT_EMAIL
- FIREBASE_PRIVATE_KEY
- SENDGRID_API_KEY
- SENDGRID_FROM_EMAIL
- ALLOWED_ORIGIN

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Start development server:

```bash
npm run dev
```

3. Open:

- Storefront: http://localhost:3000
- Admin: http://localhost:3000/admin
