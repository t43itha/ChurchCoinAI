import { describe, expect, it } from "vitest";
import {
  getPlanFromStripeProduct,
  STRIPE_PRICES,
  STRIPE_PRODUCTS,
} from "../convex/lib/stripe";

describe("Stripe product mapping", () => {
  it("maps the configured ChurchCoin products to plans", () => {
    expect(getPlanFromStripeProduct(STRIPE_PRODUCTS.starter)).toBe("starter");
    expect(getPlanFromStripeProduct(STRIPE_PRODUCTS.growing)).toBe("growing");
    expect(getPlanFromStripeProduct(STRIPE_PRODUCTS.thriving)).toBe("thriving");
  });

  it("fails closed for an unknown product", () => {
    expect(getPlanFromStripeProduct("prod_unknown")).toBeNull();
  });

  it("uses the configured recurring prices for all three tiers", () => {
    expect(STRIPE_PRICES.starter).toBeTruthy();
    expect(STRIPE_PRICES.growing).toBeTruthy();
    expect(STRIPE_PRICES.thriving).toBeTruthy();
  });
});
