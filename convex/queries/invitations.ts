import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth, getIdentity } from "../lib/auth";

// List all open invitations for the organization (including time-expired
// ones, so admins can see and resend them)
export const listPending = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const invitations = await ctx.db
      .query("invitations")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    return invitations;
  },
});

// Invitations addressed to the signed-in identity's email (for users who
// haven't joined an organization yet). Returns org names for the acceptance
// screen.
export const pendingForCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getIdentity(ctx);
    if (!identity) return [];

    const email = identity.email?.toLowerCase().trim();
    if (!email) return [];

    const now = Date.now();
    const invitations = await ctx.db
      .query("invitations")
      .withIndex("by_email", (q) => q.eq("email", email))
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "pending"),
          q.gt(q.field("expiresAt"), now)
        )
      )
      .collect();

    const results = [];
    for (const invitation of invitations) {
      const organization = await ctx.db.get(invitation.organizationId);
      if (!organization) continue;
      results.push({
        invitationId: invitation._id,
        organizationName: organization.name,
        role: invitation.role,
        email: invitation.email,
      });
    }
    return results;
  },
});

// Look up an invitation by its secret link token (for the acceptance screen
// when arriving via an invite link). The token itself is the credential.
export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (!args.token) return null;

    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!invitation) return null;

    const organization = await ctx.db.get(invitation.organizationId);
    if (!organization) return null;

    const isExpired =
      invitation.status !== "pending" || invitation.expiresAt <= Date.now();

    return {
      invitationId: invitation._id,
      organizationName: organization.name,
      role: invitation.role,
      email: invitation.email,
      status: invitation.status === "accepted"
        ? ("accepted" as const)
        : isExpired
          ? ("expired" as const)
          : ("valid" as const),
    };
  },
});
