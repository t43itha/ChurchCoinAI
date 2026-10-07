# PR 1: one classifier for reports and balances (no behaviour change)

Design: `docs/superpowers/specs/2026-10-06-ledger-movements-design.md`. Read it first. This PR is step 1 of its "Delivery" section.

## Goal

Replace the single "reportable" yes/no in `lib/reportableTransactions.ts` with `ledgerEffect`, which answers three separate questions per row: does it count in the bank balance, in its fund's balance, and is it income, expenditure, a transfer, or none. Move every caller to the view it actually needs, then delete the old helpers.

No row can be a transfer, returned payment or loan yet, because the schema fields don't exist until PR 2. Every report, balance and total must therefore produce exactly the same numbers as before. The existing tests prove that by passing unchanged.

## Branch

`t3code/transfer-movements`, rebased on `main` at `2b44823`. It holds only the design doc and this plan. Open the PR against `main`.

## New API in `lib/reportableTransactions.ts`

```ts
export type LedgerActivity = "income" | "expenditure" | "transfer" | "none";

export type LedgerEffect = {
  bank: boolean;
  fund: boolean;
  activity: LedgerActivity;
};

export type LedgerRow = {
  amount: number;
  type: "Income" | "Expenditure";
  isVoided?: boolean;
  cashBankingRole?: "source_giving" | "bank_deposit";
};

export function ledgerEffect(row: LedgerRow): LedgerEffect;

// activity is income or expenditure
export function filterIncomeAndExpenditure<T extends LedgerRow>(rows: T[]): T[];
// fund is yes, signed by type
export function sumFundBalance<T extends LedgerRow>(rows: T[]): number;
// fund is yes (for callers that split one list into balance and activity figures)
export function filterFundBalanceRows<T extends LedgerRow>(rows: T[]): T[];
// activity is income (keeps its current name)
export function sumReportableIncome<T extends LedgerRow>(rows: T[]): number;
export function isReportableIncomeTransaction<T extends LedgerRow>(row: T): boolean;
// bank is yes (operational: reconciliation)
export function hasBankEffect(row: LedgerRow): boolean;
```

Write `ledgerEffect` as an ordered rule table, first match wins. The PR 1 rules are:

| Row | bank | fund | activity |
|---|---|---|---|
| Voided | no | no | none |
| `cashBankingRole: "bank_deposit"` | yes | no | none |
| Anything else | yes | yes | `type`, lowercased |

PR 2 adds the journal, transfer, reversal and loan rows above the last one. `sumRaised` for Campaigns also waits for PR 2, because it needs `movementKind`.

Keep `sumMoney` from `convex/lib/money` for every total.

Delete when no caller is left: `filterReportableTransactions`, `isReportableTransaction`, `sumReportableSigned`. Keep `isVoidedTransaction` (display only) and `isCashBankingDeposit`, if anything outside this file still needs it.

## Call sites

Line numbers are at `2b44823`. "Activity" means `filterIncomeAndExpenditure`. "Fund" means `sumFundBalance` or `filterFundBalanceRows`. "Giving" means `sumReportableIncome` or `isReportableIncomeTransaction`, unchanged.

| Site | Today | Becomes | Why |
|---|---|---|---|
| `convex/queries/funds.ts:28, 55, 83, 132` | `sumReportableSigned` | Fund | Fund balances |
| `lib/dashboardKpis.ts:238` | `filterReportableTransactions` | Activity for period income, spending, Gift Aid, mission tithe, six-month trend | Income and spending figures |
| `lib/dashboardKpis.ts:287` | `sumReportableSigned` over the activity list | Fund, over `filterFundBalanceRows(transactions)` filtered to unrestricted funds | General Fund balance. Must not reuse the activity list |
| `lib/dashboardKpis.ts:656` | `sumReportableSigned` | Fund | Per-fund balances |
| `components/FundManager.tsx:49, 61` | one list for both | Fund for `moveByFund` (net movement); Activity for `monthExpByFund` and line 100 `generalExp` | Line 61's loop computes a balance view and an activity view together. Split it |
| `components/TransactionManager.tsx:265` | `sumReportableIncome` | Giving | "Money in" strip |
| `components/TransactionManager.tsx:266` | `sumReportableSigned` | Fund | "Net" strip |
| `convex/queries/reports.ts:384` (weekly), `699, 719` (annual) | `filterReportableTransactions` | Activity | Income and spending |
| `convex/queries/reports.ts:445, 746, 833` | `isReportableIncomeTransaction` | Giving | Income lines |
| `convex/queries/reports.ts:863` | `filterReportableTransactions`, then income minus expenditure per fund at 865 to 878 | Fund via `sumFundBalance` | Year-end fund balances. Also replaces the raw `reduce` calls. `tests/moneyArithmetic.test.ts` then fails until you lower that file's count in `tests/moneyArithmetic.baseline.json` (and the same for FundManager or Reports if their counts drop) |
| `components/Reports.tsx:1118` | `filterReportableTransactions` | Activity | Check lines 1165 to 1315. All are income, spending, Gift Aid or period breakdowns. If any computes a balance, use Fund there |
| `services/pdfGenerator.ts:55` | `filterReportableTransactions` | Activity | Donor statement rows |
| `components/DonorManager.tsx:142, 172, 205` | `filterReportableTransactions` | Activity | Donor giving |
| `components/DonorManager.tsx:207, 633`, `components/Campaigns.tsx:151`, `convex/lib/pledgeStatus.ts:37`, `convex/queries/pledges.ts:114, 117, 151`, `convex/queries/donors.ts:92`, `lib/inPersonGiving.ts:130`, `convex/queries/transactions.ts:214, 235, 310` | Giving helpers | Unchanged | Already income-only |
| `convex/queries/donors.ts:88`, `convex/queries/transactions.ts:98, 270, 337`, `convex/queries/cashCollections.ts:76`, `convex/queries/aiContext.ts:48`, `convex/intelligence/generateInsights.ts:19` | `filterReportableTransactions` | Activity | Category totals, monthly summary, donor history, collection detail, AI context |
| `convex/queries/reconciliationSessions.ts:61`, `convex/mutations/reconciliationSessions.ts:136, 179` | inline `isVoided` | `hasBankEffect` | Reconciliation matches bank lines. Today this keeps cash banking deposits, and `hasBankEffect` keeps them too |

Before editing, re-run this to catch anything new on `main`:

```bash
rg -n "filterReportableTransactions|isReportableTransaction|sumReportableSigned|sumReportableIncome|isReportableIncomeTransaction|isCashBankingDeposit" --glob '!node_modules'
```

## Lint

`eslint/churchcoin-rules.js` `reportable-transactions` flags inline reads of `REPORTABLE_FIELDS`. Leave the field list alone in this PR. PR 2 adds `movementKind` and `isJournal`. Update the rule's message to name the new helpers. Reconciliation code that moves to `hasBankEffect` no longer needs any inline `isVoided` check, so remove any matching `eslint-disable` comments.

## Tests

- `tests/reportableTransactions.test.ts`: replace the old helper names with the new ones, keeping every expected number (175, 155, 0.3, 0.2). Add a table test for `ledgerEffect` covering one row per rule, including that a cash banking deposit has `bank: true, fund: false`.
- Every other test passes unchanged. The report, dashboard KPI, fund, reconciliation-lock and money-arithmetic tests are the behaviour proof. If one needs editing, the refactor changed behaviour, so stop and find out why.
- Check that the tests can fail: temporarily make `sumFundBalance` skip `bank_deposit` handling, and confirm a fund-balance or dashboard test goes red.

## Verify

```bash
npm run typecheck
npm run lint      # no new warnings over main
npm test
```

No schema change, so no `npx convex codegen` and no deploy are needed for this PR.

## PR

Title: `refactor(reports): split ledger effects into bank, fund and activity views`. Body sections: Why, Scope (old name to new name per caller group), Blast Radius (every report and balance; unchanged numbers proven by the existing tests), Verification. End with the standard Claude Code footer.

## Out of scope

Schema fields, the built-in categories, the transfers report section, the month-end check, the linking UI, `sumRaised`, and the "Needs reclassifying" filter. Those are PRs 2 and 3.
