import { describe, expect, it } from "vitest";
import {
  buildRagEntryKey,
  metadataToSuggestion,
} from "../convex/intelligence/categorization/rag";
import {
  CategoryLike,
  FundLike,
} from "../convex/intelligence/categorization/types";

const categories: CategoryLike[] = [
  {
    name: "Offerings",
    transactionType: "Income",
    mainCategory: "Donations",
  },
  {
    name: "Bank Charges",
    transactionType: "Expenditure",
    mainCategory: "Admin & Governance",
  },
];

const funds: FundLike[] = [{ _id: "fund1", name: "General Fund" }];

describe("RAG categorization helpers", () => {
  it("builds stable aggregate memory keys", () => {
    expect(buildRagEntryKey("org1", "Income:jane:band:50")).toBe(
      "memory:org1:Income:jane:band:50"
    );
  });

  it("rejects mismatched metadata transaction type", () => {
    const suggestion = metadataToSuggestion(
      {
        category: "Bank Charges",
        fundId: "fund1",
        type: "Expenditure",
        isGiftAidEligible: false,
        donorName: "",
        acceptedCount: 4,
      },
      { description: "Donation", amount: 50, type: "Income" },
      0.94,
      categories,
      funds
    );

    expect(suggestion).toBeNull();
  });

  it("converts valid metadata into a RAG suggestion", () => {
    const suggestion = metadataToSuggestion(
      {
        category: "Offerings",
        fundId: "fund1",
        type: "Income",
        isGiftAidEligible: true,
        donorName: "Jane Smith",
        acceptedCount: 3,
      },
      { description: "Jane Smith donation", amount: 50, type: "Income" },
      0.95,
      categories,
      funds
    );

    expect(suggestion).toMatchObject({
      category: "Offerings",
      fundName: "General Fund",
      confidence: 0.92,
      confidenceLabel: "High",
      isGiftAidEligible: true,
      donorName: "Jane Smith",
      predictionSource: "rag",
      ragScore: 0.95,
      requiresReview: false,
    });
    expect(suggestion?.evidence[0]).toMatchObject({
      source: "rag",
      score: 0.95,
    });
  });
});
