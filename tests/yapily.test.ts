import { describe, expect, it } from "vitest";
import {
  normalizeYapilyAccount,
  normalizeYapilyTransaction,
} from "../convex/lib/bankConnectionUtils";
import { normalizeYapilyInstitutions } from "../convex/lib/yapily";

describe("Yapily banking helpers", () => {
  it("lists only UK institutions with the required data features", () => {
    expect(
      normalizeYapilyInstitutions({
        data: [
          {
            id: "unity-trust",
            name: "Unity Trust Bank",
            countries: [{ countryCode2: "GB" }],
            environmentType: "LIVE",
            media: [
              { type: "icon", source: "https://images.example/icon.png" },
              { type: "logo", source: "https://images.example/logo.png" },
            ],
            features: [
              "INITIATE_ACCOUNT_REQUEST",
              "ACCOUNTS",
              "ACCOUNT_TRANSACTIONS",
            ],
          },
          {
            id: "payments-only",
            name: "Payments Only",
            countries: [{ countryCode2: "GB" }],
            features: ["INITIATE_DOMESTIC_SINGLE_PAYMENT"],
          },
          {
            id: "european-bank",
            name: "European Bank",
            countries: [{ countryCode2: "DE" }],
            features: [
              "INITIATE_ACCOUNT_REQUEST",
              "ACCOUNTS",
              "ACCOUNT_TRANSACTIONS",
            ],
          },
        ],
      })
    ).toEqual([
      {
        institutionId: "unity-trust",
        name: "Unity Trust Bank",
        country: "GB",
        logoUrl: "https://images.example/logo.png",
        environmentType: "LIVE",
      },
    ]);
  });

  it("normalizes an account without exposing its full identifier", () => {
    expect(
      normalizeYapilyAccount({
        id: "account-1",
        type: "BUSINESS_CURRENT",
        nickname: "Church current",
        currency: "GBP",
        accountIdentifications: [
          { type: "SORT_CODE", identification: "123456" },
          { type: "ACCOUNT_NUMBER", identification: "87654321" },
        ],
      })
    ).toEqual({
      accountId: "account-1",
      providerAccountHash: undefined,
      providerAccountHashes: undefined,
      name: "Church current",
      mask: "4321",
      type: "BUSINESS_CURRENT",
      currency: "GBP",
    });
  });

  it("normalizes signed Yapily credits and debits", () => {
    expect(
      normalizeYapilyTransaction({
        transaction: {
          id: "credit-1",
          bookingDateTime: "2026-08-12T10:30:00.000Z",
          transactionAmount: { amount: 125.5, currency: "GBP" },
          description: "Sunday giving",
        },
        accountId: "account-1",
        accountName: "Church current",
        fundId: "fund-1",
      })
    ).toMatchObject({
      date: "2026-08-12",
      amount: 125.5,
      type: "Income",
      providerTransactionId: "credit-1",
    });

    expect(
      normalizeYapilyTransaction({
        transaction: {
          id: "debit-1",
          date: "2026-08-13T00:00:00.000Z",
          amount: -49.99,
          transactionInformation: ["Stationery", "Invoice 123"],
        },
        accountId: "account-1",
        accountName: "Church current",
      })
    ).toMatchObject({
      date: "2026-08-13",
      description: "Stationery Invoice 123",
      amount: 49.99,
      type: "Expenditure",
      providerTransactionId: "debit-1",
    });
  });
});
