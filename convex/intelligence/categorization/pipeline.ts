import { internal } from "../../_generated/api";
import { Id } from "../../_generated/dataModel";
import { validateGeminiSuggestion } from "./gemini";
import { buildMemorySuggestion } from "./memory";
import { normalizeDescription, normalizeTransaction } from "./normalize";
import { applyDeterministicRules } from "./rules";
import {
  CategoryLike,
  CategorizationInput,
  CategorizationSource,
  CategorizationSuggestion,
  FundLike,
} from "./types";

type PipelineCtx = {
  runQuery: (
    query: any,
    args: { organizationId: Id<"organizations">; signatures: string[] }
  ) => Promise<any>;
};

const getCategorizationMemoryBySignatures = (internal as any).intelligence
  .categorizationMemory.getBySignatures;

export const categorizationSignatures = (
  transactions: CategorizationInput[]
): string[] => [
  ...new Set(
    transactions.map(
      (transaction) => normalizeTransaction(transaction).signature
    )
  ),
];

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

const hasMatchingRawDescription = (
  rawSuggestion: Record<string, unknown>,
  transaction: CategorizationInput
): boolean => {
  if (
    typeof rawSuggestion.description !== "string" ||
    !rawSuggestion.description.trim()
  ) {
    return false;
  }

  return (
    normalizeDescription(rawSuggestion.description) ===
    normalizeDescription(transaction.description)
  );
};

export const categorizeWithoutExternalAI = async (
  ctx: PipelineCtx,
  organizationId: Id<"organizations">,
  transactions: CategorizationInput[],
  categories: CategoryLike[],
  funds: FundLike[]
): Promise<CategorizationSuggestion[]> => {
  const signatures = categorizationSignatures(transactions);
  const memories: any[] = signatures.length
    ? await ctx.runQuery(getCategorizationMemoryBySignatures, {
        organizationId,
        signatures,
      })
    : [];
  return categorizeFromContext(transactions, categories, funds, memories);
};

export const categorizeFromContext = (
  transactions: CategorizationInput[],
  categories: CategoryLike[],
  funds: FundLike[],
  memories: any[]
): CategorizationSuggestion[] => {
  const normalizedTransactions = transactions.map((transaction) =>
    normalizeTransaction(transaction)
  );
  const memoryBySignature = new Map<string, any>(
    memories.map((memory) => [memory.signature, memory])
  );
  const suggestions: CategorizationSuggestion[] = [];

  for (const normalized of normalizedTransactions) {
    const memory = memoryBySignature.get(normalized.signature);
    const memorySuggestion = memory
      ? buildMemorySuggestion(memory, normalized, categories, funds)
      : null;

    if (memorySuggestion) {
      suggestions.push(memorySuggestion);
      continue;
    }

    const ruleSuggestion = applyDeterministicRules(
      normalized,
      categories,
      funds
    );
    suggestions.push(ruleSuggestion ?? unresolvedSuggestion(normalized));
  }

  return suggestions;
};

type AIPredictionSource = Extract<
  CategorizationSource,
  "gemini" | "openrouter" | "openai"
>;

export const mergeAIFallback = (
  currentSuggestions: CategorizationSuggestion[],
  rawAISuggestions: Record<string, unknown>[],
  originalTransactions: CategorizationInput[],
  categories: CategoryLike[],
  funds: FundLike[],
  predictionSource: AIPredictionSource
): CategorizationSuggestion[] => {
  let aiIndex = 0;

  return currentSuggestions.map((suggestion, index) => {
    if (suggestion.predictionSource !== "none") {
      return suggestion;
    }

    const rawSuggestion = rawAISuggestions[aiIndex];
    aiIndex += 1;
    if (!rawSuggestion) {
      return suggestion;
    }

    const transaction = originalTransactions[index];
    if (!transaction) {
      return suggestion;
    }

    if (!hasMatchingRawDescription(rawSuggestion, transaction)) {
      return suggestion;
    }

    return (
      validateGeminiSuggestion(
        rawSuggestion,
        transaction,
        categories,
        funds,
        predictionSource
      ) ?? suggestion
    );
  });
};

export const mergeGeminiFallback = (
  currentSuggestions: CategorizationSuggestion[],
  rawGeminiSuggestions: Record<string, unknown>[],
  originalTransactions: CategorizationInput[],
  categories: CategoryLike[],
  funds: FundLike[]
): CategorizationSuggestion[] =>
  mergeAIFallback(
    currentSuggestions,
    rawGeminiSuggestions,
    originalTransactions,
    categories,
    funds,
    "gemini"
  );

export type LoadedAIFallback = {
  suggestions: Record<string, unknown>[];
  source: AIPredictionSource;
};

export const mergeAIFallbackSafely = async (
  initialSuggestions: CategorizationSuggestion[],
  loadRawSuggestions: () => Promise<LoadedAIFallback> | LoadedAIFallback,
  originalTransactions: CategorizationInput[],
  categories: CategoryLike[],
  funds: FundLike[],
  onError?: (error: unknown) => void
): Promise<CategorizationSuggestion[]> => {
  try {
    const loaded = await loadRawSuggestions();
    return mergeAIFallback(
      initialSuggestions,
      loaded.suggestions,
      originalTransactions,
      categories,
      funds,
      loaded.source
    );
  } catch (error) {
    onError?.(error);
    return initialSuggestions;
  }
};

export const mergeGeminiFallbackSafely = async (
  initialSuggestions: CategorizationSuggestion[],
  loadRawGeminiSuggestions: () =>
    | Promise<Record<string, unknown>[]>
    | Record<string, unknown>[],
  originalTransactions: CategorizationInput[],
  categories: CategoryLike[],
  funds: FundLike[],
  onError?: (error: unknown) => void
): Promise<CategorizationSuggestion[]> => {
  return mergeAIFallbackSafely(
    initialSuggestions,
    async () => ({
      suggestions: await loadRawGeminiSuggestions(),
      source: "gemini",
    }),
    originalTransactions,
    categories,
    funds,
    onError
  );
};
