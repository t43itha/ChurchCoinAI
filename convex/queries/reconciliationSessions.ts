// convex/queries/reconciliationSessions.ts
import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

// All sessions for the organization, newest first, with fund names
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const sessions = await ctx.db
      .query("reconciliationSessions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .order("desc")
      .collect();

    const fundIds = [...new Set(sessions.map((s) => s.fundId))];
    const funds = await Promise.all(fundIds.map((id) => ctx.db.get(id)));
    const fundMap = new Map(
      funds.filter((f) => f !== null).map((f) => [f!._id, f!.name])
    );
    return sessions.map((s) => ({
      ...s,
      fundName: fundMap.get(s.fundId) ?? "Unknown fund",
    }));
  },
});

// Workspace data for one session: the session, its cleared transactions,
// and candidate (unmatched, same-fund, not-after-period-end) transactions.
export const workspace = query({
  args: { sessionId: v.id("reconciliationSessions") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
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
    const fundTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_fund", (q) => q.eq("fundId", session.fundId))
      .collect();

    const candidates = fundTransactions.filter(
      (t) =>
        t.date <= session.periodEnd &&
        !t.isVoided &&
        t.reconciliationSessionId == null
    );

    return { session, cleared, candidates };
  },
});
