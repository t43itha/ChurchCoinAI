import { describe, expect, it } from "vitest";
import {
  getGoCardlessConsentExpiry,
  isGoCardlessReauthError,
  mapGoCardlessAccountDetails,
} from "../convex/lib/gocardless";

describe("GoCardless provider helpers", () => {
  it("maps GoCardless account details into ChurchCoin account fields", () => {
    expect(
      mapGoCardlessAccountDetails("account-1", {
        account: {
          name: "Metro Business Current",
          iban: "GB29NWBK60161331926819",
          cashAccountType: "CACC",
          currency: "GBP",
          product: "Business Current Account",
        },
      })
    ).toEqual({
      accountId: "account-1",
      providerAccountHash: "GB29NWBK60161331926819",
      name: "Metro Business Current",
      mask: "6819",
      type: "CACC",
      currency: "GBP",
    });
  });

  it("falls back to account id when GoCardless account names are unavailable", () => {
    expect(
      mapGoCardlessAccountDetails("account-2", {
        account: {
          currency: "GBP",
        },
      })
    ).toEqual({
      accountId: "account-2",
      providerAccountHash: undefined,
      name: "Bank account account-2",
      mask: undefined,
      type: undefined,
      currency: "GBP",
    });
  });

  it("detects GoCardless reauthentication errors", () => {
    expect(isGoCardlessReauthError({ status: 401 })).toBe(true);
    expect(isGoCardlessReauthError({ status: 403 })).toBe(true);
    expect(
      isGoCardlessReauthError({
        status: 409,
        summary: "Account Suspended",
      })
    ).toBe(true);
    expect(isGoCardlessReauthError({ status: 503 })).toBe(false);
  });

  it("calculates consent expiry from access-valid days", () => {
    expect(
      getGoCardlessConsentExpiry({
        now: new Date("2026-06-08T00:00:00.000Z").getTime(),
        accessValidForDays: 90,
      })
    ).toBe(new Date("2026-09-06T00:00:00.000Z").getTime());
  });
});
