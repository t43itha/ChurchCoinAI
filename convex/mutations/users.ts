import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth, requireRole, isAdmin } from "../lib/auth";

// Invite a new user to the organization
export const invite = mutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    role: v.union(
      v.literal("Admin"),
      v.literal("Finance Team"),
      v.literal("Pastorate"),
      v.literal("Guest")
    ),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireRole(ctx, ["Admin"]);

    // Check if user already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId_organization", (q) =>
        q
          .eq("clerkId", args.clerkId)
          .eq("organizationId", currentUser.organizationId)
      )
      .first();

    if (existingUser) {
      throw new Error("User already exists in this organization");
    }

    const userId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      organizationId: currentUser.organizationId,
      name: args.name,
      email: args.email,
      role: args.role,
      createdAt: Date.now(),
    });

    return userId;
  },
});

// Update a user's role
export const updateRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(
      v.literal("Admin"),
      v.literal("Finance Team"),
      v.literal("Pastorate"),
      v.literal("Guest")
    ),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireRole(ctx, ["Admin"]);

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) {
      throw new Error("User not found");
    }

    if (targetUser.organizationId !== currentUser.organizationId) {
      throw new Error("Cannot modify users from other organizations");
    }

    // Prevent removing the last admin
    if (targetUser.role === "Admin" && args.role !== "Admin") {
      const admins = await ctx.db
        .query("users")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", currentUser.organizationId)
        )
        .filter((q) => q.eq(q.field("role"), "Admin"))
        .collect();

      if (admins.length <= 1) {
        throw new Error("Cannot remove the last admin from the organization");
      }
    }

    await ctx.db.patch(args.userId, { role: args.role });

    return args.userId;
  },
});

// Update current user's profile
export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const updates: Record<string, any> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.avatarUrl !== undefined) updates.avatarUrl = args.avatarUrl;

    await ctx.db.patch(user._id, updates);

    return user._id;
  },
});

// Remove a user from the organization
export const remove = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireRole(ctx, ["Admin"]);

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) {
      throw new Error("User not found");
    }

    if (targetUser.organizationId !== currentUser.organizationId) {
      throw new Error("Cannot remove users from other organizations");
    }

    // Prevent removing yourself
    if (targetUser._id === currentUser._id) {
      throw new Error("Cannot remove yourself from the organization");
    }

    // Prevent removing the last admin
    if (targetUser.role === "Admin") {
      const admins = await ctx.db
        .query("users")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", currentUser.organizationId)
        )
        .filter((q) => q.eq(q.field("role"), "Admin"))
        .collect();

      if (admins.length <= 1) {
        throw new Error("Cannot remove the last admin from the organization");
      }
    }

    await ctx.db.delete(args.userId);

    return args.userId;
  },
});
