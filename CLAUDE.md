# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChurchCoinAI is a multi-tenant financial management SaaS for UK churches. It combines fund accounting, donor management, AI-powered transaction categorization, and banking integrations into a single platform.

## Development Commands

```bash
npm run dev        # Start Vite dev server on localhost:3000
npm run build      # Production build
npx convex dev     # Start Convex backend dev server (run alongside Vite)
npx convex deploy  # Deploy backend to production
npm run typecheck  # Type-check (tsc --noEmit)
npm run lint       # ESLint (rules-of-hooks as errors; see eslint.config.js)
npm test           # Vitest unit tests (tests/ covers lib + categorization logic)
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint, and tests on pushes and PRs.

Both `npm run dev` and `npx convex dev` must run simultaneously during development.

## Architecture

### Stack
- **Frontend:** React 19 + TypeScript + Vite (port 3000)
- **Backend:** Convex (serverless BaaS with real-time reactivity)
- **Auth:** Clerk (JWT-based, bridged to Convex via `ConvexProviderWithClerk`)
- **AI:** Google Gemini 2.5 Flash + Convex RAG for transaction categorization
- **Banking:** Provider-neutral bank connections, with Enable Banking as the active provider for manual UK Open Banking transaction sync
- **Payments:** Stripe (subscription billing with webhook handling)
- **Styling:** Tailwind CSS via PostCSS (`tailwind.config.cjs` + `styles.css`) with the "Refined Ledger" design system
- **Exports:** html2canvas + jsPDF for PDF, XLSX (SheetJS 0.20.x from cdn.sheetjs.com) for Excel

### Frontend Structure
- `index.tsx` — Entry: Clerk + Convex providers, `BrowserRouter`
- `App.tsx` — Auth/onboarding gates and app shell; fetches only shared reference data (funds, categories)
- `components/app/AppContentRoutes.tsx` — react-router routes; each route wrapper fetches its own data (transactions, donors, pledges, users) so only the active page subscribes to it
- `components/app/actions/` — Mutation-wrapping hooks (donor/pledge, fund/category, org admin) used by route wrappers; they surface toasts via `lib/notifications.notify`
- `components/` — UI components, flat structure; `components/landing/` marketing site; `components/legal/` privacy/terms
- `lib/` — Shared pure logic (dates, money-adjacent filters like `reportableTransactions`, notifications)
- `services/` — PDF and Excel export utilities
- `types.ts` — Shared TypeScript interfaces
- `tests/` — Vitest unit tests for lib and categorization logic
- Routes: /dashboard, /transactions, /funds, /donors, /campaigns, /reports, /copilot, /settings (+ public /privacy, /terms)

### Backend Structure (convex/)
- `schema.ts` — 17 tables, all scoped to `organizationId` for multi-tenancy
- `queries/` — Read-only data fetching with auth checks
- `mutations/` — Data modifications with role validation
- `actions/` — Server-side async operations (AI calls, Stripe, bank connection flows)
- `intelligence/` — AI insight generation and RAG indexing
- `http.ts` — HTTP routes for Stripe webhooks, active Enable Banking callbacks, and preserved Plaid webhook compatibility
- `crons.ts` — Daily maintenance: expire pending invitations, flag lapsed bank consents, clean stale pending bank connections
- `lib/auth.ts` — Auth helpers: `getCurrentUser()`, `requireAuth()`, `requireRole()`, `canEdit()`
- `lib/money.ts` — Money helpers: amounts are pounds as floats; always round sums with `roundMoney()` and compare targets with `meetsMoneyTarget()`

### Data Patterns
```typescript
// Reactive queries with conditional execution ("skip" disables the query)
const funds = useQuery(api.queries.funds.list, hasUser ? {} : "skip");

// Mutations trigger automatic refetch of dependent queries
const createDonor = useMutation(api.mutations.donors.create);

// Server-side actions for external API calls
const categorize = useAction(api.actions.ai.categorizeTransactions);
```

### Multi-tenancy
Every table has an `organizationId` field. All queries and mutations must scope data to the current user's organization. Auth helpers in `convex/lib/auth.ts` enforce this.

### Role-Based Access
Four roles with descending permissions: **Admin** > **Finance Team** > **Pastorate** > **Guest**. Admin and Finance Team can edit; Pastorate and Guest are read-only. Use `requireRole()` and `canEdit()` from `convex/lib/auth.ts`.

### Design System
The "Refined Ledger" design system is defined in `tailwind.config.cjs` and `styles.css`. Key tokens:
- Colors: ink, paper, charcoal, sage, amber
- Fonts: DM Sans (body), JetBrains Mono (code)
- Borders/shadows: `border-ledger` + soft shadows (`shadow-soft`)
- Custom classes: `swiss-card`, `ledger-table`, `btn-primary`, `btn-secondary`, `badge-*`

## Environment Variables

**Frontend** (`.env.local`):
- `VITE_CONVEX_URL` — Convex deployment URL
- `VITE_CLERK_PUBLISHABLE_KEY` — Clerk frontend key

**Backend** (set via Convex Dashboard or `npx convex env set`):
- `GEMINI_API_KEY`, `CLERK_JWT_ISSUER_DOMAIN`
- `ENABLE_BANKING_APPLICATION_ID`, `ENABLE_BANKING_PRIVATE_KEY`, `ENABLE_BANKING_REDIRECT_URL`, `APP_BASE_URL`
- `ENABLE_BANKING_DEFAULT_COUNTRY`, `ENABLE_BANKING_DEFAULT_ASPSP`, optional `ENABLE_BANKING_API_BASE_URL`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWING`, `STRIPE_PRICE_THRIVING`
- `RESEND_API_KEY` (invitation emails), optional `RESEND_FROM_EMAIL` (defaults to `ChurchCoin <onboarding@resend.dev>`; set a verified-domain sender for production)

Backend secrets must **never** go in `VITE_*` env vars (those are exposed to the browser).
`APP_BASE_URL` is the public frontend origin used after Enable Banking redirects back to Convex; set it for deployed environments.

## Key Conventions

- Path alias: `@/*` maps to project root (configured in `tsconfig.json` and `vite.config.ts`)
- Convex auto-generates types in `convex/_generated/` — never edit these files
- HTTP integration endpoints live in `convex/http.ts` (Stripe at `/stripe/webhook`, active Enable Banking callback at `/enable-banking/callback`, preserved Plaid webhook at `/plaid/webhook` for backend compatibility)
- PDF export uses client-side rendering: html2canvas captures DOM, jsPDF converts to A4
- AI categorization uses Gemini JSON mode and stores correction feedback in `categorizationCorrections` for RAG learning
- Reuse existing Convex queries and mutations rather than creating duplicates
