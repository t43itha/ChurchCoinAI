import { resolveCategoryForTransaction } from "./categoryResolver";
import { confidenceFromModelLabel } from "./gemini";
import { confidenceLabel } from "./confidence";
import type { CategoryLike, CategorizationInput, CategorizationSource, CategorizationSuggestion, FundLike } from "./types";

// Invalid or missing fallback fields must never destroy an accepted field.
export function mergeSelectiveFallback(
  current: CategorizationSuggestion,
  raw: Record<string, unknown>,
  input: CategorizationInput,
  categories: CategoryLike[],
  funds: FundLike[],
  source: Extract<CategorizationSource, "gemini" | "openrouter" | "openai">
): CategorizationSuggestion {
  const metadata = current.decisionMetadata!;
  const fieldSources = { ...metadata.fieldSources };
  let category = current.category, fundId = current.fundId, fundName = current.fundName, donorName = current.donorName;
  let updated = false;
  if (!fieldSources.category) {
    const resolved = resolveCategoryForTransaction(typeof raw.category === "string" ? raw.category : "", input.type, categories);
    if (resolved) { category = resolved.name; fieldSources.category = source; updated = true; }
  }
  if (!fieldSources.fund && typeof raw.fundName === "string") {
    const resolved = funds.find((fund) => fund.name.trim().toLowerCase() === (raw.fundName as string).trim().toLowerCase());
    if (resolved) { fundId = String(resolved._id); fundName = resolved.name; fieldSources.fund = source; updated = true; }
  }
  if (!fieldSources.donor) {
    if (input.type === "Expenditure" || category === "Merchandise") {
      donorName = null; fieldSources.donor = "rule"; updated = true;
    } else if (raw.donorName === null || (typeof raw.donorName === "string" && raw.donorName.length <= 256)) {
      donorName = typeof raw.donorName === "string" ? raw.donorName.trim() || null : null;
      fieldSources.donor = source; updated = true;
    }
  }
  const complete = !!fieldSources.category && !!fieldSources.fund && !!fieldSources.donor;
  const confidence = complete ? Math.min(
    confidenceFromModelLabel(raw.confidence),
    fieldSources.category === "jev" ? metadata.categoryProbability ?? 0 : 1,
    fieldSources.fund === "jev" ? metadata.fundProbability ?? 0 : 1
  ) : 0;
  return { ...current, category, fundName, ...(fundId ? { fundId } : {}), donorName: donorName ?? null,
    categoryTransactionType: input.type, isGiftAidEligible: false, requiresReview: true,
    confidence, confidenceLabel: confidenceLabel(confidence), predictionSource: updated ? source : current.predictionSource,
    decisionMetadata: { ...metadata, fieldSources },
    evidence: updated ? [...current.evidence, { source, reason: "Completed unresolved fields; retained validated existing and Jev decisions." }] : current.evidence,
  };
}
