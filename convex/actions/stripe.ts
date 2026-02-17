"use node";

import { action, type ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { getStripe, STRIPE_PRICES } from "../lib/stripe";

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

const validateRedirectUrl = (url: string, fieldName: string) => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${fieldName} is not a valid URL`);
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new Error(`${fieldName} must use HTTP or HTTPS`);
  }

  const appBaseUrl = process.env.APP_BASE_URL;
  if (appBaseUrl) {
    const allowedHost = new URL(appBaseUrl).host;
    if (parsed.host !== allowedHost) {
      throw new Error(`${fieldName} host is not allowed`);
    }
  }
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
  },
  handler: async (ctx, args): Promise<{ sessionId: string; url: string | null }> => {
    const user = await requireUser(ctx);
    const { api, internal } = await import("../_generated/api");

    validateRedirectUrl(args.successUrl, "successUrl");
    validateRedirectUrl(args.cancelUrl, "cancelUrl");

    // Get organization
    const org: any = await ctx.runQuery(api.queries.organizations.current, {});
    if (!org) {
      throw new Error("Organization not found");
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
    const priceId = STRIPE_PRICES[args.plan];
    if (!priceId) {
      throw new Error(`Price ID not configured for plan: ${args.plan}`);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
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
      },
      subscription_data: {
        metadata: {
          organizationId: org._id,
          plan: args.plan,
        },
      },
    });

    return { sessionId: session.id, url: session.url };
  },
});

// Create billing portal session for managing subscription
export const createPortalSession = action({
  args: {
    returnUrl: v.string(),
  },
  handler: async (ctx, args): Promise<{ url: string }> => {
    await requireUser(ctx);
    const { api } = await import("../_generated/api");

    // Get organization
    const org: any = await ctx.runQuery(api.queries.organizations.current, {});
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
