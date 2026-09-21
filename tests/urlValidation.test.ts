import { describe, expect, it } from "vitest";
import { validateRedirectUrl } from "../convex/lib/urlValidation";

describe("redirect url validation", () => {
  it("accepts a valid same-host url", () => {
    expect(() =>
      validateRedirectUrl(
        "https://app.example.com/success",
        "successUrl",
        "https://app.example.com"
      )
    ).not.toThrow();
  });

  it("rejects invalid urls", () => {
    expect(() =>
      validateRedirectUrl("not-a-url", "successUrl", "https://app.example.com")
    ).toThrow("successUrl is not a valid URL");
  });

  it("rejects a redirect when the app origin is not configured", () => {
    expect(() =>
      validateRedirectUrl("https://app.example.com/billing", "returnUrl", undefined)
    ).toThrow("APP_BASE_URL is not configured");
  });

  it("rejects disallowed host", () => {
    expect(() =>
      validateRedirectUrl(
        "https://evil.example.com/callback",
        "successUrl",
        "https://app.example.com"
      )
    ).toThrow("successUrl host is not allowed");
  });
});
