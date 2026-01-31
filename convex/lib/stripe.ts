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
  starter: process.env.STRIPE_PRICE_STARTER!,
  growing: process.env.STRIPE_PRICE_GROWING!,
  thriving: process.env.STRIPE_PRICE_THRIVING!,
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
