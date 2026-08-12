import { describe, expect, it } from "vitest";
import { getInviteEmailConfig } from "../convex/lib/emailConfig";

describe("invite email configuration", () => {
  it("requires an API key", () => {
    expect(getInviteEmailConfig({})).toMatchObject({
      configured: false,
      error: expect.stringContaining("RESEND_API_KEY"),
    });
  });

  it("does not fall back to the Resend sandbox sender", () => {
    expect(
      getInviteEmailConfig({
        RESEND_API_KEY: "re_test",
        RESEND_FROM_EMAIL: "ChurchCoin <onboarding@resend.dev>",
      })
    ).toMatchObject({
      configured: false,
      error: expect.stringContaining("verified custom domain"),
    });
  });

  it("accepts a sender on a configured custom domain", () => {
    expect(
      getInviteEmailConfig({
        RESEND_API_KEY: "re_test",
        RESEND_FROM_EMAIL: "ChurchCoin <onboarding@churchcoin.example>",
      })
    ).toEqual({
      configured: true,
      apiKey: "re_test",
      from: "ChurchCoin <onboarding@churchcoin.example>",
    });
  });
});
