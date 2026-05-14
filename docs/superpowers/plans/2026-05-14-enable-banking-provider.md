# Enable Banking Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the active Plaid flow with a provider-neutral bank connections layer backed by Enable Banking for manual Metro Bank transaction sync.

**Architecture:** Add a new `bankConnections` data model and generic Convex API surface, with Enable Banking isolated in backend helper modules. Keep the existing review-before-import UI flow: bank sync returns normalized pending transactions and does not write ledger transactions directly. Leave Plaid files and dependencies in place until the Metro flow is validated, but move active UI and sync calls to `bankConnections`.

**Tech Stack:** React 19, TypeScript, Vite, Convex, Clerk auth, `jose` for RS256 JWT signing, Vitest for pure helper tests.

---

## File Structure

- Create `convex/lib/bankConnectionUtils.ts`: pure helper functions and shared types for sync ranges, state expiry validation, and Enable Banking transaction normalization.
- Create `tests/bankConnectionUtils.test.ts`: unit tests for helper behavior.
- Modify `convex/schema.ts`: add `bankConnections` and `pendingBankConnections` tables.
- Create `convex/lib/enableBanking.ts`: Enable Banking JWT generation and HTTP API client.
- Create `convex/mutations/bankConnections.ts`: internal lifecycle mutations plus user-facing fund mapping mutation.
- Create `convex/queries/bankConnections.ts`: list, attention, and active mapped connection queries.
- Create `convex/actions/bankConnections.ts`: start connection, sync transactions, and remove connection actions.
- Modify `convex/http.ts`: add `/enable-banking/callback` route.
- Modify `components/BankConnectionsSettings.tsx`: swap Plaid-specific actions/queries/hook for bank connection APIs.
- Modify `components/TransactionManager.tsx`: swap Plaid sync query/action for generic bank connection APIs.
- Modify `AGENTS.md`, `CLAUDE.md`, and `convex/README.md`: update environment variable and architecture references from Plaid-only wording to provider-neutral banking wording.

---

### Task 1: Add Pure Helper Tests

**Files:**
- Create: `tests/bankConnectionUtils.test.ts`
- Create: `convex/lib/bankConnectionUtils.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `tests/bankConnectionUtils.test.ts` with:

```typescript
import { describe, expect, it } from "vitest";
import {
  calculateDefaultSyncRange,
  isPendingStateExpired,
  normalizeEnableBankingTransaction,
} from "../convex/lib/bankConnectionUtils";

describe("bank connection utils", () => {
  it("uses the day after lastSyncedThrough as the next sync start", () => {
    expect(
      calculateDefaultSyncRange({
        today: "2026-05-14",
        lastSyncedThrough: "2026-05-10",
      })
    ).toEqual({
      dateFrom: "2026-05-11",
      dateTo: "2026-05-14",
    });
  });

  it("falls back to the last 30 days for a new connection", () => {
    expect(
      calculateDefaultSyncRange({
        today: "2026-05-14",
      })
    ).toEqual({
      dateFrom: "2026-04-14",
      dateTo: "2026-05-14",
    });
  });

  it("detects expired pending connection state", () => {
    expect(isPendingStateExpired({ now: 1000, expiresAt: 1000 })).toBe(true);
    expect(isPendingStateExpired({ now: 999, expiresAt: 1000 })).toBe(false);
  });

  it("normalizes a credit transaction as income", () => {
    const normalized = normalizeEnableBankingTransaction({
      transaction: {
        entry_reference: "credit-1",
        booking_date: "2026-05-13",
        credit_debit_indicator: "CRDT",
        amount: { amount: "125.50", currency: "GBP" },
        remittance_information: "Sunday giving",
      },
      accountId: "account-1",
      accountName: "Metro Current",
      fundId: "fund-1",
    });

    expect(normalized).toEqual({
      date: "2026-05-13",
      description: "Sunday giving",
      amount: 125.5,
      type: "Income",
      accountId: "account-1",
      accountName: "Metro Current",
      fundId: "fund-1",
      providerTransactionId: "credit-1",
    });
  });

  it("normalizes a debit transaction as expenditure", () => {
    const normalized = normalizeEnableBankingTransaction({
      transaction: {
        transaction_id: "debit-1",
        value_date: "2026-05-12",
        credit_debit_indicator: "DBIT",
        transaction_amount: { amount: "49.99", currency: "GBP" },
        remittance_information: ["Stationery", "Invoice 123"],
      },
      accountId: "account-1",
      accountName: "Metro Current",
      fundId: null,
    });

    expect(normalized).toEqual({
      date: "2026-05-12",
      description: "Stationery Invoice 123",
      amount: 49.99,
      type: "Expenditure",
      accountId: "account-1",
      accountName: "Metro Current",
      fundId: null,
      providerTransactionId: "debit-1",
    });
  });

  it("falls back to transaction sign when the credit debit indicator is missing", () => {
    const income = normalizeEnableBankingTransaction({
      transaction: {
        transaction_id: "signed-income-1",
        booking_date: "2026-05-12",
        amount: { amount: "-25.00", currency: "GBP" },
      },
      accountId: "account-1",
      accountName: "Metro Current",
      fundId: null,
    });

    const expenditure = normalizeEnableBankingTransaction({
      transaction: {
        transaction_id: "signed-expenditure-1",
        booking_date: "2026-05-12",
        amount: { amount: "25.00", currency: "GBP" },
      },
      accountId: "account-1",
      accountName: "Metro Current",
      fundId: null,
    });

    expect(income.type).toBe("Income");
    expect(income.amount).toBe(25);
    expect(expenditure.type).toBe("Expenditure");
    expect(expenditure.amount).toBe(25);
  });

  it("falls back to a default description for whitespace-only descriptions", () => {
    const normalized = normalizeEnableBankingTransaction({
      transaction: {
        transaction_id: "blank-description-1",
        booking_date: "2026-05-12",
        credit_debit_indicator: "CRDT",
        amount: { amount: "10.00", currency: "GBP" },
        remittance_information: "   ",
      },
      accountId: "account-1",
      accountName: "Metro Current",
      fundId: null,
    });

    expect(normalized.description).toBe("Bank transaction");
  });

  it("rejects transactions without a usable date", () => {
    expect(() =>
      normalizeEnableBankingTransaction({
        transaction: {
          entry_reference: "missing-date",
          credit_debit_indicator: "CRDT",
          amount: { amount: "10.00", currency: "GBP" },
        },
        accountId: "account-1",
        accountName: "Metro Current",
        fundId: null,
      })
    ).toThrow("Enable Banking transaction is missing a date");
  });

  it("rejects transactions with a malformed date", () => {
    expect(() =>
      normalizeEnableBankingTransaction({
        transaction: {
          entry_reference: "invalid-date",
          booking_date: "13/05/2026",
          credit_debit_indicator: "CRDT",
          amount: { amount: "10.00", currency: "GBP" },
        },
        accountId: "account-1",
        accountName: "Metro Current",
        fundId: null,
      })
    ).toThrow("Enable Banking transaction has an invalid date");
  });

  it("rejects transactions with malformed amount strings", () => {
    expect(() =>
      normalizeEnableBankingTransaction({
        transaction: {
          entry_reference: "malformed-amount",
          booking_date: "2026-05-13",
          credit_debit_indicator: "CRDT",
          amount: { amount: "12.34GBP", currency: "GBP" },
        },
        accountId: "account-1",
        accountName: "Metro Current",
        fundId: null,
      })
    ).toThrow("Enable Banking transaction has an invalid amount");
  });
});
```

- [ ] **Step 2: Add a minimal helper module so imports resolve**

Create `convex/lib/bankConnectionUtils.ts` with:

```typescript
export type ChurchCoinPendingBankTransaction = {
  date: string;
  description: string;
  amount: number;
  type: "Income" | "Expenditure";
  accountId: string;
  accountName: string;
  fundId: string | null;
  providerTransactionId: string;
};

export type EnableBankingAmount = {
  amount?: string | number;
  currency?: string;
};

export type EnableBankingTransactionLike = {
  entry_reference?: string;
  transaction_id?: string;
  booking_date?: string;
  value_date?: string;
  transaction_date?: string;
  credit_debit_indicator?: string;
  amount?: EnableBankingAmount;
  transaction_amount?: EnableBankingAmount;
  remittance_information?: string | string[];
  creditor_name?: string;
  debtor_name?: string;
  additional_information?: string;
};

export type CalculateSyncRangeArgs = {
  today: string;
  lastSyncedThrough?: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

export const addDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  return toIsoDate(new Date(date.getTime() + days * DAY_MS));
};

export const calculateDefaultSyncRange = ({
  today,
  lastSyncedThrough,
}: CalculateSyncRangeArgs) => ({
  dateFrom: lastSyncedThrough ? addDays(lastSyncedThrough, 1) : addDays(today, -30),
  dateTo: today,
});

export const isPendingStateExpired = ({
  expiresAt,
  now = Date.now(),
}: {
  expiresAt: number;
  now?: number;
}) => now >= expiresAt;

const getTransactionAmount = (transaction: EnableBankingTransactionLike) => {
  const rawAmount =
    transaction.amount?.amount ?? transaction.transaction_amount?.amount;
  const numericAmount =
    typeof rawAmount === "number"
      ? rawAmount
      : typeof rawAmount === "string" && rawAmount.trim() !== ""
        ? Number(rawAmount.trim())
        : Number.NaN;

  if (!Number.isFinite(numericAmount) || numericAmount === 0) {
    throw new Error("Enable Banking transaction has an invalid amount");
  }

  return numericAmount;
};

const getTransactionDescription = (transaction: EnableBankingTransactionLike) => {
  const normalizeDescription = (description?: string) => {
    const normalized = description?.trim();
    return normalized || undefined;
  };

  const remittance = transaction.remittance_information;
  if (Array.isArray(remittance)) {
    return (
      remittance.map((part) => part.trim()).filter(Boolean).join(" ") ||
      "Bank transaction"
    );
  }

  return (
    normalizeDescription(remittance) ||
    normalizeDescription(transaction.additional_information) ||
    normalizeDescription(transaction.creditor_name) ||
    normalizeDescription(transaction.debtor_name) ||
    "Bank transaction"
  );
};

const assertValidTransactionDate = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Enable Banking transaction has an invalid date");
  }

  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || toIsoDate(parsedDate) !== date) {
    throw new Error("Enable Banking transaction has an invalid date");
  }
};

const getTransactionType = (
  transaction: EnableBankingTransactionLike,
  amount: number
): "Income" | "Expenditure" => {
  const indicator = transaction.credit_debit_indicator?.toUpperCase();
  if (indicator === "CRDT" || indicator === "CREDIT") return "Income";
  if (indicator === "DBIT" || indicator === "DEBIT") return "Expenditure";
  return amount < 0 ? "Income" : "Expenditure";
};

export const normalizeEnableBankingTransaction = ({
  transaction,
  accountId,
  accountName,
  fundId,
}: {
  transaction: EnableBankingTransactionLike;
  accountId: string;
  accountName: string;
  fundId?: string | null;
}): ChurchCoinPendingBankTransaction => {
  const date =
    transaction.booking_date ||
    transaction.value_date ||
    transaction.transaction_date;
  if (!date) {
    throw new Error("Enable Banking transaction is missing a date");
  }
  assertValidTransactionDate(date);

  const amount = getTransactionAmount(transaction);
  const providerTransactionId =
    transaction.entry_reference || transaction.transaction_id;
  if (!providerTransactionId) {
    throw new Error("Enable Banking transaction is missing an identifier");
  }

  return {
    date,
    description: getTransactionDescription(transaction),
    amount: Math.abs(amount),
    type: getTransactionType(transaction, amount),
    accountId,
    accountName,
    fundId: fundId ?? null,
    providerTransactionId,
  };
};
```

- [ ] **Step 3: Run the helper tests**

Run:

```bash
npm test -- tests/bankConnectionUtils.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add convex/lib/bankConnectionUtils.ts tests/bankConnectionUtils.test.ts
git commit -m "test: add bank connection helper coverage"
```

---

### Task 2: Add Bank Connection Schema

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Add provider-neutral tables after `plaidItems`**

In `convex/schema.ts`, after the existing `plaidItems` table definition and before `categorizationCorrections`, insert:

```typescript
  // Provider-neutral bank connections
  bankConnections: defineTable({
    organizationId: v.id("organizations"),
    provider: v.union(v.literal("enable_banking")),
    providerConnectionId: v.string(),
    institutionName: v.string(),
    institutionCountry: v.string(),
    accounts: v.array(
      v.object({
        accountId: v.string(),
        providerAccountHash: v.optional(v.string()),
        providerAccountHashes: v.optional(v.array(v.string())),
        name: v.string(),
        mask: v.optional(v.string()),
        type: v.optional(v.string()),
        currency: v.optional(v.string()),
        fundId: v.optional(v.id("funds")),
      })
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("error"),
      v.literal("consent_expired"),
      v.literal("pending_reauth")
    ),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
    lastSyncedThrough: v.optional(v.string()),
    consentExpiresAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_provider_connection", ["provider", "providerConnectionId"])
    .index("by_organization_status", ["organizationId", "status"]),

  pendingBankConnections: defineTable({
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
    provider: v.union(v.literal("enable_banking")),
    state: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("error")
    ),
    aspspCountry: v.string(),
    aspspName: v.string(),
    existingConnectionId: v.optional(v.id("bankConnections")),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_state", ["state"])
    .index("by_organization", ["organizationId"])
    .index("by_organization_status", ["organizationId", "status"]),
```

- [ ] **Step 2: Generate Convex types**

Run:

```bash
npx convex codegen
```

Expected: `convex/_generated/dataModel.d.ts` includes `bankConnections` and `pendingBankConnections`. Do not manually edit generated files.

- [ ] **Step 3: Run TypeScript**

Run:

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat: add provider-neutral bank connection schema"
```

---

### Task 3: Add Enable Banking API Client

**Files:**
- Create: `convex/lib/enableBanking.ts`

- [ ] **Step 1: Create the Enable Banking client module**

Create `convex/lib/enableBanking.ts` with:

```typescript
import { importPKCS8, SignJWT } from "jose";

type EnableBankingAccount = {
  uid: string;
  identification_hash?: string;
  identification_hashes?: string[];
  name?: string;
  details?: {
    name?: string;
    currency?: string;
    product?: string;
    cash_account_type?: string;
    iban?: string;
    bban?: string;
  };
};

type StartAuthorizationArgs = {
  state: string;
  aspspCountry: string;
  aspspName: string;
  redirectUrl: string;
  validUntil: string;
};

export type EnableBankingSessionResponse = {
  session_id: string;
  accounts: EnableBankingAccount[];
  psu_id_hash?: string;
};

export type EnableBankingStartAuthorizationResponse = {
  url: string;
  authorization_id?: string;
  psu_id_hash?: string;
};

export type EnableBankingTransactionsResponse = {
  transactions: unknown[];
  continuation_key?: string | null;
};

export class EnableBankingApiError extends Error {
  status: number;
  statusText?: string;

  constructor(status: number, statusText?: string) {
    super(
      `Enable Banking API request failed with status ${status}${
        statusText ? ` ${statusText}` : ""
      }`
    );
    this.name = "EnableBankingApiError";
    this.status = status;
    this.statusText = statusText;
  }
}

const getRequiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} not configured`);
  }
  return value;
};

const getApiBaseUrl = () =>
  process.env.ENABLE_BANKING_API_BASE_URL || "https://api.enablebanking.com";

const normalizePrivateKey = (key: string) =>
  key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;

export const createEnableBankingJwt = async () => {
  const applicationId = getRequiredEnv("ENABLE_BANKING_APPLICATION_ID");
  const privateKey = normalizePrivateKey(
    getRequiredEnv("ENABLE_BANKING_PRIVATE_KEY")
  );
  const key = await importPKCS8(privateKey, "RS256");
  const now = Math.floor(Date.now() / 1000);

  return await new SignJWT({})
    .setProtectedHeader({
      typ: "JWT",
      alg: "RS256",
      kid: applicationId,
    })
    .setIssuer("enablebanking.com")
    .setAudience("api.enablebanking.com")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
};

const enableBankingRequest = async <T>(
  path: string,
  init: RequestInit = {}
): Promise<T> => {
  const jwt = await createEnableBankingJwt();
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${jwt}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new EnableBankingApiError(
      response.status,
      response.statusText || undefined
    );
  }

  return (await response.json()) as T;
};

export const getEnableBankingDefaults = () => ({
  aspspCountry: process.env.ENABLE_BANKING_DEFAULT_COUNTRY || "GB",
  aspspName: process.env.ENABLE_BANKING_DEFAULT_ASPSP || "Metro Bank",
  redirectUrl: getRequiredEnv("ENABLE_BANKING_REDIRECT_URL"),
});

export const getConsentValidUntil = (days = 90) => {
  const validUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return validUntil.toISOString();
};

export const startAuthorization = async ({
  state,
  aspspCountry,
  aspspName,
  redirectUrl,
  validUntil,
}: StartAuthorizationArgs) =>
  await enableBankingRequest<EnableBankingStartAuthorizationResponse>("/auth", {
    method: "POST",
    body: JSON.stringify({
      access: {
        balances: true,
        transactions: true,
        valid_until: validUntil,
      },
      aspsp: {
        country: aspspCountry,
        name: aspspName,
      },
      psu_type: "business",
      redirect_url: redirectUrl,
      state,
    }),
  });

export const authorizeSession = async (code: string) =>
  await enableBankingRequest<EnableBankingSessionResponse>("/sessions", {
    method: "POST",
    body: JSON.stringify({ code }),
  });

export const getAccountTransactions = async ({
  accountId,
  dateFrom,
  dateTo,
  continuationKey,
}: {
  accountId: string;
  dateFrom: string;
  dateTo: string;
  continuationKey?: string;
}) => {
  const params = new URLSearchParams({
    date_from: dateFrom,
    date_to: dateTo,
  });
  if (continuationKey != null) {
    params.set("continuation_key", continuationKey);
  }

  return await enableBankingRequest<EnableBankingTransactionsResponse>(
    `/accounts/${encodeURIComponent(accountId)}/transactions?${params}`
  );
};

export const closeSession = async (sessionId: string) =>
  await enableBankingRequest<{ message: string }>(
    `/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" }
  );
```

- [ ] **Step 2: Run TypeScript**

Run:

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add convex/lib/enableBanking.ts
git commit -m "feat: add Enable Banking API client"
```

---

### Task 4: Add Bank Connection Mutations

**Files:**
- Create: `convex/mutations/bankConnections.ts`

- [ ] **Step 1: Create lifecycle and mapping mutations**

Create `convex/mutations/bankConnections.ts` with:

```typescript
import { internalMutation, mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

const providerSchema = v.literal("enable_banking");

const statusSchema = v.union(
  v.literal("pending"),
  v.literal("active"),
  v.literal("error"),
  v.literal("consent_expired"),
  v.literal("pending_reauth")
);

const accountSchema = v.object({
  accountId: v.string(),
  providerAccountHash: v.optional(v.string()),
  providerAccountHashes: v.optional(v.array(v.string())),
  name: v.string(),
  mask: v.optional(v.string()),
  type: v.optional(v.string()),
  currency: v.optional(v.string()),
  fundId: v.optional(v.id("funds")),
});

export const createPending = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
    provider: providerSchema,
    state: v.string(),
    aspspCountry: v.string(),
    aspspName: v.string(),
    existingConnectionId: v.optional(v.id("bankConnections")),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("pendingBankConnections", {
      ...args,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const markPendingError = internalMutation({
  args: {
    state: v.string(),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("pendingBankConnections")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();

    if (!pending) return null;

    await ctx.db.patch(pending._id, {
      status: "error",
      errorCode: args.errorCode,
      errorMessage: args.errorMessage,
      updatedAt: Date.now(),
    });

    return pending._id;
  },
});

export const completePending = internalMutation({
  args: {
    state: v.string(),
    providerConnectionId: v.string(),
    accounts: v.array(accountSchema),
    consentExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("pendingBankConnections")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();

    if (!pending || pending.status !== "pending") {
      throw new Error("Pending bank connection not found");
    }

    const now = Date.now();
    let connectionId = pending.existingConnectionId;

    if (!connectionId) {
      const firstHash = args.accounts
        .flatMap((account) => account.providerAccountHashes || [])
        .concat(args.accounts.map((account) => account.providerAccountHash || ""))
        .filter(Boolean)[0];

      if (firstHash) {
        const existingConnections = await ctx.db
          .query("bankConnections")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", pending.organizationId)
          )
          .collect();

        const match = existingConnections.find((connection) =>
          connection.accounts.some((account) =>
            [account.providerAccountHash, ...(account.providerAccountHashes || [])]
              .filter(Boolean)
              .includes(firstHash)
          )
        );
        connectionId = match?._id;
      }
    }

    if (connectionId) {
      const existing = await ctx.db.get(connectionId);
      if (!existing || existing.organizationId !== pending.organizationId) {
        throw new Error("Existing bank connection not found");
      }

      await ctx.db.patch(connectionId, {
        providerConnectionId: args.providerConnectionId,
        institutionName: pending.aspspName,
        institutionCountry: pending.aspspCountry,
        accounts: args.accounts.map((account) => {
          const previous = existing.accounts.find(
            (existingAccount) =>
              existingAccount.accountId === account.accountId ||
              (account.providerAccountHash &&
                [
                  existingAccount.providerAccountHash,
                  ...(existingAccount.providerAccountHashes || []),
                ]
                  .filter(Boolean)
                  .includes(account.providerAccountHash))
          );
          return {
            ...account,
            fundId: previous?.fundId,
          };
        }),
        status: "active",
        errorCode: undefined,
        errorMessage: undefined,
        consentExpiresAt: args.consentExpiresAt,
        updatedAt: now,
      });
    } else {
      connectionId = await ctx.db.insert("bankConnections", {
        organizationId: pending.organizationId,
        provider: pending.provider,
        providerConnectionId: args.providerConnectionId,
        institutionName: pending.aspspName,
        institutionCountry: pending.aspspCountry,
        accounts: args.accounts,
        status: "active",
        consentExpiresAt: args.consentExpiresAt,
        createdBy: pending.createdBy,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(pending._id, {
      status: "completed",
      updatedAt: now,
    });

    return connectionId;
  },
});

export const updateStatus = internalMutation({
  args: {
    bankConnectionId: v.id("bankConnections"),
    status: statusSchema,
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.bankConnectionId, {
      status: args.status,
      errorCode: args.errorCode,
      errorMessage: args.errorMessage,
      updatedAt: Date.now(),
    });
  },
});

export const updateSyncState = internalMutation({
  args: {
    bankConnectionId: v.id("bankConnections"),
    lastSyncedThrough: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.bankConnectionId, {
      lastSyncAt: Date.now(),
      lastSyncedThrough: args.lastSyncedThrough,
      updatedAt: Date.now(),
    });
  },
});

export const deleteConnectionInternal = internalMutation({
  args: {
    bankConnectionId: v.id("bankConnections"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.bankConnectionId);
  },
});

export const updateAccountFundMapping = mutation({
  args: {
    bankConnectionId: v.id("bankConnections"),
    accountId: v.string(),
    fundId: v.optional(v.id("funds")),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const connection = await ctx.db.get(args.bankConnectionId);

    if (!connection || connection.organizationId !== user.organizationId) {
      throw new Error("Bank connection not found");
    }

    if (args.fundId) {
      const fund = await ctx.db.get(args.fundId);
      if (!fund || fund.organizationId !== user.organizationId) {
        throw new Error("Invalid fund");
      }
    }

    await ctx.db.patch(args.bankConnectionId, {
      accounts: connection.accounts.map((account) =>
        account.accountId === args.accountId
          ? { ...account, fundId: args.fundId }
          : account
      ),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
```

- [ ] **Step 2: Run Convex codegen**

Run:

```bash
npx convex codegen
```

Expected: generated API contains `mutations.bankConnections`.

- [ ] **Step 3: Run TypeScript**

Run:

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add convex/mutations/bankConnections.ts convex/_generated
git commit -m "feat: add bank connection mutations"
```

---

### Task 5: Add Bank Connection Queries

**Files:**
- Create: `convex/queries/bankConnections.ts`

- [ ] **Step 1: Create provider-neutral queries**

Create `convex/queries/bankConnections.ts` with:

```typescript
import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "../lib/auth";

const publicConnection = (connection: any) => ({
  _id: connection._id,
  _creationTime: connection._creationTime,
  organizationId: connection.organizationId,
  provider: connection.provider,
  institutionName: connection.institutionName,
  institutionCountry: connection.institutionCountry,
  accounts: connection.accounts,
  status: connection.status,
  errorCode: connection.errorCode,
  errorMessage: connection.errorMessage,
  lastSyncAt: connection.lastSyncAt,
  lastSyncedThrough: connection.lastSyncedThrough,
  consentExpiresAt: connection.consentExpiresAt,
  createdAt: connection.createdAt,
  updatedAt: connection.updatedAt,
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const connections = await ctx.db
      .query("bankConnections")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    return connections.map(publicConnection);
  },
});

export const getActiveWithMappedAccounts = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const connections = await ctx.db
      .query("bankConnections")
      .withIndex("by_organization_status", (q) =>
        q.eq("organizationId", user.organizationId).eq("status", "active")
      )
      .collect();

    return connections
      .filter((connection) => connection.accounts.some((account) => account.fundId))
      .map((connection) => ({
        _id: connection._id,
        provider: connection.provider,
        institutionName: connection.institutionName,
        accounts: connection.accounts.filter((account) => account.fundId),
        lastSyncAt: connection.lastSyncAt,
        lastSyncedThrough: connection.lastSyncedThrough,
      }));
  },
});

export const getItemsNeedingAttention = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const connections = await ctx.db
      .query("bankConnections")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    const now = Date.now();
    const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000;

    return connections
      .filter((connection) => {
        if (
          connection.status === "error" ||
          connection.status === "consent_expired" ||
          connection.status === "pending_reauth"
        ) {
          return true;
        }

        return Boolean(
          connection.consentExpiresAt &&
            connection.consentExpiresAt < sevenDaysFromNow
        );
      })
      .map((connection) => ({
        _id: connection._id,
        institutionName: connection.institutionName,
        status: connection.status,
        errorCode: connection.errorCode,
        errorMessage: connection.errorMessage,
        consentExpiresAt: connection.consentExpiresAt,
        daysUntilExpiry: connection.consentExpiresAt
          ? Math.ceil((connection.consentExpiresAt - now) / (24 * 60 * 60 * 1000))
          : null,
      }));
  },
});

export const getForAction = internalQuery({
  args: {
    bankConnectionId: v.id("bankConnections"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.bankConnectionId);
  },
});

export const getPendingByState = internalQuery({
  args: {
    state: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pendingBankConnections")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();
  },
});
```

- [ ] **Step 2: Run Convex codegen**

Run:

```bash
npx convex codegen
```

Expected: generated API contains `queries.bankConnections`.

- [ ] **Step 3: Run TypeScript**

Run:

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add convex/queries/bankConnections.ts convex/_generated
git commit -m "feat: add bank connection queries"
```

---

### Task 6: Add Bank Connection Actions

**Files:**
- Create: `convex/actions/bankConnections.ts`

Corrected sync behavior: `syncTransactions` returns normalized pending transactions from complete Enable Banking transaction pages and does not advance `lastSyncedThrough`; a later post-import acknowledgement/deduplication path should handle durable checkpoints. When a manual sync cannot finish because the 500-transaction soft cap, provider continuation, per-account page cap, or unprocessed mapped accounts leave data behind, it returns `hasMore: true` with an explicit `nextCursor` containing `dateFrom`, `dateTo`, `accountIndex`, and optional `continuationKey`. The next manual sync must pass that cursor back so the action resumes from the exact account and provider page. Cursor dates are validated as `YYYY-MM-DD`, `accountIndex` is validated against the current mapped accounts, empty-string continuation keys are preserved, and provider pages are never sliced or partially imported. Authorization failures mark the connection `pending_reauth`; non-auth sync failures do not mark the connection inactive/error so users can retry. Local removal ignores only structured provider 404 responses as already removed; 401/403 and other remote close failures are rethrown so the local record remains retryable.

- [ ] **Step 1: Create start, sync, and remove actions**

Create `convex/actions/bankConnections.ts` with:

```typescript
"use node";

import { action, type ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import {
  closeSession,
  EnableBankingApiError,
  getAccountTransactions,
  getConsentValidUntil,
  getEnableBankingDefaults,
  startAuthorization,
} from "../lib/enableBanking";
import {
  calculateDefaultSyncRange,
  normalizeEnableBankingTransaction,
} from "../lib/bankConnectionUtils";

const requireUser = async (ctx: ActionCtx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized: please sign in");
  }

  const { api } = await import("../_generated/api");
  const currentUser = await ctx.runQuery(api.queries.users.current, {});
  if (!currentUser) {
    throw new Error("Forbidden: complete onboarding first");
  }

  return currentUser;
};

const requireFinanceRole = (
  user: { role: "Admin" | "Finance Team" | "Pastorate" | "Guest" }
) => {
  if (user.role !== "Admin" && user.role !== "Finance Team") {
    throw new Error("Forbidden: this action requires Admin or Finance Team role");
  }
};

const randomState = () => crypto.randomUUID();

const todayIso = () => new Date().toISOString().slice(0, 10);

const MAX_TRANSACTION_PAGES_PER_ACCOUNT = 20;
const MAX_SYNC_TRANSACTIONS = 500;

type SyncTransactionsCursor = {
  dateFrom: string;
  dateTo: string;
  accountIndex: number;
  continuationKey?: string;
};

type SyncedBankTransaction = {
  date: string;
  description: string;
  amount: number;
  type: "Income" | "Expenditure";
  accountId: string;
  accountName: string;
  fundId: string | null;
  providerTransactionId: string;
};

const assertValidAuthorizationUrl = (url: unknown) => {
  if (typeof url !== "string") {
    throw new Error("Enable Banking returned an invalid authorization URL");
  }

  const trimmedUrl = url.trim();

  try {
    const parsed = new URL(trimmedUrl);
    if (parsed.protocol !== "https:") throw new Error();
    return trimmedUrl;
  } catch {
    throw new Error("Enable Banking returned an invalid authorization URL");
  }
};

const isValidIsoDate = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
};

const createSyncCursor = ({
  dateFrom,
  dateTo,
  accountIndex,
  continuationKey,
}: SyncTransactionsCursor): SyncTransactionsCursor =>
  continuationKey == null
    ? { dateFrom, dateTo, accountIndex }
    : { dateFrom, dateTo, accountIndex, continuationKey };

const validateSyncCursor = (
  cursor: SyncTransactionsCursor | undefined,
  mappedAccountCount: number
) => {
  if (!cursor) return undefined;

  if (!isValidIsoDate(cursor.dateFrom) || !isValidIsoDate(cursor.dateTo)) {
    throw new Error("Invalid sync cursor: expected YYYY-MM-DD date strings");
  }

  if (cursor.dateFrom > cursor.dateTo) {
    throw new Error("Invalid sync cursor: dateFrom must be on or before dateTo");
  }

  if (
    !Number.isInteger(cursor.accountIndex) ||
    cursor.accountIndex < 0 ||
    cursor.accountIndex >= mappedAccountCount
  ) {
    throw new Error("Invalid sync cursor: accountIndex is out of range");
  }

  return cursor;
};

export const startConnection = action({
  args: {
    existingConnectionId: v.optional(v.id("bankConnections")),
  },
  handler: async (ctx, args): Promise<{ authorizationUrl: string }> => {
    const user = await requireUser(ctx);
    requireFinanceRole(user);

    const { internal } = await import("../_generated/api");
    const defaults = getEnableBankingDefaults();
    const state = randomState();
    const expiresAt = Date.now() + 15 * 60 * 1000;
    const existingConnectionId = args.existingConnectionId;

    if (existingConnectionId) {
      const existingConnection = await ctx.runQuery(
        internal.queries.bankConnections.getForAction,
        { bankConnectionId: existingConnectionId }
      );

      if (
        !existingConnection ||
        existingConnection.organizationId !== user.organizationId
      ) {
        throw new Error("Bank connection not found");
      }
    }

    await ctx.runMutation(internal.mutations.bankConnections.createPending, {
      organizationId: user.organizationId,
      createdBy: user._id,
      provider: "enable_banking",
      state,
      aspspCountry: defaults.aspspCountry,
      aspspName: defaults.aspspName,
      existingConnectionId,
      expiresAt,
    });

    try {
      const response = await startAuthorization({
        state,
        aspspCountry: defaults.aspspCountry,
        aspspName: defaults.aspspName,
        redirectUrl: defaults.redirectUrl,
        validUntil: getConsentValidUntil(),
      });

      return { authorizationUrl: assertValidAuthorizationUrl(response.url) };
    } catch (error: any) {
      try {
        await ctx.runMutation(internal.mutations.bankConnections.markPendingError, {
          state,
          errorCode: "AUTHORIZATION_START_FAILED",
          errorMessage:
            error?.message || "Failed to start bank authorization session",
        });
      } catch {
        // Preserve the original provider or validation error for the caller.
      }

      throw error;
    }
  },
});

export const syncTransactions = action({
  args: {
    bankConnectionId: v.id("bankConnections"),
    cursor: v.optional(
      v.object({
        dateFrom: v.string(),
        dateTo: v.string(),
        accountIndex: v.number(),
        continuationKey: v.optional(v.string()),
      })
    ),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    transactions: SyncedBankTransaction[];
    hasMore: boolean;
    nextCursor?: SyncTransactionsCursor;
  }> => {
    const user = await requireUser(ctx);
    requireFinanceRole(user);

    const { internal } = await import("../_generated/api");
    const connection = await ctx.runQuery(
      internal.queries.bankConnections.getForAction,
      { bankConnectionId: args.bankConnectionId }
    );

    if (!connection || connection.organizationId !== user.organizationId) {
      throw new Error("Bank connection not found");
    }

    if (connection.status !== "active") {
      throw new Error(`Bank connection is ${connection.status}. Please re-authenticate.`);
    }

    const mappedAccounts = connection.accounts.filter((account) => account.fundId);
    if (mappedAccounts.length === 0) {
      return { transactions: [], hasMore: false };
    }

    const cursor = validateSyncCursor(args.cursor, mappedAccounts.length);
    const syncRange = cursor ?? calculateDefaultSyncRange({
      today: todayIso(),
      lastSyncedThrough: connection.lastSyncedThrough,
    });
    const { dateFrom, dateTo } = syncRange;
    const transactions: SyncedBankTransaction[] = [];
    let hasMore = false;
    let nextCursor: SyncTransactionsCursor | undefined;

    try {
      syncLoop: for (
        let accountIndex = cursor?.accountIndex ?? 0;
        accountIndex < mappedAccounts.length;
        accountIndex += 1
      ) {
        const account = mappedAccounts[accountIndex];
        let continuationKey =
          accountIndex === cursor?.accountIndex ? cursor.continuationKey : undefined;

        for (let page = 0; page < MAX_TRANSACTION_PAGES_PER_ACCOUNT; page += 1) {
          const remainingCapacity = MAX_SYNC_TRANSACTIONS - transactions.length;
          if (remainingCapacity <= 0) {
            hasMore = true;
            nextCursor = createSyncCursor({
              dateFrom,
              dateTo,
              accountIndex,
              continuationKey,
            });
            break syncLoop;
          }

          const response = await getAccountTransactions({
            accountId: account.accountId,
            dateFrom,
            dateTo,
            continuationKey,
          });

          if (!Array.isArray(response.transactions)) {
            throw new Error("Enable Banking transactions response is invalid");
          }

          const responseContinuationKey = response.continuation_key;
          const hasContinuation = responseContinuationKey != null;
          if (hasContinuation && typeof responseContinuationKey !== "string") {
            throw new Error("Enable Banking transactions response is invalid");
          }

          if (
            response.transactions.length > remainingCapacity &&
            transactions.length > 0
          ) {
            hasMore = true;
            nextCursor = createSyncCursor({
              dateFrom,
              dateTo,
              accountIndex,
              continuationKey,
            });
            break syncLoop;
          }

          for (const transaction of response.transactions) {
            transactions.push(
              normalizeEnableBankingTransaction({
                transaction: transaction as any,
                accountId: account.accountId,
                accountName: account.name,
                fundId: account.fundId as string,
              })
            );
          }

          if (!hasContinuation) {
            if (
              transactions.length >= MAX_SYNC_TRANSACTIONS &&
              accountIndex < mappedAccounts.length - 1
            ) {
              hasMore = true;
              nextCursor = createSyncCursor({
                dateFrom,
                dateTo,
                accountIndex: accountIndex + 1,
              });
              break syncLoop;
            }

            break;
          }

          if (page === MAX_TRANSACTION_PAGES_PER_ACCOUNT - 1) {
            hasMore = true;
            nextCursor = createSyncCursor({
              dateFrom,
              dateTo,
              accountIndex,
              continuationKey: responseContinuationKey,
            });
            break syncLoop;
          }

          if (transactions.length >= MAX_SYNC_TRANSACTIONS) {
            hasMore = true;
            nextCursor = createSyncCursor({
              dateFrom,
              dateTo,
              accountIndex,
              continuationKey: responseContinuationKey,
            });
            break syncLoop;
          }

          continuationKey = responseContinuationKey;
        }
      }
    } catch (error: any) {
      const message = error?.message || "Failed to sync bank transactions";
      const isAuthorizationError =
        error instanceof EnableBankingApiError &&
        (error.status === 401 || error.status === 403);

      if (isAuthorizationError) {
        await ctx.runMutation(internal.mutations.bankConnections.updateStatus, {
          bankConnectionId: args.bankConnectionId,
          status: "pending_reauth",
          errorCode: "AUTHORIZATION_REQUIRED",
          errorMessage: message,
        });
      }

      throw error;
    }

    return {
      transactions,
      hasMore,
      ...(nextCursor ? { nextCursor } : {}),
    };
  },
});

export const removeConnection = action({
  args: {
    bankConnectionId: v.id("bankConnections"),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const user = await requireUser(ctx);
    if (user.role !== "Admin") {
      throw new Error("Forbidden: this action requires Admin role");
    }

    const { internal } = await import("../_generated/api");
    const connection = await ctx.runQuery(
      internal.queries.bankConnections.getForAction,
      { bankConnectionId: args.bankConnectionId }
    );

    if (!connection || connection.organizationId !== user.organizationId) {
      throw new Error("Bank connection not found");
    }

    try {
      await closeSession(connection.providerConnectionId);
    } catch (error: any) {
      if (
        !(
          error instanceof EnableBankingApiError &&
          error.status === 404
        )
      ) {
        throw error;
      }
    }

    await ctx.runMutation(
      internal.mutations.bankConnections.deleteConnectionInternal,
      { bankConnectionId: args.bankConnectionId }
    );

    return { success: true };
  },
});
```

- [ ] **Step 2: Run Convex codegen**

Run:

```bash
npx convex codegen
```

Expected: generated API contains `actions.bankConnections`.

- [ ] **Step 3: Run TypeScript**

Run:

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add convex/actions/bankConnections.ts convex/_generated
git commit -m "feat: add bank connection actions"
```

---

### Task 7: Add Enable Banking Callback Route

**Files:**
- Modify: `convex/http.ts`

- [x] **Step 1: Add imports**

At the top of `convex/http.ts`, add:

```typescript
import { authorizeSession, getConsentValidUntil } from "./lib/enableBanking";
import { isPendingStateExpired } from "./lib/bankConnectionUtils";
```

- [x] **Step 2: Add callback helper functions**

After `const http = httpRouter();`, add:

```typescript
type EnableBankingCallbackAccount = {
  uid?: unknown;
  identification_hash?: unknown;
  identification_hashes?: unknown;
  name?: unknown;
  details?: {
    name?: unknown;
    currency?: unknown;
    product?: unknown;
    cash_account_type?: unknown;
    iban?: unknown;
    bban?: unknown;
  };
};

const nonEmptyString = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const trimCallbackValue = (value: string | null) => {
  const trimmed = value?.trim();
  return trimmed || undefined;
};

const safeErrorMessage = (message: string, fallback: string) =>
  (message.trim() || fallback).slice(0, 500);

const getBankSettingsOrigin = (request: Request) => {
  const fallbackOrigin = new URL(request.url).origin;
  const configuredBaseUrl = process.env.APP_BASE_URL?.trim();

  if (!configuredBaseUrl) return fallbackOrigin;

  try {
    const parsed = new URL(configuredBaseUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return fallbackOrigin;
    }
    return parsed.origin;
  } catch {
    return fallbackOrigin;
  }
};

const settingsBankUrl = (request: Request, result: "success" | "error") => {
  const url = new URL("/settings", getBankSettingsOrigin(request));
  url.searchParams.set("tab", "bank");
  url.searchParams.set("bankConnection", result);
  return url.toString();
};

const redirectToBankSettings = (
  request: Request,
  result: "success" | "error"
) =>
  new Response(null, {
    status: 302,
    headers: {
      Location: settingsBankUrl(request, result),
    },
  });

const getAccountMask = (account: EnableBankingCallbackAccount) => {
  const identifier =
    nonEmptyString(account.details?.iban) || nonEmptyString(account.details?.bban);
  if (!identifier) return undefined;
  const compactIdentifier = identifier.replace(/\s+/g, "");
  return compactIdentifier.slice(-4) || undefined;
};

const mapEnableBankingAccount = (account: EnableBankingCallbackAccount) => {
  const accountId = nonEmptyString(account.uid);
  if (!accountId) {
    throw new Error("Enable Banking account is missing uid");
  }

  const identificationHashes = Array.isArray(account.identification_hashes)
    ? account.identification_hashes
        .map(nonEmptyString)
        .filter((hash): hash is string => Boolean(hash))
    : undefined;

  const name =
    nonEmptyString(account.name) ||
    nonEmptyString(account.details?.name) ||
    nonEmptyString(account.details?.product) ||
    nonEmptyString(account.details?.iban) ||
    nonEmptyString(account.details?.bban) ||
    "Bank account";

  return {
    accountId,
    providerAccountHash: nonEmptyString(account.identification_hash),
    providerAccountHashes: identificationHashes?.length
      ? identificationHashes
      : undefined,
    name,
    mask: getAccountMask(account),
    type:
      nonEmptyString(account.details?.cash_account_type) ||
      nonEmptyString(account.details?.product),
    currency: nonEmptyString(account.details?.currency),
  };
};
```

- [x] **Step 3: Add the callback route before `export default http`**

Add this route before the final `export default http;`:

```typescript
// Enable Banking callback endpoint
http.route({
  path: "/enable-banking/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const code = trimCallbackValue(url.searchParams.get("code"));
    const state = trimCallbackValue(url.searchParams.get("state"));
    const providerError = trimCallbackValue(url.searchParams.get("error"));
    const providerErrorDescription = trimCallbackValue(
      url.searchParams.get("error_description")
    );

    if (!state) {
      return redirectToBankSettings(request, "error");
    }

    const pending = await ctx.runQuery(
      internal.queries.bankConnections.getPendingByState,
      { state }
    );

    if (!pending || pending.status !== "pending") {
      return redirectToBankSettings(request, "error");
    }

    if (isPendingStateExpired({ expiresAt: pending.expiresAt })) {
      await ctx.runMutation(
        internal.mutations.bankConnections.markPendingError,
        {
          state,
          errorCode: "STATE_EXPIRED",
          errorMessage: "Bank authorization session expired",
        }
      );
      return redirectToBankSettings(request, "error");
    }

    if (providerError) {
      await ctx.runMutation(
        internal.mutations.bankConnections.markPendingError,
        {
          state,
          errorCode: providerError.slice(0, 100),
          errorMessage: safeErrorMessage(
            providerErrorDescription || "",
            "Bank authorization was not completed"
          ),
        }
      );
      return redirectToBankSettings(request, "error");
    }

    if (!code) {
      await ctx.runMutation(
        internal.mutations.bankConnections.markPendingError,
        {
          state,
          errorCode: "MISSING_CODE",
          errorMessage: "Bank authorization callback did not include a code",
        }
      );
      return redirectToBankSettings(request, "error");
    }

    try {
      const session = await authorizeSession(code);
      const consentExpiresAt = new Date(getConsentValidUntil()).getTime();

      await ctx.runMutation(
        internal.mutations.bankConnections.completePending,
        {
          state,
          providerConnectionId: session.session_id,
          consentExpiresAt,
          accounts: session.accounts.map(mapEnableBankingAccount),
        }
      );

      return redirectToBankSettings(request, "success");
    } catch {
      await ctx.runMutation(
        internal.mutations.bankConnections.markPendingError,
        {
          state,
          errorCode: "SESSION_EXCHANGE_FAILED",
          errorMessage: "Failed to authorize bank session",
        }
      );
      return redirectToBankSettings(request, "error");
    }
  }),
});
```

- [x] **Step 4: Run TypeScript**

Run:

```bash
npm run typecheck
```

Expected: no errors.

- [x] **Step 5: Commit**

```bash
git add convex/http.ts
git commit -m "feat: add Enable Banking callback route"
```

---

### Task 8: Migrate Bank Connections Settings UI

**Files:**
- Modify: `components/BankConnectionsSettings.tsx`

- [x] **Step 1: Remove Plaid hook imports**

In `components/BankConnectionsSettings.tsx`, remove:

```typescript
import { usePlaidLinkFlow, usePlaidUpdateLink } from '../hooks/usePlaidLink';
```

- [x] **Step 2: Rename queries/actions and local state**

Replace the Plaid-specific declarations near the top of the component with:

```typescript
  const bankConnections = useQuery(api.queries.bankConnections.list) || [];
  const itemsNeedingAttention = useQuery(api.queries.bankConnections.getItemsNeedingAttention) || [];
  const updateFundMapping = useMutation(api.mutations.bankConnections.updateAccountFundMapping);
  const startConnection = useAction(api.actions.bankConnections.startConnection);
  const removeConnection = useAction(api.actions.bankConnections.removeConnection);

  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);
```

Remove these state variables and Plaid flow values from the file:

```typescript
  const [pendingMappings, setPendingMappings] = useState<AccountMapping[]>([]);
```

Remove the `usePlaidLinkFlow` block, both `useEffect` blocks that initialize/open Plaid Link, and the Plaid fund mapping modal. Fund mapping now happens from the provider-neutral account list after the callback creates or refreshes the bank connection.

Add a mount-only browser-guarded `useEffect` that reads the `/settings?tab=bank&bankConnection=success|error` callback result. On `success`, clear any connection error and notify success. On `error`, set `connectionError` to a helpful retry message and notify error. In both cases, remove only the `bankConnection` query parameter with `window.history.replaceState`, preserving any other query parameters and the hash.

- [x] **Step 3: Replace connect handler**

Replace `handleConnectBank` with:

```typescript
  const handleConnectBank = async () => {
    setIsConnecting(true);
    setConnectionError(null);

    try {
      const { authorizationUrl } = await startConnection({});
      window.location.assign(authorizationUrl);
    } catch (error: any) {
      const message = error?.message || "Failed to start bank connection";
      setConnectionError(message);
      notify("Error", message);
      setIsConnecting(false);
    }
  };
```

Delete `handleCompleteFundMapping` and all uses of `pendingMappings`.

- [x] **Step 4: Replace remove and mapping handlers**

Replace `handleRemoveConnection` with:

```typescript
  const handleRemoveConnection = async (connectionId: Id<"bankConnections">) => {
    if (!window.confirm('Are you sure you want to disconnect this bank account? You will need to re-authenticate to reconnect.')) {
      return;
    }

    setIsRemoving(connectionId);
    try {
      await removeConnection({ bankConnectionId: connectionId });
    } catch (error) {
      console.error('Failed to remove connection:', error);
      notify('Error', 'Failed to remove bank connection. Please try again.');
    } finally {
      setIsRemoving(null);
    }
  };
```

Replace `handleUpdateFundMapping` with:

```typescript
  const handleUpdateFundMapping = async (
    connectionId: Id<"bankConnections">,
    accountId: string,
    fundId: Id<"funds"> | undefined
  ) => {
    try {
      await updateFundMapping({
        bankConnectionId: connectionId,
        accountId,
        fundId,
      });
    } catch (error) {
      console.error('Failed to update fund mapping:', error);
      notify('Error', 'Failed to update account mapping. Please try again.');
    }
  };
```

- [x] **Step 5: Replace JSX identifiers**

In the returned JSX, replace:

```typescript
plaidItems
```

with:

```typescript
bankConnections
```

Replace:

```typescript
isLinkLoading
```

with:

```typescript
isConnecting
```

Replace:

```typescript
linkError
```

with:

```typescript
connectionError
```

Replace user-facing text containing "Plaid" with "bank connection".

- [x] **Step 6: Replace re-auth button component**

Replace the existing `ReauthButton` component at the bottom of the file with:

```typescript
const ReauthButton: React.FC<{ bankConnectionId: Id<"bankConnections"> }> = ({ bankConnectionId }) => {
  const [isLoading, setIsLoading] = useState(false);
  const startConnection = useAction(api.actions.bankConnections.startConnection);

  const handleReauth = async () => {
    setIsLoading(true);
    try {
      const { authorizationUrl } = await startConnection({ existingConnectionId: bankConnectionId });
      window.location.assign(authorizationUrl);
    } catch (error: any) {
      notify("Error", error?.message || "Failed to start re-authentication");
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleReauth}
      disabled={isLoading}
      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wide border border-amber-200 text-amber-700 rounded hover:bg-amber-50 disabled:opacity-50"
    >
      <RefreshCw size={10} className={isLoading ? "animate-spin" : ""} />
      Re-auth
    </button>
  );
};
```

Update component usage from:

```tsx
<ReauthButton plaidItemId={item._id} />
```

to:

```tsx
<ReauthButton bankConnectionId={item._id} />
```

- [x] **Step 7: Run TypeScript**

Run:

```bash
npm run typecheck
```

Expected: no errors in `BankConnectionsSettings.tsx`.

- [x] **Step 8: Commit**

```bash
git add components/BankConnectionsSettings.tsx
git commit -m "feat: migrate bank settings to provider-neutral connections"
```

---

### Task 9: Migrate Transaction Bank Sync UI

**Files:**
- Modify: `components/TransactionManager.tsx`

- [x] **Step 1: Replace Plaid query and action declarations**

In `components/TransactionManager.tsx`, replace:

```typescript
  // Plaid bank sync
  const plaidItems = useQuery(api.queries.plaid.getActiveItemsWithMappedAccounts) || [];
  const syncTransactions = useAction(api.actions.plaid.syncTransactions);
```

with:

```typescript
  // Bank sync
  const bankConnections = useQuery(api.queries.bankConnections.getActiveWithMappedAccounts) || [];
  const syncTransactions = useAction(api.actions.bankConnections.syncTransactions);
```

- [x] **Step 2: Replace sync handler identifiers**

Replace `handleSyncBank` with:

```typescript
  const handleSyncBank = () => {
    if (bankConnections.length === 0) {
      notify("Error", "No bank accounts connected. Please connect a bank account in Settings > Bank Connections first.");
      return;
    }
    if (bankConnections.length === 1) {
      handleSyncFromBank(bankConnections[0]._id);
    } else {
      setShowBankSelector(true);
    }
  };
```

Replace `handleSyncFromBank` function signature and action call:

```typescript
  const handleSyncFromBank = async (bankConnectionId: Id<"bankConnections">) => {
```

and:

```typescript
      const result = await syncTransactions({ bankConnectionId, ...(cursor ? { cursor } : {}) });
```

- [x] **Step 3: Replace remaining `plaidItems` UI references**

Replace every remaining `plaidItems` reference in `components/TransactionManager.tsx` with `bankConnections`.

Replace any variable or label that says "Plaid" with provider-neutral wording. Keep user-facing "bank" wording where it already exists.

Add state for Task 6 sync continuation:

```typescript
const [nextBankSyncCursor, setNextBankSyncCursor] = useState<BankSyncCursor | null>(null);
const [nextBankSyncConnectionId, setNextBankSyncConnectionId] = useState<Id<"bankConnections"> | null>(null);
```

When `syncTransactions` returns `hasMore` with `nextCursor`, show a user-facing notice and keep the current review batch open. Add a compact review modal footer button that calls `syncTransactions({ bankConnectionId, cursor: nextCursor })` and appends the returned transactions to `pendingTransactions`, preserving existing review edits and duplicate warnings. Starting a new bank sync while a review batch exists should reopen the review modal instead of silently overwriting the pending transactions.

- [x] **Step 4: Run TypeScript**

Run:

```bash
npm run typecheck
```

Expected: no errors in `TransactionManager.tsx`.

- [ ] **Step 5: Commit**

```bash
git add components/TransactionManager.tsx
git commit -m "feat: migrate transaction sync to bank connections"
```

---

### Task 10: Remove Active Plaid Hook Usage

**Files:**
- Delete: `hooks/usePlaidLink.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] **Step 1: Verify the Plaid hook is unused**

Run:

```bash
rg -n "usePlaidLink|react-plaid-link|api\\.actions\\.plaid|api\\.queries\\.plaid|api\\.mutations\\.plaid" .
```

Expected: matches only in Plaid backend files, docs, `package.json`, `package-lock.json`, or `hooks/usePlaidLink.ts`. No active React component should import `hooks/usePlaidLink.ts`.

- [x] **Step 2: Delete the unused hook**

Delete `hooks/usePlaidLink.ts`.

- [x] **Step 3: Remove the React Plaid dependency**

Run:

```bash
npm uninstall react-plaid-link
```

Expected: `package.json` and `package-lock.json` no longer list `react-plaid-link`. Keep the backend `plaid` package for now because existing Plaid backend files still import it.

- [x] **Step 4: Run TypeScript and tests**

Run:

```bash
npm run typecheck
npm test -- --runInBand
```

Expected: no errors. Vitest should pass all current tests.

- [x] **Step 5: Commit**

```bash
git add package.json package-lock.json hooks/usePlaidLink.ts
git commit -m "chore: remove unused Plaid Link frontend hook"
```

---

### Task 11: Update Project Documentation

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `convex/README.md`

- [x] **Step 1: Update architecture references**

In `AGENTS.md` and `CLAUDE.md`, replace the stack banking line:

```markdown
- **Banking:** Plaid (UK Open Banking / PSD2)
```

with:

```markdown
- **Banking:** Provider-neutral bank connections, with Enable Banking as the active provider for manual UK Open Banking transaction sync
```

Replace:

```markdown
- `hooks/` — Custom hooks (e.g., `usePlaidLink.ts`)
```

with:

```markdown
- `hooks/` — Custom hooks for frontend workflows
```

Replace:

```markdown
- `actions/` — Server-side async operations (AI calls, Stripe, Plaid OAuth)
```

with:

```markdown
- `actions/` — Server-side async operations (AI calls, Stripe, bank connection flows)
```

Replace:

```markdown
- `http.ts` — HTTP routes for Stripe and Plaid webhooks
```

with:

```markdown
- `http.ts` — HTTP routes for Stripe webhooks, active Enable Banking callbacks, and preserved Plaid webhook compatibility
```

Replace backend Plaid env vars:

```markdown
- `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `PLAID_WEBHOOK_URL`
```

with:

```markdown
- `ENABLE_BANKING_APPLICATION_ID`, `ENABLE_BANKING_PRIVATE_KEY`, `ENABLE_BANKING_REDIRECT_URL`
- `ENABLE_BANKING_DEFAULT_COUNTRY`, `ENABLE_BANKING_DEFAULT_ASPSP`, optional `ENABLE_BANKING_API_BASE_URL`
```

Replace:

```markdown
- Webhook endpoints live in `convex/http.ts` (Stripe at `/stripe/webhook`, Plaid at `/plaid/webhook`)
```

with:

```markdown
- HTTP integration endpoints live in `convex/http.ts` (Stripe at `/stripe/webhook`, active Enable Banking callback at `/enable-banking/callback`, preserved Plaid webhook at `/plaid/webhook` for backend compatibility)
```

- [x] **Step 2: Add Enable Banking setup notes to `convex/README.md`**

Append this section to `convex/README.md`:

```markdown
## Enable Banking

Bank connection secrets are backend-only Convex environment variables:

- `ENABLE_BANKING_APPLICATION_ID`
- `ENABLE_BANKING_PRIVATE_KEY`
- `ENABLE_BANKING_REDIRECT_URL`
- `ENABLE_BANKING_DEFAULT_COUNTRY`
- `ENABLE_BANKING_DEFAULT_ASPSP`
- Optional `ENABLE_BANKING_API_BASE_URL`

Set them with `npx convex env set`. Do not expose these values through `VITE_*` variables.

The active v1 flow is manual sync:

1. Admin or Finance Team starts a connection from Settings > Bank Connections.
2. Enable Banking redirects back to `/enable-banking/callback`.
3. The returned account is mapped to a fund.
4. Transactions are fetched on demand from the Transactions screen and reviewed before import.

The first rollout is for internal validation with the linked Metro Bank account. Tenant-wide availability requires a separate commercial/compliance decision.
```

- [x] **Step 3: Run documentation search**

Run:

```bash
rg -n "Plaid|plaid|usePlaidLink|PLAID_|/plaid/webhook" AGENTS.md CLAUDE.md convex/README.md components hooks convex package.json
```

Expected: remaining matches are only in preserved Plaid backend files, `package.json` backend Plaid dependency, or intentionally historical wording. No active UI docs should describe Plaid as the current provider.

- [x] **Step 4: Commit**

```bash
git add AGENTS.md CLAUDE.md convex/README.md
git commit -m "docs: update banking integration documentation"
```

---

### Task 12: Final Verification

**Files:**
- Verify only unless fixes are required.

- [ ] **Step 1: Run helper tests**

Run:

```bash
npm test -- tests/bankConnectionUtils.test.ts
```

Expected: all helper tests pass.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Run TypeScript**

Run:

```bash
npm run typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 4: Start development servers**

Run Vite:

```bash
npm run dev
```

Run Convex in a second terminal:

```bash
npx convex dev
```

Expected: Vite serves the app on `http://localhost:3000`; Convex starts without schema or generated API errors.

- [ ] **Step 5: Manual UI verification without live Enable Banking credentials**

In the browser:

1. Open Settings > Bank Connections.
2. Confirm the page renders without Plaid Link errors.
3. Confirm the primary action says "Connect Bank".
4. Open Transactions.
5. Click "Sync from Bank" with no mapped connections.
6. Confirm the existing error notification says no bank account is connected.

- [ ] **Step 6: Manual Enable Banking verification with configured credentials**

After Convex env vars are configured:

1. Open Settings > Bank Connections.
2. Click "Connect Bank".
3. Confirm the browser redirects to Enable Banking/Metro Bank.
4. Complete Metro Bank authorization.
5. Confirm redirect back to Settings.
6. Confirm the connection appears as active.
7. Map the returned account to a fund.
8. Open Transactions and click "Sync from Bank".
9. Confirm fetched transactions appear in the review modal.
10. Confirm duplicate warnings still appear for same date and amount.
11. Import a selected transaction and confirm it appears in the ledger.
12. Remove the bank connection and confirm it disappears from Settings.

- [ ] **Step 7: Commit any verification fixes**

If verification requires fixes, commit only those touched files:

```bash
git status --short
git add convex/lib/bankConnectionUtils.ts convex/lib/enableBanking.ts convex/schema.ts convex/mutations/bankConnections.ts convex/queries/bankConnections.ts convex/actions/bankConnections.ts convex/http.ts components/BankConnectionsSettings.tsx components/TransactionManager.tsx tests/bankConnectionUtils.test.ts package.json package-lock.json AGENTS.md CLAUDE.md convex/README.md
git diff --cached --name-only
git commit -m "fix: address Enable Banking verification issues"
```

Expected: no commit is created if no fixes are required.

---

## Self-Review

Spec coverage:

- Provider-neutral backend: Tasks 2, 4, 5, and 6.
- Enable Banking API client and JWT: Task 3.
- Callback route: Task 7.
- Manual sync range and normalization: Tasks 1 and 6.
- Existing review/import UI reuse: Task 9.
- Settings connection and mapping UI: Task 8.
- Security and backend-only secrets: Tasks 3, 7, and 11.
- Plaid active UI removal: Tasks 8, 9, and 10.
- Documentation: Task 11.
- Verification: Task 12.

Completeness scan:

- No task contains unresolved filler text. Commands, files, expected outcomes, and code snippets are specified.

Type consistency:

- The plan consistently uses `bankConnectionId`, `bankConnections`, `pendingBankConnections`, `providerConnectionId`, `lastSyncedThrough`, and provider value `"enable_banking"`.
