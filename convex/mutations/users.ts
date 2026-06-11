import { internalMutation, mutation } from "../_generated/server";
import { v } from "convex/values";
import { getIdentity, requireAuth, requireRole } from "../lib/auth";

// Accept an invitation explicitly (for new users). Identified either by the
// secret link token (works regardless of which email the user signed up
// with) or by an invitation id whose email must match the Clerk identity.
export const acceptInvitation = mutation({
  args: {
    token: v.optional(v.string()),
    invitationId: v.optional(v.id("invitations")),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    if (!identity) {
      throw new Error("Must be signed in");
    }

    // Check if user already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (existingUser) {
      throw new Error("You already belong to an organization");
    }

    const identityEmail = identity.email?.toLowerCase().trim();
    const now = Date.now();

    let invitation;
    if (args.token) {
      invitation = await ctx.db
        .query("invitations")
        .withIndex("by_token", (q) => q.eq("token", args.token))
        .first();
      if (!invitation) {
        throw new Error("This invite link is invalid. Ask your administrator to send a new one.");
      }
    } else if (args.invitationId) {
      invitation = await ctx.db.get(args.invitationId);
      if (!invitation) {
        throw new Error("Invitation not found");
      }
      // Without a token, the invitation must be addressed to this identity
      if (!identityEmail || invitation.email !== identityEmail) {
        throw new Error("This invitation was sent to a different email address");
      }
    } else {
      throw new Error("An invitation token or id is required");
    }

    if (invitation.status === "accepted") {
      throw new Error("This invitation has already been used");
    }
    if (invitation.status !== "pending" || invitation.expiresAt <= now) {
      throw new Error("This invitation has expired. Ask your administrator to resend it.");
    }

    const email = identityEmail ?? invitation.email;

    // Create the user record
    const userId = await ctx.db.insert("users", {
      clerkId: identity.subject,
      organizationId: invitation.organizationId,
      name: identity.name ?? email.split("@")[0],
      email,
      role: invitation.role,
      createdAt: now,
    });

    // Mark invitation as accepted
    await ctx.db.patch(invitation._id, {
      status: "accepted",
    });

    return { userId, organizationId: invitation.organizationId };
  },
});

// Invite a new user to the organization (DEPRECATED - use invitations.create)
export const invite = internalMutation({
  args: {},
  handler: async () => {
    throw new Error(
      "This endpoint is deprecated. Use mutations.invitations.create instead."
    );
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
