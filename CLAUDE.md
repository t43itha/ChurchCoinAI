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
npx tsc            # Type-check (no test framework or linter configured)
```

Both `npm run dev` and `npx convex dev` must run simultaneously during development.

## Architecture

### Stack
- **Frontend:** React 19 + TypeScript + Vite (port 3000)
- **Backend:** Convex (serverless BaaS with real-time reactivity)
- **Auth:** Clerk (JWT-based, bridged to Convex via `ConvexProviderWithClerk`)
- **AI:** Google Gemini 2.5 Flash + Convex RAG for transaction categorization
- **Banking:** Plaid (UK Open Banking / PSD2)
- **Payments:** Stripe (subscription billing with webhook handling)
- **Styling:** Tailwind CSS via CDN with custom "Swiss Ledger" design system defined in `index.html`
- **Exports:** html2canvas + jsPDF for PDF, XLSX for Excel

### Frontend Structure
- `App.tsx` — Root component with tab-based routing via `activeTab` state (no router library)
- `components/` — All UI components (~46 files), flat structure
- `components/landing/` — Marketing site components
- `hooks/` — Custom hooks (e.g., `usePlaidLink.ts`)
- `services/` — PDF and Excel export utilities
- `types.ts` — Shared TypeScript interfaces
- Navigation tabs: dashboard, transactions, funds, donors, campaigns, reports, copilot, settings

### Backend Structure (convex/)
- `schema.ts` — 16 tables, all scoped to `organizationId` for multi-tenancy
- `queries/` — Read-only data fetching with auth checks
- `mutations/` — Data modifications with role validation
- `actions/` — Server-side async operations (AI calls, Stripe, Plaid OAuth)
- `intelligence/` — AI insight generation and RAG indexing
- `http.ts` — HTTP routes for Stripe and Plaid webhooks
- `lib/auth.ts` — Auth helpers: `getCurrentUser()`, `requireAuth()`, `requireRole()`, `canEdit()`

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
The "Swiss Ledger" design system is defined via Tailwind config in `index.html` (not a separate tailwind.config file). Key tokens:
- Colors: ink, paper, charcoal, sage, amber
- Fonts: DM Sans (body), JetBrains Mono (code)
- Shadow style: hard offset shadows (2px-8px)
- Custom classes: `swiss-card`, `ledger-table`, `btn-primary`, `btn-secondary`, `badge-*`

## Environment Variables

**Frontend** (`.env.local`):
- `VITE_CONVEX_URL` — Convex deployment URL
- `VITE_CLERK_PUBLISHABLE_KEY` — Clerk frontend key

**Backend** (set via Convex Dashboard or `npx convex env set`):
- `GEMINI_API_KEY`, `CLERK_JWT_ISSUER_DOMAIN`
- `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `PLAID_WEBHOOK_URL`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWING`, `STRIPE_PRICE_THRIVING`

Backend secrets must **never** go in `VITE_*` env vars (those are exposed to the browser).

## Key Conventions

- Path alias: `@/*` maps to project root (configured in `tsconfig.json` and `vite.config.ts`)
- Convex auto-generates types in `convex/_generated/` — never edit these files
- Webhook endpoints live in `convex/http.ts` (Stripe at `/stripe/webhook`, Plaid at `/plaid/webhook`)
- PDF export uses client-side rendering: html2canvas captures DOM, jsPDF converts to A4
- AI categorization uses Gemini JSON mode and stores correction feedback in `categorizationCorrections` for RAG learning
- Reuse existing Convex queries and mutations rather than creating duplicates
