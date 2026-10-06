import { categoryNamesForPrompt } from "./categoryResolver";
import { CATEGORIZATION_RULES } from "./gemini";
import {
  CategoryLike,
  CategorizationEvidence,
  FundLike,
} from "./types";

export const categorizationModelInstructions = (
  categories: CategoryLike[],
  funds: FundLike[],
  evidence: CategorizationEvidence[]
): string => `You are a UK church finance categorisation assistant.
Return exactly one strict JSON prediction for every supplied transaction.

Income categories: ${categoryNamesForPrompt(categories, "Income").join(", ")}
Expenditure categories: ${categoryNamesForPrompt(categories, "Expenditure").join(", ")}
Funds: ${funds.map((fund) => fund.name).join(", ")}

${CATEGORIZATION_RULES}

Relevant evidence reasons:
${evidence.map((item) => `- ${item.reason}`).join("\n")}`;

export const categorizationOutputSchema = (
  categories: CategoryLike[],
  funds: FundLike[]
) => ({
  type: "object",
  properties: {
    predictions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          category: {
            type: "string",
            enum: [
              ...categoryNamesForPrompt(categories, "Income"),
              ...categoryNamesForPrompt(categories, "Expenditure"),
            ],
          },
          fundName: {
            type: "string",
            enum: funds.map((fund) => fund.name),
          },
          confidence: {
            type: "string",
            enum: ["High", "Medium", "Low"],
          },
          isGiftAidEligible: { type: "boolean" },
          donorName: { type: ["string", "null"] },
          evidence: { type: "string" },
        },
        required: [
          "description",
          "category",
          "fundName",
          "confidence",
          "isGiftAidEligible",
          "donorName",
          "evidence",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["predictions"],
  additionalProperties: false,
});
