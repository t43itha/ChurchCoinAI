import { internal } from "../../_generated/api";
import { Id } from "../../_generated/dataModel";
import { validateGeminiSuggestion } from "./gemini";
import { buildMemorySuggestion } from "./memory";
import { normalizeDescription, normalizeTransaction } from "./normalize";
import { applyDeterministicRules } from "./rules";
import { applySmallIncomeDefaults, effectiveCategories, isSmallIncome } from "../../../lib/smallIncomeDefaults";
import { resolveCategoryForTransaction } from "./categoryResolver";
import { mergeSelectiveFallback } from "./selectiveFallback";
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
  categories = effectiveCategories(categories);
  const normalizedTransactions = transactions.map((transaction) =>
    normalizeTransaction(transaction)
  );
  const memoryBySignature = new Map<string, any>(
    memories.map((memory) => [memory.signature, memory])
  );
  const suggestions: CategorizationSuggestion[] = [];

  for (const normalized of normalizedTransactions) {
    const preservedCategory = resolveCategoryForTransaction(normalized.category ?? "", normalized.type, categories);
    const preservedFund = funds.find((fund) => String(fund._id) === normalized.fundId);
    if (preservedCategory && preservedFund) {
      suggestions.push({ ...unresolvedSuggestion(normalized), category: preservedCategory.name, categoryTransactionType: normalized.type, fundId: String(preservedFund._id), fundName: preservedFund.name, predictionSource: "rule", donorName: normalized.donorName ?? null, evidence: [{ source: "rule", reason: "Preserved existing category and fund." }] });
      continue;
    }
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
    if (ruleSuggestion) {
      suggestions.push(ruleSuggestion);
      continue;
    }
    const defaults = applySmallIncomeDefaults(normalized, categories, funds.map((fund) => ({ ...fund, _id: String(fund._id) })));
    const defaultFund = funds.find((fund) => String(fund._id) === defaults.fundId);
    if (isSmallIncome(normalized) && defaults.category && defaultFund) {
      suggestions.push({ ...unresolvedSuggestion(normalized), category: defaults.category, categoryTransactionType: normalized.type, fundId: String(defaultFund._id), fundName: defaultFund.name, predictionSource: "rule", donorName: normalized.donorName ?? null, evidence: [{ source: "rule", reason: "Income of £30 or less: defaulted missing category/fund to Offerings and General Fund." }] });
    } else suggestions.push(unresolvedSuggestion(normalized));
  }

  return suggestions.map((suggestion, index) => preserveCategorizationFields(suggestion, transactions[index], categories, funds));
};

export function preserveCategorizationFields(suggestion: CategorizationSuggestion, input: CategorizationInput, categories: CategoryLike[], funds: FundLike[]): CategorizationSuggestion {
  const category = resolveCategoryForTransaction(input.category ?? "", input.type, categories);
  const fund = funds.find((item) => String(item._id) === input.fundId);
  return { ...suggestion, ...(input.rowId ? { rowId: input.rowId } : {}), ...(category ? { category: category.name, categoryTransactionType: input.type } : {}), ...(fund ? { fundId: String(fund._id), fundName: fund.name } : {}), ...(input.donorName ? { donorName: input.donorName } : {}) };
}

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
  const byId = new Map<string, Record<string, unknown>[]>();
  const queues = new Map<string, Record<string, unknown>[]>();
  for (const rawSuggestion of rawAISuggestions) {
    if (typeof rawSuggestion.rowId === "string") {
      const matches = byId.get(rawSuggestion.rowId) ?? [];
      matches.push(rawSuggestion);
      byId.set(rawSuggestion.rowId, matches);
    }
    const description =
      typeof rawSuggestion.description === "string"
        ? normalizeDescription(rawSuggestion.description)
        : "";
    if (!description) continue;
    const queue = queues.get(description) ?? [];
    queue.push(rawSuggestion);
    queues.set(description, queue);
  }

  return currentSuggestions.map((suggestion, index) => {
    if (suggestion.predictionSource !== "none") {
      return suggestion;
    }

    const transaction = originalTransactions[index];
    if (!transaction) {
      return suggestion;
    }

    const identified = transaction.rowId ? byId.get(transaction.rowId) : undefined;
    const rawSuggestion = transaction.rowId
      ? (identified?.length === 1 ? identified[0] : undefined)
      : queues.get(normalizeDescription(transaction.description))?.shift();
    if (!rawSuggestion) {
      return suggestion;
    }

    if (suggestion.decisionMetadata?.fieldSources) {
      return mergeSelectiveFallback(suggestion, rawSuggestion, transaction, categories, funds, predictionSource);
    }

    const validated = validateGeminiSuggestion(
        rawSuggestion,
        transaction,
        categories,
        funds,
        predictionSource
      );
    return validated ? preserveCategorizationFields(validated, transaction, categories, funds) : suggestion;
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
