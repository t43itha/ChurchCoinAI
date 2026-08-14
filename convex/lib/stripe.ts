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
    name: "Core",
    price: 19,
    maxDonors: Infinity,
    maxFunds: Infinity,
    features: [
      "Restricted and designated funds",
      "AI transaction categorisation",
      "Gift Aid records and schedules",
      "Monthly and annual reports",
      "Standard data exports",
      "Self-service support",
    ],
  },
  growing: {
    name: "Standard",
    price: 29,
    maxDonors: Infinity,
    maxFunds: Infinity,
    features: [
      "Everything in Core",
      "Human approval workflow",
      "Connected bank accounts",
      "Trustee-ready reports",
      "One onboarding session",
      "Standard support",
    ],
  },
  thriving: {
    name: "Plus",
    price: 49,
    maxDonors: Infinity,
    maxFunds: Infinity,
    features: [
      "Everything in Standard",
      "More connected bank accounts",
      "Advanced permissions",
      "Assisted onboarding",
      "Training sessions",
      "Priority support",
    ],
  },
} as const;

export function getPlanFromStripeProduct(productId: string): PlanTier | null {
  for (const plan of PLAN_TIERS) {
    const configuredProductId = process.env[STRIPE_PRODUCT_ENV[plan]]?.trim();
    if (configuredProductId && productId === configuredProductId) return plan;
  }
  return null;
}
