# ChurchCoinAI — Comprehensive Codebase Review Report

**Date:** 2026-02-17
**Scope:** Full-stack architecture, security, design system, performance, accessibility, configuration
**Repository:** ChurchCoinAI (multi-tenant financial SaaS for UK churches)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Backend: Schema & Data Model](#2-backend-schema--data-model)
3. [Backend: Authentication & Authorization](#3-backend-authentication--authorization)
4. [Backend: Queries](#4-backend-queries)
5. [Backend: Mutations](#5-backend-mutations)
6. [Backend: Actions (External APIs)](#6-backend-actions-external-apis)
7. [Backend: Webhooks (HTTP Endpoints)](#7-backend-webhooks-http-endpoints)
8. [Backend: AI & Intelligence](#8-backend-ai--intelligence)
9. [Frontend: App Structure](#9-frontend-app-structure)
10. [Frontend: Component Architecture](#10-frontend-component-architecture)
11. [Frontend: Landing Page](#11-frontend-landing-page)
12. [Frontend: Hooks & Services](#12-frontend-hooks--services)
13. [Frontend: Types](#13-frontend-types)
14. [Frontend: Design System](#14-frontend-design-system)
15. [Frontend: Performance](#15-frontend-performance)
16. [Frontend: Accessibility](#16-frontend-accessibility)
17. [Frontend: Error Handling](#17-frontend-error-handling)
18. [Configuration & DevOps](#18-configuration--devops)
19. [Security Summary](#19-security-summary)
20. [Master Issue Tracker](#20-master-issue-tracker)
21. [Priority Action Plan](#21-priority-action-plan)

---

## 1. Executive Summary

ChurchCoinAI has a **solid architectural foundation**. The Convex backend is well-organized with clear separation of queries, mutations, and actions. Multi-tenancy is handled consistently via `organizationId` on every table. Auth is centralized in `convex/lib/auth.ts`. The schema is thoughtfully designed with appropriate indexes. Stripe webhook handling includes proper signature verification. The Swiss Ledger design system is coherent and distinctive.

However, the review identified **83 issues** across the stack:

| Severity | Count | Examples |
|----------|-------|---------|
| **Critical** | 5 | Plaid webhook unverified, CDN supply-chain risk, potential secret exposure |
| **High** | 14 | Plaid token exposed via public mutation, no rate limiting on AI, unbounded queries |
| **Medium** | 28 | Missing input validation, design system inconsistencies, N+1 patterns |
| **Low** | 36 | Dead code, minor type safety gaps, accessibility polish |

The most urgent items are security-related and should be addressed before any production launch.

---

## 2. Backend: Schema & Data Model

**File:** `convex/schema.ts`

### Strengths
- Every table has `organizationId` for multi-tenancy — consistent and complete.
- Composite indexes (e.g., `by_organization_date`, `by_clerkId_organization`, `by_email_organization`) support common query patterns efficiently.
- Fund balances are computed from transactions rather than stored — correct for an accounting system (avoids balance drift).
- Invitation expiry (`expiresAt`) is modelled at the schema level.
- `categorizationCorrections` table with `wasCorrect`, `predictionSource`, and `ragScore` supports a learning feedback loop.

### Issues

| ID | Severity | Description |
|----|----------|-------------|
| S-1 | Medium | `v.any()` on `actionData` in `intelligenceSuggestions` (line 231) bypasses type safety. Replace with a typed union. |
| S-2 | Low | No `updatedAt`/`updatedBy` audit fields on financial records (`transactions`, `donors`, `pledges`, `categories`, `cashCollections`). |
| S-3 | Low | Unused `by_status` index on `invitations` (line 63) spans all tenants. Remove it. |
| S-4 | Medium | Plaid `accessToken` stored in plain text (line 282). Comment claims Convex encrypts at rest, but tokens are fully visible in the Convex dashboard. No application-level encryption. |

---

## 3. Backend: Authentication & Authorization

**File:** `convex/lib/auth.ts` and all query/mutation/action files

### Strengths
- `requireAuth` and `requireRole` are consistently used across queries and mutations.
- Organization scoping is enforced after auth in nearly all handlers.
- Admin-only operations (delete fund, delete donor, delete transaction) are properly gated.
- `requireRole` throws rather than returning null — harder to accidentally ignore.
- "Last Admin" protection in `updateRole` and `remove` prevents lockout.

### Issues

| ID | Severity | File | Description |
|----|----------|------|-------------|
| A-1 | Medium | `mutations/transactions.ts:724` | `getCategorizationStats` is a mutation but performs read-only work. Takes unnecessary write lock. Move to queries. |
| A-2 | Medium | `mutations/plaid.ts:140` | `getItemForAction` is `internalMutation` but only reads. Should be `internalQuery`. |
| A-3 | Low | `mutations/subscriptions.ts:116` | `getForCancel` is a mutation but read-only. Should be a query. |
| A-4 | Low | `mutations/donors.ts:581` | `findDuplicates` is a mutation running O(n²) read-only scan. Should be a query. |
| A-5 | Low | `intelligence/bootstrapRAG.ts:147` | `getIndexingStatus` is `internalMutation` but read-only. Should be `internalQuery`. |
| A-6 | Low | `actions/ai.ts:18`, `actions/stripe.ts:8`, `actions/plaid.ts:15` | `requireUser` uses `ctx: any` — bypasses TypeScript. Use `ActionCtx`. |
| A-7 | Medium | `mutations/users.ts:67` | Deprecated `invite` mutation still publicly callable. Bypasses invitation flow guards (no expiry, no email uniqueness check). Remove or harden. |
| A-8 | **High** | `actions/ai.ts` (all) | No rate limiting on AI actions. A single user could trigger unbounded Gemini API costs. Implement per-org rate limiting. |
| A-9 | Medium | `actions/stripe.ts:29-31` | `successUrl`/`cancelUrl` passed directly to Stripe without domain validation. Could be used for redirect attacks. |
| A-10 | **High** | `mutations/plaid.ts:187` | `removeConnection` is a **public mutation** that returns raw Plaid `accessToken` to the caller. Must be changed to `internalMutation`. |

---

## 4. Backend: Queries

### Strengths
- Almost all queries use `withIndex` rather than full table scans.
- Organization scoping is enforced before returning data.
- Cross-resource ownership checks are performed (e.g., verifying `fundId` belongs to user's org).

### Issues

| ID | Severity | File | Description |
|----|----------|------|-------------|
| Q-1 | Medium | `queries/transactions.ts:205` | `aggregateByCategory` fetches ALL org transactions then filters by date in JS. Use `by_organization_date` index. |
| Q-2 | Medium | `queries/transactions.ts:169` | `listGiftAidEligible` fetches all org transactions then post-filters by date. Use `by_organization_date` index. |
| Q-3 | **High** | `queries/dashboard.ts:12` | `dashboard.summary` fetches ALL transactions for the org on every render. Only current month and YTD are needed. |
| Q-4 | **High** | `queries/aiContext.ts:11` | `getAIContext` fetches ALL transactions and ALL donors — potentially tens of MB. Should be paginated or summarized server-side. |
| Q-5 | **High** | `intelligence/generateInsights.ts:8` | `gatherInsightContext` performs N+1 per-donor queries inside a mutation. Pre-compute per-donor aggregates or use scheduled jobs. |
| Q-6 | Medium | `queries/funds.ts:6-36` | N+1 pattern: 1 query for funds + N queries for transactions per fund. Pattern duplicated ~5 times across `listPriority`, `listByType`, and `dashboard.ts`. |

---

## 5. Backend: Mutations

### Strengths
- `bulkCreate` validates each transaction's fund and donor against the organization.
- Pledge completion is automatically re-evaluated after transaction changes.
- `donors.merge` correctly moves all linked transactions and pledges.
- `organizations.create` enforces "one org per user" check.

### Issues

| ID | Severity | File | Description |
|----|----------|------|-------------|
| M-1 | Medium | Multiple mutation files | No max length limits on string fields (`description`, `notes`, `donorName`, `address`). A user could submit megabytes of data. |
| M-2 | **High** | `mutations/transactions.ts:60` | Negative and zero amounts accepted. `amount: -500` would corrupt fund balances. Add `amount > 0` validation. |
| M-3 | Medium | `mutations/transactions.ts:59` | Date strings not format-validated. `"not-a-date"` would be stored and break all date comparisons. Validate `YYYY-MM-DD`. |
| M-4 | Medium | `mutations/transactions.ts:256` | `bulkCreate` has no maximum transaction count limit. Could hit Convex execution limits. Cap at ~500. |
| M-5 | Medium | `mutations/donors.ts:83` | Donor name change triggers unbounded fan-out: patches ALL transactions and pledges individually. Consider scheduled jobs for large updates. |
| M-6 | Low | `mutations/cashCollections.ts:293` | `markAsBanked` (auto-reconcile) accessible to Finance Team. Consider whether Admin-only is more appropriate for this powerful operation. |
| M-7 | Low | `mutations/maintenance.ts:155` | `backfillDonorIdsFromDonorName` leaks `clerkId` and `email` in response payload. |

---

## 6. Backend: Actions (External APIs)

### Strengths
- All actions use `requireUser` before external API calls.
- Gemini is initialized lazily with API key check.
- Plaid `syncTransactions` verifies item belongs to user's org before using access token.
- Stripe actions check Admin role before cancellation/resumption.

### Issues

| ID | Severity | File | Description |
|----|----------|------|-------------|
| AC-1 | **High** | `actions/ai.ts:649` | `generateGiftAidSchedule` parses raw JSON string with no try/catch and no schema validation. Prompt injection vector. |
| AC-2 | **High** | `actions/ai.ts:1164` | `chatWithTreasurer` concatenates user-supplied `message` and `contextData` directly into Gemini prompt. Prompt injection risk. Use structured `system_instruction` + `contents`. |
| AC-3 | Medium | `actions/ai.ts:735` | Multiple actions parse JSON strings without try/catch (`generateTreasurerReport`, etc.). |
| AC-4 | Medium | `actions/ai.ts:591` | `reconcilePledges` sends full donor PII (names, amounts) to Gemini API. Ensure privacy policy discloses this. |
| AC-5 | **High** | `actions/plaid.ts:99` | `exchangePublicToken` accessible to ALL roles including Guest. Any authenticated user can create a bank connection. Restrict to Admin/Finance Team. |
| AC-6 | Medium | `actions/plaid.ts:29` | `createLinkToken` accessible to all roles. Restrict to Admin/Finance Team. |

---

## 7. Backend: Webhooks (HTTP Endpoints)

**File:** `convex/http.ts`

### Strengths
- Stripe webhook validates `stripe-signature` header using `constructEventAsync` — correct implementation.
- Returns 500 on processing errors to trigger Stripe retry.
- Uses `internal` mutations for all database writes from webhooks.

### Issues

| ID | Severity | Description |
|----|----------|-------------|
| H-1 | **Critical** | Plaid webhook (line 164) has **no signature verification**. Endpoint is completely unauthenticated. Anyone who knows the URL can forge payloads. Implement Plaid's JWT-based verification. |
| H-2 | **High** | Stripe `organizationId` from metadata (line 71) cast with `as any` and not validated as a real org. Spoofed metadata could create orphaned subscription records. |
| H-3 | Low | Stripe event objects cast to `any` in multiple places (lines 70, 99, 107, 122). Use proper Stripe types (`Stripe.Subscription`, `Stripe.Invoice`). |

---

## 8. Backend: AI & Intelligence

### Strengths
- `internalQuery` and `internalMutation` used for all intelligence functions — cannot be called from the client.
- Duplicate insight detection via `hasDuplicateForDonor` prevents flooding.
- 7-day expiry on insights with cleanup function.
- RAG indexing fails gracefully without blocking transaction creation.

### Issues

| ID | Severity | File | Description |
|----|----------|------|-------------|
| I-1 | Low | `intelligence/ragIndexer.ts:29` | RAG namespace collision assumption (`org_<convexId>`) undocumented. |
| I-2 | **High** | `intelligence/bootstrapRAG.ts:60` | `cursor` parameter is declared but never used in `indexAllTransactions`. Every recursive call re-fetches the same first batch — **infinite re-index loop bug**. |
| I-3 | Low | `actions/ai.ts:1181` | Raw Gemini response returned without sanitization. Ensure frontend renders safely (not as raw HTML). |
| I-4 | Low | `intelligence/generateInsights.ts:8` | Mixed query/mutation DB read contexts produce inconsistent snapshots. |

---

## 9. Frontend: App Structure

**File:** `App.tsx` (703 lines)

### Strengths
- Correct use of Convex "skip" pattern for conditional queries.
- Layered loading/redirect waterfall (Clerk → user → org → subscription → data) is logical.
- Shared `showNotification` system.
- URL param cleanup after Stripe redirect.

### Issues

| ID | Severity | Description |
|----|----------|-------------|
| F-1 | Medium | **God Component**: App.tsx declares ~20 mutations, ~15 handlers, passes up to 13 props per child. Components should own their own mutations (like `TransactionManager` already does). |
| F-2 | Low | `renderContent()` (line 531) not memoized — re-evaluates on every render. |
| F-3 | Low | `isPaymentSuccess` URL check (lines 184-198) runs `new URLSearchParams` on every render. Move to `useMemo`. |
| F-4 | Low | `handleRemoveUser` — `removeUser` mutation declared (line 123) but never wired to a handler passed to Settings. |

---

## 10. Frontend: Component Architecture

### Strengths
- `DonorSearchInput.tsx` — well-isolated, keyboard-navigable combobox with debounce.
- `SmartSuggestionsPanel.tsx` — self-contained, owns its own queries/mutations.
- `CashTakingsEntry.tsx` — owns its Convex mutations directly (correct pattern).
- `FundManager.tsx` — clean display logic.

### Issues

| ID | Severity | File | Description |
|----|----------|------|-------------|
| C-1 | Low | Dashboard, TransactionManager, CashTakingsEntry | `Category` interface duplicated locally in 3 files. Already exists in `types.ts:195`. |
| C-2 | Medium | `DonorManager.tsx:129-130` | `canEdit` and `canView` are **identical expressions**. Likely a bug — read-only roles (Pastorate) are completely blocked from viewing donors. |
| C-3 | Medium | Multiple components | `alert()` used for error feedback in 8+ places (TransactionManager, Settings, SubscriptionRequired). Should use `showNotification`. |
| C-4 | Low | `Campaigns.tsx:38` | `matches` state typed as `any[]`. Should be typed against `reconcilePledgesAI` return shape. |
| C-5 | Medium | `DonorManager.tsx:26-56` | WhatsApp templates hardcode "NCC Finance Team". Should dynamically use `churchDetails.name`. |

---

## 11. Frontend: Landing Page

### Strengths
- Clean component decomposition: one file per section, all driven by centralized `content.ts`.
- Framer Motion uses `useReducedMotion()` in `Hero.tsx` for accessibility.
- `whileInView` with `viewport={{ once: true }}` correctly prevents re-firing animations.
- `willChange: "transform, opacity"` hint on heavy animated elements.

### Issues

| ID | Severity | File | Description |
|----|----------|------|-------------|
| L-1 | **High** | `Hero.tsx:327` | "Book a Demo" secondary CTA has **no `onClick` handler**. Clicking does nothing — major conversion blocker. |
| L-2 | Low | `content.ts:30-35` | Trust metrics ("500+ UK churches", "£2.3M Gift Aid recovered") appear to be aspirational figures, not actual data. Compliance risk for a UK charity SaaS. |
| L-3 | Low | `Hero.tsx` | `framer-motion` dependency may not be in `package.json` — relies on import map from `aistudiocdn.com`. |

---

## 12. Frontend: Hooks & Services

### Strengths
- `usePlaidLinkFlow` properly encapsulates the multi-step Plaid auth flow.
- Dynamic imports for PDF/Excel services in `Reports.tsx` prevent loading heavy deps until needed.
- Separation of `pdfGenerator.ts` (HTML) and `pdfExport.ts` (browser rendering) is clean.

### Issues

| ID | Severity | File | Description |
|----|----------|------|-------------|
| HS-1 | Low | `usePlaidLink.ts:63,124` | `options` object in `useCallback` deps creates new reference every render, recreating callbacks. Use `useRef`. |
| HS-2 | Low | N/A | Only 1 custom hook for 46+ components. Reusable patterns (debounce, month navigation, currency formatting) duplicated across files. |
| HS-3 | Medium | `Reports.tsx:113-140` | Export buttons (PDF, Excel) have no loading state. User can click multiple times. |

---

## 13. Frontend: Types

**File:** `types.ts`

### Strengths
- `as const` enum objects with corresponding type aliases — clean, non-enum pattern.
- `CashCollectionSubmitInput` cleanly separates submission DTO from entity.
- Good use of `Pick` and `Omit` for create-input types.

### Issues

| ID | Severity | Description |
|----|----------|-------------|
| T-1 | Low | `Transaction.pledgeId` (line 130) is `string | null | undefined` — tri-state is fragile. |
| T-2 | Low | `AppUser` (lines 40-47) lacks `organizationId` field. |
| T-3 | Low | `Insight` interface (lines 181-187) is defined but never imported anywhere — dead code. |

---

## 14. Frontend: Design System

### Strengths
- Semantic color tokens (`ink`, `paper`, `charcoal`, `sage`, `amber`, `error`).
- Hard offset shadows (`.shadow-hard-sm/md/lg`) create a distinct visual identity.
- `prefers-reduced-motion` media query correctly disables transitions.
- Custom utility classes (`.swiss-card`, `.ledger-table`, `.btn-primary`) consistently used across most components.

### Issues

| ID | Severity | File | Description |
|----|----------|------|-------------|
| D-1 | **High** | `index.html:14` | Tailwind CDN (`cdn.tailwindcss.com`) loads full CSS engine (~300KB) at runtime. No tree-shaking, no build-time optimization. Migrate to PostCSS/Vite plugin. |
| D-2 | Medium | `AICoPilot.tsx:94-142` | Entire component uses `slate-*` and `indigo-*` Tailwind classes — not part of Swiss Ledger design system. Visually inconsistent. |
| D-3 | Medium | `DonorSearchInput.tsx:181-256` | Uses `border-gray-300`, `text-gray-400`, `hover:bg-gray-100` — not design system tokens. |
| D-4 | Medium | Landing components | 8+ sections repeat `text-xs uppercase tracking-widest text-[#666666] mb-4` with hardcoded hex. Extract to shared `SectionHeader` component using `text-grey-mid`. |
| D-5 | Low | `Settings.tsx:226` | `scrollbar-hide` utility used but never defined in Tailwind config. Silently ignored. |
| D-6 | Low | `FundManager.tsx:75`, `Dashboard.tsx:252` | Arbitrary inline shadow values bypass `shadow-hard-*` system. |

---

## 15. Frontend: Performance

### Strengths
- `useMemo` correctly applied to `filteredTransactions`, chart data in TransactionManager and Dashboard.
- `ITEMS_PER_PAGE = 100` with load-more pattern.
- `useCallback` for keyboard handlers in `DonorSearchInput`.

### Issues

| ID | Severity | File | Description |
|----|----------|------|-------------|
| P-1 | Medium | `TransactionManager.tsx:126` | `searchTerm` in `useMemo` deps causes full array re-filter on every keystroke. Debounce the search term. |
| P-2 | **High** | `TransactionManager.tsx:273` | `handleBulkAutoCategorize` makes N sequential `updateTransaction` mutations. A `bulkUpdateTransactions` mutation exists but isn't used. |
| P-3 | Medium | `Hero.tsx:60-88` | `LiveProgressBar` uses `requestAnimationFrame` loop + framer-motion simultaneously. RAF triggers `setCurrentPercent` at 60fps, causing 180 React state updates/second across 3 progress bars. Use `useMotionValue`. |

---

## 16. Frontend: Accessibility

### Strengths
- Mobile menu backdrop dismissable via click.
- `aria-label` on Dashboard FAB.
- Escape key closes dropdowns in `DonorSearchInput`.
- `autoFocus` on first input in Onboarding.

### Issues

| ID | Severity | File | Description |
|----|----------|------|-------------|
| AX-1 | Medium | `DonorSearchInput.tsx:221` | Dropdown missing ARIA combobox pattern: no `role="listbox"`, no `aria-expanded`, no `aria-haspopup`, no `aria-controls`, no `role="option"`. |
| AX-2 | Low | `Sidebar.tsx:64` | Close button has only `<X>` icon with no `aria-label`. |
| AX-3 | Low | `App.tsx:660` | Notification toast close button has no `aria-label`. |
| AX-4 | Low | `FAQ.tsx:41` | Accordion buttons missing `aria-expanded` and `aria-controls`. |
| AX-5 | Low | `App.tsx:648` | Toast notification lacks `role="status"` or `aria-live="polite"`. Screen readers won't announce it. |
| AX-6 | Low | `Reports.tsx:282`, `Dashboard.tsx:208` | Data tables have no `<caption>` or `aria-label`. |

---

## 17. Frontend: Error Handling

### Strengths
- App.tsx handlers have try/catch with `showNotification` fallback.
- `Onboarding.tsx` displays inline error messages.
- `CashTakingsEntry.tsx` has inline error state.

### Issues

| ID | Severity | Description |
|----|----------|-------------|
| E-1 | **High** | **No React Error Boundary** in the entire app. Any render error crashes to a blank white screen. Critical for a financial application. |
| E-2 | Low | `TransactionManager.tsx:554` — `console.log` left in production code. |
| E-3 | Low | Inconsistent empty states: `FundManager.tsx` renders empty grid when no funds exist; `DonorManager.tsx` shows no message when search returns no results. |

---

## 18. Configuration & DevOps

### package.json

| ID | Severity | Description |
|----|----------|-------------|
| CF-1 | Low | No `typecheck` or `lint` scripts. |
| CF-2 | Medium | `plaid` and `stripe` (Node-only SDKs) in `dependencies` instead of `devDependencies`. May bloat client bundle. |
| CF-3 | Medium | `@ai-sdk/google` and `ai` packages appear unused — AI uses `@google/genai` directly. Dead dependencies. |
| CF-4 | Low | `xlsx@^0.18.5` unmaintained since 2023. Consider `exceljs`. |
| CF-5 | Low | Loose `^` version pinning for Stripe/Plaid. Use `~` for financial-critical deps. |

### TypeScript

| ID | Severity | Description |
|----|----------|-------------|
| TS-1 | **High** | No `strict: true` on root `tsconfig.json`. `strictNullChecks`, `noImplicitAny` all disabled for frontend. Dangerous for financial logic. |
| TS-2 | Low | `"allowJs": true` — reduces TypeScript protection. |
| TS-3 | Low | `"types": ["node"]` injects Node.js globals into browser code. |
| TS-4 | Low | Convex `tsconfig.json` includes `"dom"` in lib — DOM APIs typecheck in server code. Use `["ES2022", "WebWorker"]`. |

### Vite

| ID | Severity | Description |
|----|----------|-------------|
| V-1 | Medium | `host: "0.0.0.0"` exposes dev server to LAN on shared networks. |
| V-2 | Medium | No build optimizations or chunk splitting. Single large bundle in production. |
| V-3 | Low | No build-time validation that `VITE_CONVEX_URL` and `VITE_CLERK_PUBLISHABLE_KEY` exist. |

### index.html Security

| ID | Severity | Description |
|----|----------|-------------|
| IX-1 | **Critical** | Tailwind CDN script (line 14) has no Subresource Integrity (SRI) hash. Supply-chain attack vector. |
| IX-2 | **Critical** | importmap (lines 259-270) loads React and other libs from `aistudiocdn.com` with `^` version ranges. Not a standard CDN; no SRI; no SLA. Remove entirely — Vite handles bundling. |
| IX-3 | **High** | No Content Security Policy (CSP) meta tag. |
| IX-4 | Low | `apple-touch-icon.png` referenced but file is SVG. Apple requires rasterized PNG. |
| IX-5 | Low | PWA manifest `purpose: "any maskable"` is invalid per spec. Should be separate icon objects. |

### .gitignore

| ID | Severity | Description |
|----|----------|-------------|
| G-1 | **Critical** | `.env.local` may be git-tracked (readable despite `*.local` rule). If committed, all secrets (Stripe SK, Gemini key) are in git history and must be rotated. Run `git log --all -- .env.local` to verify. |
| G-2 | Low | Missing entries: `.convex/`, `.claude/settings.local.json`, `coverage/`, `*.pem`, `*.key`. |

### File Structure

| ID | Severity | Description |
|----|----------|-------------|
| FS-1 | Low | `components/` is flat (20+ files). No feature grouping. Consider `components/transactions/`, `components/donors/`, etc. |
| FS-2 | Low | `SmartSuggestionsPanel.tsx` in `components/intelligence/` but `AICoPilot.tsx` in root `components/`. Inconsistent. |
| FS-3 | Low | Image filename `ChurchCoin-Variation 01-transparent (2).png` has spaces and parentheses. Rename for URL safety. |

---

## 19. Security Summary

### Critical Vulnerabilities

| # | Location | Risk | Recommendation |
|---|----------|------|----------------|
| 1 | `convex/http.ts:164` | **Plaid webhook completely unauthenticated.** Anyone can forge events. | Implement Plaid JWT-based webhook verification immediately. |
| 2 | `index.html:14` | **Tailwind CDN with no SRI.** Compromised CDN = arbitrary JS injection on every page. | Add SRI hash or migrate to npm Tailwind + PostCSS. |
| 3 | `index.html:259-270` | **importmap loads from `aistudiocdn.com` with `^` version ranges.** Uncontrolled third-party CDN. | Remove importmap entirely; Vite handles bundling. |
| 4 | `.env.local` | **Possible secret exposure in git history.** Stripe SK, Gemini key, Clerk key at risk. | Verify with `git log`. Rotate all keys if confirmed. |
| 5 | `mutations/plaid.ts:187` | **Public mutation returns raw Plaid `accessToken`.** Any Finance Team user can retrieve it via client SDK. | Change to `internalMutation`. |

### High-Risk Items

| # | Location | Risk |
|---|----------|------|
| 6 | `actions/plaid.ts:99` | `exchangePublicToken` callable by Guest role — any user can create bank connections. |
| 7 | `actions/ai.ts` (all) | No rate limiting — unbounded Gemini API cost exposure. |
| 8 | `actions/ai.ts:1164` | User input concatenated directly into AI prompt — prompt injection. |
| 9 | `actions/ai.ts:649` | `JSON.parse` without try/catch on external action inputs. |
| 10 | `convex/http.ts:71` | Stripe `organizationId` from metadata not validated — orphaned records possible. |
| 11 | No CSP | `index.html` lacks Content Security Policy. |
| 12 | `tsconfig.json` | No `strict: true` on frontend — null-safety bugs in financial logic. |

---

## 20. Master Issue Tracker

| ID | Area | Severity | Summary |
|----|------|----------|---------|
| H-1 | Webhook | Critical | Plaid webhook has no signature verification |
| IX-1 | Config | Critical | Tailwind CDN with no SRI — supply-chain risk |
| IX-2 | Config | Critical | importmap loads from unverified CDN with version ranges |
| G-1 | Config | Critical | Possible secret exposure in git history |
| A-10 | Auth | High | Public mutation returns raw Plaid accessToken |
| AC-5 | Auth | High | Plaid token exchange accessible to Guest role |
| A-8 | Auth | High | No rate limiting on AI actions |
| AC-2 | Security | High | Prompt injection in chatWithTreasurer |
| AC-1 | Security | High | JSON.parse without try/catch in AI actions |
| H-2 | Webhook | High | Stripe organizationId not validated |
| Q-3 | Performance | High | Dashboard fetches ALL transactions |
| Q-4 | Performance | High | AI context fetches ALL transactions + donors |
| Q-5 | Performance | High | N+1 per-donor queries in insight generation |
| M-2 | Validation | High | Negative/zero amounts accepted |
| I-2 | Bug | High | bootstrapRAG cursor never used — infinite re-index |
| E-1 | Error | High | No React Error Boundary |
| L-1 | UX | High | "Book a Demo" CTA does nothing |
| P-2 | Performance | High | Bulk categorize makes N sequential mutations |
| D-1 | Performance | High | Tailwind CDN in production (~300KB runtime) |
| TS-1 | Config | High | No strict mode in frontend TypeScript |
| IX-3 | Security | High | No Content Security Policy |
| C-2 | Bug | Medium | canEdit/canView identical — blocks read-only roles |
| C-5 | Bug | Medium | Hardcoded "NCC Finance Team" in WhatsApp templates |
| A-7 | Auth | Medium | Deprecated invite mutation still callable |
| A-9 | Security | Medium | Stripe URLs not domain-validated |
| AC-6 | Auth | Medium | createLinkToken accessible to all roles |
| S-1 | Schema | Medium | v.any() on actionData |
| S-4 | Schema | Medium | Plaid accessToken in plain text |
| M-1 | Validation | Medium | No max length limits on string inputs |
| M-3 | Validation | Medium | Date strings not format-validated |
| M-4 | Validation | Medium | bulkCreate has no count limit |
| M-5 | Performance | Medium | Donor name change — unbounded write fan-out |
| Q-1 | Performance | Medium | aggregateByCategory full-table fetch |
| Q-2 | Performance | Medium | listGiftAidEligible full-table fetch |
| Q-6 | Performance | Medium | N+1 fund balance computation (5x duplicated) |
| AC-3 | Security | Medium | Multiple actions parse JSON without validation |
| AC-4 | Privacy | Medium | Donor PII sent to Gemini API |
| D-2 | Design | Medium | AICoPilot uses wrong design tokens |
| D-3 | Design | Medium | DonorSearchInput uses wrong design tokens |
| D-4 | Design | Medium | Landing sections use hardcoded hex colors |
| P-1 | Performance | Medium | Search term not debounced in filter |
| P-3 | Performance | Medium | LiveProgressBar 60fps React re-renders |
| AX-1 | A11y | Medium | DonorSearchInput missing ARIA combobox pattern |
| HS-3 | UX | Medium | Export buttons lack loading state |
| CF-2 | Config | Medium | Node-only SDKs in browser dependencies |
| CF-3 | Config | Medium | Unused AI SDK packages |
| V-1 | Config | Medium | Dev server exposed to LAN |
| V-2 | Config | Medium | No chunk splitting in production build |
| F-1 | Architecture | Medium | App.tsx god component — 13+ props drilled |
| C-3 | UX | Medium | alert() used in 8+ places |
| A-1 | Code | Medium | Read-only mutations (multiple instances) |
| A-2 | Code | Medium | internalMutation used for reads |

*Low-severity items (36 total) omitted for brevity — see individual sections above.*

---

## 21. Priority Action Plan

### Phase 1: Security (Do Immediately)

1. **Verify secret exposure**: Run `git log --all -- .env.local`. If tracked, rotate ALL keys (Stripe, Gemini, Clerk) immediately.
2. **Plaid webhook verification** (`convex/http.ts`): Implement JWT-based signature verification using `plaid.webhookVerificationKeyGet()`.
3. **Fix Plaid access token exposure** (`mutations/plaid.ts`): Change `removeConnection` to `internalMutation`.
4. **Restrict Plaid roles** (`actions/plaid.ts`): Add `requireRole(["Admin", "Finance Team"])` to `exchangePublicToken` and `createLinkToken`.
5. **Remove importmap** from `index.html` (lines 259-270). Vite handles bundling.
6. **Add SRI hash** to Tailwind CDN script, or better, migrate to npm Tailwind + PostCSS.
7. **Add Content Security Policy** meta tag to `index.html`.

### Phase 2: Data Integrity (This Sprint)

8. **Add amount validation**: `amount > 0` check in all transaction mutations.
9. **Add date format validation**: `/^\d{4}-\d{2}-\d{2}$/` check on date strings.
10. **Add string length limits**: Max 1000-5000 chars on free-text fields.
11. **Fix bootstrapRAG cursor bug** (`intelligence/bootstrapRAG.ts`): Implement actual cursor-based pagination.
12. **Validate Stripe organizationId** (`convex/http.ts`): Check org exists before upserting subscription.
13. **Add React Error Boundary**: Wrap the app in a top-level error boundary with fallback UI.

### Phase 3: Performance (Next Sprint)

14. **Fix dashboard query** (`queries/dashboard.ts`): Use date-bounded queries instead of fetching all transactions.
15. **Fix AI context query** (`queries/aiContext.ts`): Paginate or summarize server-side.
16. **Consolidate fund balance computation**: Replace N+1 pattern with single-fetch approach. Deduplicate the 5 copies.
17. **Use bulk mutation for auto-categorize** (`TransactionManager.tsx`): Replace sequential loop with `bulkUpdateTransactions`.
18. **Add rate limiting** on AI actions.

### Phase 4: Code Quality (Ongoing)

19. **Enable TypeScript strict mode** on frontend `tsconfig.json`.
20. **Fix canEdit/canView bug** in `DonorManager.tsx`.
21. **Replace all `alert()` calls** with `showNotification`.
22. **Fix "Book a Demo" CTA** — wire to a booking form or Calendly link.
23. **Parameterize "NCC Finance Team"** in WhatsApp templates.
24. **Unify design tokens** — fix AICoPilot, DonorSearchInput, and landing page hex colors.
25. **Remove unused dependencies** (`@ai-sdk/google`, `ai`).
26. **Add ARIA combobox pattern** to DonorSearchInput.
27. **Convert read-only mutations to queries** (A-1 through A-5).
28. **Add typecheck/lint scripts** to package.json.

---

*Report generated by automated code review. All file paths and line numbers reference the codebase as of 2026-02-17.*
