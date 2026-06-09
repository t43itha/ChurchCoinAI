# Cash/Cheque Banking Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Cash/cheque Banking reconciliation workflow that links in-person cash/cheque giving collections to existing imported/synced bank credit transactions without double-counting the bank deposit as donation income.

**Architecture:** Add pure TypeScript domain helpers first, then extend Convex schema and backend APIs, then update reporting helpers and UI. Reconciliations store collection splits and bank transaction splits so many-to-many and partial banking are auditable; original giving stays reportable income while linked bank deposits are classified as Cash/cheque banking and excluded from reports.

**Tech Stack:** React 19, TypeScript, Vite, Convex queries/mutations, Vitest, Tailwind utility classes, lucide-react icons.

---

## File Structure

- Create `lib/reportableTransactions.ts`
  - Shared report inclusion/exclusion rules for voided transactions and Cash/cheque banking deposits.
- Create `tests/reportableTransactions.test.ts`
  - Tests that source giving remains reportable and linked bank deposits are excluded.
- Create `lib/cashChequeBanking.ts`
  - Pure calculation and validation helpers for expected cash/cheque amounts, bank splits, variance, and collection banking status.
- Create `tests/cashChequeBanking.test.ts`
  - Tests for cash-only, cheque-only, mixed, many-to-one, one-to-many, partial banking, and invalid mixed splits.
- Modify `convex/schema.ts`
  - Add `cashBankingReconciliations` and lightweight fields on `transactions` and `cashCollections`.
- Modify `types.ts`
  - Add frontend types for reconciliation records and new transaction/collection fields.
- Create `convex/queries/cashBankingReconciliations.ts`
  - Read APIs for reconciliation history, awaiting collections, and candidate bank credits.
- Create `convex/mutations/cashBankingReconciliations.ts`
  - Draft, update, complete, and reopen APIs with role and organization checks.
- Modify `convex/queries/transactions.ts`, `convex/queries/reports.ts`, `convex/queries/dashboard.ts`, `convex/queries/funds.ts`, `convex/queries/donors.ts`, `convex/queries/aiContext.ts`
  - Apply shared reportable transaction rules where income, fund balance, donor giving, Gift Aid, mission tithe, or AI income context is calculated.
- Modify `components/Dashboard.tsx` and `components/Reports.tsx`
  - Apply shared reportable transaction rules to client-side calculations.
- Create `components/CashChequeBanking.tsx`
  - New operational reconciliation tab component.
- Modify `components/TransactionManager.tsx`
  - Add the third tab and render `CashChequeBanking`.

## Implementation Notes

The design spec named `cashCollectionIds` and `bankTransactionIds`. Implementation should also store per-item split arrays because partial banking and mixed bank deposits require audit detail:

```ts
cashCollectionSplits: Array<{
  cashCollectionId: Id<"cashCollections">;
  cashAmount: number;
  chequeAmount: number;
}>;

bankTransactionSplits: Array<{
  transactionId: Id<"transactions">;
  medium: "cash" | "cheque" | "mixed";
  cashAmount: number;
  chequeAmount: number;
}>;
```

Keep `cashCollectionIds` and `bankTransactionIds` as denormalized arrays for quick display and indexing convenience.

---

### Task 1: Add Shared Reportable Transaction Rules

**Files:**
- Create: `lib/reportableTransactions.ts`
- Create: `tests/reportableTransactions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/reportableTransactions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  filterReportableTransactions,
  isCashBankingDeposit,
  isReportableIncomeTransaction,
  sumReportableSigned,
} from "../lib/reportableTransactions";

const transactions = [
  { _id: "source-cash", amount: 100, type: "Income" as const, cashBankingRole: "source_giving" as const },
  { _id: "bank-deposit", amount: 100, type: "Income" as const, cashBankingRole: "bank_deposit" as const },
  { _id: "direct-bank-gift", amount: 75, type: "Income" as const },
  { _id: "expense", amount: 20, type: "Expenditure" as const },
  { _id: "voided-income", amount: 50, type: "Income" as const, isVoided: true },
];

describe("reportable transaction helpers", () => {
  it("identifies cash/cheque banking deposit transactions", () => {
    expect(isCashBankingDeposit(transactions[1])).toBe(true);
    expect(isCashBankingDeposit(transactions[0])).toBe(false);
    expect(isCashBankingDeposit(transactions[2])).toBe(false);
  });

  it("keeps original source giving reportable and excludes linked bank deposits", () => {
    expect(isReportableIncomeTransaction(transactions[0])).toBe(true);
    expect(isReportableIncomeTransaction(transactions[1])).toBe(false);
    expect(isReportableIncomeTransaction(transactions[2])).toBe(true);
    expect(isReportableIncomeTransaction(transactions[3])).toBe(false);
    expect(isReportableIncomeTransaction(transactions[4])).toBe(false);
  });

  it("filters active reportable transactions while keeping expenditure", () => {
    expect(filterReportableTransactions(transactions).map((t) => t._id)).toEqual([
      "source-cash",
      "direct-bank-gift",
      "expense",
    ]);
  });

  it("sums reportable income and expenditure without double-counting banking deposits", () => {
    expect(sumReportableSigned(transactions)).toBe(155);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/reportableTransactions.test.ts
```

Expected: FAIL because `../lib/reportableTransactions` does not exist.

- [ ] **Step 3: Add the helper implementation**

Create `lib/reportableTransactions.ts`:

```ts
import { filterActiveTransactions, isActiveTransaction } from "./voidedTransactions";

export type ReportableTransaction = {
  amount: number;
  type: "Income" | "Expenditure";
  isVoided?: boolean;
  cashBankingRole?: "source_giving" | "bank_deposit";
  category?: string;
};

export function isCashBankingDeposit(transaction: {
  cashBankingRole?: "source_giving" | "bank_deposit";
}) {
  return transaction.cashBankingRole === "bank_deposit";
}

export function isReportableIncomeTransaction<T extends ReportableTransaction>(
  transaction: T
) {
  return (
    isActiveTransaction(transaction) &&
    transaction.type === "Income" &&
    !isCashBankingDeposit(transaction)
  );
}

export function isReportableTransaction<T extends ReportableTransaction>(
  transaction: T
) {
  if (!isActiveTransaction(transaction)) {
    return false;
  }

  if (transaction.type === "Income") {
    return !isCashBankingDeposit(transaction);
  }

  return true;
}

export function filterReportableTransactions<T extends ReportableTransaction>(
  transactions: T[]
) {
  return filterActiveTransactions(transactions).filter(isReportableTransaction);
}

export function sumReportableIncome<T extends ReportableTransaction>(
  transactions: T[]
) {
  return filterReportableTransactions(transactions)
    .filter((transaction) => transaction.type === "Income")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function sumReportableSigned<T extends ReportableTransaction>(
  transactions: T[]
) {
  return filterReportableTransactions(transactions).reduce(
    (sum, transaction) =>
      transaction.type === "Income"
        ? sum + transaction.amount
        : sum - transaction.amount,
    0
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npm test -- tests/reportableTransactions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/reportableTransactions.ts tests/reportableTransactions.test.ts
git commit -m "test: add reportable transaction helpers"
```

---

### Task 2: Add Cash/Cheque Banking Calculation Helpers

**Files:**
- Create: `lib/cashChequeBanking.ts`
- Create: `tests/cashChequeBanking.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/cashChequeBanking.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  calculateCollectionBankingTotals,
  calculateReconciliationSummary,
  getCollectionBankingStatus,
  normalizeBankTransactionSplits,
} from "../lib/cashChequeBanking";

const givingTransactions = [
  { _id: "c1-cash", cashCollectionId: "collection-1", paymentMethod: "Cash" as const, amount: 100, type: "Income" as const },
  { _id: "c1-cheque", cashCollectionId: "collection-1", paymentMethod: "Cheque" as const, amount: 40, type: "Income" as const },
  { _id: "c1-card", cashCollectionId: "collection-1", paymentMethod: "Card" as const, amount: 25, type: "Income" as const },
  { _id: "c2-cash", cashCollectionId: "collection-2", paymentMethod: "Cash" as const, amount: 60, type: "Income" as const },
  { _id: "c2-void", cashCollectionId: "collection-2", paymentMethod: "Cash" as const, amount: 10, type: "Income" as const, isVoided: true },
  { _id: "expense", cashCollectionId: "collection-1", paymentMethod: "Cash" as const, amount: 5, type: "Expenditure" as const },
];

describe("cash/cheque banking helpers", () => {
  it("calculates collection expected totals using only active income cash and cheques", () => {
    expect(calculateCollectionBankingTotals("collection-1", givingTransactions)).toEqual({
      cashAmount: 100,
      chequeAmount: 40,
      totalAmount: 140,
    });
  });

  it("normalizes cash-only and cheque-only bank transaction splits", () => {
    expect(
      normalizeBankTransactionSplits([
        { transactionId: "bank-cash", transactionAmount: 100, medium: "cash" },
        { transactionId: "bank-cheque", transactionAmount: 40, medium: "cheque" },
      ])
    ).toEqual([
      { transactionId: "bank-cash", medium: "cash", cashAmount: 100, chequeAmount: 0 },
      { transactionId: "bank-cheque", medium: "cheque", cashAmount: 0, chequeAmount: 40 },
    ]);
  });

  it("normalizes mixed bank transaction splits", () => {
    expect(
      normalizeBankTransactionSplits([
        {
          transactionId: "bank-mixed",
          transactionAmount: 140,
          medium: "mixed",
          cashAmount: 100,
          chequeAmount: 40,
        },
      ])
    ).toEqual([
      { transactionId: "bank-mixed", medium: "mixed", cashAmount: 100, chequeAmount: 40 },
    ]);
  });

  it("rejects a mixed split that does not equal the bank transaction amount", () => {
    expect(() =>
      normalizeBankTransactionSplits([
        {
          transactionId: "bank-mixed",
          transactionAmount: 140,
          medium: "mixed",
          cashAmount: 100,
          chequeAmount: 39,
        },
      ])
    ).toThrow("Mixed bank split must equal the transaction amount");
  });

  it("calculates zero variance for one collection to many deposits", () => {
    const summary = calculateReconciliationSummary({
      collectionSplits: [{ cashCollectionId: "collection-1", cashAmount: 100, chequeAmount: 40 }],
      bankTransactionSplits: [
        { transactionId: "bank-cash", medium: "cash", cashAmount: 100, chequeAmount: 0 },
        { transactionId: "bank-cheque", medium: "cheque", cashAmount: 0, chequeAmount: 40 },
      ],
    });

    expect(summary).toEqual({
      expectedCashAmount: 100,
      expectedChequeAmount: 40,
      expectedTotal: 140,
      bankedCashAmount: 100,
      bankedChequeAmount: 40,
      bankedTotal: 140,
      varianceAmount: 0,
    });
  });

  it("calculates variance for many collections to one partial deposit", () => {
    const summary = calculateReconciliationSummary({
      collectionSplits: [
        { cashCollectionId: "collection-1", cashAmount: 100, chequeAmount: 40 },
        { cashCollectionId: "collection-2", cashAmount: 60, chequeAmount: 0 },
      ],
      bankTransactionSplits: [
        { transactionId: "bank-cash", medium: "cash", cashAmount: 150, chequeAmount: 0 },
      ],
    });

    expect(summary.varianceAmount).toBe(-50);
  });

  it("reports collection banking status from expected and banked totals", () => {
    expect(getCollectionBankingStatus(140, 0)).toBe("not_started");
    expect(getCollectionBankingStatus(140, 100)).toBe("partially_banked");
    expect(getCollectionBankingStatus(140, 140)).toBe("banked");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/cashChequeBanking.test.ts
```

Expected: FAIL because `../lib/cashChequeBanking` does not exist.

- [ ] **Step 3: Add the helper implementation**

Create `lib/cashChequeBanking.ts`:

```ts
import { isActiveTransaction } from "./voidedTransactions";

const roundMoney = (amount: number) => Math.round(amount * 100) / 100;

export type BankingMedium = "cash" | "cheque" | "mixed";
export type CashBankingStatus = "not_started" | "partially_banked" | "banked";

export type CollectionBankingTransaction = {
  _id: string;
  cashCollectionId?: string;
  paymentMethod?: "Cash" | "Cheque" | "Bank" | "Card" | "Online";
  amount: number;
  type: "Income" | "Expenditure";
  isVoided?: boolean;
};

export type CollectionSplit = {
  cashCollectionId: string;
  cashAmount: number;
  chequeAmount: number;
};

export type BankTransactionSplitInput = {
  transactionId: string;
  transactionAmount: number;
  medium: BankingMedium;
  cashAmount?: number;
  chequeAmount?: number;
};

export type BankTransactionSplit = {
  transactionId: string;
  medium: BankingMedium;
  cashAmount: number;
  chequeAmount: number;
};

export type ReconciliationSummary = {
  expectedCashAmount: number;
  expectedChequeAmount: number;
  expectedTotal: number;
  bankedCashAmount: number;
  bankedChequeAmount: number;
  bankedTotal: number;
  varianceAmount: number;
};

export function calculateCollectionBankingTotals(
  cashCollectionId: string,
  transactions: CollectionBankingTransaction[]
) {
  const totals = transactions
    .filter(
      (transaction) =>
        transaction.cashCollectionId === cashCollectionId &&
        transaction.type === "Income" &&
        isActiveTransaction(transaction)
    )
    .reduce(
      (acc, transaction) => {
        if (transaction.paymentMethod === "Cash") {
          acc.cashAmount += transaction.amount;
        }
        if (transaction.paymentMethod === "Cheque") {
          acc.chequeAmount += transaction.amount;
        }
        return acc;
      },
      { cashAmount: 0, chequeAmount: 0 }
    );

  return {
    cashAmount: roundMoney(totals.cashAmount),
    chequeAmount: roundMoney(totals.chequeAmount),
    totalAmount: roundMoney(totals.cashAmount + totals.chequeAmount),
  };
}

export function normalizeBankTransactionSplits(
  splits: BankTransactionSplitInput[]
): BankTransactionSplit[] {
  return splits.map((split) => {
    if (split.transactionAmount <= 0) {
      throw new Error("Bank transaction amount must be greater than zero");
    }

    if (split.medium === "cash") {
      return {
        transactionId: split.transactionId,
        medium: split.medium,
        cashAmount: roundMoney(split.transactionAmount),
        chequeAmount: 0,
      };
    }

    if (split.medium === "cheque") {
      return {
        transactionId: split.transactionId,
        medium: split.medium,
        cashAmount: 0,
        chequeAmount: roundMoney(split.transactionAmount),
      };
    }

    const cashAmount = roundMoney(split.cashAmount ?? 0);
    const chequeAmount = roundMoney(split.chequeAmount ?? 0);
    const splitTotal = roundMoney(cashAmount + chequeAmount);

    if (splitTotal !== roundMoney(split.transactionAmount)) {
      throw new Error("Mixed bank split must equal the transaction amount");
    }

    return {
      transactionId: split.transactionId,
      medium: split.medium,
      cashAmount,
      chequeAmount,
    };
  });
}

export function calculateReconciliationSummary({
  collectionSplits,
  bankTransactionSplits,
}: {
  collectionSplits: CollectionSplit[];
  bankTransactionSplits: BankTransactionSplit[];
}): ReconciliationSummary {
  const expectedCashAmount = roundMoney(
    collectionSplits.reduce((sum, split) => sum + split.cashAmount, 0)
  );
  const expectedChequeAmount = roundMoney(
    collectionSplits.reduce((sum, split) => sum + split.chequeAmount, 0)
  );
  const bankedCashAmount = roundMoney(
    bankTransactionSplits.reduce((sum, split) => sum + split.cashAmount, 0)
  );
  const bankedChequeAmount = roundMoney(
    bankTransactionSplits.reduce((sum, split) => sum + split.chequeAmount, 0)
  );
  const expectedTotal = roundMoney(expectedCashAmount + expectedChequeAmount);
  const bankedTotal = roundMoney(bankedCashAmount + bankedChequeAmount);

  return {
    expectedCashAmount,
    expectedChequeAmount,
    expectedTotal,
    bankedCashAmount,
    bankedChequeAmount,
    bankedTotal,
    varianceAmount: roundMoney(bankedTotal - expectedTotal),
  };
}

export function getCollectionBankingStatus(
  expectedTotal: number,
  bankedTotal: number
): CashBankingStatus {
  if (bankedTotal <= 0) {
    return "not_started";
  }

  if (roundMoney(bankedTotal) >= roundMoney(expectedTotal)) {
    return "banked";
  }

  return "partially_banked";
}
```

- [ ] **Step 4: Run the tests**

Run:

```bash
npm test -- tests/cashChequeBanking.test.ts tests/reportableTransactions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cashChequeBanking.ts tests/cashChequeBanking.test.ts
git commit -m "test: add cash cheque banking calculations"
```

---

### Task 3: Extend Schema And Frontend Types

**Files:**
- Modify: `convex/schema.ts`
- Modify: `types.ts`

- [ ] **Step 1: Update Convex schema**

Modify `convex/schema.ts`:

1. In the `transactions` table, after `cashCollectionId`, add:

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

2. Add transaction indexes after `by_cashCollection`:

```ts
    .index("by_cashBankingReconciliation", ["cashBankingReconciliationId"])
    .index("by_organization_cashBankingRole", ["organizationId", "cashBankingRole"]),
```

3. In the `cashCollections` table, after `bankedDate`, add:

```ts
    cashBankingLastReconciliationId: v.optional(v.id("cashBankingReconciliations")),
    cashBankingStatus: v.optional(v.union(
      v.literal("not_started"),
      v.literal("partially_banked"),
      v.literal("banked")
    )),
```

4. Add this table after `cashCollections`:

```ts
  cashBankingReconciliations: defineTable({
    organizationId: v.id("organizations"),
    cashCollectionIds: v.array(v.id("cashCollections")),
    cashCollectionSplits: v.array(
      v.object({
        cashCollectionId: v.id("cashCollections"),
        cashAmount: v.number(),
        chequeAmount: v.number(),
      })
    ),
    bankTransactionIds: v.array(v.id("transactions")),
    bankTransactionSplits: v.array(
      v.object({
        transactionId: v.id("transactions"),
        medium: v.union(
          v.literal("cash"),
          v.literal("cheque"),
          v.literal("mixed")
        ),
        cashAmount: v.number(),
        chequeAmount: v.number(),
      })
    ),
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
    varianceType: v.optional(
      v.union(
        v.literal("partial_banking"),
        v.literal("petty_cash_retained_or_spent"),
        v.literal("bank_counting_difference"),
        v.literal("cheque_timing"),
        v.literal("other")
      )
    ),
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
    .index("by_organization_status", ["organizationId", "status"]),
```

- [ ] **Step 2: Update frontend types**

Modify `types.ts`:

1. Add these constants after `CashCollectionStatus`:

```ts
export const CashBankingStatus = {
  NOT_STARTED: "not_started",
  PARTIALLY_BANKED: "partially_banked",
  BANKED: "banked",
} as const;

export type CashBankingStatus =
  (typeof CashBankingStatus)[keyof typeof CashBankingStatus];

export const CashBankingRole = {
  SOURCE_GIVING: "source_giving",
  BANK_DEPOSIT: "bank_deposit",
} as const;

export type CashBankingRole =
  (typeof CashBankingRole)[keyof typeof CashBankingRole];

export type BankingMedium = "cash" | "cheque" | "mixed";

export type CashBankingVarianceType =
  | "partial_banking"
  | "petty_cash_retained_or_spent"
  | "bank_counting_difference"
  | "cheque_timing"
  | "other";
```

2. Add to `Transaction`:

```ts
  cashBankingReconciliationId?: string;
  cashBankingRole?: CashBankingRole;
  bankingMedium?: BankingMedium;
```

3. Add to `CashCollection`:

```ts
  cashBankingLastReconciliationId?: string;
  cashBankingStatus?: CashBankingStatus;
```

4. Add this interface after `CashCollection`:

```ts
export interface CashBankingReconciliation {
  _id: string;
  organizationId: string;
  cashCollectionIds: string[];
  cashCollectionSplits: Array<{
    cashCollectionId: string;
    cashAmount: number;
    chequeAmount: number;
  }>;
  bankTransactionIds: string[];
  bankTransactionSplits: Array<{
    transactionId: string;
    medium: BankingMedium;
    cashAmount: number;
    chequeAmount: number;
  }>;
  status: "draft" | "completed" | "reopened";
  expectedCashAmount: number;
  expectedChequeAmount: number;
  expectedTotal: number;
  bankedCashAmount: number;
  bankedChequeAmount: number;
  bankedTotal: number;
  varianceAmount: number;
  varianceType?: CashBankingVarianceType;
  varianceNote?: string;
  completedAt?: number;
  completedBy?: string;
  reopenedAt?: number;
  reopenedBy?: string;
  reopenReason?: string;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
}
```

- [ ] **Step 3: Run typecheck/code generation**

Run:

```bash
npx convex codegen
npm run typecheck
```

Expected: Convex generated files update automatically; TypeScript may fail only where code still does not know about new APIs. If typecheck fails because generated API references to new query/mutation files do not exist yet, continue to Task 4 before re-running.

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts types.ts convex/_generated
git commit -m "feat: add cash cheque banking schema"
```

---

### Task 4: Add Backend Reconciliation Queries

**Files:**
- Create: `convex/queries/cashBankingReconciliations.ts`

- [ ] **Step 1: Create query validators and helpers**

Create `convex/queries/cashBankingReconciliations.ts` with this structure:

```ts
import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../lib/auth";
import { Id } from "../_generated/dataModel";
import {
  calculateCollectionBankingTotals,
  getCollectionBankingStatus,
} from "../../lib/cashChequeBanking";
import { isActiveTransaction } from "../../lib/voidedTransactions";

const sumCompletedCollectionBanked = (
  reconciliations: Array<{
    status: "draft" | "completed" | "reopened";
    cashCollectionSplits: Array<{
      cashCollectionId: Id<"cashCollections">;
      cashAmount: number;
      chequeAmount: number;
    }>;
  }>,
  cashCollectionId: Id<"cashCollections">
) => {
  return reconciliations
    .filter((reconciliation) => reconciliation.status === "completed")
    .flatMap((reconciliation) => reconciliation.cashCollectionSplits)
    .filter((split) => split.cashCollectionId === cashCollectionId)
    .reduce(
      (acc, split) => ({
        cashAmount: acc.cashAmount + split.cashAmount,
        chequeAmount: acc.chequeAmount + split.chequeAmount,
      }),
      { cashAmount: 0, chequeAmount: 0 }
    );
};
```

- [ ] **Step 2: Add list query**

Add:

```ts
export const list = query({
  args: {
    status: v.optional(
      v.union(v.literal("draft"), v.literal("completed"), v.literal("reopened"))
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const reconciliations = args.status
      ? await ctx.db
          .query("cashBankingReconciliations")
          .withIndex("by_organization_status", (q) =>
            q.eq("organizationId", user.organizationId).eq("status", args.status!)
          )
          .collect()
      : await ctx.db
          .query("cashBankingReconciliations")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", user.organizationId)
          )
          .collect();

    return reconciliations.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});
```

- [ ] **Step 3: Add getById query**

Add:

```ts
export const getById = query({
  args: { reconciliationId: v.id("cashBankingReconciliations") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const reconciliation = await ctx.db.get(args.reconciliationId);

    if (!reconciliation || reconciliation.organizationId !== user.organizationId) {
      return null;
    }

    return reconciliation;
  },
});
```

- [ ] **Step 4: Add awaiting banking query**

Add:

```ts
export const getAwaitingBanking = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const collections = await ctx.db
      .query("cashCollections")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    const submittedCollections = collections.filter(
      (collection) => collection.status === "submitted" || collection.status === "banked"
    );

    const allTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    const reconciliations = await ctx.db
      .query("cashBankingReconciliations")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    return submittedCollections
      .map((collection) => {
        const expected = calculateCollectionBankingTotals(
          collection._id,
          allTransactions
        );
        const banked = sumCompletedCollectionBanked(
          reconciliations,
          collection._id
        );
        const bankedTotal = banked.cashAmount + banked.chequeAmount;
        const openCashAmount = Math.max(0, expected.cashAmount - banked.cashAmount);
        const openChequeAmount = Math.max(0, expected.chequeAmount - banked.chequeAmount);
        const openTotal = openCashAmount + openChequeAmount;

        return {
          ...collection,
          expectedCashAmount: expected.cashAmount,
          expectedChequeAmount: expected.chequeAmount,
          expectedTotal: expected.totalAmount,
          bankedCashAmount: banked.cashAmount,
          bankedChequeAmount: banked.chequeAmount,
          bankedTotal,
          openCashAmount,
          openChequeAmount,
          openTotal,
          cashBankingStatus: getCollectionBankingStatus(
            expected.totalAmount,
            bankedTotal
          ),
        };
      })
      .filter((collection) => collection.expectedTotal > 0 && collection.openTotal > 0)
      .sort((a, b) => b.weekEndingDate.localeCompare(a.weekEndingDate));
  },
});
```

- [ ] **Step 5: Add candidate bank credits query**

Add:

```ts
export const getCandidateBankCredits = query({
  args: {
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    const searchLower = args.searchTerm?.trim().toLowerCase();

    return transactions
      .filter((transaction) => {
        if (!isActiveTransaction(transaction)) return false;
        if (transaction.type !== "Income") return false;
        if (transaction.cashBankingRole === "bank_deposit") return false;
        if (transaction.cashBankingReconciliationId) return false;
        if (transaction.cashCollectionId) return false;
        if (args.startDate && transaction.date < args.startDate) return false;
        if (args.endDate && transaction.date > args.endDate) return false;
        if (searchLower) {
          const haystack = `${transaction.description} ${transaction.category} ${transaction.notes ?? ""}`.toLowerCase();
          if (!haystack.includes(searchLower)) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  },
});
```

- [ ] **Step 6: Run codegen and typecheck**

Run:

```bash
npx convex codegen
npm run typecheck
```

Expected: PASS or fail only because mutations/UI are not implemented yet. If generated API errors mention missing mutation module, continue to Task 5.

- [ ] **Step 7: Commit**

```bash
git add convex/queries/cashBankingReconciliations.ts convex/_generated
git commit -m "feat: add cash cheque banking queries"
```

---

### Task 5: Add Backend Reconciliation Mutations

**Files:**
- Create: `convex/mutations/cashBankingReconciliations.ts`

- [ ] **Step 1: Create validators and helper functions**

Create `convex/mutations/cashBankingReconciliations.ts`:

```ts
import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";
import { Id } from "../_generated/dataModel";
import {
  calculateReconciliationSummary,
  normalizeBankTransactionSplits,
} from "../../lib/cashChequeBanking";
import { isActiveTransaction } from "../../lib/voidedTransactions";

const varianceTypeValidator = v.union(
  v.literal("partial_banking"),
  v.literal("petty_cash_retained_or_spent"),
  v.literal("bank_counting_difference"),
  v.literal("cheque_timing"),
  v.literal("other")
);

const collectionSplitValidator = v.object({
  cashCollectionId: v.id("cashCollections"),
  cashAmount: v.number(),
  chequeAmount: v.number(),
});

const bankTransactionSplitInputValidator = v.object({
  transactionId: v.id("transactions"),
  transactionAmount: v.number(),
  medium: v.union(v.literal("cash"), v.literal("cheque"), v.literal("mixed")),
  cashAmount: v.optional(v.number()),
  chequeAmount: v.optional(v.number()),
});

async function assertCollectionsBelongToOrganization(
  ctx: any,
  organizationId: Id<"organizations">,
  splits: Array<{
    cashCollectionId: Id<"cashCollections">;
    cashAmount: number;
    chequeAmount: number;
  }>
) {
  for (const split of splits) {
    if (split.cashAmount < 0 || split.chequeAmount < 0) {
      throw new Error("Collection split amounts cannot be negative");
    }

    const collection = await ctx.db.get(split.cashCollectionId);
    if (!collection || collection.organizationId !== organizationId) {
      throw new Error("Cash collection not found");
    }
    if (collection.status === "draft") {
      throw new Error("Draft collections cannot be reconciled");
    }
  }
}

async function getAndValidateBankTransactions(
  ctx: any,
  organizationId: Id<"organizations">,
  bankTransactionIds: Id<"transactions">[]
) {
  const transactions = [];

  for (const transactionId of bankTransactionIds) {
    const transaction = await ctx.db.get(transactionId);
    if (!transaction || transaction.organizationId !== organizationId) {
      throw new Error("Bank transaction not found");
    }
    if (!isActiveTransaction(transaction)) {
      throw new Error("Voided transactions cannot be used as bank deposits");
    }
    if (transaction.type !== "Income") {
      throw new Error("Only bank credit transactions can be reconciled");
    }
    if (
      transaction.cashBankingRole === "bank_deposit" ||
      transaction.cashBankingReconciliationId
    ) {
      throw new Error("Bank transaction is already linked to a cash/cheque banking reconciliation");
    }
    if (transaction.cashCollectionId) {
      throw new Error("In-person giving source transactions cannot be used as bank deposits");
    }
    transactions.push(transaction);
  }

  return transactions;
}

function assertVarianceDetails(args: {
  varianceAmount: number;
  varianceType?: string;
  varianceNote?: string;
}) {
  if (args.varianceAmount !== 0) {
    if (!args.varianceType) {
      throw new Error("Variance type is required when variance is non-zero");
    }
    if (!args.varianceNote || args.varianceNote.trim().length < 3) {
      throw new Error("Variance note is required when variance is non-zero");
    }
  }
}
```

- [ ] **Step 2: Add createDraft mutation**

Add:

```ts
export const createDraft = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const now = Date.now();

    return await ctx.db.insert("cashBankingReconciliations", {
      organizationId: user.organizationId,
      cashCollectionIds: [],
      cashCollectionSplits: [],
      bankTransactionIds: [],
      bankTransactionSplits: [],
      status: "draft",
      expectedCashAmount: 0,
      expectedChequeAmount: 0,
      expectedTotal: 0,
      bankedCashAmount: 0,
      bankedChequeAmount: 0,
      bankedTotal: 0,
      varianceAmount: 0,
      createdAt: now,
      createdBy: user._id,
      updatedAt: now,
    });
  },
});
```

- [ ] **Step 3: Add updateDraft mutation**

Add:

```ts
export const updateDraft = mutation({
  args: {
    reconciliationId: v.id("cashBankingReconciliations"),
    cashCollectionSplits: v.array(collectionSplitValidator),
    bankTransactionSplits: v.array(bankTransactionSplitInputValidator),
    varianceType: v.optional(varianceTypeValidator),
    varianceNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const reconciliation = await ctx.db.get(args.reconciliationId);

    if (!reconciliation || reconciliation.organizationId !== user.organizationId) {
      throw new Error("Reconciliation not found");
    }
    if (reconciliation.status === "completed") {
      throw new Error("Completed reconciliations must be reopened before editing");
    }

    await assertCollectionsBelongToOrganization(
      ctx,
      user.organizationId,
      args.cashCollectionSplits
    );

    const bankTransactions = await getAndValidateBankTransactions(
      ctx,
      user.organizationId,
      args.bankTransactionSplits.map((split) => split.transactionId)
    );

    const amountsById = new Map(
      bankTransactions.map((transaction) => [transaction._id, transaction.amount])
    );
    const normalizedBankSplits = normalizeBankTransactionSplits(
      args.bankTransactionSplits.map((split) => ({
        transactionId: split.transactionId,
        transactionAmount: amountsById.get(split.transactionId) ?? split.transactionAmount,
        medium: split.medium,
        cashAmount: split.cashAmount,
        chequeAmount: split.chequeAmount,
      }))
    ).map((split) => ({
      transactionId: split.transactionId as Id<"transactions">,
      medium: split.medium,
      cashAmount: split.cashAmount,
      chequeAmount: split.chequeAmount,
    }));

    const summary = calculateReconciliationSummary({
      collectionSplits: args.cashCollectionSplits.map((split) => ({
        cashCollectionId: split.cashCollectionId,
        cashAmount: split.cashAmount,
        chequeAmount: split.chequeAmount,
      })),
      bankTransactionSplits: normalizedBankSplits,
    });

    assertVarianceDetails({
      varianceAmount: summary.varianceAmount,
      varianceType: args.varianceType,
      varianceNote: args.varianceNote,
    });

    await ctx.db.patch(args.reconciliationId, {
      cashCollectionIds: args.cashCollectionSplits.map((split) => split.cashCollectionId),
      cashCollectionSplits: args.cashCollectionSplits,
      bankTransactionIds: normalizedBankSplits.map((split) => split.transactionId),
      bankTransactionSplits: normalizedBankSplits,
      ...summary,
      varianceType: args.varianceType,
      varianceNote: args.varianceNote?.trim(),
      updatedAt: Date.now(),
    });

    return args.reconciliationId;
  },
});
```

- [ ] **Step 4: Add complete mutation**

Add:

```ts
export const complete = mutation({
  args: { reconciliationId: v.id("cashBankingReconciliations") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const reconciliation = await ctx.db.get(args.reconciliationId);

    if (!reconciliation || reconciliation.organizationId !== user.organizationId) {
      throw new Error("Reconciliation not found");
    }
    if (reconciliation.status === "completed") {
      throw new Error("Reconciliation is already completed");
    }
    if (reconciliation.cashCollectionSplits.length === 0) {
      throw new Error("Select at least one cash collection");
    }
    if (reconciliation.bankTransactionSplits.length === 0) {
      throw new Error("Select at least one bank credit");
    }

    assertVarianceDetails({
      varianceAmount: reconciliation.varianceAmount,
      varianceType: reconciliation.varianceType,
      varianceNote: reconciliation.varianceNote,
    });

    await getAndValidateBankTransactions(
      ctx,
      user.organizationId,
      reconciliation.bankTransactionIds
    );

    const now = Date.now();

    for (const split of reconciliation.bankTransactionSplits) {
      await ctx.db.patch(split.transactionId, {
        category: "Cash/cheque banking",
        cashBankingReconciliationId: args.reconciliationId,
        cashBankingRole: "bank_deposit",
        bankingMedium: split.medium,
        isReconciled: true,
      });
    }

    for (const collectionId of reconciliation.cashCollectionIds) {
      const sourceTransactions = await ctx.db
        .query("transactions")
        .withIndex("by_cashCollection", (q) => q.eq("cashCollectionId", collectionId))
        .collect();

      const activeCashChequeSourceTransactions = sourceTransactions.filter(
        (transaction) =>
          isActiveTransaction(transaction) &&
          transaction.type === "Income" &&
          (transaction.paymentMethod === "Cash" || transaction.paymentMethod === "Cheque")
      );

      for (const transaction of activeCashChequeSourceTransactions) {
        await ctx.db.patch(transaction._id, {
          cashBankingReconciliationId: args.reconciliationId,
          cashBankingRole: "source_giving",
        });
      }

      await ctx.db.patch(collectionId, {
        cashBankingLastReconciliationId: args.reconciliationId,
        cashBankingStatus:
          reconciliation.varianceAmount === 0 ? "banked" : "partially_banked",
      });
    }

    await ctx.db.patch(args.reconciliationId, {
      status: "completed",
      completedAt: now,
      completedBy: user._id,
      updatedAt: now,
    });

    return args.reconciliationId;
  },
});
```

- [ ] **Step 5: Add reopen mutation**

Add:

```ts
export const reopen = mutation({
  args: {
    reconciliationId: v.id("cashBankingReconciliations"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const reason = args.reason.trim();
    if (reason.length < 3) {
      throw new Error("Reopen reason must be at least 3 characters");
    }

    const reconciliation = await ctx.db.get(args.reconciliationId);
    if (!reconciliation || reconciliation.organizationId !== user.organizationId) {
      throw new Error("Reconciliation not found");
    }
    if (reconciliation.status !== "completed") {
      throw new Error("Only completed reconciliations can be reopened");
    }

    for (const transactionId of reconciliation.bankTransactionIds) {
      await ctx.db.patch(transactionId, {
        cashBankingReconciliationId: undefined,
        cashBankingRole: undefined,
        bankingMedium: undefined,
        isReconciled: false,
      });
    }

    await ctx.db.patch(args.reconciliationId, {
      status: "reopened",
      reopenedAt: Date.now(),
      reopenedBy: user._id,
      reopenReason: reason,
      updatedAt: Date.now(),
    });

    return args.reconciliationId;
  },
});
```

- [ ] **Step 6: Run typecheck**

Run:

```bash
npx convex codegen
npm run typecheck
```

Expected: PASS for backend modules. If TypeScript reports that assigning `undefined` in `ctx.db.patch` is invalid, replace those fields with the Convex-supported clearing pattern used elsewhere in the repo, or patch to neutral values accepted by generated types.

- [ ] **Step 7: Commit**

```bash
git add convex/mutations/cashBankingReconciliations.ts convex/_generated
git commit -m "feat: add cash cheque banking mutations"
```

---

### Task 6: Apply Reportable Rules To Backend Reporting

**Files:**
- Modify: `convex/queries/transactions.ts`
- Modify: `convex/queries/reports.ts`
- Modify: `convex/queries/dashboard.ts`
- Modify: `convex/queries/funds.ts`
- Modify: `convex/queries/donors.ts`
- Modify: `convex/queries/aiContext.ts`

- [ ] **Step 1: Update transaction aggregate queries**

In `convex/queries/transactions.ts`, add:

```ts
import {
  filterReportableTransactions,
  isReportableIncomeTransaction,
} from "../../lib/reportableTransactions";
```

Then replace income report filters:

```ts
return boundedTransactions.filter(
  (t) => t.isGiftAidEligible === true && isReportableIncomeTransaction(t)
);
```

For `aggregateByCategory`, replace:

```ts
const activeTransactions = filterActiveTransactions(transactions);
```

with:

```ts
const activeTransactions = filterReportableTransactions(transactions);
```

For `monthlySummary`, replace:

```ts
filterActiveTransactions(transactions).forEach((t) => {
```

with:

```ts
filterReportableTransactions(transactions).forEach((t) => {
```

- [ ] **Step 2: Update funds query balances**

In `convex/queries/funds.ts`, add:

```ts
import { sumReportableSigned } from "../../lib/reportableTransactions";
```

Replace each balance reducer:

```ts
const balance = transactions.reduce((sum, t) => {
  return t.type === "Income" ? sum + t.amount : sum - t.amount;
}, 0);
```

with:

```ts
const balance = sumReportableSigned(transactions);
```

Also remove `.filter((q) => q.neq(q.field("isVoided"), true))` only where the helper is called after collection; keeping it is acceptable because the helper still handles reportability.

- [ ] **Step 3: Update dashboard query**

In `convex/queries/dashboard.ts`, add:

```ts
import {
  filterReportableTransactions,
  sumReportableSigned,
} from "../../lib/reportableTransactions";
```

Remove `sumActiveSigned` from the `voidedTransactions` import.

Replace:

```ts
const activeTransactions = filterActiveTransactions(transactions);
```

with:

```ts
const activeTransactions = filterReportableTransactions(transactions);
```

Keep the existing `sumActiveSigned` call sites but rename them to `sumReportableSigned`.

- [ ] **Step 4: Update reports query**

In `convex/queries/reports.ts`, add:

```ts
import {
  filterReportableTransactions,
  isReportableIncomeTransaction,
} from "../../lib/reportableTransactions";
```

For `monthlyReportData` and `annualReportData`, after fetching `allTransactions`, add:

```ts
const reportableTransactions = filterReportableTransactions(allTransactions);
```

Then replace:

```ts
const incomeTransactions = allTransactions.filter((t) => t.type === "Income");
const expenditureTransactions = allTransactions.filter((t) => t.type === "Expenditure");
```

with:

```ts
const incomeTransactions = reportableTransactions.filter(
  isReportableIncomeTransaction
);
const expenditureTransactions = reportableTransactions.filter(
  (t) => t.type === "Expenditure"
);
```

For weekly cash collection summaries that intentionally inspect source collection transactions by `cashCollectionId`, keep using active source transactions because those are the original giving records.

- [ ] **Step 5: Update donor history query**

In `convex/queries/donors.ts`, add:

```ts
import { isReportableIncomeTransaction } from "../../lib/reportableTransactions";
```

Replace:

```ts
const totalGiving = transactions
  .filter((t) => t.type === "Income")
  .reduce((sum, t) => sum + t.amount, 0);
```

with:

```ts
const totalGiving = transactions
  .filter(isReportableIncomeTransaction)
  .reduce((sum, t) => sum + t.amount, 0);
```

- [ ] **Step 6: Update AI context**

In `convex/queries/aiContext.ts`, add:

```ts
import { filterReportableTransactions } from "../../lib/reportableTransactions";
```

Replace:

```ts
const pageItems = filterActiveTransactions(page.page)
```

with:

```ts
const pageItems = filterReportableTransactions(page.page)
```

- [ ] **Step 7: Run tests and typecheck**

Run:

```bash
npm test -- tests/reportableTransactions.test.ts tests/cashChequeBanking.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add convex/queries/transactions.ts convex/queries/reports.ts convex/queries/dashboard.ts convex/queries/funds.ts convex/queries/donors.ts convex/queries/aiContext.ts
git commit -m "fix: exclude cash cheque banking deposits from reports"
```

---

### Task 7: Apply Reportable Rules To Client-Side Dashboard And Reports

**Files:**
- Modify: `components/Dashboard.tsx`
- Modify: `components/Reports.tsx`

- [ ] **Step 1: Update Dashboard calculations**

In `components/Dashboard.tsx`, replace:

```ts
import { filterActiveTransactions } from '../lib/voidedTransactions';
```

with:

```ts
import { filterReportableTransactions } from '../lib/reportableTransactions';
```

Replace:

```ts
const activeTransactions = useMemo(() => filterActiveTransactions(transactions), [transactions]);
```

with:

```ts
const activeTransactions = useMemo(
  () => filterReportableTransactions(transactions),
  [transactions]
);
```

- [ ] **Step 2: Update AI Reports content calculations**

In `components/Reports.tsx`, find:

```ts
const activeTransactions = filterActiveTransactions(transactions);
```

Replace it with:

```ts
const activeTransactions = filterReportableTransactions(transactions);
```

Update the import:

```ts
import { filterReportableTransactions } from '../lib/reportableTransactions';
```

Keep `filterActiveTransactions` imported only if another section still needs it for non-report transaction display.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/Dashboard.tsx components/Reports.tsx
git commit -m "fix: exclude banking deposits from client reports"
```

---

### Task 8: Build Cash/Cheque Banking UI Component

**Files:**
- Create: `components/CashChequeBanking.tsx`
- Modify: `components/TransactionManager.tsx`

- [ ] **Step 1: Create the UI component skeleton**

Create `components/CashChequeBanking.tsx`:

```tsx
import React, { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, Loader2, Search, X } from "lucide-react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { AppUser, Fund } from "../types";
import {
  calculateReconciliationSummary,
  normalizeBankTransactionSplits,
  BankingMedium,
} from "../lib/cashChequeBanking";

type CashChequeBankingProps = {
  funds: Fund[];
  currentUser: AppUser;
};

type SelectedBankCredit = {
  transactionId: string;
  amount: number;
  medium: BankingMedium;
  cashAmount: string;
  chequeAmount: string;
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amount);

const parseMoney = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const varianceOptions = [
  { value: "partial_banking", label: "Partial banking" },
  { value: "petty_cash_retained_or_spent", label: "Petty cash retained/spent" },
  { value: "bank_counting_difference", label: "Bank/counting difference" },
  { value: "cheque_timing", label: "Cheque timing" },
  { value: "other", label: "Other" },
] as const;

const CashChequeBanking: React.FC<CashChequeBankingProps> = ({
  funds,
  currentUser,
}) => {
  const canEdit = ["Admin", "Finance Team"].includes(currentUser.role);
  const awaitingCollections =
    useQuery(api.queries.cashBankingReconciliations.getAwaitingBanking, {}) ?? [];
  const candidateBankCredits =
    useQuery(api.queries.cashBankingReconciliations.getCandidateBankCredits, {}) ?? [];
  const createDraft = useMutation(api.mutations.cashBankingReconciliations.createDraft);
  const updateDraft = useMutation(api.mutations.cashBankingReconciliations.updateDraft);
  const completeReconciliation = useMutation(api.mutations.cashBankingReconciliations.complete);

  const [selectedCollectionIds, setSelectedCollectionIds] = useState<Set<string>>(new Set());
  const [selectedBankCredits, setSelectedBankCredits] = useState<SelectedBankCredit[]>([]);
  const [varianceType, setVarianceType] = useState<string>("");
  const [varianceNote, setVarianceNote] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCollections = awaitingCollections.filter((collection) =>
    selectedCollectionIds.has(collection._id)
  );

  const filteredBankCredits = candidateBankCredits.filter((transaction) => {
    if (!searchTerm.trim()) return true;
    return transaction.description.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const collectionSplits = selectedCollections.map((collection) => ({
    cashCollectionId: collection._id,
    cashAmount: collection.openCashAmount,
    chequeAmount: collection.openChequeAmount,
  }));

  const bankTransactionSplits = useMemo(() => {
    return normalizeBankTransactionSplits(
      selectedBankCredits.map((credit) => ({
        transactionId: credit.transactionId,
        transactionAmount: credit.amount,
        medium: credit.medium,
        cashAmount: parseMoney(credit.cashAmount),
        chequeAmount: parseMoney(credit.chequeAmount),
      }))
    );
  }, [selectedBankCredits]);

  const summary = calculateReconciliationSummary({
    collectionSplits,
    bankTransactionSplits,
  });

  const toggleCollection = (collectionId: string) => {
    setSelectedCollectionIds((current) => {
      const next = new Set(current);
      if (next.has(collectionId)) next.delete(collectionId);
      else next.add(collectionId);
      return next;
    });
  };

  const toggleBankCredit = (transaction: { _id: string; amount: number }) => {
    setSelectedBankCredits((current) => {
      if (current.some((credit) => credit.transactionId === transaction._id)) {
        return current.filter((credit) => credit.transactionId !== transaction._id);
      }
      return [
        ...current,
        {
          transactionId: transaction._id,
          amount: transaction.amount,
          medium: "cash",
          cashAmount: transaction.amount.toFixed(2),
          chequeAmount: "",
        },
      ];
    });
  };

  const updateBankCredit = (
    transactionId: string,
    updates: Partial<SelectedBankCredit>
  ) => {
    setSelectedBankCredits((current) =>
      current.map((credit) =>
        credit.transactionId === transactionId ? { ...credit, ...updates } : credit
      )
    );
  };

  const handleComplete = async () => {
    setError(null);
    if (!canEdit) return;
    if (selectedCollections.length === 0 || selectedBankCredits.length === 0) {
      setError("Select at least one collection and one bank credit.");
      return;
    }
    if (summary.varianceAmount !== 0 && (!varianceType || varianceNote.trim().length < 3)) {
      setError("Choose a variance type and add a note.");
      return;
    }

    setIsSubmitting(true);
    try {
      const reconciliationId = await createDraft({});
      await updateDraft({
        reconciliationId,
        cashCollectionSplits: collectionSplits.map((split) => ({
          cashCollectionId: split.cashCollectionId as Id<"cashCollections">,
          cashAmount: split.cashAmount,
          chequeAmount: split.chequeAmount,
        })),
        bankTransactionSplits: selectedBankCredits.map((credit) => ({
          transactionId: credit.transactionId as Id<"transactions">,
          transactionAmount: credit.amount,
          medium: credit.medium,
          cashAmount: parseMoney(credit.cashAmount),
          chequeAmount: parseMoney(credit.chequeAmount),
        })),
        varianceType: varianceType || undefined,
        varianceNote: varianceNote.trim() || undefined,
      });
      await completeReconciliation({ reconciliationId });
      setSelectedCollectionIds(new Set());
      setSelectedBankCredits([]);
      setVarianceType("");
      setVarianceNote("");
    } catch (err: any) {
      setError(err.message || "Failed to complete reconciliation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="swiss-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-wide text-grey-mid">Awaiting Cash</div>
          <div className="mt-1 font-mono text-lg font-bold">{formatCurrency(awaitingCollections.reduce((sum, c) => sum + c.openCashAmount, 0))}</div>
        </div>
        <div className="swiss-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-wide text-grey-mid">Awaiting Cheques</div>
          <div className="mt-1 font-mono text-lg font-bold">{formatCurrency(awaitingCollections.reduce((sum, c) => sum + c.openChequeAmount, 0))}</div>
        </div>
        <div className="swiss-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-wide text-grey-mid">Selected Expected</div>
          <div className="mt-1 font-mono text-lg font-bold">{formatCurrency(summary.expectedTotal)}</div>
        </div>
        <div className="swiss-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-wide text-grey-mid">Selected Banked</div>
          <div className="mt-1 font-mono text-lg font-bold">{formatCurrency(summary.bankedTotal)}</div>
        </div>
        <div className="swiss-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-wide text-grey-mid">Variance</div>
          <div className={`mt-1 font-mono text-lg font-bold ${summary.varianceAmount === 0 ? "text-sage" : "text-error"}`}>{formatCurrency(summary.varianceAmount)}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="swiss-card overflow-hidden">
          <div className="p-4 border-b border-ledger bg-paper">
            <h3 className="text-xs font-bold uppercase tracking-wide">Collections Awaiting Banking</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full ledger-table text-left">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-xs"></th>
                  <th className="px-4 py-2 text-xs">Week</th>
                  <th className="px-4 py-2 text-xs text-right">Cash</th>
                  <th className="px-4 py-2 text-xs text-right">Cheque</th>
                  <th className="px-4 py-2 text-xs text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {awaitingCollections.map((collection) => (
                  <tr key={collection._id}>
                    <td className="px-4 py-2">
                      <input type="checkbox" checked={selectedCollectionIds.has(collection._id)} onChange={() => toggleCollection(collection._id)} />
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{collection.weekEndingDate}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatCurrency(collection.openCashAmount)}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatCurrency(collection.openChequeAmount)}</td>
                    <td className="px-4 py-2 text-right font-mono font-bold">{formatCurrency(collection.openTotal)}</td>
                  </tr>
                ))}
                {awaitingCollections.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-sm text-grey-mid">No collections awaiting banking.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="swiss-card overflow-hidden">
          <div className="p-4 border-b border-ledger bg-paper flex items-center gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wide">Bank Credits</h3>
            <div className="relative ml-auto">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-grey-mid" />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="pl-7 pr-2 py-1 border border-ledger rounded text-xs" placeholder="Search credits" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full ledger-table text-left">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-xs"></th>
                  <th className="px-4 py-2 text-xs">Date</th>
                  <th className="px-4 py-2 text-xs">Description</th>
                  <th className="px-4 py-2 text-xs text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredBankCredits.map((transaction) => (
                  <tr key={transaction._id}>
                    <td className="px-4 py-2">
                      <input type="checkbox" checked={selectedBankCredits.some((credit) => credit.transactionId === transaction._id)} onChange={() => toggleBankCredit(transaction)} />
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{transaction.date}</td>
                    <td className="px-4 py-2 text-sm max-w-[260px] truncate">{transaction.description}</td>
                    <td className="px-4 py-2 text-right font-mono font-bold">{formatCurrency(transaction.amount)}</td>
                  </tr>
                ))}
                {filteredBankCredits.length === 0 && (
                  <tr><td colSpan={4} className="p-8 text-center text-sm text-grey-mid">No candidate bank credits found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {selectedBankCredits.length > 0 && (
        <div className="swiss-card p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide">Reconciliation Basket</h3>
          {selectedBankCredits.map((credit) => (
            <div key={credit.transactionId} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
              <div className="font-mono text-xs">{credit.transactionId}</div>
              <select value={credit.medium} onChange={(event) => updateBankCredit(credit.transactionId, { medium: event.target.value as BankingMedium })} className="border border-ledger rounded px-2 py-1 text-xs">
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
                <option value="mixed">Mixed</option>
              </select>
              <input value={credit.cashAmount} onChange={(event) => updateBankCredit(credit.transactionId, { cashAmount: event.target.value })} className="border border-ledger rounded px-2 py-1 text-xs font-mono" placeholder="Cash" disabled={credit.medium === "cheque"} />
              <input value={credit.chequeAmount} onChange={(event) => updateBankCredit(credit.transactionId, { chequeAmount: event.target.value })} className="border border-ledger rounded px-2 py-1 text-xs font-mono" placeholder="Cheque" disabled={credit.medium === "cash"} />
              <button type="button" onClick={() => toggleBankCredit({ _id: credit.transactionId, amount: credit.amount })} className="justify-self-end text-grey-mid hover:text-error"><X size={14} /></button>
            </div>
          ))}
          {summary.varianceAmount !== 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select value={varianceType} onChange={(event) => setVarianceType(event.target.value)} className="border border-ledger rounded px-3 py-2 text-sm">
                <option value="">Variance type...</option>
                {varianceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <input value={varianceNote} onChange={(event) => setVarianceNote(event.target.value)} className="border border-ledger rounded px-3 py-2 text-sm" placeholder="Variance note" />
            </div>
          )}
          {error && <div className="text-sm text-error">{error}</div>}
          <div className="flex justify-end">
            <button type="button" onClick={handleComplete} disabled={!canEdit || isSubmitting} className="btn-primary flex items-center gap-2">
              {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Complete Reconciliation
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashChequeBanking;
```

- [ ] **Step 2: Add TransactionManager tab**

In `components/TransactionManager.tsx`, import:

```ts
import CashChequeBanking from "./CashChequeBanking";
```

Update tab state:

```ts
const [activeTransactionTab, setActiveTransactionTab] =
  useState<'all' | 'inPerson' | 'cashChequeBanking'>('all');
```

Add a tab button beside In-Person Giving:

```tsx
<button
  type="button"
  onClick={() => setActiveTransactionTab('cashChequeBanking')}
  className={`px-4 py-2 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors ${
    activeTransactionTab === 'cashChequeBanking'
      ? 'border-ink text-ink'
      : 'border-transparent text-grey-mid hover:text-ink'
  }`}
>
  Cash/cheque Banking
</button>
```

Render the new tab after the In-Person Giving block:

```tsx
{activeTransactionTab === 'cashChequeBanking' && (
  <CashChequeBanking funds={funds} currentUser={currentUser} />
)}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS. If the generated Convex API does not include the new query/mutation names, run `npx convex codegen` and retry.

- [ ] **Step 4: Commit**

```bash
git add components/CashChequeBanking.tsx components/TransactionManager.tsx convex/_generated
git commit -m "feat: add cash cheque banking tab"
```

---

### Task 9: Polish Reconciliation Completion Behavior

**Files:**
- Modify: `components/CashChequeBanking.tsx`
- Modify: `convex/mutations/cashBankingReconciliations.ts`
- Modify: `convex/queries/cashBankingReconciliations.ts`

- [ ] **Step 1: Add selected collection split controls**

In `components/CashChequeBanking.tsx`, replace the fixed `collectionSplits` calculation with state that allows a partial amount per collection:

```ts
const [collectionSplitOverrides, setCollectionSplitOverrides] = useState<
  Record<string, { cashAmount: string; chequeAmount: string }>
>({});

const collectionSplits = selectedCollections.map((collection) => {
  const override = collectionSplitOverrides[collection._id];
  return {
    cashCollectionId: collection._id,
    cashAmount: override ? parseMoney(override.cashAmount) : collection.openCashAmount,
    chequeAmount: override ? parseMoney(override.chequeAmount) : collection.openChequeAmount,
  };
});
```

In the reconciliation basket, add editable selected collection rows before selected bank credits:

```tsx
{selectedCollections.map((collection) => {
  const override = collectionSplitOverrides[collection._id];
  return (
    <div key={collection._id} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
      <div className="text-xs font-mono">{collection.weekEndingDate}</div>
      <input
        value={override?.cashAmount ?? collection.openCashAmount.toFixed(2)}
        onChange={(event) =>
          setCollectionSplitOverrides((current) => ({
            ...current,
            [collection._id]: {
              cashAmount: event.target.value,
              chequeAmount:
                current[collection._id]?.chequeAmount ??
                collection.openChequeAmount.toFixed(2),
            },
          }))
        }
        className="border border-ledger rounded px-2 py-1 text-xs font-mono"
      />
      <input
        value={override?.chequeAmount ?? collection.openChequeAmount.toFixed(2)}
        onChange={(event) =>
          setCollectionSplitOverrides((current) => ({
            ...current,
            [collection._id]: {
              cashAmount:
                current[collection._id]?.cashAmount ??
                collection.openCashAmount.toFixed(2),
              chequeAmount: event.target.value,
            },
          }))
        }
        className="border border-ledger rounded px-2 py-1 text-xs font-mono"
      />
      <div className="text-right text-xs text-grey-mid">Collection split</div>
    </div>
  );
})}
```

- [ ] **Step 2: Backend reject collection split exceeding open amount**

In `convex/mutations/cashBankingReconciliations.ts`, add a helper that sums completed splits and compares requested split to expected totals:

```ts
async function assertCollectionSplitsDoNotExceedExpected(
  ctx: any,
  organizationId: Id<"organizations">,
  splits: Array<{
    cashCollectionId: Id<"cashCollections">;
    cashAmount: number;
    chequeAmount: number;
  }>,
  reconciliationId?: Id<"cashBankingReconciliations">
) {
  const allTransactions = await ctx.db
    .query("transactions")
    .withIndex("by_organization", (q: any) => q.eq("organizationId", organizationId))
    .collect();
  const reconciliations = await ctx.db
    .query("cashBankingReconciliations")
    .withIndex("by_organization", (q: any) => q.eq("organizationId", organizationId))
    .collect();

  for (const split of splits) {
    const expected = calculateCollectionBankingTotals(
      split.cashCollectionId,
      allTransactions
    );
    const previous = reconciliations
      .filter(
        (reconciliation: any) =>
          reconciliation.status === "completed" &&
          reconciliation._id !== reconciliationId
      )
      .flatMap((reconciliation: any) => reconciliation.cashCollectionSplits)
      .filter((previousSplit: any) => previousSplit.cashCollectionId === split.cashCollectionId)
      .reduce(
        (acc: any, previousSplit: any) => ({
          cashAmount: acc.cashAmount + previousSplit.cashAmount,
          chequeAmount: acc.chequeAmount + previousSplit.chequeAmount,
        }),
        { cashAmount: 0, chequeAmount: 0 }
      );

    if (previous.cashAmount + split.cashAmount > expected.cashAmount) {
      throw new Error("Cash split exceeds the collection open cash amount");
    }
    if (previous.chequeAmount + split.chequeAmount > expected.chequeAmount) {
      throw new Error("Cheque split exceeds the collection open cheque amount");
    }
  }
}
```

Call this helper from `updateDraft` after `assertCollectionsBelongToOrganization`.

- [ ] **Step 3: Update collection statuses on completion**

In `complete`, derive each collection status from all completed splits plus the current split instead of using variance:

```ts
const allCompletedReconciliations = await ctx.db
  .query("cashBankingReconciliations")
  .withIndex("by_organization", (q) => q.eq("organizationId", user.organizationId))
  .collect();
const expected = calculateCollectionBankingTotals(collectionId, sourceTransactions);
const previousSplit = allCompletedReconciliations
  .filter(
    (completedReconciliation) =>
      completedReconciliation.status === "completed" &&
      completedReconciliation._id !== args.reconciliationId
  )
  .flatMap((completedReconciliation) => completedReconciliation.cashCollectionSplits)
  .filter((split) => split.cashCollectionId === collectionId)
  .reduce(
    (acc, split) => ({
      cashAmount: acc.cashAmount + split.cashAmount,
      chequeAmount: acc.chequeAmount + split.chequeAmount,
    }),
    { cashAmount: 0, chequeAmount: 0 }
  );
const currentSplit = reconciliation.cashCollectionSplits
  .filter((split) => split.cashCollectionId === collectionId)
  .reduce(
    (acc, split) => ({
      cashAmount: acc.cashAmount + split.cashAmount,
      chequeAmount: acc.chequeAmount + split.chequeAmount,
    }),
    { cashAmount: 0, chequeAmount: 0 }
  );
const bankedTotal =
  previousSplit.cashAmount +
  previousSplit.chequeAmount +
  currentSplit.cashAmount +
  currentSplit.chequeAmount;
const status = getCollectionBankingStatus(expected.totalAmount, bankedTotal);

await ctx.db.patch(collectionId, {
  cashBankingLastReconciliationId: args.reconciliationId,
  cashBankingStatus: status,
});
```

Import `calculateCollectionBankingTotals` and `getCollectionBankingStatus` from `../../lib/cashChequeBanking`.

- [ ] **Step 4: Run verification**

Run:

```bash
npm test -- tests/cashChequeBanking.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/CashChequeBanking.tsx convex/mutations/cashBankingReconciliations.ts convex/queries/cashBankingReconciliations.ts
git commit -m "feat: support partial collection banking splits"
```

---

### Task 10: Verify Locally In Browser

**Files:**
- No planned source edits unless verification reveals a defect.

- [ ] **Step 1: Run full automated checks**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 2: Start dev servers**

Run Vite:

```bash
npm run dev
```

Run Convex in a second terminal:

```bash
npx convex dev
```

Expected:

- Vite serves on `http://localhost:3000`.
- Convex dev server connects without schema errors.

- [ ] **Step 3: Browser verification**

Open `http://localhost:3000`, sign in with the existing local dev account, and verify:

- Transactions page has three tabs.
- Cash/cheque Banking tab loads.
- Awaiting Banking excludes PDQ/card amounts.
- Bank Credits shows existing income/credit rows not linked to cash collections.
- Selecting one collection and one matching bank credit shows zero variance.
- Completing reconciliation labels the bank credit Cash/cheque banking.
- All Transactions still shows the bank credit and original giving.
- Dashboard/report totals do not increase by the linked bank credit.

- [ ] **Step 4: Fix only verified defects**

For each defect found, make the smallest focused change, then run:

```bash
npm run typecheck
npm run build
```

Expected: PASS after each fix.

- [ ] **Step 5: Commit verification fixes**

If source changed:

```bash
git add <changed-files>
git commit -m "fix: polish cash cheque banking reconciliation"
```

If no source changed, do not create an empty commit.

---

## Final Verification Before Completion

Run:

```bash
npm test
npm run typecheck
npm run build
git status --short
```

Expected:

- all tests pass
- typecheck passes
- production build passes
- `git status --short` shows only intentional untracked local artifacts, if any

After v1 implementation is committed, ask the user:

> Do you want me to design and implement a separate historical migration/backfill for old counter deposits that were previously double-counted or voided?

Do not ask this before v1 is implemented and committed.
