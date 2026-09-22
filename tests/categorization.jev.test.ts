import { afterEach, describe, expect, it, vi } from "vitest";
import { buildJevRequest, JEV_MODEL, JEV_URL, parseJevDecisions, readJevChoice } from "../lib/jevDecisions";
import type { JevRow } from "../lib/jevDecisions";
import { categorizeWithJev, jevFallbackInput, jevModeForOrganization, mergeJevSuggestions } from "../convex/intelligence/categorization/jev";
import { categorizeFromContext, mergeAIFallback, mergeAIFallbackSafely } from "../convex/intelligence/categorization/pipeline";
import { categorizationModelInstructions, categorizationOutputSchema } from "../convex/intelligence/categorization/modelContract";
import { categoryCriterion, fundCriterion } from "../lib/categorizationPolicy";

const categories = [
  { name: "Offerings", transactionType: "Income" as const },
  { name: "IT Costs", transactionType: "Expenditure" as const },
];
const funds = [{ _id: "general", name: "General Fund" }];
const row: JevRow = { rowId: "stable-a", description: "Unidentified payment", amount: 80, type: "Income" };

function answer(choice: string, probabilities: Record<string, number>, confidence = 0.99) {
  return { type: "choice", choice, probabilities, confidence };
}
function answersFor(body: ReturnType<typeof buildJevRequest>["body"]) {
  return Object.fromEntries(Object.entries(body.questions).map(([key, question]) => {
    const chosen = key.endsWith("_donor") ? "none" : Object.keys(question.criteria)[0];
    return [key, answer(chosen, Object.fromEntries(Object.keys(question.criteria).map((id) => [id, id === chosen ? 1 : 0])))];
  }));
}
function responseFor(body: ReturnType<typeof buildJevRequest>["body"]) {
  return { ok: true, json: async () => ({ id: "request-test", model: JEV_MODEL, answers: answersFor(body), usage: { input_tokens: 321, cost: 0.0001 } }) };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Jev decision contract", () => {
  it("uses the Decisions endpoint with tenant/type-scoped choices and explicit row references", () => {
    const { body } = buildJevRequest([row, { ...row, rowId: "stable-b", type: "Expenditure" }], categories, funds);
    expect(body.model).toBe("typesafe/jev-1.13");
    expect(body.provider).toEqual({ allow_fallbacks: false, data_collection: "deny" });
    expect(body.questions.r0_category.instructions).toContain("state.transactions[0]");
    expect(body.questions.r1_category.instructions).toContain("stable-b");
    expect(body.questions.r0_category.criteria.c0).toContain("Offerings");
    expect(body.questions.r1_category.criteria.c0).toContain("IT Costs");
    expect(body.questions.r1_donor).toBeUndefined();
    expect(body.questions.r0_category.criteria.unknown).toBeTruthy();
  });
  it("does not confuse concentration confidence with selected-choice probability", () => {
    const request = buildJevRequest([row], categories, funds);
    const answers = answersFor(request.body);
    answers.r0_category = answer("c0", { c0: 0.60, unknown: 0.40 }, 1);
    const [result] = parseJevDecisions({ answers }, [row], request);
    expect(result.categoryDecision).toMatchObject({ probability: 0.6, confidence: 1 });
    expect(result.accepted).toBe(false);
  });
  it("falls back for named or uncertain donors but preserves supplied donor names", () => {
    const request = buildJevRequest([row], categories, funds);
    const answers = answersFor(request.body);
    answers.r0_donor = answer("individual", { individual: 1, none: 0, unknown: 0 });
    expect(parseJevDecisions({ answers }, [row], request)[0]).toMatchObject({ accepted: false, needsDonorExtraction: true });
    delete answers.r0_donor;
    expect(parseJevDecisions({ answers }, [row], request)[0].accepted).toBe(false);
    const named = { ...row, donorName: "Existing Donor" };
    const namedRequest = buildJevRequest([named], categories, funds);
    expect(namedRequest.body.questions.r0_donor).toBeUndefined();
    expect(parseJevDecisions({ answers: answersFor(namedRequest.body) }, [named], namedRequest)[0].accepted).toBe(true);
  });
  it("rejects unknown, malformed, omitted and out-of-catalog answers without losing good rows", () => {
    const rows = [row, { ...row, rowId: "stable-b" }];
    const request = buildJevRequest(rows, categories, funds);
    const answers = answersFor(request.body);
    answers.r0_fund = answer("unknown", { f0: 0, unknown: 1 });
    expect(parseJevDecisions({ answers }, rows, request)).toMatchObject([
      { rowId: "stable-a", categoryAccepted: true, fundAccepted: false, fallbackReasons: ["fund-unknown"] },
      { rowId: "stable-b", accepted: true },
    ]);
    answers.r0_fund = answer("foreign-fund", { "foreign-fund": 1 });
    delete answers.r1_category;
    expect(parseJevDecisions({ answers }, rows, request)).toMatchObject([
      { categoryAccepted: true, fundAccepted: false, fallbackReasons: ["fund-invalid"] },
      { categoryAccepted: false, fundAccepted: true, fallbackReasons: ["category-invalid"] },
    ]);
    expect(() => parseJevDecisions({}, rows, request)).toThrow("Missing Jev answers");
  });
  it.each([
    answer("a", { a: NaN, b: 0 }),
    answer("a", { a: 1.1, b: -0.1 }),
    answer("a", { a: 0.2, b: 0.8 }),
    answer("a", { a: 0.8 }),
    answer("a", { a: 0.8, b: 0.1 }),
    { type: "choice", choice: "a", confidence: 1 },
  ])("rejects invalid probability distributions %#", (value) => {
    expect(readJevChoice(value, ["a", "b"])).toBeNull();
  });
  it("accepts valid rounded distributions", () => {
    expect(readJevChoice(answer("a", { a: 0.34, b: 0.33, c: 0.34 }), ["a", "b", "c"])).not.toBeNull();
  });
  it("bounds rows, choices and state before any request", () => {
    expect(() => buildJevRequest([row, row], categories, funds)).toThrow();
    expect(() => buildJevRequest([{ ...row, description: "x".repeat(4001) }], categories, funds)).toThrow();
    expect(() => buildJevRequest([row], Array.from({ length: 255 }, (_, i) => ({ name: `${i}` })), funds)).toThrow();
  });
  it("merges by stable ID, retains local results, requires review and never grants Gift Aid", () => {
    const rows = [row, { ...row, rowId: "stable-b", amount: 20 }];
    const current = categorizeFromContext(rows, categories, funds, []);
    const request = buildJevRequest(rows, categories, funds);
    const decisions = parseJevDecisions({ answers: answersFor(request.body) }, rows, request).reverse();
    const results = mergeJevSuggestions(current, decisions, rows);
    expect(results[0]).toMatchObject({ rowId: "stable-a", predictionSource: "jev", requiresReview: true, isGiftAidEligible: false, decisionMetadata: { model: JEV_MODEL } });
    expect(results[1]).toBe(current[1]);
  });
});

describe("selective decisions and fallback", () => {
  function partial(kind: "fund" | "donor" | "category", input = row) {
    const request = buildJevRequest([input], categories, funds);
    const answers = answersFor(request.body);
    if (kind === "fund") answers.r0_fund = answer("unknown", { f0: 0, unknown: 1 });
    if (kind === "category") answers.r0_category = answer("unknown", { c0: 0, unknown: 1 });
    if (kind === "donor") answers.r0_donor = answer("individual", { individual: 1, none: 0, unknown: 0 });
    return mergeJevSuggestions(categorizeFromContext([input], categories, funds, []), parseJevDecisions({ answers }, [input], request), [input]);
  }
  it("keeps category and asks only for fund when fund is unknown", () => {
    const current = partial("fund");
    expect(current[0]).toMatchObject({ category: "Offerings", fundName: "", predictionSource: "none" });
    expect(jevFallbackInput(row, current[0])).toMatchObject({ category: "Offerings", requestedFields: ["fund"] });
    const merged = mergeAIFallback(current, [{ rowId: row.rowId, category: "IT Costs", fundName: "General Fund", donorName: "Invented Donor", isGiftAidEligible: true, confidence: "High" }], [row], categories, funds, "openrouter");
    expect(merged[0]).toMatchObject({ category: "Offerings", fundId: "general", donorName: null, isGiftAidEligible: false,
      decisionMetadata: { fieldSources: { category: "jev", fund: "openrouter", donor: "jev" } } });
  });
  it("extracts only a donor while retaining both accepted accounting fields", () => {
    const current = partial("donor");
    expect(jevFallbackInput(row, current[0]).requestedFields).toEqual(["donor"]);
    const merged = mergeAIFallback(current, [{ rowId: row.rowId, category: null, fundName: null, donorName: "Jane Smith", confidence: "High" }], [row], categories, funds, "openrouter");
    expect(merged[0]).toMatchObject({ category: "Offerings", fundId: "general", donorName: "Jane Smith", requiresReview: true,
      decisionMetadata: { fieldSources: { category: "jev", fund: "jev", donor: "openrouter" } } });
  });
  it("rejects foreign funds and wrong-type categories without discarding good fields", () => {
    const fundPending = partial("fund");
    expect(mergeAIFallback(fundPending, [{ rowId: row.rowId, fundName: "Foreign Church Fund" }], [row], categories, funds, "openrouter")[0]).toMatchObject({ category: "Offerings", fundName: "", confidenceLabel: "Low" });
    const categoryPending = partial("category");
    expect(mergeAIFallback(categoryPending, [{ rowId: row.rowId, category: "IT Costs" }], [row], categories, funds, "openrouter")[0]).toMatchObject({ category: "", fundId: "general", confidenceLabel: "Low" });
  });
  it("retains partial decisions on missing, duplicate, reordered or failed fallback results", async () => {
    const current = partial("fund");
    const prediction = { rowId: row.rowId, fundName: "General Fund" };
    expect(mergeAIFallback(current, [], [row], categories, funds, "openrouter")).toEqual(current);
    expect(mergeAIFallback(current, [prediction, prediction], [row], categories, funds, "openrouter")).toEqual(current);
    expect(mergeAIFallback(current, [{ ...prediction, rowId: "different" }, prediction], [row], categories, funds, "openrouter")[0].fundId).toBe("general");
    expect(await mergeAIFallbackSafely(current, () => { throw new Error("offline"); }, [row], categories, funds)).toEqual(current);
  });
  it("asks only unknown fields and excludes invalid existing fields from state", () => {
    const input = { ...row, category: "Offerings", donorName: "Existing Name", fundId: "foreign" };
    const request = buildJevRequest([input], categories, funds);
    expect(Object.keys(request.body.questions)).toEqual(["r0_fund"]);
    expect(request.body.state).toEqual({ transaction: { description: row.description, type: "Income", knownCategory: "Offerings" } });
    expect(parseJevDecisions({ answers: answersFor(request.body) }, [input], request)[0]).toMatchObject({ accepted: true, categoryAccepted: false, fundAccepted: true });
    const invalid = buildJevRequest([{ ...input, category: "IT Costs" }], categories, funds);
    expect(Object.keys(invalid.body.questions)).toEqual(["r0_category", "r0_fund"]);
  });
  it("resolves one exact known donor without generation but leaves ambiguous matches for extraction", () => {
    const input = { ...row, description: "JANE SMITH VOLUNTARY GIFT" };
    const request = buildJevRequest([input], categories, funds);
    const answers = answersFor(request.body);
    answers.r0_donor = answer("individual", { individual: 1, none: 0, unknown: 0 });
    const decisions = parseJevDecisions({ answers }, [input], request, ["Jane Smith", "Jane Smithson"]);
    expect(decisions[0]).toMatchObject({ knownDonorName: "Jane Smith", needsDonorExtraction: false, accepted: true });
    expect(mergeJevSuggestions(categorizeFromContext([input], categories, funds, []), decisions, [input])[0]).toMatchObject({ donorName: "Jane Smith", isGiftAidEligible: false, decisionMetadata: { fieldSources: { donor: "existing" } } });
    expect(parseJevDecisions({ answers }, [input], request, ["Jane Smith", "JANE SMITH"])[0].needsDonorExtraction).toBe(true);
    expect(parseJevDecisions({ answers }, [input], request, ["Jane", "John Smith"])[0].needsDonorExtraction).toBe(true);
    answers.r0_donor = answer("unknown", { individual: .4, none: .1, unknown: .5 });
    expect(parseJevDecisions({ answers }, [input], request, ["Jane Smith"])[0].needsDonorExtraction).toBe(true);
  });
  it("shares fund descriptions and accounting boundaries with every fallback provider", () => {
    const describedFunds = [...funds, { _id: "roof", name: "Roof Fund", description: "Only roof replacement", type: "Restricted" }];
    const request = buildJevRequest([row], categories, describedFunds);
    const instructions = categorizationModelInstructions(categories, describedFunds, []);
    expect(instructions).toContain(request.body.questions.r0_category.criteria.c0);
    expect(instructions).toContain(categoryCriterion("Offerings"));
    expect(instructions).toContain(fundCriterion(describedFunds[1]));
  });
  it("uses a compact nullable schema for selective output and preserves the full-output contract", () => {
    const schema = categorizationOutputSchema(categories, funds, true).properties.predictions.items;
    expect(schema.properties.category.type).toEqual(["string", "null"]);
    expect(schema.properties.category.enum).toContain(null);
    expect(schema.required).not.toContain("description");
    expect(schema.required).not.toContain("isGiftAidEligible");
    expect(categorizationOutputSchema(categories, funds).properties.predictions.items.required).toContain("description");
  });
});

describe("Jev transport and rollout", () => {
  it("requires an explicit mode and tenant allowlist", () => {
    vi.stubEnv("CATEGORIZATION_JEV_MODE", "");
    expect(jevModeForOrganization("org-a")).toBe("off");
    vi.stubEnv("CATEGORIZATION_JEV_MODE", "assist");
    vi.stubEnv("CATEGORIZATION_JEV_ORGANIZATIONS", "org-b, org-a");
    expect(jevModeForOrganization("org-a")).toBe("assist");
    expect(jevModeForOrganization("foreign")).toBe("off");
    vi.stubEnv("CATEGORIZATION_JEV_MODE", "shadow");
    expect(jevModeForOrganization("org-a")).toBe("shadow");
  });
  it("uses the requested endpoint and captures usage without raw text logs", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchMock = vi.fn(async (_url, init) => responseFor(JSON.parse(init.body)));
    vi.stubGlobal("fetch", fetchMock);
    const result = await categorizeWithJev([row], categories, funds);
    expect(fetchMock.mock.calls[0][0]).toBe(JEV_URL);
    expect(result).toMatchObject({ failedBatches: 0, inputTokens: 321, costUsd: 0.0001, requestIds: ["request-test"] });
    expect(result.decisions[0].rowId).toBe(row.rowId);
  });
  it("defaults to batches of ten and supports single-row evaluation without unrelated state", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchMock = vi.fn(async (_url, init) => responseFor(JSON.parse(init.body)));
    vi.stubGlobal("fetch", fetchMock);
    const rows = Array.from({ length: 11 }, (_, i) => ({ ...row, rowId: `row-${i}`, description: `ref-${i}` }));
    const result = await categorizeWithJev(rows, categories, funds);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).state.transactions).toHaveLength(10);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).state.transaction.description).toBe("ref-10");
    expect(result.decisions).toHaveLength(11);
  });
  it("retains healthy batches while one batch fails and stops scheduling further work", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchMock = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      if (body.state.transaction.description === "row 1") throw new Error("network failure");
      return responseFor(body);
    });
    vi.stubGlobal("fetch", fetchMock);
    const rows = Array.from({ length: 60 }, (_, i) => ({ ...row, rowId: `id-${i}`, description: `row ${i}` }));
    const result = await categorizeWithJev(rows, categories, funds, { batchSize: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.failedBatches).toBe(1);
    expect(result.decisions).toHaveLength(3);
    expect(result.decisions.some((decision) => decision.rowId === "id-1")).toBe(false);
    expect(result.failures).toContainEqual({ rowId: "id-1", reason: "provider-error" });
    expect(result.failures.filter((failure) => failure.reason === "not-attempted")).toHaveLength(56);
  });
  it("aborts a slow provider at 1.5 seconds without retrying", async () => {
    vi.useFakeTimers();
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchMock = vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("abort")))));
    vi.stubGlobal("fetch", fetchMock);
    const pending = categorizeWithJev([row], categories, funds);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await pending).toMatchObject({ failedBatches: 1, decisions: [], failures: [{ rowId: row.rowId, reason: "timeout" }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not make a request without a key", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await categorizeWithJev([row], categories, funds)).toMatchObject({ failedBatches: 1, costUsd: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
