import { query } from "../_generated/server";
import { requireAuth } from "../lib/auth";

// List all pending invitations for the organization
export const listPending = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const now = Date.now();
    const invitations = await ctx.db
      .query("invitations")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "pending"),
          q.gt(q.field("expiresAt"), now) // Not expired
        )
      )
      .collect();

    return invitations;
  },
});
