# Valore Parfums Monorepo

This repository is split into independent applications:

- `frontend/`: Next.js storefront + admin UI (no local API routes)
- `backend/`: Next.js API service (`/api/*` route handlers)
- `shared/`: Shared libraries and types used by both apps

## Development

Install dependencies per app:

- `npm --prefix backend install`
- `npm --prefix frontend install`

Run apps independently:

- Backend: `npm run dev:backend` (http://localhost:3001)
- Frontend: `npm run dev:frontend` (http://localhost:3000)

Frontend API calls are proxied to backend via `NEXT_PUBLIC_API_BASE_URL`.

## Build

- `npm run build:backend`
- `npm run build:frontend`
- `npm run build`

## Environment

Set in `frontend/.env.local`:

- `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001`

Set in `backend/.env.local`:

- Firebase admin credentials and service settings
- Optional: `ALLOWED_ORIGIN=http://localhost:3000`
