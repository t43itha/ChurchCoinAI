# PR 2: transfers, returned payments and loans in the ledger

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a treasurer mark a row as a transfer between funds, a returned payment or a loan, so it drops out of income and spending but still moves fund balances, and show transfers on reports and unpaired legs at month end.

**Architecture:** PR 1 (#50) put every report and balance behind `ledgerEffect` in `lib/reportableTransactions.ts`. This PR adds the schema fields, three built-in categories that carry a `movementKind`, copies the kind onto each transaction whenever its category is validated, and adds the rules for journal, transfer, reversal and loan rows. Reports, the PDF, Campaigns and the dashboard then pick up the new behaviour through the existing views plus three new helpers.

**Tech Stack:** Convex, React 19, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-06-ledger-movements-design.md` (step 2 of "Delivery"). PR 1 plan: `docs/superpowers/plans/2026-10-07-ledger-movements-pr1.md`.

## Global Constraints

- Every table is scoped to `organizationId`.
- Money totals use `sumMoney` / `roundMoney` from `convex/lib/money.ts`. `tests/moneyArithmetic.test.ts` counts may only go down.
- Category validity goes through `ensureTypedCategories` + `requireCanonicalCategory` on the server.
- Every `transactions` patch goes through `convex/lib/transactionWrites.patchTransaction`.
- No new module under `convex/`, so `convex/_generated/api.d.ts` does not change and no `npx convex codegen` is needed. `dataModel.d.ts` derives from `schema.ts` at compile time.
- New schema fields are optional, so the schema stays compatible with existing data. Deploying is the user's call.
- Out of scope (PR 3): "Link other side", creating `movements` rows, the journal transfer form, the "Needs reclassifying" filter. Also out of scope: the loan register, bank account per row, pairing on import, an Excel transfers sheet.

## Decisions

- **Movement categories have no `transactionType`.** The resolver already accepts an untyped category for both types (`resolveCategoryForTransaction` falls back to an exact untyped name), so one row per kind is "valid for both income and expenditure" without duplicate names. The AI prompt list (`allowedCategoriesForType`) gains them explicitly.
- **Built-ins are found by `movementKind`, not name**, so a renamed built-in is not re-created. If an organisation already has a user category with the built-in's name and no kind, the built-in is skipped rather than taking over that category, because its existing rows would otherwise change classification only when next edited.
- **`requireCanonicalCategory` returns `{ category, movementKind }`.** Every write path already calls it, so changing its return type makes the compiler find every place that must copy the kind. Patches always include the key, so moving a row out of a movement category clears the kind.
- **The month-end check counts transfer and reversal legs without a `movementId`**, dated on or before the period's through date, voided rows excluded. Loans are excluded: their other side is the lender, outside the ledger. The check only appears when the count is above zero.
- **Operational counts use the bank view.** Dashboard reconciled/categorised percentages, unreconciled spend, and insight reconciliation counts and last-activity date use `hasBankEffect` rows, so journal legs (no bank effect) are never "waiting to be reconciled".
- **Transfers sections render only when the period has transfer rows**, in the app and the PDF, so reports for churches with no transfers are unchanged.

## Review Focus

1. A row moved from "Loan" back to "Offerings" must lose its `movementKind` (patch clears the key) and count as income again.
2. A bulk edit that sets a movement category on mixed income and expenditure rows must succeed for both types.
3. A cash banking deposit that was earlier marked as a loan must still classify as a deposit (rule order: deposit before movement rules).
4. A transfer leg in a fund that is not a campaign must not affect any campaign's "raised" figure; a transfer out of a campaign fund must not reduce it.
5. An org with a user category named "Loan" must keep that category untouched and not get a duplicate.

---

### Task 1: Classifier rules and new views

**Files:**
- Create: `lib/movementCategories.ts`
- Modify: `lib/reportableTransactions.ts`, `eslint.config.js` (exempt the new file from `churchcoin/reportable-transactions`), `eslint/churchcoin-rules.js` (`REPORTABLE_FIELDS` adds `movementKind`, `isJournal`, `movementId`)
- Test: `tests/reportableTransactions.test.ts`, `tests/movementCategories.test.ts`

**Interfaces — Produces:**
```ts
// lib/movementCategories.ts
export const MOVEMENT_KINDS = ["transfer", "reversal", "loan"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];
export type MovementCategorySeed = { name: string; mainCategory: string; movementKind: MovementKind; displayOrder: number };
export const MOVEMENT_CATEGORIES: MovementCategorySeed[]; // "Transfer between funds", "Returned payment", "Loan"; mainCategory "Transfers and adjustments"; displayOrder 1000-1002
export function isMovementCategory(category: { movementKind?: MovementKind }): boolean;
export function missingMovementCategories(existing: Array<{ name: string; movementKind?: MovementKind }>): MovementCategorySeed[];

// lib/reportableTransactions.ts
export type LedgerRow = { amount; type; isVoided?; cashBankingRole?; movementKind?: MovementKind; movementId?: string; isJournal?: boolean };
export function sumRaised<T extends LedgerRow>(rows: T[]): number; // income activity, plus transfer legs in
export function transfersByFund<T extends LedgerRow & { fundId: string }>(rows: T[]): {
  funds: Array<{ fundId: string; in: number; out: number; net: number }>;
  unmatched: number; // net across all funds; 0 when every transfer has both sides
};
export function isUnlinkedMovementLeg(row: LedgerRow): boolean; // active transfer/reversal leg with no movementId
```

- [ ] **Step 1: Failing tests.** Add table rows to `ledgerEffect`: journal leg → `{bank:false,fund:true,activity:"transfer"}`; `movementKind:"transfer"` income and expenditure → `{true,true,"transfer"}`; `"reversal"` and `"loan"` → `{true,true,"none"}`; voided transfer → all off; income `bank_deposit` with `movementKind:"loan"` → deposit effect. Add tests: `filterIncomeAndExpenditure` drops all three kinds; `sumFundBalance` keeps them (Income +, Expenditure −); `sumRaised` counts income + transfer in, ignores transfer out, reversal and loan; `transfersByFund` with General out £300 / Building in £300 gives nets −300/+300 and `unmatched` 0, and with only the out leg `unmatched` −300; `isUnlinkedMovementLeg` true for transfer/reversal without `movementId`, false for loan, linked, voided or plain rows. `tests/movementCategories.test.ts`: `missingMovementCategories([])` returns all three; a renamed built-in (`{name:"Fund transfer", movementKind:"transfer"}`) suppresses the transfer seed; a user `{name:"loan"}` without kind suppresses the loan seed (case-insensitive).
- [ ] **Step 2:** `npx vitest run tests/reportableTransactions.test.ts tests/movementCategories.test.ts` → FAIL (missing exports / wrong effects).
- [ ] **Step 3: Implement.** Rules after the deposit rule, first match wins:
```ts
{ matches: (row) => row.isJournal === true, effect: { bank: false, fund: true, activity: "transfer" } },
{ matches: (row) => row.movementKind === "transfer", effect: { bank: true, fund: true, activity: "transfer" } },
{ matches: (row) => row.movementKind === "reversal" || row.movementKind === "loan", effect: { bank: true, fund: true, activity: "none" } },
```
`ledgerEffect` returns `{ ...rule.effect }` so callers can't mutate the shared table. `transfersByFund` groups `activity === "transfer"` rows by `fundId`, `in`/`out` via `sumMoney`, `net = roundMoney(in - out)`, `unmatched = sumMoney(funds, f => f.net)`.
- [ ] **Step 4:** same command → PASS; `npm run lint` → 0 errors.
- [ ] **Step 5:** commit `feat(ledger): classify transfers, returned payments and loans`.

### Task 2: Schema, built-in categories, copy `movementKind` on write

**Files:**
- Modify: `convex/schema.ts`, `convex/lib/categoryIntegrity.ts`, `convex/mutations/transactions.ts` (create, update, bulkCreate, bulkUpdate, batchUpdate), `convex/mutations/cashCollections.ts` (two named-donation inserts), `convex/intelligence/categorization/types.ts`, `convex/intelligence/categorization/categoryResolver.ts`, `convex/intelligence/categorization/modelContract.ts`, `types.ts`
- Test: `tests/ledgerMovementWrites.test.ts`, `tests/categorization.categoryResolver.test.ts`

**Interfaces — Consumes:** Task 1's `MovementKind`, `MOVEMENT_CATEGORIES`, `missingMovementCategories`, `isMovementCategory`. **Produces:** `requireCanonicalCategory(categories, name, type): { category: string; movementKind: MovementKind | undefined }`.

Schema:
```ts
const movementKind = v.union(v.literal("transfer"), v.literal("reversal"), v.literal("loan"));
movements: defineTable({ organizationId: v.id("organizations"), kind: movementKind, note: v.optional(v.string()), createdBy: v.id("users"), createdAt: v.number() }).index("by_organization", ["organizationId"]),
// transactions: movementKind: v.optional(movementKind), movementId: v.optional(v.id("movements")), isJournal: v.optional(v.boolean()), .index("by_movement", ["movementId"])
// categories: movementKind: v.optional(movementKind)
```

- [ ] **Step 1: Failing tests** in `tests/ledgerMovementWrites.test.ts`, using the in-memory fixture pattern from `tests/reconciliationLocks.test.ts` (plus `scheduler: { runAfter: vi.fn() }`):
  - `transactions.create` with category "Loan" (Income) inserts `movementKind: "loan"`, and with "Transfer between funds" (Expenditure) inserts `"transfer"`.
  - `ensureTypedCategories` inserts the three built-ins with no `transactionType`; a second call inserts nothing.
  - An org with a user category "Loan" (Income, no kind) keeps it unchanged and gets no second "Loan".
  - `transactions.update` from "Loan" to "Offerings" patches `movementKind` to `undefined`.
  - `transactions.bulkUpdate` setting "Returned payment" on one Income and one Expenditure row sets `movementKind: "reversal"` on both.
  - Resolver test: `allowedCategoriesForType` includes an untyped category with a `movementKind` for both types, and still excludes an untyped category without one.
- [ ] **Step 2:** `npx vitest run tests/ledgerMovementWrites.test.ts tests/categorization.categoryResolver.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `ensureTypedCategories` inserts `missingMovementCategories(existing)` after the seed loop (counting as a change); `seedOrganizationCategories` does the same for new orgs. `requireCanonicalCategory` returns `{ category: resolved.name, movementKind: resolved.movementKind }`. Each write path spreads that object into the insert or patch (`Object.assign(updates, …)` in update/bulkUpdate/batchUpdate). `allowedCategoriesForType` keeps `category.transactionType === type || isMovementCategory(category)`. `categorizationOutputSchema` dedupes its enum with `new Set`. Add `movementKind?` to `CategoryLike`, client `Category`, and `movementKind?`, `movementId?`, `isJournal?` to client `Transaction`.
- [ ] **Step 4:** same command → PASS; `npm run typecheck` → clean; `npx vitest run tests/convexGeneratedApi.test.ts tests/transactionWriteOwnership.test.ts` → PASS.
- [ ] **Step 5:** commit `feat(ledger): built-in movement categories and movementKind on write`.

### Task 3: Transfers on reports and the PDF; cash reports use the classifier

**Files:**
- Modify: `convex/queries/reports.ts` (`weeklyCashSummary`, `monthlyCashBreakdown`, `monthlyReportData`, `annualReportData`), `types.ts` (`TransferSummary` on `MonthlyReportData`/`AnnualReportData`), `components/Reports.tsx`, `services/pdfGenerator.ts`
- Test: `tests/reportTransfers.test.ts`

**Interfaces — Consumes:** `transfersByFund`, `filterIncomeAndExpenditure`. **Produces:**
```ts
export interface TransferSummary { funds: Array<{ fundId: string; fund: string; in: number; out: number; net: number }>; unmatched: number }
export function buildTransferSummary(rows, funds: Array<{ _id: string; name: string }>): TransferSummary // lib/reportableTransactions.ts, sorted by fund name
export function transfersSectionHTML(transfers: TransferSummary): string // services/pdfGenerator.ts, "" when no rows
```

- [ ] **Step 1: Failing tests:** `buildTransferSummary` names funds and sorts by name; `transfersSectionHTML` returns `""` for no funds, and otherwise a "Transfers between funds" table with each fund's in, out and net, a total row, and an "Unmatched" row only when `unmatched !== 0`; fund names are HTML-escaped.
- [ ] **Step 2:** `npx vitest run tests/reportTransfers.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Both report queries return `transfers: buildTransferSummary(allTransactions, funds)` (the period's non-voided rows). The cash reports pass their collected rows through `filterIncomeAndExpenditure` before splitting by type. `Reports.tsx` monthly and annual tabs gain a "Transfers between funds" card (same table styling as Fund Balances) when `transfers.funds.length > 0`, with an amber "Unmatched" row when `unmatched !== 0`. Both PDF generators insert `transfersSectionHTML(reportData.transfers)` before the footer.
- [ ] **Step 4:** test → PASS; `npm run typecheck` → clean.
- [ ] **Step 5:** commit `feat(reports): transfers between funds section`.

### Task 4: Dashboard, month-end check, Campaigns, insights, reconciliation

**Files:**
- Modify: `convex/queries/dashboard.ts` (project `movementKind`, `movementId`, `isJournal`), `lib/dashboardKpis.ts` (type fields; operational rows via `hasBankEffect`; `readiness.unlinkedMovementLegs`), `lib/dashboardChecks.ts`, `components/Campaigns.tsx` (`sumRaised`), `convex/intelligence/generateInsights.ts` (operations counts over `hasBankEffect` rows), `convex/mutations/reconciliationSessions.ts` (toggle message for journal legs)
- Test: `tests/dashboardKpis.test.ts`, `tests/dashboardChecks.test.ts`

- [ ] **Step 1: Failing tests:**
  - Dashboard: General £1,000 offerings plus a £300 transfer out of General and £300 in to a Restricted fund: income stays £1,000, spending £0, net movement £1,000, General Fund balance £700, restricted balance £300.
  - Dashboard: a journal leg (`isJournal`, unreconciled) is not counted in `unreconciledExpenditureCount` or the reconciled percentage.
  - Dashboard: `readiness.unlinkedMovementLegs` is 2 for one unlinked transfer and one unlinked reversal, ignoring a loan, a linked leg and a leg dated after the period.
  - Checks: `unlinked-movements` appears as `attention` with value "2" when the count is 2, and is absent at 0.
- [ ] **Step 2:** `npx vitest run tests/dashboardKpis.test.ts tests/dashboardChecks.test.ts` → FAIL.
- [ ] **Step 3: Implement** as listed under Files. The check: `{ id: "unlinked-movements", label: "Transfers to pair", value, detail: "Transfers and returned payments with only one side recorded", status: "attention", href: "/transactions" }`. Reconciliation toggle: voided rows keep "Voided transactions cannot be reconciled"; other rows without a bank effect get "Transfers between funds that stay in one bank account cannot be reconciled".
- [ ] **Step 4:** tests → PASS; full `npm run typecheck`, `npm run lint`, `npm test` → clean, 0 lint errors, all pass.
- [ ] **Step 5:** commit `feat(dashboard): flag unpaired transfers and count transfers in campaigns`.
