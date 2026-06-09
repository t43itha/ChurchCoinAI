# Void Transaction Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make voided transactions consistently excluded from financial calculations, auditable enough for finance users, and harder to change accidentally.

**Architecture:** Add a small shared transaction state helper so frontend and Convex calculations use the same `isVoided !== true` rule. Update Convex pledge mutations and read queries to respect active transactions, then replace instant checkbox voiding with explicit void/unvoid mutations and a confirmation workflow.

**Tech Stack:** React 19, TypeScript, Convex mutations/queries, Vitest.

---

### Task 1: Active Transaction Rule

**Files:**
- Create: `lib/voidedTransactions.ts`
- Test: `tests/voidedTransactions.test.ts`
- Modify: `convex/mutations/transactions.ts`
- Modify: `convex/queries/transactions.ts`
- Modify: `convex/queries/dashboard.ts`
- Modify: `convex/queries/aiContext.ts`
- Modify: `components/Dashboard.tsx`
- Modify: `components/Campaigns.tsx`
- Modify: `components/DonorManager.tsx`

- [ ] Write failing tests for active transaction filtering and totals.
- [ ] Implement shared helpers: `isActiveTransaction`, `filterActiveTransactions`, `sumActiveIncome`, and `sumActiveSigned`.
- [ ] Use helpers in frontend calculations.
- [ ] Use `isVoided !== true` in Convex pledge and reporting-adjacent calculations.
- [ ] Run `npm test -- tests/voidedTransactions.test.ts`.

### Task 2: Audit Metadata And Explicit Mutations

**Files:**
- Modify: `convex/schema.ts`
- Modify: `types.ts`
- Modify: `convex/mutations/transactions.ts`
- Test: `tests/voidedTransactions.test.ts`

- [ ] Add optional transaction fields: `voidReason`, `voidedAt`, `voidedBy`, `unvoidedAt`, `unvoidedBy`.
- [ ] Replace shallow toggling with `voidTransaction` and `unvoidTransaction`; keep `toggleVoided` as a compatibility wrapper if needed.
- [ ] Recalculate linked pledge status after void/unvoid.
- [ ] Run focused tests.

### Task 3: Safer UI

**Files:**
- Modify: `components/TransactionManager.tsx`

- [ ] Replace the table checkbox with a void/unvoid action button.
- [ ] Require a reason when voiding.
- [ ] Show voided status and reason clearly.
- [ ] Run `npm run typecheck` and `npm test`.
