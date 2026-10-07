# PR 3: linking movements, journal transfers, the loan register and reclassifying old rows

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A treasurer can link the two sides of a transfer or returned payment, move money between funds without a bank row, keep a register of what each lender is owed, find rows still in a retired category, and get pairing suggestions while importing. Month end flags unlinked legs and months where cash may be counted twice.

**Architecture:** PR 2 (#51) marks rows with `movementKind` and classifies them through `ledgerEffect`. This PR adds one pure module, `lib/movementMatching.ts`, that owns every rule about which legs belong together: the candidate matcher, the "is this movement complete" check, and the loan summary. The server (`convex/mutations/movements.ts`), the Transactions page, the import review and the Loans page all call it, so the client and server never disagree about a match. `convex/lib/transactionWrites.ts` already owns every transaction write; it gains the link lock and the void/delete detach, so no write path can leave a half-linked movement.

**Tech Stack:** Convex, React 19, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-06-ledger-movements-design.md` (step 3 of "Delivery" plus the "Later" items). PR 2 plan: `docs/superpowers/plans/2026-10-07-ledger-movements-pr2.md`.

## Global Constraints

- Every table is scoped to `organizationId`. Every new mutation checks the org of each id it receives.
- Money totals use `sumMoney` / `roundMoney`; equality to the penny uses `meetsMoneyTarget` or cents comparison from `convex/lib/money.ts`. `tests/moneyArithmetic.test.ts` counts may only go down.
- Every `transactions` patch/delete goes through `convex/lib/transactionWrites`. Inserts may use `ctx.db.insert`.
- Category validity goes through `ensureTypedCategories` + `requireCanonicalCategory` (server) and `categoryNamesForTransactionTypes` (client).
- New modules `convex/mutations/movements.ts` and `convex/queries/movements.ts` mean `convex/_generated/api.d.ts` changes. Regenerate with `npx convex codegen` and commit it. Never run `npx convex dev` against `efficient-dogfish-623` from this branch.
- New schema fields are optional, so the schema stays compatible with existing data and with the frontend already on `main`.
- Out of scope: the bank account on each transaction (a separate PR), interest tracking (stays ordinary expenditure), a loans section in the PDF.
- Live data is not changed by this PR. The "Internal Transfer" cleanup (Task 10) runs only after the operator confirms the mapping.

## Decisions

- **The lender is a name on the loan movement, not a `lenders` table or a donor link.** Lenders include banks and other churches, not just members. A donor link would put loans into donor views, Gift Aid and the donor redaction rules; a table holding only a name adds CRUD with no behaviour. `movements` gains `lender` and `dueDate`. The Loans view groups by loan, not by lender. Readers without `donors.read` (Guest) see "Lender hidden", matching the donor-identity rule in `CLAUDE.md`.
- **One module owns matching.** `linkCandidates`, `movementProblem`, `summarizeLoan` and `suggestImportPairs` live in `lib/movementMatching.ts`. The server validates with `movementProblem` before any write; the UI lists with `linkCandidates`. Import suggestions use `linkCandidates` too.
- **The client computes candidates.** `TransactionManager` already loads every transaction, so "Link other side" needs no new query. The server re-validates on link.
- **A movement is valid when `movementProblem(kind, legs)` returns `null`.** Transfer and reversal: two or more active legs of that kind, money in equals money out to the penny, and for transfers no fund on both sides. Loan: at least one money-in leg (the amount received), and repayments never exceed the amount received.
- **Linked legs lock in `patchTransaction`.** If a row has a `movementId`, a patch that changes `amount`, `type`, `fundId`, `movementKind` or `isJournal` throws "Unlink this transaction from its other side before changing its amount, direction, fund or category." Values are compared, so the edit form resending unchanged values still works, and a category rename (same kind) passes. Category changes are covered because there is one category per kind.
- **Voiding or deleting a linked leg detaches it.** `transactionWrites` removes the leg, re-checks the remaining legs with `movementProblem`, and dissolves the movement (deletes it, clears `movementId` on every remaining leg) when they no longer form a valid movement. A transfer or returned payment always dissolves; a loan only loses that repayment unless the amount received is gone. Unvoiding brings a leg back unlinked.
- **A journal transfer is deleted whole.** Deleting either journal leg deletes both legs and the movement. Voiding or unlinking a journal leg is refused with "Delete the transfer between funds instead."
- **Reconciliation locks apply to links.** Linking and unlinking patch each leg through `patchTransaction`, so a leg in a completed reconciliation can't be linked or unlinked, and voiding a leg whose other side is locked fails with the lock message. Convex rolls back the whole mutation on a throw.
- **Unlinked loans join the month-end check.** `isUnlinkedMovementLeg` now includes loan legs, because the register replaces "keep loans unlinked". The check keeps the label "Transfers to pair" with detail "Transfers, returned payments and loans with no other side linked".
- **Retired categories are hidden, not deleted.** `categories.isRetired` hides a category from pickers and the AI categoriser, and the server refuses to move a row into it. Rows already in it keep it, and the "Needs reclassifying" filter lists them. Built-in movement categories can't be retired.
- **The double count check is a heuristic, labelled as one.** A month is flagged when it has an active income row whose description reads "counter deposit" or "cash deposit" (not from a collection, not a cash banking deposit) and a cash collection in that month not yet covered by a completed cash banking reconciliation. It links to the cash banking tab. Only the collection sheets can confirm it.

## Review Focus

1. Voiding one side of a linked transfer must leave the other side unlinked and back in "Transfers to pair", and must fail cleanly if the other side is in a completed reconciliation.
2. Editing a linked leg's description must succeed; editing its amount, type, fund or category must fail with the unlink message.
3. Adding a repayment that takes total repayments above the amount received must fail, to the penny.
4. Two legs of a transfer in the same fund must not link.
5. Import pairing must survive row edits: a suggestion accepted before the user changes a row's amount must be dropped (not linked) at confirm.
6. A Guest on the Loans page must not see lender names.

---

### Task 1: Matching rules

**Files:**
- Create: `lib/movementMatching.ts`
- Modify: `lib/reportableTransactions.ts` (`isUnlinkedMovementLeg` includes loans), `eslint.config.js` (exempt `lib/movementMatching.ts` from `churchcoin/reportable-transactions`, like `lib/movementCategories.ts`)
- Test: `tests/movementMatching.test.ts`, `tests/reportableTransactions.test.ts`

**Interfaces, produces:**
```ts
// lib/movementMatching.ts
export const LINK_WINDOW_DAYS = 14;
export type MovementLeg = LedgerRow & { _id: string; date: string; fundId: string };
export const MOVEMENT_LABELS: Record<MovementKind, string>; // "transfer between funds", "returned payment", "loan"
// Unlinked, active legs of the same kind (transfer or reversal only), opposite type,
// same amount to the penny, within 14 days, not journal legs, and for transfers a
// different fund. Closest date first, then earlier date, then _id.
export function linkCandidates<T extends MovementLeg>(leg: MovementLeg, pool: T[]): T[];
// null when the legs form a complete movement of this kind, else a sentence for the user.
export function movementProblem(kind: MovementKind, legs: MovementLeg[]): string | null;
export type LoanSummary = { borrowed: number; repaid: number; outstanding: number; isRepaid: boolean };
export function summarizeLoan(legs: MovementLeg[]): LoanSummary; // active legs only; Income = received
export function isLoanOverdue(loan: { dueDate?: string; outstanding: number }, today: string): boolean;
export type PairSuggestion = { source: "import" | "ledger"; id: string };
// Greedy one-to-one pairing, earliest import row first. Import legs use their review
// row id as _id. Import-import pairs appear under both keys.
export function suggestImportPairs(importLegs: MovementLeg[], ledgerLegs: MovementLeg[]): Map<string, PairSuggestion>;
```

- [ ] **Step 1: Failing tests.** `linkCandidates`: picks the opposite-direction, same-amount, same-kind leg; ignores linked, voided, journal, same-direction, other-kind, 15-days-away and £0.01-different rows; for transfers ignores a leg in the same fund; for reversals accepts the same fund; for loans returns `[]`; orders by closeness then date. `movementProblem`: valid transfer pair in two funds → `null`; same fund → transfer message; £100 in vs £99.99 out → mentions both amounts; one leg → "Choose the other side"; a voided leg or a leg of another kind → message; loan with only a repayment → message; loan received £1,852 with repayments £1,000 + £852 → `null`, + £0.01 more → message. `summarizeLoan`: borrowed/repaid/outstanding/isRepaid, ignoring voided legs. `isLoanOverdue`: false without a due date, false when repaid, true when due date < today and outstanding > 0. `suggestImportPairs`: pairs two import rows, pairs an import row with a ledger leg, never uses a leg twice, ignores rows without a transfer or reversal kind. `tests/reportableTransactions.test.ts`: `isUnlinkedMovementLeg` is now true for an unlinked active loan leg.
- [ ] **Step 2:** `npx vitest run tests/movementMatching.test.ts tests/reportableTransactions.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Compare amounts and money totals in pence (`Math.round(x * 100)`). Date distance via `Date.UTC` on `YYYY-MM-DD` parts, never local time.
- [ ] **Step 4:** same command → PASS; `npm run lint` → 0 errors.
- [ ] **Step 5:** commit `feat(ledger): rules for linking movement legs`.

### Task 2: Schema, link lock and detach in `transactionWrites`

**Files:**
- Modify: `convex/schema.ts`, `convex/lib/transactionWrites.ts`, `types.ts`
- Test: `tests/movementLinks.test.ts` (in-memory fixture pattern from `tests/ledgerMovementWrites.test.ts`, extended with `delete` and the `by_movement` index)

Schema:
```ts
// movements gain
lender: v.optional(v.string()),   // loans only
dueDate: v.optional(v.string()),  // loans only, YYYY-MM-DD
// categories gain
isRetired: v.optional(v.boolean()),
```

- [ ] **Step 1: Failing tests** against real `transactions.update`, `transactions.voidTransaction`, `transactions.remove`, `transactions.bulkUpdate`:
  - Linked leg: update with a new description and unchanged amount/type/fund/category succeeds; update amount, fund, type or category throws the unlink message; `bulkUpdate` of its fund throws.
  - Voiding one leg of a linked transfer deletes the movement and clears `movementId` on both legs.
  - Voiding a repayment of a loan with two repayments keeps the movement and the other legs; voiding the only money-in leg dissolves the loan.
  - Voiding a leg whose other side is in a completed reconciliation session throws the reconciliation message and changes nothing.
  - Deleting a journal leg deletes both legs and the movement; voiding a journal leg throws "Delete the transfer between funds instead."
  - Category rename cascade over a linked leg still succeeds.
- [ ] **Step 2:** `npx vitest run tests/movementLinks.test.ts` → FAIL.
- [ ] **Step 3: Implement** in `transactionWrites.ts`: `guard` always resolves the doc. `patchTransaction` runs `assertMovementLockAllows(doc, patch)` (throws when a locked field's value changes), refuses voiding a journal leg, and calls `detachFromMovement(ctx, doc, options)` before a patch that voids a linked leg, adding `movementId: undefined` to that patch. `deleteTransaction` on a journal leg deletes every leg of its movement and the movement; on another linked leg it detaches first. `detachFromMovement` loads legs with `by_movement`, drops the leg, and if `movementProblem(movement.kind, remaining)` is non-null deletes the movement and patches each remaining leg `{ movementId: undefined }` through `patchTransaction` with the same options. Export `detachFromMovement` for the unlink mutation. Add `lender?`, `dueDate?` to a client `Movement` type and `isRetired?` to client `Category`.
- [ ] **Step 4:** test → PASS; `npm run typecheck`; `npx vitest run tests/transactionWriteOwnership.test.ts tests/reconciliationLocks.test.ts tests/ledgerMovementWrites.test.ts` → PASS.
- [ ] **Step 5:** commit `feat(ledger): lock linked legs and detach them on void or delete`.

### Task 3: Movement mutations and the loans query

**Files:**
- Create: `convex/mutations/movements.ts`, `convex/queries/movements.ts`
- Modify: `convex/_generated/api.d.ts` (via `npx convex codegen`)
- Test: `tests/movementLinks.test.ts`

**Interfaces, produces:**
```ts
// convex/mutations/movements.ts (ledger.write unless noted)
link({ transactionIds: Id<"transactions">[], movementId?: Id<"movements">, lender?: string, dueDate?: string, note?: string }): Id<"movements">
// New movement: kind = the legs' movementKind; a loan needs a non-empty lender.
// With movementId: adds legs to that movement (its kind). Validates all legs with
// movementProblem before writing; every leg must be unlinked and in the org.
unlink({ transactionId: Id<"transactions"> }): null // detachFromMovement; journal legs refused
updateLoan({ movementId, lender: string, dueDate?: string, note?: string }): null
createJournalTransfer({ fromFundId, toFundId, amount, date, note?: string }): Id<"movements">
// Two legs: Expenditure in from-fund "Transfer to {to}", Income in to-fund "Transfer from {from}",
// category = the org's built-in transfer category (found by movementKind after ensureTypedCategories),
// movementKind "transfer", isJournal true, isReconciled false, notes = note.
deleteJournalTransfer({ movementId }): null // ledger.delete; deleteTransaction on one leg

// convex/queries/movements.ts
listLoans(): Array<{ _id; lender: string; dueDate?: string; note?: string; createdAt: number;
  borrowed: number; repaid: number; outstanding: number; isRepaid: boolean;
  legs: Array<{ _id; date; description; amount; type; isVoided?: boolean }> }>
// ledger.read; lender becomes "Lender hidden" and legs pass through redactDonorFields without donors.read.
```

- [ ] **Step 1: Failing tests:** linking a valid transfer pair creates one movement and sets `movementId` on both; linking same-fund transfer legs, unequal legs, an already linked leg, a leg from another org, or a voided leg throws and writes nothing; a loan without a lender throws; adding a repayment over the outstanding amount throws; `unlink` of a transfer leg clears both; `createJournalTransfer` with the same fund twice throws, otherwise writes two linked journal legs whose fund balances move by ±amount (`sumFundBalance`); `deleteJournalTransfer` as Finance Team throws, as Admin removes both legs; `listLoans` returns borrowed/repaid/outstanding and hides the lender for a Guest.
- [ ] **Step 2:** `npx vitest run tests/movementLinks.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `npx convex codegen` (deployment from `.env.local`; codegen does not push). Validate amount/date with `convex/lib/transactionValidation`.
- [ ] **Step 4:** tests → PASS; `npx vitest run tests/convexGeneratedApi.test.ts` → PASS; typecheck, lint clean.
- [ ] **Step 5:** commit `feat(ledger): link, unlink, journal transfers and the loan register`.

### Task 4: Transactions page, link, unlink and transfer form

**Files:**
- Create: `components/transactions/LinkMovementModal.tsx`, `components/transactions/JournalTransferModal.tsx`
- Modify: `components/TransactionManager.tsx`
- Test: `tests/movementUi.test.ts` (server render, pattern from `tests/permissions.ui.test.ts`)

- [ ] **Step 1: Failing tests:** an unlinked transfer row renders a "Link other side" button for Finance Team and not for Pastorate; a linked row renders "Linked" and an "Unlink" button; a journal leg renders "Journal" and, for Admin only, "Delete transfer"; the header renders "New transfer" for Finance Team. `LinkMovementModal` for a transfer leg lists the matching candidate and not a same-fund one; with no candidates it says "No unlinked transfer between funds of £x going the other way within 14 days."
- [ ] **Step 2:** `npx vitest run tests/movementUi.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Row actions sit next to the edit pencil. `LinkMovementModal`: transfer/reversal legs choose one of `linkCandidates(row, transactions)` and call `link`; a loan leg received (Income) records a new loan (lender required, due date, note) or adds to an open loan from `listLoans`; a repayment (Expenditure) picks an open loan with outstanding ≥ its amount. The edit modal disables amount, type, fund and category on linked legs with the hint "Linked to its other side. Unlink to change these." `JournalTransferModal` fields: from fund, to fund, amount, date (today), note; calls `createJournalTransfer`. Status filter gains "Waiting for other side" (value `awaiting-link`, `isUnlinkedMovementLeg`), and the page reads `?status=` so the month-end check can link to it. The existing `unlinked` value means income with no pledge and stays. Errors and success go through `notify`. Modals follow the void modal's markup (`createPortal`, `bg-ink/40`, `shadow-soft-lg`, `border-ledger`) and add `role="dialog"` + `aria-modal`.
- [ ] **Step 4:** tests → PASS; typecheck, lint clean.
- [ ] **Step 5:** commit `feat(transactions): link other side and transfers between funds`.

### Task 5: Loans page

**Files:**
- Create: `components/Loans.tsx`
- Modify: `components/app/AppContentRoutes.tsx` (`/loans`, `ledger.read`), `components/Sidebar.tsx` (Loans entry after Campaigns), `tests/permissions.ui.test.ts` (sidebar hrefs)
- Test: `tests/movementUi.test.ts`

- [ ] **Step 1: Failing tests:** `Loans` renders each loan's lender, borrowed, repaid, outstanding and status ("Repaid", "Overdue", "Open"), a totals row, and an empty state that explains "Mark the money received as Loan in Transactions, then choose Link other side"; Guest sees "Lender hidden"; the edit control shows only for `ledger.write`.
- [ ] **Step 2:** test → FAIL.
- [ ] **Step 3: Implement.** Editing lender, due date and note calls `updateLoan`. Each loan expands to its legs.
- [ ] **Step 4:** tests → PASS; `npx vitest run tests/permissions.ui.test.ts` → PASS.
- [ ] **Step 5:** commit `feat(loans): loan register page`.

### Task 6: Retired categories and "Needs reclassifying"

**Files:**
- Modify: `convex/mutations/categories.ts` (`setRetired`), `convex/lib/categoryIntegrity.ts` (`requireCanonicalCategory` refuses a retired category unless it is the row's current one), `convex/mutations/transactions.ts` (pass `currentCategory` from update/bulkUpdate/batchUpdate), `convex/intelligence/categorization/categoryResolver.ts` (`allowedCategoriesForType` skips retired), `lib/transactionCategories.ts` (pickers skip retired), `components/Settings.tsx` + `components/app/AppContentRoutes.tsx` + `components/app/actions/useFundCategoryActions.ts` (Retire / Restore on each category chip, `categories.write`), `components/TransactionManager.tsx` (status filter "Needs reclassifying", value `needs-reclassifying`)
- Test: `tests/ledgerMovementWrites.test.ts`, `tests/transactionCategories.test.ts`, `tests/categorization.categoryResolver.test.ts`

- [ ] **Step 1: Failing tests:** `setRetired` on a movement category throws; creating or moving a row into a retired category throws "{name} is retired. Choose another category."; updating another field of a row already in a retired category succeeds; `categoryNamesForTransactionTypes` and `allowedCategoriesForType` omit retired categories.
- [ ] **Step 2:** tests → FAIL.
- [ ] **Step 3: Implement.** The filter counts active rows whose category is retired and shows the count in the option label.
- [ ] **Step 4:** tests → PASS; typecheck, lint clean.
- [ ] **Step 5:** commit `feat(categories): retire a category and filter rows that need reclassifying`.

### Task 7: Pairing suggestions on import

**Files:**
- Modify: `components/TransactionManager.tsx` (review modal and `handleConfirmImport`)
- Test: `tests/importPairing.test.ts` (uses `tests/helpers/transactionManagerHandlers.ts` for the confirm handler)

- [ ] **Step 1: Failing tests:** `suggestImportPairs` over review rows keyed by `reviewRowId`; confirming with one accepted import-import pair and one accepted import-ledger pair calls `link` with the created ids (mapped by index from `bulkCreate`'s `ids`) and the ledger id; a suggestion accepted before its row's amount changed is not linked; a skipped duplicate (null id) is not linked; an unaccepted suggestion is never linked.
- [ ] **Step 2:** test → FAIL.
- [ ] **Step 3: Implement.** Suggestions are computed with `useMemo` from the review rows whose category resolves to a transfer or returned payment, and the org's unlinked ledger legs. Each suggested row shows "Other side: {description}, {date}" with Accept / Dismiss. Acceptance is stored on the row as `pairWith: PairSuggestion` and dropped when the row's amount, type, fund or category changes. At confirm, every accepted pair is re-checked with `linkCandidates` against current state before calling `link`; failures are reported once with `notify`.
- [ ] **Step 4:** tests → PASS; `npx vitest run tests/importDuplicates.test.ts tests/audit.importBaseline.test.ts` → PASS.
- [ ] **Step 5:** commit `feat(import): suggest the other side of transfers and returned payments`.

### Task 8: Month-end checks

**Files:**
- Modify: `lib/dashboardKpis.ts` (`readiness.possibleDoubleCountMonths: string[]` as `YYYY-MM`), `convex/queries/dashboard.ts` (project `description`), `lib/dashboardChecks.ts`, `components/TransactionManager.tsx` (`?view=cash-banking` opens the cash/cheque banking tab)
- Test: `tests/dashboardKpis.test.ts`, `tests/dashboardChecks.test.ts`

- [ ] **Step 1: Failing tests:** an unlinked loan leg counts in `unlinkedMovementLegs`; December with a "Counter deposit" income row and a submitted, unbanked collection is flagged; a month with the collection covered by a completed cash banking reconciliation is not; a counter deposit that is a cash banking deposit, voided, or from a collection is not; months after the period's through date are not. Checks: `possible-double-count` appears as `attention` with value "2", detail naming "Dec 2025, Feb 2026" and href `/transactions?view=cash-banking`, and is absent when the list is empty. "Transfers to pair" links to `/transactions?status=awaiting-link`.
- [ ] **Step 2:** tests → FAIL.
- [ ] **Step 3: Implement.** Detail: "Counter deposits recorded as income in months with unbanked cash collections. Check the collection sheets: {months}".
- [ ] **Step 4:** tests → PASS.
- [ ] **Step 5:** commit `feat(dashboard): flag possible double-counted cash`.

### Task 9: Excel sheets, leftover tests and the category migration

**Files:**
- Modify: `convex/queries/reports.ts` (`loans` on monthly and annual report data, as of the period end, via `summarizeLoan`), `types.ts`, `services/excelGenerator.ts` (Transfers sheet when `transfers.funds.length > 0`; Loans sheet when `loans.length > 0`), `convex/mutations/categories.ts` (`migrateTransactionCategories` uses `categoryNameConflict` and case-insensitive lookups, never renames into or re-types a movement category)
- Test: `tests/reportTransfers.test.ts` (sheet rows), `tests/categorization.policy.test.ts` (refund guidance: "Returned payment" names supplier refunds, "Uncategorised" no longer mentions refunds), `tests/generateInsights.test.ts` (`gatherInsightContext`: nine reconciled income rows, one unreconciled transfer leg and one unreconciled journal leg give `totalTransactions` 10 and `unreconciledCount` 1), `tests/ledgerMovementWrites.test.ts` (migration: an alias whose target exists in different case is merged, not duplicated; a movement category keeps no transaction type)

- [ ] **Step 1:** failing tests as listed.
- [ ] **Step 2:** `npx vitest run tests/reportTransfers.test.ts tests/categorization.policy.test.ts tests/generateInsights.test.ts tests/ledgerMovementWrites.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Export the sheet builders (`transfersSheetRows`, `loansSheetRows`) so they are testable without SheetJS.
- [ ] **Step 4:** tests → PASS; full `npm run typecheck`, `npm run lint`, `npm test` → clean.
- [ ] **Step 5:** commit `feat(reports): transfers and loans sheets; test PR 2 fixes`.

### Task 10: Verify on a local backend, then clean up live data on the operator's go

- [ ] **Step 1: Local rehearsal.** Start a local Convex backend for this worktree (`npx convex dev --local --once`, never the dev cloud deployment), import a copy of the dev organisation's `organizations`, `users`, `funds`, `categories`, `transactions`, `cashCollections` tables, and run the cleanup below with `npx convex run --identity` as the org's Admin. Evidence: the before and after report figures (`monthlyReportData` for Aug 2026 income, General Fund balance) and `listLoans` output.
- [ ] **Step 2: Cleanup mapping (dev data, org `jn74kj9d9ay4k2sp2nz4hf2a3d7wwjys`).** Retire "Internal Transfer". Then:
  - 2026-08-03 and 2026-08-14 unpaid standing order pairs (£3,707.68, £2,800): "Returned payment", linked in pairs.
  - 2026-08-28 "OPARE T BOOK ERROR" in £100 and 2026-09-02 PayPal card purchase out £100: "Returned payment", linked.
  - 2026-08-03 "ALEX SACKEY PAYE LOAN" £1,852: "Loan", lender "Alex Sackey".
  - 2025-11-11, 11-14, 11-28 counter deposits (4 rows, £1,580.75): "Offerings". No cash collection exists before 2025-12-05.
  - 2025-12-12 and 12-16 counter deposits (3 rows, £816.23): operator decides between "Offerings" and banking them against the 5 to 14 December collections (£833.14). Only the collection sheets settle it.
  - The nine September 2025 offerings: "Offerings".
  - 2025-09-24 "Card Purchase LB CROYDON" £80: "Other Costs", matching its identical twin imported from the same statement.
  - Delete "Internal Transfer" once empty.
- [ ] **Step 3:** stop and post the mapping and the rehearsal figures to the operator. Apply to `efficient-dogfish-623` only on an explicit go, after the backend from the merged `main` is deployed there.
