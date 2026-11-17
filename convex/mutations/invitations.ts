import { mutation, type MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { requireCapability, roleValidator } from "../lib/auth";
import { nextResendAt } from "../../lib/invitationLimits";
import { DEPLOYMENT_SCOPE, dailyCaps, loadDailyCharges, personScope, utcDay } from "./aiRateLimit";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const INVITE_EMAILS_PER_DAY = 25;

// Each create or resend is followed by an email, so it reserves the send here,
// before the action contacts the email provider: it counts against the
// church's, the sender's and the deployment's day, and the caller records
// `lastSentAt` in the same transaction. A failed delivery keeps the
// reservation, so retrying cannot get round the caps or the cooldown.
async function reserveInviteEmail(
  ctx: MutationCtx,
  organization: Doc<"organizations">,
  sender: Doc<"users">,
  now: number
) {
  const day = utcDay(now);
  const sentByChurch = organization.inviteEmailDay === day ? organization.inviteEmailCount ?? 0 : 0;
  if (sentByChurch >= INVITE_EMAILS_PER_DAY) {
    throw new Error(
      `Your church has sent ${INVITE_EMAILS_PER_DAY} invitations today. Please try again tomorrow.`
    );
  }
  const caps = dailyCaps();
  const charges = await loadDailyCharges(ctx, [
    {
      scope: personScope(sender.clerkId),
      counter: "invitationEmails",
      amount: 1,
      cap: caps.personInvitationEmails,
      refusal: `You have sent ${caps.personInvitationEmails} invitations today. Please try again tomorrow.`,
    },
    {
      scope: DEPLOYMENT_SCOPE,
      counter: "invitationEmails",
      amount: 1,
      cap: caps.deploymentInvitationEmails,
      refusal: "Invitation emails are paused for today. Please try again tomorrow.",
    },
  ], now);
  if (charges.refusal) throw new Error(charges.refusal);
  await ctx.db.patch(organization._id, { inviteEmailDay: day, inviteEmailCount: sentByChurch + 1 });
  await charges.commit();
}

function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Create a pending invitation
export const create = mutation({
  args: {
    email: v.string(),
    role: roleValidator,
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCapability(ctx, "invitations.manage");
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

    const organization = await ctx.db.get(currentUser.organizationId);
    if (!organization) {
      throw new Error("Organization not found");
    }
    if (organization.dataMode === "synthetic") {
      throw new Error("Real invitation emails are disabled for demo organizations");
    }

    const now = Date.now();
    await reserveInviteEmail(ctx, organization, currentUser, now);
    const token = generateToken();
    const invitationId = await ctx.db.insert("invitations", {
      organizationId: currentUser.organizationId,
      email,
      role: args.role,
      invitedBy: currentUser._id,
      status: "pending",
      token,
      lastSentAt: now,
      createdAt: now,
      expiresAt: now + THIRTY_DAYS_MS,
    });

    return {
      invitationId,
      token,
      email,
      role: args.role,
      organizationName: organization.name,
      inviterName: currentUser.name,
    };
  },
});

// Resend an invitation: extends expiry and regenerates a token if missing
export const resend = mutation({
  args: {
    invitationId: v.id("invitations"),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCapability(ctx, "invitations.manage");

    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation) {
      throw new Error("Invitation not found");
    }

    if (invitation.organizationId !== currentUser.organizationId) {
      throw new Error("Cannot resend invitations from other organizations");
    }

    if (invitation.status === "accepted") {
      throw new Error("This invitation has already been accepted");
    }

    const organization = await ctx.db.get(currentUser.organizationId);
    if (!organization) {
      throw new Error("Organization not found");
    }

    const now = Date.now();
    const allowedAt = nextResendAt(invitation.lastSentAt, now);
    if (allowedAt !== null) {
      const minutes = Math.ceil((allowedAt - now) / 60_000);
      throw new Error(
        `This invitation was emailed in the last 10 minutes. You can resend it in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`
      );
    }
    await reserveInviteEmail(ctx, organization, currentUser, now);
    const token = invitation.token ?? generateToken();
    await ctx.db.patch(args.invitationId, {
      status: "pending",
      token,
      lastSentAt: now,
      expiresAt: now + THIRTY_DAYS_MS,
    });

    return {
      invitationId: args.invitationId,
      token,
      email: invitation.email,
      role: invitation.role,
      organizationName: organization.name,
      inviterName: currentUser.name,
    };
  },
});

// Cancel a pending invitation
export const cancel = mutation({
  args: {
    invitationId: v.id("invitations"),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireCapability(ctx, "invitations.manage");

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
