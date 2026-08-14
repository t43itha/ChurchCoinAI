import { query } from "../_generated/server";
import { requireMembership } from "../lib/auth";

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireMembership(ctx);
    const tickets = await ctx.db
      .query("supportTickets")
      .withIndex("by_createdBy_createdAt", (q) =>
        q.eq("createdBy", user._id)
      )
      .order("desc")
      .take(50);

    return tickets.map((ticket) => ({
      _id: ticket._id,
      reference: ticket.reference,
      type: ticket.type,
      impact: ticket.impact,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    }));
  },
});
