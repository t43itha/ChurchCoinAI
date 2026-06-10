# Bank Statement Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual `isReconciled` checkbox with statement-based reconciliation sessions where a period is reconciled only when ledger items match the bank statement closing balance to the penny.

**Architecture:** A new `reconciliationSessions` table (scoped per fund, since bank accounts map to funds) stores statement opening/closing balances for a period. Users tick ("clear") transactions into the session; pure math in `lib/reconciliation.ts` computes the live difference; a session can only be completed when the difference is £0.00. `isReconciled` becomes derived — set automatically when a session completes, cleared when it reopens. Transactions in a completed session are locked against edit/delete until the session is reopened with an audit reason.

**Tech Stack:** Convex (queries/mutations), React 19 + TypeScript, vitest for pure-logic tests, Swiss Ledger design classes.

**Out of scope (separate plans):** cash/cheque collection → deposit linking (the `cashBankingReconciliations` work stranded in `.worktrees/dashboard-kpi-redesign` — merge that separately); AI matching; removal of the `reconcilePledges` feature.

**Key existing files to know:**
- `convex/schema.ts` — all tables; `transactions` at line ~132 has `isReconciled: v.boolean()`
- `convex/mutations/transactions.ts` — `create`, `update`, `bulkUpdate`, `batchUpdate`, `remove`, `toggleVoided` all touch `isReconciled`
- `convex/lib/auth.ts` — `requireAuth(ctx)`, `requireRole(ctx, ["Admin", "Finance Team"])` return a user with `organizationId`
- `components/TransactionManager.tsx` — current UI with manual checkbox (lines ~1548, ~1745) and bulk Reconcile button (~1189)
- `tests/transactionValidation.test.ts` — existing vitest pattern
- Money is stored as floating-point pounds; always compare in integer pence.

---

### Task 1: Pure reconciliation math (`lib/reconciliation.ts`)

**Files:**
- Create: `lib/reconciliation.ts`
- Test: `tests/reconciliation.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/reconciliation.test.ts
import { describe, it, expect } from "vitest";
import {
  toPence,
  computeClearedTotalPence,
  computeDifferencePence,
  canCompleteSession,
} from "../lib/reconciliation";

const tx = (amount: number, type: "Income" | "Expenditure") => ({ amount, type });

describe("toPence", () => {
  it("converts pounds to integer pence", () => {
    expect(toPence(10.5)).toBe(1050);
  });
  it("handles float artifacts", () => {
    expect(toPence(0.1 + 0.2)).toBe(30);
  });
  it("handles negatives", () => {
    expect(toPence(-5.25)).toBe(-525);
  });
});

describe("computeClearedTotalPence", () => {
  it("sums income minus expenditure", () => {
    const cleared = [tx(100, "Income"), tx(40.5, "Expenditure"), tx(25, "Income")];
    expect(computeClearedTotalPence(cleared)).toBe(8450); // 100 + 25 - 40.50
  });
  it("returns 0 for empty list", () => {
    expect(computeClearedTotalPence([])).toBe(0);
  });
});

describe("computeDifferencePence", () => {
  // difference = (opening + cleared movement) - closing
  it("is zero when statement balances", () => {
    const cleared = [tx(500, "Income"), tx(200, "Expenditure")];
    expect(computeDifferencePence(1000, 1300, cleared)).toBe(0);
  });
  it("is positive when ledger has more than statement", () => {
    const cleared = [tx(500, "Income")];
    expect(computeDifferencePence(1000, 1400, cleared)).toBe(10000); // £100 over
  });
  it("is negative when items are missing from ledger", () => {
    expect(computeDifferencePence(1000, 1100, [])).toBe(-10000);
  });
  it("survives float-unfriendly amounts", () => {
    const cleared = [tx(0.1, "Income"), tx(0.2, "Income")];
    expect(computeDifferencePence(0, 0.3, cleared)).toBe(0);
  });
});

describe("canCompleteSession", () => {
  it("allows completion only at exactly zero difference", () => {
    expect(canCompleteSession(0)).toBe(true);
    expect(canCompleteSession(1)).toBe(false);
    expect(canCompleteSession(-1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/reconciliation.test.ts`
Expected: FAIL — cannot resolve `../lib/reconciliation`

- [ ] **Step 3: Write the implementation**

```typescript
// lib/reconciliation.ts
// Pure money math for statement reconciliation. All comparisons happen in
// integer pence because transaction amounts are stored as floating-point pounds.

export interface ClearedTransactionLike {
  amount: number;
  type: "Income" | "Expenditure";
}

export function toPence(pounds: number): number {
  return Math.round(pounds * 100);
}

export function computeClearedTotalPence(
  cleared: ClearedTransactionLike[]
): number {
  return cleared.reduce(
    (sum, t) => sum + (t.type === "Income" ? toPence(t.amount) : -toPence(t.amount)),
    0
  );
}

export function computeDifferencePence(
  statementOpeningBalance: number,
  statementClosingBalance: number,
  cleared: ClearedTransactionLike[]
): number {
  return (
    toPence(statementOpeningBalance) +
    computeClearedTotalPence(cleared) -
    toPence(statementClosingBalance)
  );
}

export function canCompleteSession(differencePence: number): boolean {
  return differencePence === 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/reconciliation.test.ts`
Expected: PASS (all 10 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/reconciliation.ts tests/reconciliation.test.ts
git commit -m "feat: pure pence-based math for statement reconciliation"
```

---

### Task 2: Schema — `reconciliationSessions` table + transaction link field

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Add the table**

In `convex/schema.ts`, after the `cashCollections` table definition (ends ~line 182), add:

```typescript
  // Bank statement reconciliation sessions (one per fund per statement period)
  reconciliationSessions: defineTable({
    organizationId: v.id("organizations"),
    fundId: v.id("funds"), // bank accounts map to funds
    periodStart: v.string(), // ISO date YYYY-MM-DD
    periodEnd: v.string(),
    statementOpeningBalance: v.number(), // pounds, as printed on the statement
    statementClosingBalance: v.number(),
    status: v.union(
      v.literal("draft"),
      v.literal("completed"),
      v.literal("reopened")
    ),
    completedAt: v.optional(v.number()),
    completedBy: v.optional(v.id("users")),
    reopenedReason: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_fund", ["organizationId", "fundId"])
    .index("by_organization_status", ["organizationId", "status"]),
```

- [ ] **Step 2: Add the link field to `transactions`**

In the `transactions` table definition, after `cashCollectionId: v.optional(v.id("cashCollections")),` add:

```typescript
    reconciliationSessionId: v.optional(v.id("reconciliationSessions")),
```

And after `.index("by_cashCollection", ["cashCollectionId"])` add:

```typescript
    .index("by_reconciliationSession", ["reconciliationSessionId"])
```

- [ ] **Step 3: Verify schema deploys and types regenerate**

Run: `npx convex dev --once`
Expected: "Convex functions ready" with no schema validation errors (the new field is optional, so existing rows pass).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat: reconciliationSessions table and transaction link field"
```

---

### Task 3: Session mutations

**Files:**
- Create: `convex/mutations/reconciliationSessions.ts`

- [ ] **Step 1: Write the mutations file**

```typescript
// convex/mutations/reconciliationSessions.ts
import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";
import {
  computeDifferencePence,
  canCompleteSession,
} from "../../lib/reconciliation";

// Start a new statement reconciliation session for a fund/period
export const create = mutation({
  args: {
    fundId: v.id("funds"),
    periodStart: v.string(),
    periodEnd: v.string(),
    statementOpeningBalance: v.number(),
    statementClosingBalance: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const fund = await ctx.db.get(args.fundId);
    if (!fund || fund.organizationId !== user.organizationId) {
      throw new Error("Invalid fund");
    }
    if (args.periodEnd < args.periodStart) {
      throw new Error("Period end must be on or after period start");
    }

    // Only one open (draft/reopened) session per fund at a time
    const sessions = await ctx.db
      .query("reconciliationSessions")
      .withIndex("by_organization_fund", (q) =>
        q.eq("organizationId", user.organizationId).eq("fundId", args.fundId)
      )
      .collect();
    if (sessions.some((s) => s.status !== "completed")) {
      throw new Error(
        "Finish or complete the existing open reconciliation for this fund first"
      );
    }

    return await ctx.db.insert("reconciliationSessions", {
      organizationId: user.organizationId,
      fundId: args.fundId,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      statementOpeningBalance: args.statementOpeningBalance,
      statementClosingBalance: args.statementClosingBalance,
      status: "draft",
      createdBy: user._id,
      createdAt: Date.now(),
    });
  },
});

// Edit statement balances/period while the session is open
export const updateBalances = mutation({
  args: {
    sessionId: v.id("reconciliationSessions"),
    statementOpeningBalance: v.optional(v.number()),
    statementClosingBalance: v.optional(v.number()),
    periodStart: v.optional(v.string()),
    periodEnd: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.organizationId !== user.organizationId) {
      throw new Error("Session not found");
    }
    if (session.status === "completed") {
      throw new Error("Reopen the session before editing it");
    }
    const updates: Record<string, any> = {};
    if (args.statementOpeningBalance !== undefined)
      updates.statementOpeningBalance = args.statementOpeningBalance;
    if (args.statementClosingBalance !== undefined)
      updates.statementClosingBalance = args.statementClosingBalance;
    if (args.periodStart !== undefined) updates.periodStart = args.periodStart;
    if (args.periodEnd !== undefined) updates.periodEnd = args.periodEnd;
    await ctx.db.patch(args.sessionId, updates);
    return args.sessionId;
  },
});

// Tick/untick a transaction into the session
export const setCleared = mutation({
  args: {
    sessionId: v.id("reconciliationSessions"),
    transactionId: v.id("transactions"),
    cleared: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.organizationId !== user.organizationId) {
      throw new Error("Session not found");
    }
    if (session.status === "completed") {
      throw new Error("Session is completed — reopen it to change matches");
    }
    const transaction = await ctx.db.get(args.transactionId);
    if (!transaction || transaction.organizationId !== user.organizationId) {
      throw new Error("Transaction not found");
    }
    if (args.cleared) {
      if (
        transaction.reconciliationSessionId &&
        transaction.reconciliationSessionId !== args.sessionId
      ) {
        throw new Error("Transaction already belongs to another session");
      }
      if (transaction.fundId !== session.fundId) {
        throw new Error("Transaction belongs to a different fund");
      }
      if (transaction.isVoided) {
        throw new Error("Voided transactions cannot be reconciled");
      }
      await ctx.db.patch(args.transactionId, {
        reconciliationSessionId: args.sessionId,
      });
    } else {
      if (transaction.reconciliationSessionId !== args.sessionId) return;
      await ctx.db.patch(args.transactionId, {
        reconciliationSessionId: undefined,
        isReconciled: false,
      });
    }
  },
});

// Complete: server-side re-validation that the difference is exactly zero
export const complete = mutation({
  args: { sessionId: v.id("reconciliationSessions") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.organizationId !== user.organizationId) {
      throw new Error("Session not found");
    }
    if (session.status === "completed") {
      throw new Error("Session is already completed");
    }

    const cleared = await ctx.db
      .query("transactions")
      .withIndex("by_reconciliationSession", (q) =>
        q.eq("reconciliationSessionId", args.sessionId)
      )
      .collect();

    const differencePence = computeDifferencePence(
      session.statementOpeningBalance,
      session.statementClosingBalance,
      cleared
    );
    if (!canCompleteSession(differencePence)) {
      throw new Error(
        `Cannot complete: difference is £${(differencePence / 100).toFixed(2)}. ` +
          "Match remaining items or book an adjustment."
      );
    }

    for (const t of cleared) {
      await ctx.db.patch(t._id, { isReconciled: true });
    }
    await ctx.db.patch(args.sessionId, {
      status: "completed",
      completedAt: Date.now(),
      completedBy: user._id,
    });
    return { clearedCount: cleared.length };
  },
});

// Reopen a completed session with an audit reason
export const reopen = mutation({
  args: {
    sessionId: v.id("reconciliationSessions"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.organizationId !== user.organizationId) {
      throw new Error("Session not found");
    }
    if (session.status !== "completed") {
      throw new Error("Only completed sessions can be reopened");
    }
    if (!args.reason.trim()) {
      throw new Error("A reason is required to reopen a reconciliation");
    }

    const cleared = await ctx.db
      .query("transactions")
      .withIndex("by_reconciliationSession", (q) =>
        q.eq("reconciliationSessionId", args.sessionId)
      )
      .collect();
    for (const t of cleared) {
      await ctx.db.patch(t._id, { isReconciled: false });
    }
    await ctx.db.patch(args.sessionId, {
      status: "reopened",
      reopenedReason: args.reason.trim(),
    });
    return args.sessionId;
  },
});

// Delete a draft session (frees its transactions)
export const remove = mutation({
  args: { sessionId: v.id("reconciliationSessions") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.organizationId !== user.organizationId) {
      throw new Error("Session not found");
    }
    if (session.status === "completed") {
      throw new Error("Completed sessions cannot be deleted — reopen first");
    }
    const cleared = await ctx.db
      .query("transactions")
      .withIndex("by_reconciliationSession", (q) =>
        q.eq("reconciliationSessionId", args.sessionId)
      )
      .collect();
    for (const t of cleared) {
      await ctx.db.patch(t._id, {
        reconciliationSessionId: undefined,
        isReconciled: false,
      });
    }
    await ctx.db.delete(args.sessionId);
    return args.sessionId;
  },
});
```

- [ ] **Step 2: Verify it compiles and deploys**

Run: `npx convex dev --once` then `npx tsc --noEmit`
Expected: both clean. (Convex bundles the relative import from `lib/` — same pattern as `queries/transactions.ts` importing `constants/rciCategories`.)

- [ ] **Step 3: Commit**

```bash
git add convex/mutations/reconciliationSessions.ts convex/_generated
git commit -m "feat: reconciliation session mutations (create/clear/complete/reopen)"
```

---

### Task 4: Session queries

**Files:**
- Create: `convex/queries/reconciliationSessions.ts`

- [ ] **Step 1: Write the queries file**

```typescript
// convex/queries/reconciliationSessions.ts
import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../lib/auth";

// All sessions for the organization, newest first, with fund names
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const sessions = await ctx.db
      .query("reconciliationSessions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .order("desc")
      .collect();

    return await Promise.all(
      sessions.map(async (s) => {
        const fund = await ctx.db.get(s.fundId);
        return { ...s, fundName: fund?.name ?? "Unknown fund" };
      })
    );
  },
});

// Workspace data for one session: the session, its cleared transactions,
// and candidate (unmatched, same-fund, not-after-period-end) transactions.
export const workspace = query({
  args: { sessionId: v.id("reconciliationSessions") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.organizationId !== user.organizationId) {
      return null;
    }

    const cleared = await ctx.db
      .query("transactions")
      .withIndex("by_reconciliationSession", (q) =>
        q.eq("reconciliationSessionId", args.sessionId)
      )
      .collect();

    // Candidates: anything in this fund dated on/before period end that is
    // not voided and not attached to any session. Items BEFORE periodStart
    // are included deliberately — they are uncleared stragglers from earlier
    // periods (e.g. deposits in transit) that may clear in this statement.
    const inWindow = await ctx.db
      .query("transactions")
      .withIndex("by_organization_date", (q) =>
        q
          .eq("organizationId", user.organizationId)
          .lte("date", session.periodEnd)
      )
      .collect();

    const candidates = inWindow.filter(
      (t) =>
        t.fundId === session.fundId &&
        !t.isVoided &&
        t.reconciliationSessionId == null
    );

    return { session, cleared, candidates };
  },
});
```

- [ ] **Step 2: Verify**

Run: `npx convex dev --once` then `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add convex/queries/reconciliationSessions.ts convex/_generated
git commit -m "feat: reconciliation session list and workspace queries"
```

---

### Task 5: Lock reconciled transactions against edits

Editing or deleting a transaction that sits in a **completed** session must be blocked with a message telling the user to reopen the session.

**Files:**
- Modify: `convex/mutations/transactions.ts` (`update`, `remove`, `toggleVoided`)

- [ ] **Step 1: Add the guard helper**

In `convex/mutations/transactions.ts`, below `checkPledgeCompletion` (~line 58), add:

```typescript
// Block changes to transactions locked by a completed reconciliation session
async function assertNotLockedByReconciliation(
  ctx: any,
  transaction: { reconciliationSessionId?: Id<"reconciliationSessions"> | null }
) {
  if (!transaction.reconciliationSessionId) return;
  const session = await ctx.db.get(transaction.reconciliationSessionId);
  if (session && session.status === "completed") {
    throw new Error(
      "This transaction is part of a completed reconciliation. " +
        "Reopen that reconciliation session before changing it."
    );
  }
}
```

- [ ] **Step 2: Call it in `update`, `remove`, and `toggleVoided`**

In each of the three handlers, immediately after the existing `if (!transaction || transaction.organizationId !== user.organizationId) { throw ... }` block, add:

```typescript
    await assertNotLockedByReconciliation(ctx, transaction);
```

- [ ] **Step 3: Stop accepting manual `isReconciled` writes**

`isReconciled` is now derived. In the same file:
- In `create` args, **delete** the `isReconciled: v.optional(v.boolean()),` line; in its insert, change to `isReconciled: false,`.
- In `update` args, **delete** `isReconciled: v.optional(v.boolean()),` and the `if (args.isReconciled !== undefined) updates.isReconciled = args.isReconciled;` line.
- In `bulkUpdate` and `batchUpdate`, delete the `isReconciled` entries from both the args validators and the handler bodies.
- In `bulkCreate`, keep the arg (CSV import may carry historical reconciled flags) — leave as-is.

- [ ] **Step 4: Fix frontend compile fallout**

Run: `npx tsc --noEmit`
Expected: errors in `components/TransactionManager.tsx` wherever it passes `isReconciled` to `create`/`update`/`bulkUpdate`/`batchUpdate`. Remove `isReconciled` from those call payloads (the field stays on the *type* and display; only the mutation args change). Do NOT yet remove the checkboxes/buttons — that is Task 7.

Re-run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add convex/mutations/transactions.ts components/TransactionManager.tsx convex/_generated
git commit -m "feat: lock reconciled transactions and make isReconciled derived"
```

---

### Task 6: Reconciliation UI component

**Files:**
- Create: `components/Reconciliation.tsx`

A single component with two views: session list (+ new-session form) and the workspace (tick list with live difference). Follows existing patterns: `useQuery`/`useMutation`, Swiss Ledger classes (`swiss-card`, `btn-primary`, `btn-secondary`, `ledger-table`), `lucide-react` icons.

- [ ] **Step 1: Write the component**

```tsx
// components/Reconciliation.tsx
import React, { useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { ArrowLeft, Check, Lock, Unlock, Plus, Trash2 } from "lucide-react";
import {
  computeDifferencePence,
  canCompleteSession,
} from "../lib/reconciliation";

const gbp = (n: number) =>
  n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });

interface Props {
  onBack: () => void;
}

export const Reconciliation: React.FC<Props> = ({ onBack }) => {
  const [activeSessionId, setActiveSessionId] =
    useState<Id<"reconciliationSessions"> | null>(null);

  return activeSessionId ? (
    <SessionWorkspace
      sessionId={activeSessionId}
      onClose={() => setActiveSessionId(null)}
    />
  ) : (
    <SessionList onOpen={setActiveSessionId} onBack={onBack} />
  );
};

const SessionList: React.FC<{
  onOpen: (id: Id<"reconciliationSessions">) => void;
  onBack: () => void;
}> = ({ onOpen, onBack }) => {
  const sessions = useQuery(api.queries.reconciliationSessions.list, {});
  const funds = useQuery(api.queries.funds.list, {});
  const createSession = useMutation(api.mutations.reconciliationSessions.create);
  const removeSession = useMutation(api.mutations.reconciliationSessions.remove);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    fundId: "",
    periodStart: "",
    periodEnd: "",
    opening: "",
    closing: "",
  });
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const id = await createSession({
        fundId: form.fundId as Id<"funds">,
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        statementOpeningBalance: parseFloat(form.opening),
        statementClosingBalance: parseFloat(form.closing),
      });
      setShowForm(false);
      onOpen(id);
    } catch (err: any) {
      setError(err.message ?? "Failed to create session");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-grey-mid hover:text-ink">
            <ArrowLeft size={14} /> Transactions
          </button>
          <h2 className="text-2xl font-bold text-ink mt-1">Reconciliation</h2>
          <p className="text-grey-mid text-sm">
            Match your ledger against bank statements, period by period.
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> New reconciliation
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="swiss-card p-4 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <label className="text-xs font-bold uppercase tracking-wide col-span-2 md:col-span-1">
            Fund / account
            <select required value={form.fundId} onChange={(e) => setForm({ ...form, fundId: e.target.value })} className="w-full mt-1 border border-ink p-2 text-sm font-normal">
              <option value="">Select…</option>
              {funds?.map((f: any) => (
                <option key={f._id} value={f._id}>{f.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold uppercase tracking-wide">
            Period start
            <input required type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} className="w-full mt-1 border border-ink p-2 text-sm font-normal" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide">
            Period end
            <input required type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} className="w-full mt-1 border border-ink p-2 text-sm font-normal" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide">
            Opening balance £
            <input required type="number" step="0.01" value={form.opening} onChange={(e) => setForm({ ...form, opening: e.target.value })} className="w-full mt-1 border border-ink p-2 text-sm font-normal" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide">
            Closing balance £
            <input required type="number" step="0.01" value={form.closing} onChange={(e) => setForm({ ...form, closing: e.target.value })} className="w-full mt-1 border border-ink p-2 text-sm font-normal" />
          </label>
          <div className="col-span-2 md:col-span-5 flex gap-2">
            <button type="submit" className="btn-primary">Start</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            {error && <span className="text-sm text-red-600 self-center">{error}</span>}
          </div>
        </form>
      )}

      <div className="swiss-card overflow-x-auto">
        <table className="ledger-table w-full text-sm">
          <thead>
            <tr>
              <th className="text-left">Fund</th>
              <th className="text-left">Period</th>
              <th className="text-right">Closing balance</th>
              <th className="text-center">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sessions?.map((s: any) => (
              <tr key={s._id} className="cursor-pointer hover:bg-paper" onClick={() => onOpen(s._id)}>
                <td>{s.fundName}</td>
                <td>{s.periodStart} → {s.periodEnd}</td>
                <td className="text-right font-mono">{gbp(s.statementClosingBalance)}</td>
                <td className="text-center">
                  {s.status === "completed" ? (
                    <span className="badge-success inline-flex items-center gap-1"><Lock size={12} /> Completed</span>
                  ) : s.status === "reopened" ? (
                    <span className="badge-warning inline-flex items-center gap-1"><Unlock size={12} /> Reopened</span>
                  ) : (
                    <span className="badge-neutral">Draft</span>
                  )}
                </td>
                <td className="text-right">
                  {s.status !== "completed" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeSession({ sessionId: s._id }); }}
                      className="text-grey-mid hover:text-red-600" title="Delete draft"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {sessions?.length === 0 && (
              <tr><td colSpan={5} className="text-center text-grey-mid py-8">No reconciliations yet. Grab your latest bank statement and start one.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SessionWorkspace: React.FC<{
  sessionId: Id<"reconciliationSessions">;
  onClose: () => void;
}> = ({ sessionId, onClose }) => {
  const data = useQuery(api.queries.reconciliationSessions.workspace, { sessionId });
  const setCleared = useMutation(api.mutations.reconciliationSessions.setCleared);
  const complete = useMutation(api.mutations.reconciliationSessions.complete);
  const reopen = useMutation(api.mutations.reconciliationSessions.reopen);
  const [error, setError] = useState<string | null>(null);

  const differencePence = useMemo(
    () =>
      data
        ? computeDifferencePence(
            data.session.statementOpeningBalance,
            data.session.statementClosingBalance,
            data.cleared
          )
        : 0,
    [data]
  );

  if (data === undefined) return <div className="text-grey-mid">Loading…</div>;
  if (data === null) return <div className="text-grey-mid">Session not found.</div>;

  const { session, cleared, candidates } = data;
  const locked = session.status === "completed";
  const balanced = canCompleteSession(differencePence);

  const onComplete = async () => {
    setError(null);
    try { await complete({ sessionId }); } catch (e: any) { setError(e.message); }
  };
  const onReopen = async () => {
    const reason = window.prompt("Reason for reopening this reconciliation:");
    if (!reason) return;
    setError(null);
    try { await reopen({ sessionId, reason }); } catch (e: any) { setError(e.message); }
  };

  const Row = ({ t, isCleared }: { t: any; isCleared: boolean }) => (
    <tr className={isCleared ? "bg-sage/10" : ""}>
      <td className="text-center w-10">
        <input
          type="checkbox"
          checked={isCleared}
          disabled={locked}
          onChange={(e) => setCleared({ sessionId, transactionId: t._id, cleared: e.target.checked })}
        />
      </td>
      <td className="font-mono text-xs">{t.date}</td>
      <td>{t.description}</td>
      <td className="text-right font-mono">
        <span className={t.type === "Income" ? "text-sage" : ""}>
          {t.type === "Income" ? "+" : "−"}{gbp(t.amount)}
        </span>
      </td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <button onClick={onClose} className="flex items-center gap-1 text-sm text-grey-mid hover:text-ink">
        <ArrowLeft size={14} /> All reconciliations
      </button>

      {/* Sticky balance strip — the heart of the workflow */}
      <div className="swiss-card p-4 sticky top-0 z-10 bg-white flex flex-wrap gap-6 items-center">
        <div>
          <div className="text-xs uppercase tracking-wide text-grey-mid">Statement opening</div>
          <div className="font-mono font-bold">{gbp(session.statementOpeningBalance)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-grey-mid">+ Cleared items ({cleared.length})</div>
          <div className="font-mono font-bold">
            {gbp(cleared.reduce((s: number, t: any) => s + (t.type === "Income" ? t.amount : -t.amount), 0))}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-grey-mid">Statement closing</div>
          <div className="font-mono font-bold">{gbp(session.statementClosingBalance)}</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs uppercase tracking-wide text-grey-mid">Difference</div>
          <div className={`font-mono text-2xl font-bold ${balanced ? "text-sage" : "text-amber-600"}`}>
            {gbp(differencePence / 100)}
          </div>
        </div>
        {locked ? (
          <button onClick={onReopen} className="btn-secondary flex items-center gap-2">
            <Unlock size={14} /> Reopen
          </button>
        ) : (
          <button onClick={onComplete} disabled={!balanced} className="btn-primary flex items-center gap-2 disabled:opacity-40">
            <Check size={14} /> Complete
          </button>
        )}
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      {session.status === "reopened" && session.reopenedReason && (
        <div className="text-sm text-amber-700">Reopened: {session.reopenedReason}</div>
      )}

      <div className="grid md:grid-cols-2 gap-4 items-start">
        <div className="swiss-card overflow-x-auto">
          <h3 className="p-3 font-bold text-sm uppercase tracking-wide border-b border-ink">
            To match — on ledger, not yet on statement ({candidates.length})
          </h3>
          <table className="ledger-table w-full text-sm">
            <tbody>{candidates.map((t: any) => <Row key={t._id} t={t} isCleared={false} />)}</tbody>
          </table>
          {candidates.length === 0 && <p className="p-4 text-grey-mid text-sm">Nothing left to match.</p>}
        </div>
        <div className="swiss-card overflow-x-auto">
          <h3 className="p-3 font-bold text-sm uppercase tracking-wide border-b border-ink">
            Cleared — confirmed on this statement ({cleared.length})
          </h3>
          <table className="ledger-table w-full text-sm">
            <tbody>{cleared.map((t: any) => <Row key={t._id} t={t} isCleared={true} />)}</tbody>
          </table>
          {cleared.length === 0 && <p className="p-4 text-grey-mid text-sm">Tick items on the left as you find them on the statement.</p>}
        </div>
      </div>
    </div>
  );
};

export default Reconciliation;
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: clean. (Check `api.queries.funds.list` exists — it does; it's used by other components.)

- [ ] **Step 3: Commit**

```bash
git add components/Reconciliation.tsx
git commit -m "feat: reconciliation workspace UI with live difference"
```

---

### Task 7: Wire into TransactionManager + remove manual checkbox

**Files:**
- Modify: `components/TransactionManager.tsx`

- [ ] **Step 1: Add view toggle**

In `TransactionManager.tsx`:
- Add import: `import Reconciliation from './Reconciliation';`
- Add state near the other `useState` calls (~line 95): `const [showReconciliation, setShowReconciliation] = useState(false);`
- At the top of the returned JSX add an early return:

```tsx
  if (showReconciliation) {
    return <Reconciliation onBack={() => setShowReconciliation(false)} />;
  }
```

- In the header button row (near the AI reconcile button ~line 918), add:

```tsx
  <button onClick={() => setShowReconciliation(true)} className="btn-secondary flex items-center gap-2">
    <Scale size={14} /> Reconcile
  </button>
```

(add `Scale` to the existing `lucide-react` import).

- [ ] **Step 2: Remove manual reconcile controls**

- Delete the "Reconciled" checkbox blocks in the add-transaction modal (~lines 1545–1553) and edit modal (~lines 1742–1750), and drop `isReconciled` from the `newTransaction`/`editingTransaction` payloads sent to mutations (some of this happened in Task 5 — finish the rest).
- Delete the bulk `executeBulkUpdate({ isReconciled: true })` button (~lines 1189–1191).
- Keep the read-only reconciled indicator in the table row (~line 1118) — it now reflects derived state.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` and `npx vitest run`
Expected: both clean/passing.

- [ ] **Step 4: Commit**

```bash
git add components/TransactionManager.tsx
git commit -m "feat: launch reconciliation from transactions; remove manual reconcile controls"
```

---

### Task 8: End-to-end manual verification

- [ ] **Step 1: Run the app**

Run in two terminals: `npx convex dev` and `npm run dev`. Open `http://localhost:3000`, sign in, go to Transactions → Reconcile.

- [ ] **Step 2: Walk the happy path**

1. Create a session for a fund with a known small set of transactions; enter opening 0.00 and closing equal to the sum of two transactions you'll tick.
2. Tick those two — watch the Difference hit £0.00 and the Complete button enable.
3. Complete; confirm the session shows Completed, and the ticked transactions now show the reconciled check in the transactions table.
4. Try editing one of those transactions — expect the "part of a completed reconciliation" error.
5. Reopen with a reason; confirm transactions become editable and `isReconciled` indicator clears.
6. Tick an old transaction dated *before* the period start (deposit-in-transit case) — confirm it appears in candidates and clears normally.

- [ ] **Step 3: Run the full check suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: reconciliation polish from manual verification"
```

---

## Follow-ups (separate plans, not in this one)

1. **Cash/cheque banking linking** — merge the `cashBankingReconciliations` work from `.worktrees/dashboard-kpi-redesign` so counter deposits link to cash collections without double-counting income, then surface those deposits inside the session workspace.
2. **Variance adjustments in-flow** — "book the difference" button creating a petty-cash/adjustment transaction directly from the workspace.
3. **Awaiting-banking aging alerts** — intelligence rule flagging cash collections unbanked for >14 days.
4. **Auto-suggest matching** — amount+date proximity suggestions when bank-feed import and manual entry produce near-duplicates.
