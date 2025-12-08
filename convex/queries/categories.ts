import { query } from "../_generated/server";
import { requireAuth } from "../lib/auth";

// List all categories for the organization
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const categories = await ctx.db
      .query("categories")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    // Return just the names as strings (matching frontend expectation)
    return categories.map((c) => c.name);
  },
});

// List all categories with full details
export const listWithDetails = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const categories = await ctx.db
      .query("categories")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    return categories;
  },
});
