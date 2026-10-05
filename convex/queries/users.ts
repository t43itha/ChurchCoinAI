import { can } from "../../lib/permissions";
import { query } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentUser, getIdentity, requireAuth, requireCapability } from "../lib/auth";
import { resolveOrganizationAccess } from "../lib/access";

// Get the current authenticated user
export const current = query({
  args: {},
  handler: async (ctx) => {
    return await getCurrentUser(ctx);
  },
});

// Fetch the user and app-access decision together for server actions. This avoids
// making every AI action resolve the same authenticated user twice.
export const currentWithAccess = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    return {
      user,
      access: await resolveOrganizationAccess(ctx, user),
    };
  },
});

// Get Clerk identity (for new users)
export const identity = query({
  args: {},
  handler: async (ctx) => {
    return await getIdentity(ctx);
  },
});

// List all users in the organization
export const listByOrganization = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCapability(ctx, "users.list");

    const users = await ctx.db
      .query("users")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    return users.map(({ clerkId: _clerkId, ...safeUser }) => safeUser);
  },
});

// Get a specific user by ID
export const getById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const currentUser = await requireAuth(ctx);
    const user = await ctx.db.get(args.userId);

    if (!user || user.organizationId !== currentUser.organizationId) {
      return null;
    }

    if (!can(currentUser.role, "users.list")) {
      return { _id: user._id, name: user.name };
    }
    const { clerkId: _clerkId, ...safeUser } = user;
    return safeUser;
  },
});
