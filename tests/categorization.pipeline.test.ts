import { describe, expect, it } from "vitest";
import {
  categorizeWithoutExternalAI,
  mergeGeminiFallback,
  mergeGeminiFallbackSafely,
} from "../convex/intelligence/categorization/pipeline";
import { normalizeTransaction } from "../convex/intelligence/categorization/normalize";
import {
  CategoryLike,
  CategorizationSuggestion,
  FundLike,
} from "../convex/intelligence/categorization/types";

const organizationId = "org-1" as any;

const categories: CategoryLike[] = [
  { _id: "cat-offerings", name: "Offerings", transactionType: "Income" },
  { _id: "cat-bank-charges", name: "Bank Charges", transactionType: "Expenditure" },
];

const funds: FundLike[] = [{ _id: "fund-general", name: "General Fund" }];

const suggestion = (
  transaction: {
    description: string;
    amount: number;
    type: "Income" | "Expenditure";
  },
  predictionSource: CategorizationSuggestion["predictionSource"],
  category = ""
): CategorizationSuggestion => ({
  ...transaction,
  category,
  fundName: predictionSource === "none" ? "" : "General Fund",
  fundId: predictionSource === "none" ? undefined : "fund-general",
  confidence: predictionSource === "none" ? 0 : 0.9,
  confidenceLabel: predictionSource === "none" ? "Low" : "High",
  isGiftAidEligible: false,
  donorName: null,
  predictionSource,
  requiresReview: predictionSource === "none",
  evidence: [
    {
      source: predictionSource,
      reason: `${predictionSource} suggestion`,
    },
  ],
});

describe("categorization pipeline", () => {
  it("batch loads deduplicated memory signatures before falling back to rules", async () => {
    const remembered = {
      description: "Standing order from Jane Smith",
      amount: 50,
      type: "Income" as const,
    };
    const duplicateMemorySignature = normalizeTransaction(remembered).signature;
    const ruleMatched = {
      description: "Monthly bank charges",
      amount: 7.5,
      type: "Expenditure" as const,
    };
    const unresolved = {
      description: "Unknown supplier",
      amount: 12,
      type: "Expenditure" as const,
    };
    const expectedSignatures = [
      duplicateMemorySignature,
      normalizeTransaction(ruleMatched).signature,
      normalizeTransaction(unresolved).signature,
    ];
    const runQueryCalls: any[] = [];
    const ctx = {
      runQuery: async (query: any, args: any) => {
        runQueryCalls.push({ query, args });
        return [
          {
            signature: duplicateMemorySignature,
            category: "Offerings",
            fundId: "fund-general",
            isGiftAidEligible: true,
            donorName: "Jane Smith",
            acceptedCount: 3,
            confidence: 0.93,
            transactionType: "Income",
          },
        ];
      },
    };

    const suggestions = await categorizeWithoutExternalAI(
      ctx,
      organizationId,
      [remembered, remembered, ruleMatched, unresolved],
      categories,
      funds
    );

    expect(runQueryCalls).toHaveLength(1);
    expect(runQueryCalls[0].args).toEqual({
      organizationId,
      signatures: expectedSignatures,
    });
    expect(suggestions.map((suggestion) => suggestion.predictionSource)).toEqual([
      "memory",
      "memory",
      "rule",
      "none",
    ]);
  });

  it("merges validated Gemini fallback only into unresolved suggestions", () => {
    const remembered = {
      description: "Standing order from Jane Smith",
      amount: 50,
      type: "Income" as const,
    };
    const unresolvedIncome = {
      description: "Mystery church gift",
      amount: 25,
      type: "Income" as const,
    };
    const ruleMatched = {
      description: "Monthly bank charges",
      amount: 7.5,
      type: "Expenditure" as const,
    };
    const unresolvedExpense = {
      description: "Unknown supplier",
      amount: 12,
      type: "Expenditure" as const,
    };
    const currentSuggestions = [
      suggestion(remembered, "memory", "Offerings"),
      suggestion(unresolvedIncome, "none"),
      suggestion(ruleMatched, "rule", "Bank Charges"),
      suggestion(unresolvedExpense, "none"),
    ];

    const merged = mergeGeminiFallback(
      currentSuggestions,
      [
        {
          description: unresolvedIncome.description,
          category: "Offerings",
          fundName: "General Fund",
          confidence: "High",
          isGiftAidEligible: true,
          donorName: "A Donor",
        },
        {
          description: unresolvedExpense.description,
          category: "Bank Charges",
          fundName: "General Fund",
          confidence: "Medium",
          isGiftAidEligible: false,
        },
      ],
      [remembered, unresolvedIncome, ruleMatched, unresolvedExpense],
      categories,
      funds
    );

    expect(merged).toHaveLength(currentSuggestions.length);
    expect(merged[0]).toBe(currentSuggestions[0]);
    expect(merged[2]).toBe(currentSuggestions[2]);
    expect(merged.map((item) => item.description)).toEqual([
      remembered.description,
      unresolvedIncome.description,
      ruleMatched.description,
      unresolvedExpense.description,
    ]);
    expect(merged.map((item) => item.predictionSource)).toEqual([
      "memory",
      "gemini",
      "rule",
      "gemini",
    ]);
    expect(merged[1]).toMatchObject({
      category: "Offerings",
      fundName: "General Fund",
      fundId: "fund-general",
      isGiftAidEligible: true,
      donorName: "A Donor",
    });
    expect(merged[3]).toMatchObject({
      category: "Bank Charges",
      fundName: "General Fund",
      fundId: "fund-general",
    });
  });

  it("keeps unresolved suggestions when consumed Gemini fallback is invalid", () => {
    const firstUnresolved = {
      description: "Unknown gift",
      amount: 40,
      type: "Income" as const,
    };
    const secondUnresolved = {
      description: "Unknown fee",
      amount: 8,
      type: "Expenditure" as const,
    };
    const currentSuggestions = [
      suggestion(firstUnresolved, "none"),
      suggestion(secondUnresolved, "none"),
    ];

    const merged = mergeGeminiFallback(
      currentSuggestions,
      [
        {
          description: firstUnresolved.description,
          category: "Bank Charges",
          fundName: "General Fund",
          confidence: "High",
        },
        {
          description: secondUnresolved.description,
          category: "Bank Charges",
          fundName: "General Fund",
          confidence: "High",
        },
      ],
      [firstUnresolved, secondUnresolved],
      categories,
      funds
    );

    expect(merged[0]).toBe(currentSuggestions[0]);
    expect(merged[1]).toMatchObject({
      description: secondUnresolved.description,
      category: "Bank Charges",
      predictionSource: "gemini",
    });
  });

  it("keeps unresolved suggestions when same-type Gemini rows are reordered", () => {
    const firstIncome = {
      description: "Mystery gift A",
      amount: 40,
      type: "Income" as const,
    };
    const secondIncome = {
      description: "Mystery gift B",
      amount: 60,
      type: "Income" as const,
    };
    const currentSuggestions = [
      suggestion(firstIncome, "none"),
      suggestion(secondIncome, "none"),
    ];

    const merged = mergeGeminiFallback(
      currentSuggestions,
      [
        {
          description: secondIncome.description,
          category: "Offerings",
          fundName: "General Fund",
          confidence: "High",
          donorName: "Second Donor",
        },
        {
          description: firstIncome.description,
          category: "Offerings",
          fundName: "General Fund",
          confidence: "High",
          donorName: "First Donor",
        },
      ],
      [firstIncome, secondIncome],
      categories,
      funds
    );

    expect(merged[0]).toBe(currentSuggestions[0]);
    expect(merged[1]).toBe(currentSuggestions[1]);
  });

  it("keeps unresolved suggestions for missing descriptions and missing Gemini rows", () => {
    const firstUnresolved = {
      description: "Unknown gift",
      amount: 40,
      type: "Income" as const,
    };
    const secondUnresolved = {
      description: "Unknown supplier",
      amount: 12,
      type: "Expenditure" as const,
    };
    const currentSuggestions = [
      suggestion(firstUnresolved, "none"),
      suggestion(secondUnresolved, "none"),
    ];

    const merged = mergeGeminiFallback(
      currentSuggestions,
      [
        {
          category: "Offerings",
          fundName: "General Fund",
          confidence: "High",
        },
        {
          description: "Extra row that should not be used",
          category: "Bank Charges",
          fundName: "General Fund",
          confidence: "High",
        },
      ],
      [firstUnresolved, secondUnresolved],
      categories,
      funds
    );

    expect(merged[0]).toBe(currentSuggestions[0]);
    expect(merged[1]).toBe(currentSuggestions[1]);
  });

  it("preserves initial suggestions when Gemini fallback fails", async () => {
    const remembered = {
      description: "Standing order from Jane Smith",
      amount: 50,
      type: "Income" as const,
    };
    const unresolvedIncome = {
      description: "Mystery church gift",
      amount: 25,
      type: "Income" as const,
    };
    const currentSuggestions = [
      suggestion(remembered, "memory", "Offerings"),
      suggestion(unresolvedIncome, "none"),
    ];

    const merged = await mergeGeminiFallbackSafely(
      currentSuggestions,
      async () => {
        throw new Error("Gemini unavailable");
      },
      [remembered, unresolvedIncome],
      categories,
      funds
    );

    expect(merged).toBe(currentSuggestions);
  });
});
