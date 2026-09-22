import { categoryNamesForPrompt } from "./categoryResolver";
import { accountingCriteria } from "../../../lib/categorizationPolicy";
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
  funds: FundLike[],
  selective = false
) => ({
  type: "object",
  properties: {
    predictions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rowId: { type: "string" },
          ...(selective ? {} : { description: { type: "string" } }),
          category: {
            type: selective ? ["string", "null"] : "string",
            enum: [
              ...categoryNamesForPrompt(categories, "Income"),
              ...categoryNamesForPrompt(categories, "Expenditure"),
              ...(selective ? [null] : []),
            ],
          },
          fundName: {
            type: selective ? ["string", "null"] : "string",
            enum: [...funds.map((fund) => fund.name), ...(selective ? [null] : [])],
          },
          confidence: {
            type: "string",
            enum: ["High", "Medium", "Low"],
          },
          ...(selective ? {} : { isGiftAidEligible: { type: "boolean" } }),
          donorName: { type: ["string", "null"] },
          ...(selective ? {} : { evidence: { type: "string" } }),
        },
        required: [
          "rowId",
          "category",
          "fundName",
          "confidence",
          "donorName",
          ...(selective ? [] : ["description", "isGiftAidEligible", "evidence"]),
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["predictions"],
  additionalProperties: false,
});
