import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPlanFromStripeProduct,
  getStripePriceId,
  getStripeProductId,
} from "../convex/lib/stripe";

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
});
