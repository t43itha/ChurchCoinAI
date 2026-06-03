import { describe, expect, it } from "vitest";
import {
  CATEGORIZATION_MODEL,
  buildGeminiCategorizationPrompt,
  validateGeminiSuggestion,
} from "../convex/intelligence/categorization/gemini";
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

describe("Gemini categorization helpers", () => {
  it("uses Flash-Lite for categorization fallback", () => {
    expect(CATEGORIZATION_MODEL).toBe("gemini-2.5-flash-lite");
  });

  it("filters prompt categories by transaction type", () => {
    const prompt = buildGeminiCategorizationPrompt(
      [{ description: "Donation from Jane", amount: 50, type: "Income" }],
      categories,
      funds,
      []
    );

    expect(prompt).toContain("Income categories: Offerings");
    expect(prompt).toContain("Expenditure categories: Bank Charges");
    expect(prompt).not.toContain("Income categories: Offerings, Bank Charges");
  });

  it("rejects model output with mismatched category type", () => {
    const result = validateGeminiSuggestion(
      {
        category: "Bank Charges",
        fundName: "General Fund",
        confidence: "High",
        isGiftAidEligible: false,
        donorName: "",
      },
      { description: "Donation", amount: 50, type: "Income" },
      categories,
      funds
    );

    expect(result).toBeNull();
  });

  it("accepts valid output and trims category, fund, evidence, and donor values", () => {
    const result = validateGeminiSuggestion(
      {
        category: " Offerings ",
        fundName: " General Fund ",
        confidence: "High",
        isGiftAidEligible: true,
        donorName: " Jane Donor ",
        evidence: " Standing order reference ",
      },
      { description: "Donation", amount: 50, type: "Income" },
      categories,
      funds
    );

    expect(result).toMatchObject({
      category: "Offerings",
      fundName: "General Fund",
      fundId: "fund1",
      predictionSource: "gemini",
      donorName: "Jane Donor",
      confidenceLabel: "High",
      requiresReview: true,
      isGiftAidEligible: true,
      evidence: [{ source: "gemini", reason: "Standing order reference" }],
    });
  });

  it("rejects invented funds instead of falling back to the first fund", () => {
    const result = validateGeminiSuggestion(
      {
        category: "Offerings",
        fundName: "Invented Fund",
        confidence: "Medium",
        isGiftAidEligible: false,
      },
      { description: "Donation", amount: 50, type: "Income" },
      categories,
      funds
    );

    expect(result).toBeNull();
  });

  it.each([undefined, "", "   "])(
    "rejects missing or blank fundName value %s",
    (fundName) => {
      const result = validateGeminiSuggestion(
        {
          category: "Offerings",
          fundName,
          confidence: "Medium",
          isGiftAidEligible: false,
        },
        { description: "Donation", amount: 50, type: "Income" },
        categories,
        funds
      );

      expect(result).toBeNull();
    }
  );

  it.each([
    ["High", "High"],
    ["Medium", "Medium"],
    ["Low", "Low"],
  ])("maps %s model confidence to %s confidenceLabel", (confidence, label) => {
    const result = validateGeminiSuggestion(
      {
        category: "Offerings",
        fundName: "General Fund",
        confidence,
        isGiftAidEligible: false,
      },
      { description: "Donation", amount: 50, type: "Income" },
      categories,
      funds
    );

    expect(result?.confidenceLabel).toBe(label);
    expect(result?.requiresReview).toBe(true);
  });
});
