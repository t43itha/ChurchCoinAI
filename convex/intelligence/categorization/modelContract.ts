import { categoryNamesForPrompt } from "./categoryResolver";
import { accountingCriteria } from "./policy";
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
Return exactly one strict JSON prediction for every supplied transaction, copying its rowId exactly. Never match rows by description.

Income categories: ${categoryNamesForPrompt(categories, "Income").join(", ")}
Expenditure categories: ${categoryNamesForPrompt(categories, "Expenditure").join(", ")}
Funds: ${funds.map((fund) => fund.name).join(", ")}

${accountingCriteria(categories, funds)}

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
          rowId: { type: "string" },
          description: { type: "string" },
          category: {
            type: "string",
            // Movement categories are valid for both types, so dedupe.
            enum: [
              ...new Set([
                ...categoryNamesForPrompt(categories, "Income"),
                ...categoryNamesForPrompt(categories, "Expenditure"),
              ]),
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
          "rowId",
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
