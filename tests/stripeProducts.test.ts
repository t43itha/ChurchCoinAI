import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PLAN_CONFIG,
  getPlanFromStripeProduct,
  getStripePriceId,
  getStripeProductId,
} from "../convex/lib/stripe";
import { PLANS } from "../lib/plans";

describe("Stripe product mapping", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_STARTER", "price_starter");
    vi.stubEnv("STRIPE_PRICE_GROWING", "price_growing");
    vi.stubEnv("STRIPE_PRICE_THRIVING", "price_thriving");
    vi.stubEnv("STRIPE_PRODUCT_STARTER", "prod_starter");
    vi.stubEnv("STRIPE_PRODUCT_GROWING", "prod_growing");
    vi.stubEnv("STRIPE_PRODUCT_THRIVING", "prod_thriving");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("maps the configured ChurchCoin products to plans", () => {
    expect(getPlanFromStripeProduct(getStripeProductId("starter"))).toBe("starter");
    expect(getPlanFromStripeProduct(getStripeProductId("growing"))).toBe("growing");
    expect(getPlanFromStripeProduct(getStripeProductId("thriving"))).toBe("thriving");
  });

  it("fails closed for an unknown product", () => {
    expect(getPlanFromStripeProduct("prod_unknown")).toBeNull();
  });

  it("matches a configured product when another tier is not configured", () => {
    vi.stubEnv("STRIPE_PRODUCT_STARTER", "");
    expect(getPlanFromStripeProduct("prod_thriving")).toBe("thriving");
  });

  it("reads recurring prices from the environment", () => {
    expect(getStripePriceId("starter")).toBe("price_starter");
    expect(getStripePriceId("growing")).toBe("price_growing");
    expect(getStripePriceId("thriving")).toBe("price_thriving");
  });

  it("fails fast when a Stripe catalog ID is missing", () => {
    vi.stubEnv("STRIPE_PRICE_STARTER", "");
    expect(() => getStripePriceId("starter")).toThrow(
      "STRIPE_PRICE_STARTER not configured"
    );
  });

  it("keeps the customer-facing and Stripe plan catalogues aligned", () => {
    expect(
      PLANS.map(({ id, name, price }) => ({ id, name, price }))
    ).toEqual([
      { id: "starter", name: "Essentials", price: 19 },
      { id: "growing", name: "Church", price: 29 },
      { id: "thriving", name: "Plus", price: 49 },
    ]);

    for (const plan of PLANS) {
      expect(PLAN_CONFIG[plan.id].name).toBe(plan.name);
      expect(PLAN_CONFIG[plan.id].price).toBe(plan.price);
      expect(PLAN_CONFIG[plan.id].maxDonors).toBe(Infinity);
      expect(PLAN_CONFIG[plan.id].maxFunds).toBe(Infinity);
    }
  });
});
