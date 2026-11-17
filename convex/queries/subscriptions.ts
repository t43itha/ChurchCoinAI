import { query } from "../_generated/server";
import { getCurrentUser } from "../lib/auth";
import { can } from "../../lib/permissions";
import { resolveOrganizationAccess } from "../lib/access";

export const access = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return await resolveOrganizationAccess(ctx, user);
  },
});

// Get current organization's subscription
export const current = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .first();

    // Every member sees the plan and status; Stripe ids are for billing admins.
    if (!subscription || can(user.role, "billing.manage")) return subscription;
    const {
      stripeCustomerId: _stripeCustomerId,
      stripeSubscriptionId: _stripeSubscriptionId,
      stripePriceId: _stripePriceId,
      ...safe
    } = subscription;
    return safe;
  },
});

// Check if organization has active subscription
export const hasActive = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return false;

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .first();

    return subscription?.status === "active" || subscription?.status === "trialing";
  },
});
