"use node";

import { action, type ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import {
  getPlanFromStripeProduct,
  getStripe,
  resolveStripePriceId,
} from "../lib/stripe";
import { validateRedirectUrl } from "../lib/urlValidation";

// Require an authenticated Convex user
const requireUser = async (ctx: ActionCtx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized: please sign in");
  }
  const { api } = await import("../_generated/api");
  const currentUser = await ctx.runQuery(api.queries.users.current, {});
  if (!currentUser) {
    throw new Error("Forbidden: complete onboarding first");
  }
  return currentUser;
};

// Create checkout session for subscription
export const createCheckoutSession = action({
  args: {
    plan: v.union(
      v.literal("starter"),
      v.literal("growing"),
      v.literal("thriving")
    ),
    successUrl: v.string(),
    cancelUrl: v.string(),
    attemptId: v.string(),
  },
  handler: async (ctx, args): Promise<{ sessionId: string; url: string | null }> => {
    const user = await requireUser(ctx);
    const { api, internal } = await import("../_generated/api");

    validateRedirectUrl(args.successUrl, "successUrl", process.env.APP_BASE_URL);
    validateRedirectUrl(args.cancelUrl, "cancelUrl", process.env.APP_BASE_URL);

    // Get organization
    const org: any = await ctx.runQuery(api.queries.organizations.current, {});
    if (!org) {
      throw new Error("Organization not found");
    }
    if (user.role !== "Admin") {
      throw new Error("Only organization admins can start checkout");
    }
    if (org.accessMode !== "subscription") {
      throw new Error("This organization is not eligible for Stripe billing");
    }
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(args.attemptId)) {
      throw new Error("Invalid checkout attempt");
    }

    const existingSubscription: any = await ctx.runQuery(
      api.queries.subscriptions.current,
      {}
    );
    if (
      existingSubscription &&
      ["active", "trialing", "past_due"].includes(existingSubscription.status)
    ) {
      throw new Error("An existing subscription must be managed through Billing");
    }

    const stripe = getStripe();

    // Get or create Stripe customer
    let customerId: string | undefined = org.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: org.email || user.email,
        name: org.name,
        metadata: {
          organizationId: org._id,
          clerkId: user.clerkId,
        },
      });
      customerId = customer.id;

      // Update org with customer ID
      await ctx.runMutation(internal.mutations.organizations.updateStripeCustomerId, {
        organizationId: org._id,
        stripeCustomerId: customerId,
      });
    }

    // Get price ID for the selected plan
    const priceId = await resolveStripePriceId(stripe, args.plan);

    // Create checkout session
    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: args.successUrl,
        cancel_url: args.cancelUrl,
        metadata: {
          organizationId: org._id,
          plan: args.plan,
          attemptId: args.attemptId,
        },
        subscription_data: {
          metadata: {
            organizationId: org._id,
            plan: args.plan,
          },
        },
      },
      { idempotencyKey: `checkout:${org._id}:${args.attemptId}` }
    );

    return { sessionId: session.id, url: session.url };
  },
});

// Recovery path for the success screen when a webhook is delayed. Stripe is
// queried server-side and every identifier is checked against the caller's
// organization before the same internal subscription upsert is used.
export const reconcileCheckoutSession = action({
  args: { sessionId: v.string() },
  handler: async (ctx, args): Promise<{ status: string; active: boolean }> => {
    const user = await requireUser(ctx);
    if (user.role !== "Admin") throw new Error("Only organization admins can reconcile checkout");
    if (!/^cs_(test_|live_)?[a-zA-Z0-9]+$/.test(args.sessionId)) {
      throw new Error("Invalid Checkout Session ID");
    }

    const { api, internal } = await import("../_generated/api");
    const organization: any = await ctx.runQuery(api.queries.organizations.current, {});
    if (!organization || organization.accessMode !== "subscription") {
      throw new Error("Organization is not eligible for subscription reconciliation");
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(args.sessionId, {
      expand: ["subscription"],
    });
    if (session.metadata?.organizationId !== String(organization._id)) {
      throw new Error("Checkout Session does not belong to this organization");
    }
    const sessionCustomerId =
      typeof session.customer === "string" ? session.customer : session.customer?.id;
    if (
      !sessionCustomerId ||
      (organization.stripeCustomerId && organization.stripeCustomerId !== sessionCustomerId)
    ) {
      throw new Error("Checkout customer does not match this organization");
    }

    const subscription =
      typeof session.subscription === "string"
        ? await stripe.subscriptions.retrieve(session.subscription, {
            expand: ["items.data.price.product"],
          })
        : session.subscription;
    if (!subscription || "deleted" in subscription) {
      return { status: "pending", active: false };
    }

    const item: any = subscription.items.data[0];
    const product = item?.price?.product;
    const productId = typeof product === "string" ? product : product?.id || "";
    const plan = getPlanFromStripeProduct(productId);
    if (!plan) throw new Error(`Unknown Stripe product: ${productId || "missing"}`);

    const allowedStatuses = [
      "trialing",
      "active",
      "past_due",
      "canceled",
      "incomplete",
      "incomplete_expired",
      "unpaid",
      "paused",
    ] as const;
    const status = allowedStatuses.find((value) => value === subscription.status);
    if (!status) throw new Error(`Unknown Stripe subscription status: ${subscription.status}`);

    const periodEnd =
      (subscription as any).current_period_end ?? item?.current_period_end ?? 0;
    if (!Number.isFinite(periodEnd) || periodEnd <= 0) {
      throw new Error("Stripe subscription is missing its current period end");
    }

    await ctx.runMutation(internal.mutations.subscriptions.upsert, {
      organizationId: organization._id,
      stripeCustomerId: sessionCustomerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: item?.price?.id || "",
      plan,
      status,
      currentPeriodEnd: periodEnd * 1000,
      cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
      eventTimestamp: Date.now(),
    });
    return { status, active: status === "active" || status === "trialing" };
  },
});

// Create billing portal session for managing subscription
export const createPortalSession = action({
  args: {
    returnUrl: v.string(),
  },
  handler: async (ctx, args): Promise<{ url: string }> => {
    const user = await requireUser(ctx);
    const { api } = await import("../_generated/api");

    // Get organization
    const org: any = await ctx.runQuery(api.queries.organizations.current, {});
    if (user.role !== "Admin") {
      throw new Error("Only organization admins can manage billing");
    }
    if (org?.accessMode === "demo" || org?.dataMode === "synthetic") {
      throw new Error("Demo organizations do not use Stripe billing");
    }
    if (!org?.stripeCustomerId) {
      throw new Error("No active subscription found");
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: args.returnUrl,
    });

    return { url: session.url };
  },
});

// Cancel subscription (schedule cancellation at period end)
export const cancelSubscription = action({
  args: {
    immediate: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const user = await requireUser(ctx);
    const { api } = await import("../_generated/api");

    // Check admin permission
    if (user.role !== "Admin") {
      throw new Error("Only admins can cancel subscriptions");
    }

    // Get current subscription
    const subscription: any = await ctx.runQuery(api.queries.subscriptions.current, {});
    if (!subscription) {
      throw new Error("No active subscription found");
    }

    const stripe = getStripe();

    if (args.immediate) {
      // Cancel immediately
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
    } else {
      // Cancel at period end
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    }

    return { success: true };
  },
});

// Resume a subscription that was set to cancel
export const resumeSubscription = action({
  args: {},
  handler: async (ctx): Promise<{ success: boolean }> => {
    const user = await requireUser(ctx);
    const { api } = await import("../_generated/api");

    // Check admin permission
    if (user.role !== "Admin") {
      throw new Error("Only admins can manage subscriptions");
    }

    // Get current subscription
    const subscription: any = await ctx.runQuery(api.queries.subscriptions.current, {});
    if (!subscription) {
      throw new Error("No subscription found");
    }

    const stripe = getStripe();

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    return { success: true };
  },
});
