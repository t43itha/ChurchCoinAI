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
