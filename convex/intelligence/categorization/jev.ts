import { buildJevRequest, JEV_MODEL, JEV_TEMPLATE_VERSION, JEV_URL, parseJevDecisions } from "../../../lib/jevDecisions";
import type { JevDecision, JevFallbackReason, JevRow } from "../../../lib/jevDecisions";
import type { CategoryLike, CategorizationField, CategorizationInput, CategorizationSuggestion, DecisionMetadata, FundLike } from "./types";

export type JevResult = { decisions: JevDecision[]; failures: { rowId: string; reason: JevFallbackReason }[]; failedBatches: number; inputTokens: number; costUsd: number | null; latencyMs: number; model: string; requestIds: string[] };
// Three repeated pipeline evaluations favoured batches over single-row calls.
export const JEV_BATCH_SIZE = 10;
export const JEV_MAX_CONCURRENCY = 4;

export const jevModeForOrganization = (organizationId: string): "off" | "shadow" | "assist" => {
  const mode = process.env.CATEGORIZATION_JEV_MODE;
  if (mode !== "shadow" && mode !== "assist") return "off";
  const allowlist = (process.env.CATEGORIZATION_JEV_ORGANIZATIONS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  return allowlist.includes(organizationId) ? mode : "off";
};

export async function categorizeWithJev(transactions: CategorizationInput[], categories: CategoryLike[], funds: FundLike[], options: { batchSize?: 1 | 10; knownDonors?: string[] } = {}): Promise<JevResult> {
  const started = performance.now();
  const result: JevResult = { decisions: [], failures: [], failedBatches: 0, inputTokens: 0, costUsd: 0, latencyMs: 0, model: JEV_MODEL, requestIds: [] };
  if (!transactions.length) return result;
  if (!process.env.OPENROUTER_API_KEY) return { ...result, failedBatches: 1, costUsd: null, failures: transactions.map((row) => ({ rowId: row.rowId!, reason: "provider-error" })) };
  const batches: JevRow[][] = [];
  const batchSize = options.batchSize ?? JEV_BATCH_SIZE;
  for (let index = 0; index < transactions.length; index += batchSize) batches.push(transactions.slice(index, index + batchSize).map((row) => {
    if (!row.rowId) throw new Error("Jev requires stable row IDs");
    return { ...row, rowId: row.rowId };
  }));
  let next = 0;
  // A failing endpoint incurs at most one wave; healthy completed batches survive.
  let stop = false;
  const worker = async () => {
    while (!stop && next < batches.length) {
      // Bound aggregate delay as well as each request, including large API batches.
      if (performance.now() - started >= 6000) { stop = true; break; }
      const rows = batches[next++];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);
      try {
        const request = buildJevRequest(rows, categories, funds.map((fund) => ({ ...fund, _id: String(fund._id) })));
        if (!Object.keys(request.body.questions).length) {
          result.decisions.push(...parseJevDecisions({ answers: {} }, rows, request));
          continue;
        }
        const response = await fetch(JEV_URL, { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "X-Title": "ChurchCoin categorisation" }, body: JSON.stringify(request.body), signal: controller.signal });
        if (!response.ok) throw new Error(`Jev HTTP ${response.status}`);
        const payload = await response.json();
        // Retain billed usage even when the answer contract is unusable.
        const usage = payload?.usage;
        if (typeof usage?.input_tokens === "number" && Number.isFinite(usage.input_tokens) && usage.input_tokens >= 0) result.inputTokens += usage.input_tokens;
        if (typeof usage?.cost === "number" && Number.isFinite(usage.cost) && usage.cost >= 0 && result.costUsd !== null) result.costUsd += usage.cost;
        else result.costUsd = null;
        if (typeof payload?.id === "string") result.requestIds.push(payload.id);
        if (typeof payload?.model === "string") result.model = payload.model;
        result.decisions.push(...parseJevDecisions(payload, rows, request, options.knownDonors));
      } catch {
        result.failedBatches += 1;
        result.costUsd = null;
        result.failures.push(...rows.map((row) => ({ rowId: row.rowId, reason: controller.signal.aborted ? "timeout" as const : "provider-error" as const })));
        stop = true;
      } finally { clearTimeout(timer); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(JEV_MAX_CONCURRENCY, batches.length) }, worker));
  for (const rows of batches.slice(next)) result.failures.push(...rows.map((row) => ({ rowId: row.rowId, reason: "not-attempted" as const })));
  result.latencyMs = Math.round(performance.now() - started);
  return result;
}

export function mergeJevSuggestions(current: CategorizationSuggestion[], decisions: JevDecision[], inputs: CategorizationInput[], failures: JevResult["failures"] = []): CategorizationSuggestion[] {
  const byId = new Map(decisions.map((decision) => [decision.rowId, decision]));
  const failureById = new Map(failures.map((failure) => [failure.rowId, failure.reason]));
  return current.map((suggestion, index) => {
    const input = inputs[index], decision = input?.rowId ? byId.get(input.rowId) : undefined;
    if (suggestion.predictionSource !== "none" || !input) return suggestion;
    const fieldSources: NonNullable<DecisionMetadata["fieldSources"]> = {
      ...(suggestion.category ? { category: "existing" as const } : decision?.categoryAccepted ? { category: "jev" as const } : {}),
      ...(suggestion.fundId ? { fund: "existing" as const } : decision?.fundAccepted ? { fund: "jev" as const } : {}),
      ...(input.donorName || decision?.knownDonorName ? { donor: "existing" as const } : input.type === "Expenditure" ? { donor: "rule" as const } : decision && !decision.needsDonorExtraction ? { donor: "jev" as const } : {}),
    };
    const complete = !!fieldSources.category && !!fieldSources.fund && !!fieldSources.donor;
    return { ...suggestion, rowId: input.rowId,
      category: suggestion.category || (decision?.categoryAccepted ? decision.category! : ""), categoryTransactionType: input.type,
      ...(suggestion.fundId ? {} : decision?.fundAccepted ? { fundId: decision.fundId!, fundName: decision.fundName! } : {}),
      predictionSource: complete ? "jev" : "none", confidence: complete ? Math.min(decision?.categoryDecision?.probability ?? 1, decision?.fundDecision?.probability ?? 1) : 0, confidenceLabel: complete ? "High" : "Low", requiresReview: true,
      donorName: input.donorName ?? decision?.knownDonorName ?? null, isGiftAidEligible: false,
      decisionMetadata: { model: decision?.resolvedModel ?? JEV_MODEL, ...(decision?.requestId ? { requestId: decision.requestId } : {}), templateVersion: JEV_TEMPLATE_VERSION,
        ...(decision?.categoryDecision ? { categoryProbability: decision.categoryDecision.probability, categoryConfidence: decision.categoryDecision.confidence } : {}),
        ...(decision?.fundDecision ? { fundProbability: decision.fundDecision.probability, fundConfidence: decision.fundDecision.confidence } : {}),
        fieldSources, fallbackReasons: decision?.fallbackReasons ?? [failureById.get(input.rowId!) ?? "not-attempted"],
      },
      evidence: [...suggestion.evidence, { source: "jev", reason: "Accepted fields retained independently; unresolved fields require fallback or review." }],
    };
  });
}

export function jevFallbackInput(input: CategorizationInput, suggestion: CategorizationSuggestion): CategorizationInput {
  const sources = suggestion.decisionMetadata?.fieldSources;
  if (!sources) return input;
  const requestedFields = (["category", "fund", "donor"] as CategorizationField[]).filter((field) => !sources[field]);
  return { rowId: input.rowId, description: input.description, amount: input.amount, type: input.type, requestedFields,
    ...(sources.category ? { category: suggestion.category } : {}),
    ...(sources.fund ? { fundId: suggestion.fundId, fundName: suggestion.fundName } : {}),
    ...(sources.donor && suggestion.donorName ? { donorName: suggestion.donorName } : {}),
  };
}

export function jevRoutingMetrics(result: JevResult) {
  const reasons: Record<string, number> = {};
  for (const reason of [...result.decisions.flatMap((row) => row.fallbackReasons), ...result.failures.map((row) => row.reason)]) reasons[reason] = (reasons[reason] ?? 0) + 1;
  return { accepted: result.decisions.filter((row) => row.accepted).length, acceptedCategories: result.decisions.filter((row) => row.categoryAccepted).length, acceptedFunds: result.decisions.filter((row) => row.fundAccepted).length, fallbackReasons: reasons };
}
