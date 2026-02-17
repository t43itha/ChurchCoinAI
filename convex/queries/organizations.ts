import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentUser, getIdentity } from "../lib/auth";

// Get the current user's organization
export const current = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const organization = await ctx.db.get(user.organizationId);
    return organization;
  },
});

// Check if current Clerk user has completed onboarding
export const hasOrganization = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getIdentity(ctx);
    if (!identity) return false;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    return !!user;
  },
});

// Internal query to list all organizations (for admin/seeding purposes)
export const listAll = internalQuery({
  args: {},
  handler: async (ctx) => {
    const organizations = await ctx.db.query("organizations").collect();
    return organizations.map((org) => ({
      _id: org._id,
      name: org.name,
    }));
  },
});

export const getByIdInternal = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.organizationId);
  },
});
