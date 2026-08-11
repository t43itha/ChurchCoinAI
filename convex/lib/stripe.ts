"use node";

import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

export const getStripe = (): Stripe => {
  if (stripeInstance) return stripeInstance;

  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error("STRIPE_SECRET_KEY not configured");
  }

  stripeInstance = new Stripe(apiKey, {
    apiVersion: "2026-01-28.clover",
  });

  return stripeInstance;
};

// Price IDs - set these in Convex environment variables
export const STRIPE_PRICES = {
  starter:
    process.env.STRIPE_PRICE_STARTER || "price_1SdcgM3ta3s0o656P0DP6BD9",
  growing:
    process.env.STRIPE_PRICE_GROWING || "price_1SdchC3ta3s0o656YOnYfii8",
  thriving:
    process.env.STRIPE_PRICE_THRIVING || "price_1SdcjP3ta3s0o656LO347Jgv",
} as const;

// Product IDs are stable and non-secret. Environment overrides allow test and
// live Stripe accounts to use different products without changing code.
export const STRIPE_PRODUCTS = {
  starter: process.env.STRIPE_PRODUCT_STARTER || "prod_TaoILVcX3Js9gF",
  growing: process.env.STRIPE_PRODUCT_GROWING || "prod_TaoJy477MupSeI",
  thriving: process.env.STRIPE_PRODUCT_THRIVING || "prod_TaoMzQFnBGlIm2",
} as const;

export type PlanTier = keyof typeof STRIPE_PRICES;

// Plan configurations
export const PLAN_CONFIG = {
  starter: {
    name: "Starter",
    price: 29,
    maxDonors: 50,
    maxFunds: 3,
    features: ["Basic Gift Aid tracking", "Monthly reports", "Email support"],
  },
  growing: {
    name: "Growing",
    price: 59,
    maxDonors: 200,
    maxFunds: Infinity,
    features: [
      "Full Gift Aid automation",
      "AI categorisation",
      "Trustee reports",
      "Priority support",
    ],
  },
  thriving: {
    name: "Thriving",
    price: 99,
    maxDonors: Infinity,
    maxFunds: Infinity,
    features: [
      "Unlimited donors",
      "Multi-site support",
      "API access",
      "Custom integrations",
      "Dedicated support",
      "Training sessions",
    ],
  },
} as const;

export async function resolveStripePriceId(
  stripe: Stripe,
  plan: PlanTier
): Promise<string> {
  const configuredPriceId = STRIPE_PRICES[plan];
  if (configuredPriceId) return configuredPriceId;

  const config = PLAN_CONFIG[plan];
  const prices = await stripe.prices.list({
    product: STRIPE_PRODUCTS[plan],
    active: true,
    type: "recurring",
    currency: "gbp",
    limit: 100,
  });
  const matches = prices.data.filter(
    (price) =>
      price.recurring?.interval === "month" &&
      price.recurring.interval_count === 1 &&
      price.unit_amount === config.price * 100
  );

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one active monthly GBP price at £${config.price} for ${plan}; found ${matches.length}. Set STRIPE_PRICE_${plan.toUpperCase()} explicitly.`
    );
  }
  return matches[0].id;
}

export function getPlanFromStripeProduct(productId: string): PlanTier | null {
  if (productId === STRIPE_PRODUCTS.starter) return "starter";
  if (productId === STRIPE_PRODUCTS.growing) return "growing";
  if (productId === STRIPE_PRODUCTS.thriving) return "thriving";
  return null;
}
