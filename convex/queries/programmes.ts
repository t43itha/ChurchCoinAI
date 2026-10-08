import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireCapability } from "../lib/auth";

// List the organization's programmes, hiding archived ones unless asked
export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "ledger.read");

    const programmes = await ctx.db
      .query("programmes")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    return programmes
      .filter((programme) => args.includeArchived || !programme.isArchived)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});
