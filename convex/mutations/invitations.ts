import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Create a pending invitation
export const create = mutation({
  args: {
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

    // Normalize email to lowercase
    const email = args.email.toLowerCase().trim();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error("Invalid email format");
    }

    // Check if user with this email already exists in org
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", currentUser.organizationId)
      )
      .filter((q) => q.eq(q.field("email"), email))
      .first();

    if (existingUser) {
      throw new Error("A user with this email already exists in the organization");
    }

    // Check if there's already a pending invitation for this email in this org
    const existingInvitation = await ctx.db
      .query("invitations")
      .withIndex("by_email_organization", (q) =>
        q.eq("email", email).eq("organizationId", currentUser.organizationId)
      )
      .filter((q) => q.and(
        q.eq(q.field("status"), "pending"),
        q.gt(q.field("expiresAt"), Date.now())
      ))
      .first();

    if (existingInvitation) {
      throw new Error("A pending invitation already exists for this email");
    }

    const now = Date.now();
    const invitationId = await ctx.db.insert("invitations", {
      organizationId: currentUser.organizationId,
      email,
      role: args.role,
      invitedBy: currentUser._id,
      status: "pending",
      createdAt: now,
      expiresAt: now + THIRTY_DAYS_MS,
    });

    return invitationId;
  },
});

// Cancel a pending invitation
export const cancel = mutation({
  args: {
    invitationId: v.id("invitations"),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireRole(ctx, ["Admin"]);

    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation) {
      throw new Error("Invitation not found");
    }

    if (invitation.organizationId !== currentUser.organizationId) {
      throw new Error("Cannot cancel invitations from other organizations");
    }

    if (invitation.status !== "pending") {
      throw new Error("Can only cancel pending invitations");
    }

    await ctx.db.delete(args.invitationId);

    return args.invitationId;
  },
});
