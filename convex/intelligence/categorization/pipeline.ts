import { internal } from "../../_generated/api";
import { Id } from "../../_generated/dataModel";
import { buildMemorySuggestion } from "./memory";
import { normalizeTransaction } from "./normalize";
import { applyDeterministicRules } from "./rules";
import {
  CategoryLike,
  CategorizationInput,
  CategorizationSuggestion,
  FundLike,
} from "./types";

type PipelineCtx = {
  runQuery: (
    query: any,
    args: { organizationId: Id<"organizations">; signature: string }
  ) => Promise<any>;
};

const getCategorizationMemoryBySignature = (internal as any).intelligence
  .categorizationMemory.getBySignature;

const unresolvedSuggestion = (
  transaction: CategorizationInput
): CategorizationSuggestion => ({
  description: transaction.description,
  amount: transaction.amount,
  type: transaction.type,
  category: "",
  fundName: "",
  confidence: 0,
  confidenceLabel: "Low",
  isGiftAidEligible: false,
  donorName: null,
  predictionSource: "none",
  requiresReview: true,
  evidence: [
    {
      source: "none",
      reason: "No confident categorisation found.",
    },
  ],
});

export const categorizeWithoutExternalAI = async (
  ctx: PipelineCtx,
  organizationId: Id<"organizations">,
  transactions: CategorizationInput[],
  categories: CategoryLike[],
  funds: FundLike[]
): Promise<CategorizationSuggestion[]> => {
  const suggestions: CategorizationSuggestion[] = [];

  for (const transaction of transactions) {
    const normalized = normalizeTransaction(transaction);
    const memory = await ctx.runQuery(
      getCategorizationMemoryBySignature,
      {
        organizationId,
        signature: normalized.signature,
      }
    );
    const memorySuggestion = memory
      ? buildMemorySuggestion(memory, normalized, categories, funds)
      : null;

    if (memorySuggestion) {
      suggestions.push(memorySuggestion);
      continue;
    }

    const ruleSuggestion = applyDeterministicRules(
      transaction,
      categories,
      funds
    );
    suggestions.push(ruleSuggestion ?? unresolvedSuggestion(transaction));
  }

  return suggestions;
};
