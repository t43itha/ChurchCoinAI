# Ledger movements: transfers, returned payments and loans

## Problem

Reports count everything in the "Internal Transfer" category as income or spending. The app has only two kinds of transaction, Income and Expenditure, and one yes/no (`isReportableTransaction`) that drives both income and spending totals and fund balances.

The dev deployment's main organisation (4,905 transactions, read on 2026-10-06) shows the category is a catch-all for "not really income or spending". Its 24 rows hold no fund-to-fund transfers:

| Rows | What they are |
|---|---|
| 7 | Counter deposits (cash banked at the branch) |
| 4 | Two unpaid standing orders, each an out and an in of the same amount on the same day |
| 2 | A refund pair: a card purchase out and a repayment in, five days apart |
| 1 | A loan from a member |
| 9 | Individual offerings, most likely miscategorised |
| 1 | A card purchase with no visible other side |

The same pattern exists outside the category. 40 more counter deposits are recorded as Offerings or Donation income, 3 refunds and 1 loan sit in income categories, and 3 unpaid items sit in expenditure categories.

## Goals

- Income and spending reports count only real income and spending.
- Fund balances still move for transfers between funds, returned payments and loans.
- Reports show a "Transfers between funds" line, as SORP requires.
- A transfer or returned payment with only one side recorded is flagged at month end.

Out of scope here: the loan register (amount still owed per lender), recording which bank account a transaction came from, and automatic pairing on import. Each is a later PR.

## Data shape

### What a transaction does

One pure function in `lib/reportableTransactions.ts` replaces the single yes/no:

```ts
type LedgerActivity = "income" | "expenditure" | "transfer" | "none";

type LedgerEffect = {
  bank: boolean;          // counts towards the bank balance and reconciliation
  fund: boolean;          // counts towards its fund's balance
  activity: LedgerActivity; // where it appears in income and spending reports
};

function ledgerEffect(row: LedgerRow): LedgerEffect;
```

It reads only fields on the row, so every caller keeps passing plain transactions. The rules, first match wins:

| Row | bank | fund | activity |
|---|---|---|---|
| Voided | no | no | none |
| Cash banking deposit (`cashBankingRole: "bank_deposit"`) | yes | no | none |
| Journal leg (`isJournal`) | no | yes | transfer |
| `movementKind: "transfer"` | yes | yes | transfer |
| `movementKind: "reversal"` or `"loan"` | yes | yes | none |
| Anything else | yes | yes | `type` (income or expenditure) |

The existing helpers become views over this function:

| Today | After | Callers |
|---|---|---|
| `filterReportableTransactions` | `filterIncomeAndExpenditure` (activity is income or expenditure) | Reports, PDF, dashboard KPIs, insights, AI context |
| `sumReportableSigned` | `sumFundBalance` (fund is yes) | `queries/funds.ts`, dashboard General Fund and per-fund balances, TransactionManager's net figure |
| `sumReportableIncome` | unchanged name, activity is income | Donors, pledges, in-person giving |
| `sumReportableIncome` in Campaigns | `sumRaised` (activity is income, or a transfer into the fund) | Campaigns |
| `!t.isVoided` in reconciliation | `ledgerEffect(t).bank` | `reconciliationSessions` query and mutation |
| new | `transfersByFund` (net transfer in or out per fund) | Reports, PDF |

Callers move in the same PR that adds the new names, and the old names are deleted. Some callers need both views from one list and must split it. `lib/dashboardKpis.ts` computes the General Fund balance from the filtered income and spending list. FundManager computes each fund's monthly net movement (a balance view) and monthly spending (an activity view) in one loop. Each use is classified on its own. The `churchcoin/reportable-transactions` lint rule adds `movementKind` and `isJournal` to its watched fields, so no one checks them inline.

### Schema

```ts
movements: defineTable({
  organizationId: v.id("organizations"),
  kind: v.union(v.literal("transfer"), v.literal("reversal"), v.literal("loan")),
  note: v.optional(v.string()),
  createdBy: v.id("users"),
  createdAt: v.number(),
}).index("by_organization", ["organizationId"]),

// transactions gain
movementKind: v.optional(v.union(v.literal("transfer"), v.literal("reversal"), v.literal("loan"))),
movementId: v.optional(v.id("movements")),
isJournal: v.optional(v.boolean()),
// with .index("by_movement", ["movementId"])

// categories gain
movementKind: v.optional(v.union(v.literal("transfer"), v.literal("reversal"), v.literal("loan"))),
```

`movementKind` on a transaction is copied from its category on every write, in the same places that already call `requireCanonicalCategory`. Category renames keep the attribute, so classification never depends on a category's name. `movementId` links the legs of one movement. A leg with a kind but no `movementId` is waiting for its other side.

A movement is complete when its legs' money in equals money out, to the penny. Transfer legs must be in different funds. The server enforces both when linking.

### Journal legs

A transfer between funds where no money leaves the bank account (for example, Building Fund money sitting in the General account) is two app-created legs with `isJournal: true`. They move fund balances and appear on the transfers line. Bank reconciliation skips them, because they never appear on a statement.

## Marking rows

Three built-in categories, valid for both income and expenditure, carry a `movementKind`:

- "Transfer between funds" (`transfer`)
- "Returned payment" (`reversal`), for bounced debits, unpaid standing orders and refunds of a payment
- "Loan" (`loan`), for a loan received or a repayment of the amount borrowed. Interest stays ordinary expenditure.

Choosing one in the import review, the edit form or bulk edit is how a row is marked. There is no separate type selector. The AI categoriser can suggest them like any other category.

A marked row shows "Link other side". It lists unlinked rows of the same kind, the opposite direction and the same amount, within 14 days, closest date first. Linking creates the movement. "New transfer between funds" creates a journal pair from a form (from fund, to fund, amount, date, note).

Fund-to-fund loans are transfers. The note records that they are a loan, and repayment is a transfer the other way.

## Reports

- Income and expenditure totals, category breakdowns, the PDF and dashboard income and spending use `filterIncomeAndExpenditure`, so all three movement kinds drop out.
- Fund balances use `sumFundBalance`, so they still move.
- Reports and the PDF gain a "Transfers between funds" section with each fund's money in, money out and net. The total is zero when every transfer is complete. Otherwise the difference shows as "unmatched".
- Campaign "raised" totals count giving plus transfers into the campaign fund. A transfer out does not reduce "raised", the same as spending. Donor and pledge totals still count giving only, because transfers have no donor.
- A new month-end check lists movement legs waiting for their other side.

## Existing data

The 24 rows in "Internal Transfer" are too mixed to map automatically. The Transactions page gets a "Needs reclassifying" filter for rows in a category the user marks as retired. The expected outcome for the dev data:

| Rows | Becomes |
|---|---|
| Unpaid standing order pairs, refund pair | Returned payment, linked in pairs |
| Member loan | Loan |
| Counter deposits | Cash banking deposit through the existing cash banking reconciliation, or Offerings if no cash collection covers them |
| Offerings | Offerings |

None of the 24 rows is in a completed reconciliation, so no lock override is needed. The old category is deleted once it is empty.

## Delivery

1. `refactor(reports)`: add `ledgerEffect` and the new helpers, move every caller, and delete the old names. No behaviour change, because no row has a movement kind yet. The existing report and fund tests must pass unchanged.
2. `feat(ledger)`: schema, built-in categories, copying `movementKind` on write, the transfers report section, the PDF and the month-end check.
3. `feat(transactions)`: "Link other side", the journal transfer form and the "Needs reclassifying" filter.

Later: the loan register, recording the bank account on each transaction, and pair suggestions during import.

## Separate finding

40 counter deposits are recorded as Offerings or Donation income, and 89 cash collection rows record cash giving. December 2025 and February, April and May 2026 have both. If a counter deposit is the banking of cash already entered as a collection, that cash counts twice. The cash banking reconciliation (`cashBankingRole: "bank_deposit"`) exists for this, but no row in the organisation uses it. This is inferred from counts and needs checking against the collection sheets.
