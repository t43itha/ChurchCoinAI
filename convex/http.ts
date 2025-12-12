import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { getStripe } from "./lib/stripe";
import type Stripe from "stripe";

const http = httpRouter();

// Price ID to plan tier mapping (reverse lookup)
const getPlanFromPriceId = (priceId: string): "starter" | "growing" | "thriving" => {
  if (priceId === process.env.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === process.env.STRIPE_PRICE_GROWING) return "growing";
  if (priceId === process.env.STRIPE_PRICE_THRIVING) return "thriving";
  // Default to starter if unknown
  return "starter";
};

// Map Stripe status to our status type
const mapStripeStatus = (status: string): "active" | "past_due" | "canceled" | "incomplete" => {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
      return "canceled";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    default:
      return "active";
  }
};

// Stripe webhook endpoint
http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not configured");
      return new Response("Server configuration error", { status: 500 });
    }

    const stripe = getStripe();

    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return new Response("No signature provided", { status: 400 });
    }

    let event: Stripe.Event;
    try {
      const body = await request.text();
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    // Handle the event
    try {
      switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const subscription = event.data.object as any; // Stripe.Subscription
          const organizationId = subscription.metadata?.organizationId;
          const planFromMetadata = subscription.metadata?.plan as "starter" | "growing" | "thriving" | undefined;

          if (!organizationId) {
            console.error("No organizationId in subscription metadata");
            break;
          }

          const priceId = subscription.items?.data?.[0]?.price?.id || "";
          const plan = planFromMetadata || getPlanFromPriceId(priceId);

          // Get period end from subscription object
          const periodEnd = subscription.current_period_end || subscription.currentPeriodEnd || 0;

          await ctx.runMutation(internal.mutations.subscriptions.upsert, {
            organizationId: organizationId as any,
            stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || '',
            stripeSubscriptionId: subscription.id,
            stripePriceId: priceId,
            plan,
            status: mapStripeStatus(subscription.status),
            currentPeriodEnd: periodEnd * 1000,
            cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
          });
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as any; // Stripe.Subscription
          await ctx.runMutation(internal.mutations.subscriptions.markCanceled, {
            stripeSubscriptionId: subscription.id,
          });
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as any; // Stripe.Invoice
          const subscriptionId = typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id;
          if (subscriptionId) {
            await ctx.runMutation(internal.mutations.subscriptions.updateStatus, {
              stripeSubscriptionId: subscriptionId,
              status: "past_due",
            });
          }
          break;
        }

        case "invoice.payment_succeeded": {
          const invoice = event.data.object as any; // Stripe.Invoice
          const subscriptionId = typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id;
          if (subscriptionId) {
            await ctx.runMutation(internal.mutations.subscriptions.updateStatus, {
              stripeSubscriptionId: subscriptionId,
              status: "active",
            });
          }
          break;
        }

        case "checkout.session.completed": {
          // Subscription events will handle the actual data sync
          const session = event.data.object as Stripe.Checkout.Session;
          console.log("Checkout completed for session:", session.id);
          break;
        }

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }
    } catch (err: any) {
      console.error(`Error handling event ${event.type}:`, err.message);
      // Return 500 so Stripe will retry the webhook
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
