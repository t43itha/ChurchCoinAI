import { describe, expect, it } from "vitest";
import { buildFeedbackEvent } from "../convex/intelligence/categorization/feedback";
import { shouldUpdateCategorizationRagIndex } from "../convex/mutations/transactions";

describe("categorization feedback event builder", () => {
  it("normalizes the transaction signature and compares predicted and accepted fields", () => {
    const event = buildFeedbackEvent({
      organizationId: "org-1" as any,
      transactionId: "tx-1" as any,
      transaction: {
        description: "FT-J SMITH   TITHE Ref: 1234",
        amount: 102.49,
        type: "Income",
      },
      source: "gemini",
      confidence: 0.72,
      originalCategory: "Donations",
      finalCategory: "Tithe",
      originalFundId: "fund-general" as any,
      finalFundId: "fund-restricted" as any,
      originalGiftAidEligible: false,
      finalGiftAidEligible: true,
      originalDonorName: "J Smith",
      finalDonorName: "Jane Smith",
      learned: true,
      createdAt: 12345,
    });

    expect(event).toEqual({
      organizationId: "org-1",
      transactionId: "tx-1",
      signature: "Income:j smith tithe:band:100",
      transactionType: "Income",
      source: "gemini",
      confidence: 0.72,
      originalCategory: "Donations",
      finalCategory: "Tithe",
      categoryChanged: true,
      originalFundId: "fund-general",
      finalFundId: "fund-restricted",
      fundChanged: true,
      originalGiftAidEligible: false,
      finalGiftAidEligible: true,
      giftAidChanged: true,
      originalDonorName: "J Smith",
      finalDonorName: "Jane Smith",
      donorNameChanged: true,
      learned: true,
      createdAt: 12345,
    });
  });

  it("treats omitted optional metadata as unchanged when final metadata is also omitted", () => {
    const event = buildFeedbackEvent({
      organizationId: "org-1" as any,
      transactionId: "tx-1" as any,
      transaction: {
        description: "Card Fees",
        amount: 12.5,
        type: "Expenditure",
      },
      source: "none",
      confidence: 0,
      finalCategory: "Bank Charges",
      originalFundId: "fund-general" as any,
      finalFundId: "fund-general" as any,
      learned: false,
      createdAt: 67890,
    });

    expect(event.signature).toBe("Expenditure:card fees:exact:12.50");
    expect(event.categoryChanged).toBe(true);
    expect(event.fundChanged).toBe(false);
    expect(event.giftAidChanged).toBe(false);
    expect(event.donorNameChanged).toBe(false);
    expect(event.learned).toBe(false);
  });
});

describe("categorization feedback RAG update decision", () => {
  it("updates when learned metadata changes even if the category is accepted", () => {
    expect(
      shouldUpdateCategorizationRagIndex({
        finalCategory: "Tithes & First Fruits",
        predictedCategory: "Tithes & First Fruits",
        finalCategoryName: "Tithes & First Fruits",
        predictedFundId: "fund-general" as any,
        finalFundId: "fund-building" as any,
        predictedGiftAidEligible: true,
        finalGiftAidEligible: true,
        predictedDonorName: "Jane Smith",
        finalDonorName: "Jane Smith",
      })
    ).toBe(true);
  });

  it("does not update without a learned final category", () => {
    expect(
      shouldUpdateCategorizationRagIndex({
        finalCategory: null,
        predictedCategory: "Legacy",
        finalCategoryName: "Legacy",
        predictedFundId: "fund-general" as any,
        finalFundId: "fund-building" as any,
        predictedGiftAidEligible: false,
        finalGiftAidEligible: true,
        predictedDonorName: "J Smith",
        finalDonorName: "Jane Smith",
      })
    ).toBe(false);
  });
});
