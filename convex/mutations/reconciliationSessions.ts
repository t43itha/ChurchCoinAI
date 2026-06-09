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
    const draftSessions = await ctx.db
      .query("reconciliationSessions")
      .withIndex("by_organization_fund_status", (q) =>
        q
          .eq("organizationId", user.organizationId)
          .eq("fundId", args.fundId)
          .eq("status", "draft")
      )
      .first();
    const reopenedSessions = draftSessions
      ? null
      : await ctx.db
          .query("reconciliationSessions")
          .withIndex("by_organization_fund_status", (q) =>
            q
              .eq("organizationId", user.organizationId)
              .eq("fundId", args.fundId)
              .eq("status", "reopened")
          )
          .first();
    if (draftSessions || reopenedSessions) {
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
