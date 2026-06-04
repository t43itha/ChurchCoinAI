import { describe, expect, it } from "vitest";
import { categorizeWithoutExternalAI } from "../convex/intelligence/categorization/pipeline";
import { normalizeTransaction } from "../convex/intelligence/categorization/normalize";
import { CategoryLike, FundLike } from "../convex/intelligence/categorization/types";

const organizationId = "org-1" as any;

const categories: CategoryLike[] = [
  { _id: "cat-offerings", name: "Offerings", transactionType: "Income" },
  { _id: "cat-bank-charges", name: "Bank Charges", transactionType: "Expenditure" },
];

const funds: FundLike[] = [{ _id: "fund-general", name: "General Fund" }];

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
});
