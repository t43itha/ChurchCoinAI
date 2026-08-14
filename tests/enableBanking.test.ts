import { describe, expect, it } from "vitest";
import {
  EnableBankingApiError,
  getConsentValidUntil,
  isEnableBankingExpiredSessionError,
  normalizeEnableBankingInstitutions,
} from "../convex/lib/enableBanking";

describe("Enable Banking API helpers", () => {
  it("normalizes and sorts business AISP institutions", () => {
    expect(
      normalizeEnableBankingInstitutions({
        aspsps: [
          {
            name: "HSBC UK Bank Plc",
            country: "gb",
            logo: "https://enablebanking.com/brands/GB/HSBC/",
            maximum_consent_validity: 15_552_000,
            psu_types: ["business", "personal"],
            beta: false,
          },
          {
            name: "Barclays",
            country: "GB",
            logo: "https://enablebanking.com/brands/GB/Barclays/",
            maximum_consent_validity: 7_776_000,
            psu_types: ["business"],
            beta: true,
          },
          {
            name: "Personal only bank",
            country: "GB",
            logo: "https://example.com/logo",
            maximum_consent_validity: 7_776_000,
            psu_types: ["personal"],
            beta: false,
          },
        ],
      })
    ).toEqual([
      {
        name: "Barclays",
        country: "GB",
        logoUrl: "https://enablebanking.com/brands/GB/Barclays/",
        maximumConsentValiditySeconds: 7_776_000,
        beta: true,
      },
      {
        name: "HSBC UK Bank Plc",
        country: "GB",
        logoUrl: "https://enablebanking.com/brands/GB/HSBC/",
        maximumConsentValiditySeconds: 15_552_000,
        beta: false,
      },
    ]);
  });

  it("rejects a malformed ASPSP response", () => {
    expect(() => normalizeEnableBankingInstitutions({ aspsps: null })).toThrow(
      "Enable Banking ASPSP response is invalid"
    );
  });

  it("uses the bank maximum when requesting consent validity", () => {
    const before = Date.now();
    const validUntil = Date.parse(getConsentValidUntil(15_552_000));
    const after = Date.now();

    expect(validUntil).toBeGreaterThanOrEqual(before + 15_552_000_000);
    expect(validUntil).toBeLessThanOrEqual(after + 15_552_000_000);
  });

  it("recognizes only the provider EXPIRED_SESSION error as re-authentication", () => {
    expect(
      isEnableBankingExpiredSessionError(
        new EnableBankingApiError(401, "Unauthorized", "EXPIRED_SESSION")
      )
    ).toBe(true);
    expect(
      isEnableBankingExpiredSessionError(
        new EnableBankingApiError(401, "Unauthorized", "INVALID_TOKEN")
      )
    ).toBe(false);
  });
});
