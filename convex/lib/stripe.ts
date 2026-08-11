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

export type PlanTier = "starter" | "growing" | "thriving";

const PLAN_TIERS: PlanTier[] = ["starter", "growing", "thriving"];

const STRIPE_PRICE_ENV: Record<PlanTier, string> = {
  starter: "STRIPE_PRICE_STARTER",
  growing: "STRIPE_PRICE_GROWING",
  thriving: "STRIPE_PRICE_THRIVING",
};

const STRIPE_PRODUCT_ENV: Record<PlanTier, string> = {
  starter: "STRIPE_PRODUCT_STARTER",
  growing: "STRIPE_PRODUCT_GROWING",
  thriving: "STRIPE_PRODUCT_THRIVING",
};

function requireStripeCatalogId(envName: string): string {
  const value = process.env[envName]?.trim();
  if (!value) throw new Error(`${envName} not configured`);
  return value;
}

export function getStripePriceId(plan: PlanTier): string {
  return requireStripeCatalogId(STRIPE_PRICE_ENV[plan]);
}

export function getStripeProductId(plan: PlanTier): string {
  return requireStripeCatalogId(STRIPE_PRODUCT_ENV[plan]);
}

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
  _stripe: Stripe,
  plan: PlanTier
): Promise<string> {
  return getStripePriceId(plan);
}

export function getPlanFromStripeProduct(productId: string): PlanTier | null {
  for (const plan of PLAN_TIERS) {
    if (productId === getStripeProductId(plan)) return plan;
  }
  return null;
}
