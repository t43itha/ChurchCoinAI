# Cash/Cheque Banking Reconciliation Design

Date: 2026-06-08

## Purpose

ChurchCoinAI needs a proper reconciliation workflow for in-person cash and cheque giving that is later banked through counter deposits. Today, in-person giving is recorded as income when counted, and the later imported bank deposit can also be counted as income. Voiding the bank deposit prevents double counting, but it is not correct accounting treatment because the bank movement is real and should remain visible in the ledger.

This design adds a Cash/cheque Banking reconciliation feature. The original in-person giving remains the donation income record. The later bank credit is linked as banking evidence and classified as Cash/cheque banking so it stays visible but is excluded from income, donor, Gift Aid, and mission reporting totals.

The design is based on the existing ChurchCoinAI transaction and cash collection model, plus the user's local RCI workflow materials:

- `C:\Users\tabit\_Projects\church-month-end\Record Keeping\Docs\RCI Missions Monthly Accounts Template.xlsx`
- `C:\Users\tabit\_Projects\church-month-end\Record Keeping\Docs\RCI Annual Accounts Reports Template.xlsx`
- `C:\Users\tabit\_Projects\church-month-end\Record Keeping\Docs\RCI MISSIONS - Financial Record Keeping Guide.v1.pdf`

The RCI workflow records receipts by category and medium of receipt, and annual reporting summarizes donation categories such as Offerings and Tithes & First Fruits. A cash/cheque bank deposit should therefore clear physical receipts into the bank, not create a second donation receipt.

## Scope

Included in v1:

- Reconcile physical Cash and Cheque giving only.
- Match one or more submitted in-person giving collections to one or more existing imported/synced bank credit transactions.
- Track expected cash, expected cheque, combined expected total, banked cash, banked cheque, combined banked total, and variance.
- Allow non-zero variance only with a variance type and note.
- Classify linked bank credits as Cash/cheque banking.
- Exclude linked bank credits from income/giving/Gift Aid/mission reports while keeping them visible in the transaction ledger.
- Support partial banking, delayed banking, one-to-many matches, and many-to-one matches.
- Reopen completed reconciliations with an audit reason.

Excluded from v1:

- PDQ/card settlement reconciliation.
- Automatic accounting adjustment transactions for variance.
- A full double-entry cash-in-hand ledger.
- Manual bank deposit creation inside the reconciliation workflow.
- Automatic migration/backfill of old double-counted deposits.

After v1 is implemented and committed, ask the user whether they want a separate historical migration/backfill feature for old data.

## Recommended Approach

Use a linked deposit classification model.

In-person giving transactions continue to represent donation income. Imported or synced bank credit transactions selected during reconciliation become linked bank deposit evidence with the user-facing label Cash/cheque banking. Reports exclude those linked bank deposits from donation income calculations.

This is stronger than a status-only reconciliation because it prevents report double counting. It is smaller than a full cash-in-hand ledger and fits the current app, which uses a single `transactions` table rather than formal journal entries.

## Accounting Model

The system treats receipt and banking as separate events:

1. In-person giving is counted and recorded by fund, category, donor where available, and payment method.
2. Cash and cheque amounts from those collections become awaiting banking balances.
3. Existing imported/synced bank credits are selected as banking evidence.
4. A reconciliation links the collections and bank credits.
5. Original giving transactions remain active income.
6. Linked bank credits remain visible bank movements but are classified as Cash/cheque banking and excluded from donation reports.

Reportable income comes from the original giving transactions, not from the later counter deposit.

## Data Model

Add a `cashBankingReconciliations` table:

```ts
cashBankingReconciliations: defineTable({
  organizationId: v.id("organizations"),
  cashCollectionIds: v.array(v.id("cashCollections")),
  bankTransactionIds: v.array(v.id("transactions")),
  status: v.union(
    v.literal("draft"),
    v.literal("completed"),
    v.literal("reopened")
  ),
  expectedCashAmount: v.number(),
  expectedChequeAmount: v.number(),
  expectedTotal: v.number(),
  bankedCashAmount: v.number(),
  bankedChequeAmount: v.number(),
  bankedTotal: v.number(),
  varianceAmount: v.number(),
  varianceType: v.optional(v.union(
    v.literal("partial_banking"),
    v.literal("petty_cash_retained_or_spent"),
    v.literal("bank_counting_difference"),
    v.literal("cheque_timing"),
    v.literal("other")
  )),
  varianceNote: v.optional(v.string()),
  completedAt: v.optional(v.number()),
  completedBy: v.optional(v.id("users")),
  reopenedAt: v.optional(v.number()),
  reopenedBy: v.optional(v.id("users")),
  reopenReason: v.optional(v.string()),
  createdAt: v.number(),
  createdBy: v.id("users"),
  updatedAt: v.number(),
})
  .index("by_organization", ["organizationId"])
  .index("by_organization_status", ["organizationId", "status"]);
```

Add fields to `transactions`:

```ts
cashBankingReconciliationId: v.optional(v.id("cashBankingReconciliations")),
cashBankingRole: v.optional(v.union(
  v.literal("source_giving"),
  v.literal("bank_deposit")
)),
bankingMedium: v.optional(v.union(
  v.literal("cash"),
  v.literal("cheque"),
  v.literal("mixed")
)),
```

Add fields to `cashCollections`:

```ts
cashBankingLastReconciliationId: v.optional(v.id("cashBankingReconciliations")),
cashBankingStatus: v.optional(v.union(
  v.literal("not_started"),
  v.literal("partially_banked"),
  v.literal("banked")
)),
```

Reconciliation history is derived from `cashBankingReconciliations.cashCollectionIds`, not from a single collection pointer. `cashBankingLastReconciliationId` is only a convenience pointer for the latest reconciliation touching that collection.

## Workflow

Add a third tab in `components/TransactionManager.tsx`:

- All Transactions
- In-Person Giving
- Cash/cheque Banking

The Cash/cheque Banking tab has three areas.

### Awaiting Banking

Shows submitted in-person giving collections with open cash/cheque balances. PDQ/card amounts are excluded.

Each row shows:

- week ending
- collection/service summary
- cash expected
- cheque expected
- total expected
- banking status
- expandable fund/category breakdown

### Bank Credits

Shows existing imported/synced credit transactions that are not already linked to a completed cash/cheque banking reconciliation.

V1 only shows credit/income transactions. It does not include debit/reversal matching.

Filters:

- date range
- amount
- search text
- fund/category where useful

### Reconciliation Basket

The user selects one or more collections and one or more bank credits.

The basket calculates:

- cash expected
- cheque expected
- total expected
- cash banked
- cheque banked
- total banked
- variance

For each selected bank credit, the user assigns a banking medium:

- Cash
- Cheque
- Mixed

If Mixed is selected, the user enters the cash and cheque portions. The split must equal the bank transaction amount.

Completion rules:

- At least one collection and one bank credit are required.
- If variance is zero, the reconciliation can be completed immediately.
- If variance is non-zero, variance type and note are required.
- On completion, selected bank transactions are marked as `cashBankingRole = "bank_deposit"`, labeled Cash/cheque banking, linked to the reconciliation, and marked reconciled.
- Original giving transactions remain income. Cash/cheque source transactions can be marked reconciled as source giving, but must not be excluded from reports.
- Collections become `banked` or `partially_banked` according to remaining open cash/cheque amount.

## Variance Handling

Supported variance types:

- `partial_banking`: some cash/cheques remain held and will be banked later.
- `petty_cash_retained_or_spent`: counted giving was retained as float or used for petty cash before banking.
- `bank_counting_difference`: counted amount and banked amount differ.
- `cheque_timing`: cheque amount appears on a later bank date or separate statement line.
- `other`: requires a note.

V1 records the variance and explanation only. It does not create automatic expenditure, cash asset, or adjustment transactions.

## Reporting Behavior

Add a shared helper, for example `isReportableIncomeTransaction()`, so all reports use the same exclusion rule.

Reportable income includes:

- in-person cash gifts
- in-person cheque gifts
- named cash/cheque gifts
- card/PDQ gifts through the existing giving model
- direct bank/electronic gifts that are not cash/cheque banking deposits

Reportable income excludes:

- transactions with `cashBankingRole === "bank_deposit"`
- transactions classified/labeled as Cash/cheque banking
- voided transactions, as today

Affected areas:

- dashboard income totals
- monthly summary
- monthly report export
- annual report export
- donor giving history
- Gift Aid eligible transaction lists
- mission tithe calculations
- AI context and insights where income or unreconciled income is derived

All Transactions continues to show linked bank deposits. They should display a Cash/cheque banking label and reconciled status.

## Backend API

Add reconciliation queries:

- `queries.cashBankingReconciliations.list`
- `queries.cashBankingReconciliations.getById`
- `queries.cashBankingReconciliations.getAwaitingBanking`
- `queries.cashBankingReconciliations.getCandidateBankCredits`

Add reconciliation mutations:

- `mutations.cashBankingReconciliations.createDraft`
- `mutations.cashBankingReconciliations.updateDraft`
- `mutations.cashBankingReconciliations.complete`
- `mutations.cashBankingReconciliations.reopen`

Role and tenancy rules:

- All write mutations require Admin or Finance Team.
- Queries follow existing role patterns. Read-only users can view completed reconciliation information if the surrounding transaction UI already allows them to view transactions.
- Every referenced collection and transaction must belong to the current organization.

## Controls And Audit

Validation:

- A bank transaction can belong to only one completed cash/cheque banking reconciliation.
- A bank transaction selected for reconciliation must be an active, non-voided, credit/income transaction.
- A cash collection can be partially reconciled across multiple reconciliations only while open expected cash/cheque balances remain.
- Mixed bank credit split must equal the selected bank transaction amount.
- Non-zero variance requires both variance type and note.
- Completed reconciliations cannot be silently overwritten.

Audit:

- Completion stores `completedAt` and `completedBy`.
- Reopening stores `reopenedAt`, `reopenedBy`, and `reopenReason`.
- Normal UI does not delete completed reconciliations.

## UI States

Use concise status labels:

- Not started
- Partially banked
- Banked
- Variance noted

Avoid the word "void" in this workflow. Voiding remains available only for genuinely erroneous transactions.

Empty states:

- No collections awaiting banking.
- No candidate bank credits found.
- Select at least one collection and one bank credit to reconcile.

Responsive behavior:

- Desktop can use side-by-side collection and bank credit panels with a basket.
- Mobile should stack sections and keep totals visible near the complete action.
- Long bank descriptions must truncate or wrap without breaking the table/card layout.

## Edge Cases

- Bank deposit appears in a later month than the giving: allowed.
- One deposit covers multiple weeks: allowed.
- One week is split across multiple deposits: allowed.
- Cash and cheque deposit lines appear separately: supported.
- Bank combines cash and cheque into one credit: supported through Mixed split.
- Cheques clear later than cash: use partial banking, or close with `cheque_timing` variance where appropriate.
- Petty cash retained/spent before banking: record variance in v1; accounting adjustments are deferred.
- Historical deposits that have already caused double counting: handle through a later migration/backfill feature if the user approves after v1 is implemented and committed.

## Testing

Unit tests:

- cash-only reconciliation totals
- cheque-only reconciliation totals
- mixed deposit split totals
- one collection to many deposits
- many collections to one deposit
- partial banking
- non-zero variance
- mixed deposit split validation
- reportable income helper includes giving and excludes linked bank deposits

Backend checks:

- role enforcement
- organization scoping
- duplicate completed deposit linking is rejected
- variance type/note are required when variance is non-zero
- reopen requires reason
- completion marks linked bank deposits as Cash/cheque banking
- original source giving remains reportable income

UI verification:

- Cash/cheque Banking tab renders on desktop and mobile widths.
- Long descriptions do not overlap controls or totals.
- Empty states are clear.
- Completion is blocked until required variance inputs are present.
- Linked deposits show Cash/cheque banking in All Transactions.

## Rollout

V1 is additive:

- Existing in-person giving continues to work.
- Existing imports and bank sync continue to work.
- Existing All Transactions and In-Person Giving tabs remain available.
- New reconciliation data starts applying when users complete Cash/cheque Banking reconciliations.

No old data is migrated automatically in v1. After v1 implementation is committed, ask the user whether to design and implement historical migration/backfill for prior counter deposits.
