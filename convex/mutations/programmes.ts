import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireCapability } from "../lib/auth";

// Creating a name that already exists returns the existing programme, so
// retyping a programme never makes a duplicate.
export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "ledger.write");

    const name = args.name.trim();
    if (name.length < 2) {
      throw new Error("Programme name must be at least 2 characters");
    }

    const programmes = await ctx.db
      .query("programmes")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    const existing = programmes.find(
      (programme) => programme.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      if (existing.isArchived) {
        await ctx.db.patch(existing._id, { isArchived: false });
      }
      return existing._id;
    }

    return await ctx.db.insert("programmes", {
      organizationId: user.organizationId,
      name,
      createdAt: Date.now(),
    });
  },
});

export const setArchived = mutation({
  args: {
    programmeId: v.id("programmes"),
    isArchived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireCapability(ctx, "ledger.write");

    const programme = await ctx.db.get(args.programmeId);
    if (!programme || programme.organizationId !== user.organizationId) {
      throw new Error("Programme not found");
    }

    await ctx.db.patch(args.programmeId, { isArchived: args.isArchived });

    return args.programmeId;
  },
});
