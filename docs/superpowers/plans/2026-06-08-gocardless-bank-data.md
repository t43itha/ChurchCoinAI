# GoCardless Bank Account Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the active Enable Banking integration with GoCardless Bank Account Data while preserving ChurchCoinAI's manual bank sync and review workflow.

**Architecture:** Keep the existing provider-neutral `bankConnections` API surface used by React. Swap provider-specific backend code from Enable Banking sessions to GoCardless requisitions, add GoCardless transaction/account normalization helpers, and route callbacks through `/gocardless/callback`.

**Tech Stack:** React 19, TypeScript, Convex actions/mutations/HTTP actions, Vitest, GoCardless Bank Account Data API v2.

---

## File Structure

- Modify: `tests/bankConnectionUtils.test.ts`
  - Adds failing tests for GoCardless transaction normalization.
- Modify: `convex/lib/bankConnectionUtils.ts`
  - Adds GoCardless transaction input types and `normalizeGoCardlessTransaction`.
- Create: `tests/gocardless.test.ts`
  - Adds failing tests for GoCardless account mapping and reauth error detection helpers.
- Create: `convex/lib/gocardless.ts`
  - Owns GoCardless API requests, token creation, requisition/agreement/account/transaction operations, account mapping, and provider error classification.
- Modify: `convex/schema.ts`
  - Allows `gocardless` provider values while preserving existing `enable_banking` records during transition, and stores the GoCardless requisition ID on pending connections.
- Modify: `convex/mutations/bankConnections.ts`
  - Updates provider validator and preserves existing account matching behavior.
- Modify: `convex/actions/bankConnections.ts`
  - Replaces Enable Banking orchestration with GoCardless requisitions and transactions.
- Modify: `convex/http.ts`
  - Adds `/gocardless/callback`, maps returned accounts, and leaves `/enable-banking/callback` as a validator-friendly legacy endpoint.
- Modify: `components/BankConnectionsSettings.tsx`
  - Updates copy to GoCardless/Open Banking and adds Metro Bank business-account selection guidance.
- Modify: `components/legal/LegalPage.tsx`
  - Updates legal copy from Enable Banking to GoCardless.
- Modify: `.env.example`
  - Replaces active Enable Banking variables with GoCardless variables.
- Modify: `convex/README.md`
  - Documents GoCardless configuration and flow.
- Modify: `AGENTS.md`
  - Updates repo guidance to show GoCardless as the active provider.

---

### Task 1: Add GoCardless Transaction Normalization Tests

**Files:**
- Modify: `tests/bankConnectionUtils.test.ts`

- [ ] **Step 1: Write the failing tests**

Update the import at the top:

```ts
import {
  calculateDefaultSyncRange,
  isPendingStateExpired,
  normalizeEnableBankingTransaction,
  normalizeGoCardlessTransaction,
} from "../convex/lib/bankConnectionUtils";
```

Add this `describe` block after the existing Enable Banking transaction tests:

```ts
describe("GoCardless transaction normalization", () => {
  it("normalizes a positive GoCardless amount as income", () => {
    const normalized = normalizeGoCardlessTransaction({
      transaction: {
        transactionId: "gc-income-1",
        bookingDate: "2026-06-01",
        transactionAmount: { amount: "125.50", currency: "GBP" },
        remittanceInformationUnstructured: "Sunday giving",
      },
      accountId: "account-1",
      accountName: "Metro Business Current",
      fundId: "fund-1",
    });

    expect(normalized).toEqual({
      date: "2026-06-01",
      description: "Sunday giving",
      amount: 125.5,
      type: "Income",
      accountId: "account-1",
      accountName: "Metro Business Current",
      fundId: "fund-1",
      providerTransactionId: "gc-income-1",
    });
  });

  it("normalizes a negative GoCardless amount as expenditure", () => {
    const normalized = normalizeGoCardlessTransaction({
      transaction: {
        transactionId: "gc-expense-1",
        valueDate: "2026-06-02",
        transactionAmount: { amount: "-49.99", currency: "GBP" },
        remittanceInformationUnstructuredArray: ["Stationery", "Invoice 123"],
      },
      accountId: "account-1",
      accountName: "Metro Business Current",
      fundId: null,
    });

    expect(normalized).toEqual({
      date: "2026-06-02",
      description: "Stationery Invoice 123",
      amount: 49.99,
      type: "Expenditure",
      accountId: "account-1",
      accountName: "Metro Business Current",
      fundId: null,
      providerTransactionId: "gc-expense-1",
    });
  });

  it("uses the best available GoCardless description fallback", () => {
    const normalized = normalizeGoCardlessTransaction({
      transaction: {
        entryReference: "gc-description-1",
        bookingDate: "2026-06-03",
        transactionAmount: { amount: "10.00", currency: "GBP" },
        remittanceInformationUnstructured: "   ",
        additionalInformation: "Gift Aid receipt",
      },
      accountId: "account-1",
      accountName: "Metro Business Current",
      fundId: null,
    });

    expect(normalized.description).toBe("Gift Aid receipt");
  });

  it("falls back to a default description for blank GoCardless descriptions", () => {
    const normalized = normalizeGoCardlessTransaction({
      transaction: {
        transactionId: "gc-blank-description-1",
        bookingDate: "2026-06-04",
        transactionAmount: { amount: "10.00", currency: "GBP" },
        remittanceInformationUnstructuredArray: [" ", ""],
      },
      accountId: "account-1",
      accountName: "Metro Business Current",
      fundId: null,
    });

    expect(normalized.description).toBe("Bank transaction");
  });

  it("rejects GoCardless transactions without a usable date", () => {
    expect(() =>
      normalizeGoCardlessTransaction({
        transaction: {
          transactionId: "gc-missing-date",
          transactionAmount: { amount: "10.00", currency: "GBP" },
        },
        accountId: "account-1",
        accountName: "Metro Business Current",
        fundId: null,
      })
    ).toThrow("GoCardless transaction is missing a date");
  });

  it("rejects GoCardless transactions with malformed dates", () => {
    expect(() =>
      normalizeGoCardlessTransaction({
        transaction: {
          transactionId: "gc-invalid-date",
          bookingDate: "01/06/2026",
          transactionAmount: { amount: "10.00", currency: "GBP" },
        },
        accountId: "account-1",
        accountName: "Metro Business Current",
        fundId: null,
      })
    ).toThrow("GoCardless transaction has an invalid date");
  });

  it("rejects GoCardless transactions without identifiers", () => {
    expect(() =>
      normalizeGoCardlessTransaction({
        transaction: {
          bookingDate: "2026-06-01",
          transactionAmount: { amount: "10.00", currency: "GBP" },
        },
        accountId: "account-1",
        accountName: "Metro Business Current",
        fundId: null,
      })
    ).toThrow("GoCardless transaction is missing an identifier");
  });

  it("rejects GoCardless transactions with malformed amounts", () => {
    expect(() =>
      normalizeGoCardlessTransaction({
        transaction: {
          transactionId: "gc-malformed-amount",
          bookingDate: "2026-06-01",
          transactionAmount: { amount: "12.34GBP", currency: "GBP" },
        },
        accountId: "account-1",
        accountName: "Metro Business Current",
        fundId: null,
      })
    ).toThrow("GoCardless transaction has an invalid amount");
  });
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run:

```bash
npm test tests/bankConnectionUtils.test.ts
```

Expected: FAIL because `normalizeGoCardlessTransaction` is not exported.

- [ ] **Step 3: Commit the failing tests**

Do not commit yet if your workflow keeps red tests uncommitted. If committing red tests is acceptable in this session, run:

```bash
git add tests/bankConnectionUtils.test.ts
git commit -m "test: specify GoCardless transaction normalization"
```

If not committing red, leave the file staged/unstaged and continue immediately to Task 2.

---

### Task 2: Implement GoCardless Transaction Normalization

**Files:**
- Modify: `convex/lib/bankConnectionUtils.ts`
- Test: `tests/bankConnectionUtils.test.ts`

- [ ] **Step 1: Add GoCardless input types**

Add these types below the existing `EnableBankingTransactionLike` type:

```ts
export type GoCardlessAmount = {
  amount?: string | number;
  currency?: string;
};

export type GoCardlessTransactionLike = {
  transactionId?: string;
  internalTransactionId?: string;
  entryReference?: string;
  bookingDate?: string;
  valueDate?: string;
  transactionAmount?: GoCardlessAmount;
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
  additionalInformation?: string;
  creditorName?: string;
  debtorName?: string;
};
```

- [ ] **Step 2: Add provider-neutral helpers**

Refactor the existing helper functions so provider-specific errors can be passed in. Replace `assertValidTransactionDate` with:

```ts
const assertValidProviderTransactionDate = (date: string, provider: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${provider} transaction has an invalid date`);
  }

  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || toIsoDate(parsedDate) !== date) {
    throw new Error(`${provider} transaction has an invalid date`);
  }
};
```

Update the Enable Banking call site from:

```ts
assertValidTransactionDate(date);
```

to:

```ts
assertValidProviderTransactionDate(date, "Enable Banking");
```

- [ ] **Step 3: Add GoCardless normalization**

Add these helpers below `normalizeEnableBankingTransaction`:

```ts
const getGoCardlessTransactionAmount = (transaction: GoCardlessTransactionLike) => {
  const rawAmount = transaction.transactionAmount?.amount;
  const numericAmount =
    typeof rawAmount === "number"
      ? rawAmount
      : typeof rawAmount === "string" && rawAmount.trim() !== ""
        ? Number(rawAmount.trim())
        : Number.NaN;

  if (!Number.isFinite(numericAmount) || numericAmount === 0) {
    throw new Error("GoCardless transaction has an invalid amount");
  }

  return numericAmount;
};

const normalizeDescription = (description?: string) => {
  const normalized = description?.trim();
  return normalized || undefined;
};

const getGoCardlessTransactionDescription = (
  transaction: GoCardlessTransactionLike
) => {
  const remittanceArray = transaction.remittanceInformationUnstructuredArray;
  const joinedRemittance = Array.isArray(remittanceArray)
    ? remittanceArray.map((part) => part.trim()).filter(Boolean).join(" ")
    : undefined;

  return (
    normalizeDescription(transaction.remittanceInformationUnstructured) ||
    normalizeDescription(joinedRemittance) ||
    normalizeDescription(transaction.additionalInformation) ||
    normalizeDescription(transaction.creditorName) ||
    normalizeDescription(transaction.debtorName) ||
    "Bank transaction"
  );
};

export const normalizeGoCardlessTransaction = ({
  transaction,
  accountId,
  accountName,
  fundId,
}: {
  transaction: GoCardlessTransactionLike;
  accountId: string;
  accountName: string;
  fundId?: string | null;
}): ChurchCoinPendingBankTransaction => {
  const date = transaction.bookingDate || transaction.valueDate;
  if (!date) {
    throw new Error("GoCardless transaction is missing a date");
  }
  assertValidProviderTransactionDate(date, "GoCardless");

  const amount = getGoCardlessTransactionAmount(transaction);
  const providerTransactionId =
    normalizeDescription(transaction.transactionId) ||
    normalizeDescription(transaction.internalTransactionId) ||
    normalizeDescription(transaction.entryReference);

  if (!providerTransactionId) {
    throw new Error("GoCardless transaction is missing an identifier");
  }

  return {
    date,
    description: getGoCardlessTransactionDescription(transaction),
    amount: Math.abs(amount),
    type: amount > 0 ? "Income" : "Expenditure",
    accountId,
    accountName,
    fundId: fundId ?? null,
    providerTransactionId,
  };
};
```

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```bash
npm test tests/bankConnectionUtils.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add convex/lib/bankConnectionUtils.ts tests/bankConnectionUtils.test.ts
git commit -m "feat: normalize GoCardless bank transactions"
```

---

### Task 3: Add GoCardless Provider Client And Mapping Helpers

**Files:**
- Create: `tests/gocardless.test.ts`
- Create: `convex/lib/gocardless.ts`

- [ ] **Step 1: Write failing tests for pure provider helpers**

Create `tests/gocardless.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  getGoCardlessConsentExpiry,
  isGoCardlessReauthError,
  mapGoCardlessAccountDetails,
} from "../convex/lib/gocardless";

describe("GoCardless provider helpers", () => {
  it("maps GoCardless account details into ChurchCoin account fields", () => {
    expect(
      mapGoCardlessAccountDetails("account-1", {
        account: {
          name: "Metro Business Current",
          iban: "GB29NWBK60161331926819",
          cashAccountType: "CACC",
          currency: "GBP",
          product: "Business Current Account",
        },
      })
    ).toEqual({
      accountId: "account-1",
      providerAccountHash: "GB29NWBK60161331926819",
      name: "Metro Business Current",
      mask: "6819",
      type: "CACC",
      currency: "GBP",
    });
  });

  it("falls back to account id when GoCardless account names are unavailable", () => {
    expect(
      mapGoCardlessAccountDetails("account-2", {
        account: {
          currency: "GBP",
        },
      })
    ).toEqual({
      accountId: "account-2",
      providerAccountHash: undefined,
      name: "Bank account account-2",
      mask: undefined,
      type: undefined,
      currency: "GBP",
    });
  });

  it("detects GoCardless reauthentication errors", () => {
    expect(isGoCardlessReauthError({ status: 401 })).toBe(true);
    expect(isGoCardlessReauthError({ status: 403 })).toBe(true);
    expect(
      isGoCardlessReauthError({
        status: 409,
        summary: "Account Suspended",
      })
    ).toBe(true);
    expect(isGoCardlessReauthError({ status: 503 })).toBe(false);
  });

  it("calculates consent expiry from access-valid days", () => {
    expect(
      getGoCardlessConsentExpiry({
        now: new Date("2026-06-08T00:00:00.000Z").getTime(),
        accessValidForDays: 90,
      })
    ).toBe(new Date("2026-09-06T00:00:00.000Z").getTime());
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
npm test tests/gocardless.test.ts
```

Expected: FAIL because `convex/lib/gocardless.ts` does not exist.

- [ ] **Step 3: Implement `convex/lib/gocardless.ts`**

Create `convex/lib/gocardless.ts`:

```ts
type GoCardlessTokenResponse = {
  access?: string;
  access_expires?: number;
  refresh?: string;
  refresh_expires?: number;
};

type GoCardlessAgreementResponse = {
  id: string;
  access_valid_for_days?: number;
};

type GoCardlessRequisitionResponse = {
  id: string;
  status?: string;
  link?: string;
  accounts?: string[];
  reference?: string;
};

export type GoCardlessAccountDetailsResponse = {
  account?: {
    name?: string;
    ownerName?: string;
    iban?: string;
    bban?: string;
    maskedPan?: string;
    cashAccountType?: string;
    product?: string;
    currency?: string;
  };
};

export type GoCardlessTransactionsResponse = {
  transactions?: {
    booked?: unknown[];
    pending?: unknown[];
  };
};

export class GoCardlessApiError extends Error {
  status: number;
  statusText?: string;
  summary?: string;
  detail?: string;

  constructor({
    status,
    statusText,
    summary,
    detail,
  }: {
    status: number;
    statusText?: string;
    summary?: string;
    detail?: string;
  }) {
    super(
      summary || detail
        ? `GoCardless API request failed with status ${status}: ${summary || detail}`
        : `GoCardless API request failed with status ${status}${statusText ? ` ${statusText}` : ""}`
    );
    this.name = "GoCardlessApiError";
    this.status = status;
    this.statusText = statusText;
    this.summary = summary;
    this.detail = detail;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

const getRequiredEnv = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} not configured`);
  }
  return value;
};

const getApiBaseUrl = () =>
  process.env.GOCARDLESS_API_BASE_URL ||
  "https://bankaccountdata.gocardless.com/api/v2";

const getNormalizedApiBaseUrl = () => `${getApiBaseUrl().replace(/\/+$/, "")}/`;

const nonEmptyString = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

export const getGoCardlessDefaults = () => ({
  country: process.env.GOCARDLESS_COUNTRY || "GB",
  institutionId:
    process.env.GOCARDLESS_INSTITUTION_ID || "SANDBOXFINANCE_SFIN0000",
  institutionName:
    process.env.GOCARDLESS_INSTITUTION_NAME || "GoCardless Sandbox",
  redirectUrl: getRequiredEnv("GOCARDLESS_REDIRECT_URL"),
});

export const getGoCardlessConsentExpiry = ({
  now = Date.now(),
  accessValidForDays = 90,
}: {
  now?: number;
  accessValidForDays?: number;
}) => now + accessValidForDays * DAY_MS;

const getAccountMask = (account?: GoCardlessAccountDetailsResponse["account"]) => {
  const identifier =
    nonEmptyString(account?.iban) ||
    nonEmptyString(account?.bban) ||
    nonEmptyString(account?.maskedPan);
  if (!identifier) return undefined;
  const compactIdentifier = identifier.replace(/\s+/g, "");
  return compactIdentifier.slice(-4) || undefined;
};

export const mapGoCardlessAccountDetails = (
  accountId: string,
  details: GoCardlessAccountDetailsResponse
) => {
  const account = details.account || {};
  return {
    accountId,
    providerAccountHash:
      nonEmptyString(account.iban) ||
      nonEmptyString(account.bban) ||
      nonEmptyString(account.maskedPan),
    name:
      nonEmptyString(account.name) ||
      nonEmptyString(account.ownerName) ||
      nonEmptyString(account.product) ||
      `Bank account ${accountId}`,
    mask: getAccountMask(account),
    type:
      nonEmptyString(account.cashAccountType) ||
      nonEmptyString(account.product),
    currency: nonEmptyString(account.currency),
  };
};

export const isGoCardlessReauthError = (error: unknown) => {
  const candidate = error as {
    status?: unknown;
    summary?: unknown;
  };
  const status = candidate?.status;
  const summary =
    typeof candidate?.summary === "string" ? candidate.summary : undefined;

  return (
    status === 401 ||
    status === 403 ||
    (status === 409 && summary === "Account Suspended")
  );
};

let cachedToken:
  | {
      access: string;
      expiresAt: number;
    }
  | undefined;

const parseErrorBody = async (response: Response) => {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as { summary?: string; detail?: string };
  } catch {
    return { detail: text };
  }
};

const fetchToken = async <T>(path: string, body: Record<string, string>) => {
  const response = await fetch(new URL(path, getNormalizedApiBaseUrl()), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await parseErrorBody(response);
    throw new GoCardlessApiError({
      status: response.status,
      statusText: response.statusText || undefined,
      summary: error.summary,
      detail: error.detail,
    });
  }

  return (await response.json()) as T;
};

const cacheAccessToken = (token: GoCardlessTokenResponse) => {
  if (!token.access || typeof token.access !== "string") {
    throw new Error("GoCardless token response is invalid");
  }

  cachedToken = {
    access: token.access,
    expiresAt: Date.now() + Math.max((token.access_expires || 3600) - 60, 1) * 1000,
  };

  return cachedToken.access;
};

const createAccessToken = async () => {
  const token = await fetchToken<GoCardlessTokenResponse>("token/new/", {
    secret_id: getRequiredEnv("GOCARDLESS_SECRET_ID"),
    secret_key: getRequiredEnv("GOCARDLESS_SECRET_KEY"),
  });

  if (token.access) {
    return cacheAccessToken(token);
  }

  if (!token.refresh || typeof token.refresh !== "string") {
    throw new Error("GoCardless token response is invalid");
  }

  const refreshed = await fetchToken<GoCardlessTokenResponse>(
    "token/refresh/",
    { refresh: token.refresh }
  );
  return cacheAccessToken(refreshed);
};

const getAccessToken = async () => {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.access;
  }
  return await createAccessToken();
};

const goCardlessRequest = async <T>(
  path: string,
  init: RequestInit = {}
): Promise<T> => {
  const accessToken = await getAccessToken();
  const url = new URL(path.replace(/^\/+/, ""), getNormalizedApiBaseUrl());
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    const error = await parseErrorBody(response);
    throw new GoCardlessApiError({
      status: response.status,
      statusText: response.statusText || undefined,
      summary: error.summary,
      detail: error.detail,
    });
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
};

export const createEndUserAgreement = async ({
  institutionId,
  maxHistoricalDays = 90,
  accessValidForDays = 90,
}: {
  institutionId: string;
  maxHistoricalDays?: number;
  accessValidForDays?: number;
}) =>
  await goCardlessRequest<GoCardlessAgreementResponse>(
    "agreements/enduser/",
    {
      method: "POST",
      body: JSON.stringify({
        institution_id: institutionId,
        max_historical_days: maxHistoricalDays,
        access_valid_for_days: accessValidForDays,
        access_scope: ["balances", "details", "transactions"],
      }),
    }
  );

export const createRequisition = async ({
  redirectUrl,
  institutionId,
  reference,
  agreementId,
}: {
  redirectUrl: string;
  institutionId: string;
  reference: string;
  agreementId: string;
}) =>
  await goCardlessRequest<GoCardlessRequisitionResponse>("requisitions/", {
    method: "POST",
    body: JSON.stringify({
      redirect: redirectUrl,
      institution_id: institutionId,
      reference,
      agreement: agreementId,
      user_language: "EN",
    }),
  });

export const getRequisition = async (requisitionId: string) =>
  await goCardlessRequest<GoCardlessRequisitionResponse>(
    `requisitions/${encodeURIComponent(requisitionId)}/`
  );

export const getAccountDetails = async (accountId: string) =>
  await goCardlessRequest<GoCardlessAccountDetailsResponse>(
    `accounts/${encodeURIComponent(accountId)}/details/`
  );

export const getAccountTransactions = async ({
  accountId,
  dateFrom,
  dateTo,
}: {
  accountId: string;
  dateFrom: string;
  dateTo: string;
}) => {
  const params = new URLSearchParams({
    date_from: dateFrom,
    date_to: dateTo,
  });

  return await goCardlessRequest<GoCardlessTransactionsResponse>(
    `accounts/${encodeURIComponent(accountId)}/transactions/?${params}`
  );
};

export const deleteRequisition = async (requisitionId: string) =>
  await goCardlessRequest<Record<string, never>>(
    `requisitions/${encodeURIComponent(requisitionId)}/`,
    { method: "DELETE" }
  );
```

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```bash
npm test tests/gocardless.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add convex/lib/gocardless.ts tests/gocardless.test.ts
git commit -m "feat: add GoCardless provider client"
```

---

### Task 4: Update Provider Schema And Internal Mutations

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/mutations/bankConnections.ts`

- [ ] **Step 1: Update schema provider unions**

In `convex/schema.ts`, change both provider definitions:

```ts
provider: v.union(v.literal("gocardless"), v.literal("enable_banking")),
```

Apply this to:

- `bankConnections`
- `pendingBankConnections`

- [ ] **Step 2: Add pending requisition storage**

In the `pendingBankConnections` table in `convex/schema.ts`, add:

```ts
providerConnectionId: v.optional(v.string()),
```

Place it near the provider/state fields:

```ts
provider: v.union(v.literal("gocardless"), v.literal("enable_banking")),
state: v.string(),
providerConnectionId: v.optional(v.string()),
status: v.union(
```

- [ ] **Step 3: Update mutation provider validator**

In `convex/mutations/bankConnections.ts`, replace:

```ts
const providerSchema = v.literal("enable_banking");
```

with:

```ts
const providerSchema = v.union(
  v.literal("gocardless"),
  v.literal("enable_banking")
);
```

- [ ] **Step 4: Add pending requisition mutation**

In `convex/mutations/bankConnections.ts`, add this internal mutation after `createPending`:

```ts
export const attachPendingProviderConnection = internalMutation({
  args: {
    state: v.string(),
    providerConnectionId: v.string(),
  },
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("pendingBankConnections")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();

    if (!pending || pending.status !== "pending") {
      return null;
    }

    await ctx.db.patch(pending._id, {
      providerConnectionId: args.providerConnectionId,
      updatedAt: Date.now(),
    });

    return pending._id;
  },
});
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS, or only generated Convex type errors until `npx convex dev --once` is run. If Convex generated types are stale, run:

```bash
npx convex dev --once
npm run typecheck
```

Expected after regeneration: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add convex/schema.ts convex/mutations/bankConnections.ts convex/_generated
git commit -m "feat: allow GoCardless bank connection provider"
```

If `convex/_generated` is unchanged, omit it from the commit.

---

### Task 5: Switch Bank Connection Actions To GoCardless

**Files:**
- Modify: `convex/actions/bankConnections.ts`
- Test: `tests/bankConnectionUtils.test.ts`
- Test: `tests/gocardless.test.ts`

- [ ] **Step 1: Replace Enable Banking imports**

At the top of `convex/actions/bankConnections.ts`, remove:

```ts
import {
  closeSession,
  EnableBankingApiError,
  getAccountTransactions,
  getConsentValidUntil,
  getEnableBankingDefaults,
  startAuthorization,
} from "../lib/enableBanking";
```

Replace it with:

```ts
import {
  createEndUserAgreement,
  createRequisition,
  deleteRequisition,
  getAccountTransactions,
  getGoCardlessConsentExpiry,
  getGoCardlessDefaults,
  GoCardlessApiError,
  isGoCardlessReauthError,
} from "../lib/gocardless";
```

Update the bank utility import from:

```ts
normalizeEnableBankingTransaction,
```

to:

```ts
normalizeGoCardlessTransaction,
```

- [ ] **Step 2: Update authorization URL validation messages**

Replace `assertValidAuthorizationUrl` with:

```ts
const assertValidAuthorizationUrl = (url: unknown) => {
  if (typeof url !== "string") {
    throw new Error("GoCardless returned an invalid authorization URL");
  }

  const trimmedUrl = url.trim();

  try {
    const parsed = new URL(trimmedUrl);
    if (parsed.protocol !== "https:") throw new Error();
    return trimmedUrl;
  } catch {
    throw new Error("GoCardless returned an invalid authorization URL");
  }
};
```

- [ ] **Step 3: Update `startConnection`**

Inside `startConnection`, replace the Enable Banking defaults and pending creation/provider call with:

```ts
const defaults = getGoCardlessDefaults();
const state = randomState();
const expiresAt = Date.now() + 15 * 60 * 1000;
const existingConnectionId = args.existingConnectionId;
```

Use this pending mutation payload:

```ts
await ctx.runMutation(internal.mutations.bankConnections.createPending, {
  organizationId: user.organizationId,
  createdBy: user._id,
  provider: "gocardless",
  state,
  aspspCountry: defaults.country,
  aspspName: defaults.institutionName,
  existingConnectionId,
  expiresAt,
});
```

Replace the provider request block with:

```ts
try {
  const agreement = await createEndUserAgreement({
    institutionId: defaults.institutionId,
    maxHistoricalDays: 90,
    accessValidForDays: 90,
  });

  const requisition = await createRequisition({
    redirectUrl: defaults.redirectUrl,
    institutionId: defaults.institutionId,
    reference: state,
    agreementId: agreement.id,
  });

  await ctx.runMutation(
    internal.mutations.bankConnections.attachPendingProviderConnection,
    {
      state,
      providerConnectionId: requisition.id,
    }
  );

  return { authorizationUrl: assertValidAuthorizationUrl(requisition.link) };
} catch (error: any) {
  try {
    await ctx.runMutation(internal.mutations.bankConnections.markPendingError, {
      state,
      errorCode: "AUTHORIZATION_START_FAILED",
      errorMessage:
        error?.message || "Failed to start GoCardless bank authorization",
    });
  } catch {
    // Preserve the original provider or validation error for the caller.
  }

  throw error;
}
```

- [ ] **Step 4: Update `syncTransactions`**

In the sync loop, replace the transaction fetch/validation block with:

```ts
const response = await getAccountTransactions({
  accountId: account.accountId,
  dateFrom,
  dateTo,
});

const bookedTransactions = response.transactions?.booked;
if (!Array.isArray(bookedTransactions)) {
  throw new Error("GoCardless transactions response is invalid");
}
```

Remove `responseContinuationKey` handling because GoCardless account transactions for the selected date range do not return the Enable Banking continuation key shape. Keep the outer account loop and `MAX_SYNC_TRANSACTIONS` capacity behavior, but do not create a cursor for the same GoCardless account because the API response has no continuation token. Replace the loop body with:

```ts
if (bookedTransactions.length > remainingCapacity) {
  throw new Error(
    "GoCardless returned more transactions than can be reviewed in one sync. Try again after importing the current review batch or reduce the sync range."
  );
}

for (const transaction of bookedTransactions) {
  transactions.push(
    normalizeGoCardlessTransaction({
      transaction: transaction as any,
      accountId: account.accountId,
      accountName: account.name,
      fundId: account.fundId as string,
    })
  );
}
```

After the booked loop, keep the existing next-account capacity check:

```ts
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
```

- [ ] **Step 5: Update sync error handling**

Replace the authorization error detection block with:

```ts
const isAuthorizationError =
  error instanceof GoCardlessApiError && isGoCardlessReauthError(error);
```

Keep the existing `updateStatus` mutation but use the same `AUTHORIZATION_REQUIRED` code.

- [ ] **Step 6: Update `removeConnection`**

Replace `closeSession(connection.providerConnectionId)` with:

```ts
await deleteRequisition(connection.providerConnectionId);
```

Replace the catch guard with:

```ts
if (!(error instanceof GoCardlessApiError && error.status === 404)) {
  throw error;
}
```

- [ ] **Step 7: Run tests and typecheck**

Run:

```bash
npm test tests/bankConnectionUtils.test.ts tests/gocardless.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add convex/actions/bankConnections.ts
git commit -m "feat: use GoCardless for bank connection actions"
```

---

### Task 6: Add GoCardless Callback Route

**Files:**
- Modify: `convex/http.ts`
- Modify: `convex/lib/gocardless.ts` if account mapping needs a small exported type adjustment

- [ ] **Step 1: Replace Enable Banking callback imports**

In `convex/http.ts`, remove:

```ts
import { authorizeSession, getConsentValidUntil } from "./lib/enableBanking";
```

Add:

```ts
import {
  getAccountDetails,
  getGoCardlessConsentExpiry,
  getRequisition,
  mapGoCardlessAccountDetails,
} from "./lib/gocardless";
```

- [ ] **Step 2: Remove Enable Banking account mapper code**

Delete the `EnableBankingCallbackAccount` type and these functions if no longer used:

```ts
const getAccountMask = ...
const mapEnableBankingAccount = ...
```

Keep `nonEmptyString`, `trimCallbackValue`, `safeErrorMessage`, settings redirect helpers, and Plaid webhook helpers.

- [ ] **Step 3: Add the GoCardless callback route**

Add this route before the legacy Enable Banking callback or replace the active callback block:

```ts
http.route({
  path: "/gocardless/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const state = trimCallbackValue(url.searchParams.get("ref"));
    const providerError = trimCallbackValue(url.searchParams.get("error"));
    const providerErrorDescription = trimCallbackValue(
      url.searchParams.get("error_description")
    );

    if (!state) {
      return new Response("GoCardless callback endpoint is ready.", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
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

    try {
      if (!pending.providerConnectionId) {
        await ctx.runMutation(
          internal.mutations.bankConnections.markPendingError,
          {
            state,
            errorCode: "MISSING_REQUISITION_ID",
            errorMessage: "Bank authorization session is missing a requisition ID",
          }
        );
        return redirectToBankSettings(request, "error");
      }

      const requisition = await getRequisition(pending.providerConnectionId);
      if (!Array.isArray(requisition.accounts) || requisition.accounts.length === 0) {
        await ctx.runMutation(
          internal.mutations.bankConnections.markPendingError,
          {
            state,
            errorCode: "NO_ACCOUNTS",
            errorMessage: "Bank authorization did not return any accounts",
          }
        );
        return redirectToBankSettings(request, "error");
      }

      const accounts = await Promise.all(
        requisition.accounts.map(async (accountId) =>
          mapGoCardlessAccountDetails(accountId, await getAccountDetails(accountId))
        )
      );

      await ctx.runMutation(
        internal.mutations.bankConnections.completePending,
        {
          state,
          providerConnectionId: requisition.id,
          accounts,
          consentExpiresAt: getGoCardlessConsentExpiry({ accessValidForDays: 90 }),
        }
      );

      return redirectToBankSettings(request, "success");
    } catch (error: any) {
      await ctx.runMutation(
        internal.mutations.bankConnections.markPendingError,
        {
          state,
          errorCode: "REQUISITION_EXCHANGE_FAILED",
          errorMessage:
            error?.message || "Failed to complete GoCardless bank authorization",
        }
      );
      return redirectToBankSettings(request, "error");
    }
  }),
});
```

- [ ] **Step 4: Keep legacy Enable Banking route validator-friendly**

Replace the existing `/enable-banking/callback` handler body with a plain health response:

```ts
handler: httpAction(async () => {
  return new Response(
    "Enable Banking is no longer the active ChurchCoinAI bank provider.",
    {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    }
  );
}),
```

This avoids carrying dead Enable Banking callback logic while keeping old provider validators from seeing a hard 404.

- [ ] **Step 5: Run generated typecheck**

Run:

```bash
npx convex dev --once
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add convex/http.ts convex/_generated
git commit -m "feat: add GoCardless bank callback"
```

If `convex/_generated` is unchanged, omit it from the commit.

---

### Task 7: Update Frontend And Legal Copy

**Files:**
- Modify: `components/BankConnectionsSettings.tsx`
- Modify: `components/legal/LegalPage.tsx`
- Optional modify: `components/TransactionManager.tsx` only if `rg "Enable Banking" components/TransactionManager.tsx` finds provider-specific copy

- [ ] **Step 1: Update bank settings copy**

In `components/BankConnectionsSettings.tsx`, update the subtitle:

```tsx
<p className="text-[10px] text-grey-mid">
  Connect UK bank accounts via GoCardless Open Banking.
</p>
```

Update the empty state body:

```tsx
<p className="text-xs text-grey-mid max-w-sm mx-auto mb-6">
  Connect a UK bank account through GoCardless, map it to a fund, then manually sync transactions for review before import.
</p>
```

Add this guidance block below the connect button area inside the `swiss-card`, before the empty/non-empty state conditional:

```tsx
<div className="px-6 py-3 border-b border-ledger bg-blue-50">
  <p className="text-[11px] leading-relaxed text-blue-900">
    Metro Bank users: when the bank login opens, select the business account
    or profile you want ChurchCoinAI to read. Personal accounts can appear in
    the same Metro Bank flow.
  </p>
</div>
```

- [ ] **Step 2: Update info box copy**

Replace the final info box text with:

```tsx
<strong>GoCardless Open Banking:</strong> Connections are read-only and require consent renewal every 90 days.
You'll be notified before consent expires and can re-authenticate without losing your transaction history.
```

- [ ] **Step 3: Update legal pages**

In `components/legal/LegalPage.tsx`, replace privacy banking data body with:

```ts
"When an authorised user connects a bank account, ChurchCoinAI uses GoCardless Bank Account Data to request read-only account and transaction access. We do not receive or store online banking passwords. Imported transactions are shown for manual review before they are added to the ledger.",
```

Replace processors body with:

```ts
"The service uses trusted processors including Convex for application data hosting, Clerk for authentication, Stripe for subscription billing, GoCardless for open banking connectivity, and AI providers for categorisation features where enabled.",
```

Replace terms bank connections body with:

```ts
"Bank connections are read-only and require explicit user consent through GoCardless Open Banking. You may disconnect a bank connection or allow consent to expire. Transaction sync is manual and reviewed before import.",
```

- [ ] **Step 4: Search for stale active-provider copy**

Run:

```bash
rg -n "Enable Banking|ENABLE_BANKING|enable-banking" components convex .env.example AGENTS.md README.md docs -S
```

Expected: no active user-facing Enable Banking references except old design docs or explicitly legacy route text.

- [ ] **Step 5: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add components/BankConnectionsSettings.tsx components/legal/LegalPage.tsx
git commit -m "chore: update bank provider copy to GoCardless"
```

Include `components/TransactionManager.tsx` only if it was modified.

---

### Task 8: Update Environment And Repo Documentation

**Files:**
- Modify: `.env.example`
- Modify: `convex/README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update `.env.example`**

Replace the active banking block with:

```text
# GoCardless Bank Account Data (UK Open Banking) - set in Convex Dashboard
# Sandbox institution: SANDBOXFINANCE_SFIN0000
# Get credentials from https://bankaccountdata.gocardless.com
# GOCARDLESS_SECRET_ID=your-secret-id
# GOCARDLESS_SECRET_KEY=your-secret-key
# GOCARDLESS_REDIRECT_URL=https://your-deployment.convex.site/gocardless/callback
# GOCARDLESS_INSTITUTION_ID=SANDBOXFINANCE_SFIN0000
# GOCARDLESS_COUNTRY=GB
# GOCARDLESS_INSTITUTION_NAME=GoCardless Sandbox
# Optional:
# GOCARDLESS_API_BASE_URL=https://bankaccountdata.gocardless.com/api/v2
```

Keep Plaid webhook variables only if the file clearly labels them as preserved compatibility, not active provider config.

- [ ] **Step 2: Update `convex/README.md`**

Replace the Enable Banking section with:

```md
## GoCardless Bank Account Data

Bank connection secrets are backend-only Convex environment variables:

- `GOCARDLESS_SECRET_ID`
- `GOCARDLESS_SECRET_KEY`
- `GOCARDLESS_REDIRECT_URL`
- `GOCARDLESS_INSTITUTION_ID`
- `GOCARDLESS_COUNTRY`
- `GOCARDLESS_INSTITUTION_NAME`
- Optional `GOCARDLESS_API_BASE_URL`
- `APP_BASE_URL`

Set them with `npx convex env set`. Do not expose these values through `VITE_*` variables.

Sandbox defaults:

- `GOCARDLESS_INSTITUTION_ID=SANDBOXFINANCE_SFIN0000`
- `GOCARDLESS_COUNTRY=GB`
- `GOCARDLESS_INSTITUTION_NAME=GoCardless Sandbox`
- `GOCARDLESS_REDIRECT_URL=https://<deployment>.convex.site/gocardless/callback`

The active flow is manual sync:

1. Admin or Finance Team starts a connection from Settings > Bank Connections.
2. GoCardless redirects back to `/gocardless/callback`.
3. Returned accounts are mapped to funds.
4. Transactions are fetched on demand from the Transactions screen and reviewed before import.

Before live Metro Bank rollout, confirm the live Metro Bank institution ID from the GoCardless institution list or dashboard.
```

- [ ] **Step 3: Update `AGENTS.md`**

Change the banking architecture line to:

```text
- **Banking:** Provider-neutral bank connections, with GoCardless Bank Account Data as the active provider for manual UK Open Banking transaction sync
```

Replace Enable Banking env var names with the GoCardless names from this task.

Change the HTTP integration note to:

```text
- HTTP integration endpoints live in `convex/http.ts` (Stripe at `/stripe/webhook`, active GoCardless callback at `/gocardless/callback`, preserved Plaid webhook compatibility at `/plaid/webhook`, and legacy Enable Banking callback health at `/enable-banking/callback`)
```

- [ ] **Step 4: Run stale reference search**

Run:

```bash
rg -n "ENABLE_BANKING|Enable Banking|enable-banking" . -S
```

Expected: references may remain in old spec/plan docs and legacy callback health text. There should be no active env instructions, legal copy, or UI copy pointing users to Enable Banking.

- [ ] **Step 5: Commit**

Run:

```bash
git add .env.example convex/README.md AGENTS.md
git commit -m "docs: document GoCardless bank configuration"
```

---

### Task 9: Final Verification And Sandbox Readiness

**Files:**
- No planned source edits unless verification finds a bug.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected:

- All Vitest tests pass.
- TypeScript emits no errors.
- Vite production build succeeds.

- [ ] **Step 2: Run Convex generation/deploy check**

Run:

```bash
npx convex dev --once
```

Expected: Convex functions are ready. If this mutates generated files, inspect and commit only relevant generated type changes.

- [ ] **Step 3: Verify callback readiness locally or against deployed dev**

After Convex dev deployment is updated, run:

```bash
curl.exe -i -L --max-time 20 https://efficient-dogfish-623.convex.site/gocardless/callback
```

Expected:

```text
HTTP/1.1 200 OK
GoCardless callback endpoint is ready.
```

If using another deployment, replace the hostname with that deployment's `.convex.site` URL.

- [ ] **Step 4: Document required Convex env setup for the user**

Prepare these commands for the final handoff, but do not run them unless the user has supplied real secrets locally:

```powershell
npx convex env set GOCARDLESS_SECRET_ID "..."
npx convex env set GOCARDLESS_SECRET_KEY "..."
npx convex env set GOCARDLESS_REDIRECT_URL "https://efficient-dogfish-623.convex.site/gocardless/callback"
npx convex env set GOCARDLESS_INSTITUTION_ID "SANDBOXFINANCE_SFIN0000"
npx convex env set GOCARDLESS_COUNTRY "GB"
npx convex env set GOCARDLESS_INSTITUTION_NAME "GoCardless Sandbox"
npx convex env set APP_BASE_URL "https://www.churchcoin.co.uk"
```

- [ ] **Step 5: Final commit if verification changed generated files**

If any generated files changed in Step 2:

```bash
git add convex/_generated
git commit -m "chore: refresh Convex generated types"
```

- [ ] **Step 6: Report completion**

Final report should include:

- Branch/worktree path.
- Commit list summary.
- Verification commands and pass/fail results.
- Exact GoCardless sandbox env commands.
- Remaining manual step: user must create GoCardless credentials and, later, confirm the live Metro Bank institution ID.

---

## Self-Review Checklist

- Spec coverage: every design section has a task: normalization, provider client, schema, actions, callback, UI/legal copy, env docs, verification.
- No multi-provider UI is introduced.
- Manual sync and review flow remains unchanged at the React action level.
- GoCardless secrets remain backend-only.
- The plan avoids hardcoding a live Metro Bank institution ID.
- The legacy Plaid compatibility path is left alone.
