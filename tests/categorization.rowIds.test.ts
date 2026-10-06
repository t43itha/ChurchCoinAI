import { afterEach, describe, expect, it, vi } from "vitest";
import { categorizeWithPipelinePreview } from "../convex/actions/ai";
import { categorizeFromContext, mergeAIFallback } from "../convex/intelligence/categorization/pipeline";
import { categorizationModelInstructions } from "../convex/intelligence/categorization/modelContract";
import { buildGeminiCategorizationPrompt } from "../convex/intelligence/categorization/gemini";
import { categoryCriterion, fundCriterion } from "../lib/categorizationPolicy";

vi.mock("../convex/lib/ragInstance", () => ({ transactionRAG: {} }));

const categories = [
  { name: "Offerings", transactionType: "Income" as const },
  { name: "Building Fund", transactionType: "Income" as const },
  { name: "IT Costs", transactionType: "Expenditure" as const },
];
const funds = [
  { _id: "general", name: "General Fund" },
  { _id: "roof", name: "Roof Fund", description: "Only roof replacement", type: "Restricted" },
];
const prediction = (rowId: string, category: string, fundName = "General Fund") => ({ rowId, description: "SAME REFERENCE", category, fundName, confidence: "High", isGiftAidEligible: false, donorName: null, evidence: "test" });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("generative categorisation prompts", () => {
  it("give every provider the same accounting boundaries and fund descriptions", () => {
    for (const prompt of [categorizationModelInstructions(categories, funds, []), buildGeminiCategorizationPrompt([], categories, funds, [])]) {
      expect(prompt).toContain(categoryCriterion("Offerings"));
      expect(prompt).toContain(fundCriterion(funds[1]));
      expect(prompt).not.toMatch(/\bunknown\b|requestedFields/);
    }
  });
});

describe("model fallback merge", () => {
  const rows = ["a", "b", "c"].map((rowId) => ({ rowId, description: "SAME REFERENCE", amount: 90, type: "Income" as const }));

  it("matches identical descriptions by row ID regardless of response order", () => {
    const merged = mergeAIFallback(categorizeFromContext(rows, categories, funds, []), [prediction("c", "Offerings"), prediction("a", "Building Fund", "Roof Fund"), prediction("b", "Offerings")], rows, categories, funds, "openrouter");
    expect(merged.map((row) => [row.rowId, row.category, row.fundName])).toEqual([["a", "Building Fund", "Roof Fund"], ["b", "Offerings", "General Fund"], ["c", "Offerings", "General Fund"]]);
  });

  it("leaves rows unresolved when their prediction is missing or duplicated", () => {
    const merged = mergeAIFallback(categorizeFromContext(rows, categories, funds, []), [prediction("a", "Offerings"), prediction("a", "Building Fund"), prediction("c", "Offerings")], rows, categories, funds, "openrouter");
    expect(merged.map((row) => row.predictionSource)).toEqual(["none", "none", "openrouter"]);
  });

  it("keeps a valid user-entered category over the model's answer", () => {
    const edited = [{ ...rows[0], category: "Building Fund" }];
    const [merged] = mergeAIFallback(categorizeFromContext(edited, categories, funds, []), [prediction("a", "Offerings")], edited, categories, funds, "openrouter");
    expect(merged).toMatchObject({ category: "Building Fund", fundName: "General Fund" });
  });
});

describe("authenticated pipeline preview", () => {
  const context = () => ({
    auth: { getUserIdentity: vi.fn(async () => ({ subject: "owner" })) },
    runQuery: vi.fn(async (_ref: unknown, args: Record<string, unknown>) => "signatures" in args ? { categories, funds, memories: [] } : { user: { organizationId: "our-church", role: "Admin" }, access: { canUseApp: true } }),
    runMutation: vi.fn(async () => null),
    scheduler: { runAfter: vi.fn() },
  });
  type Handler = { _handler: (ctx: ReturnType<typeof context>, args: { transactions: Record<string, unknown>[] }) => Promise<Record<string, unknown>[]> };
  const run = (ctx: ReturnType<typeof context>, transactions: Record<string, unknown>[]) => (categorizeWithPipelinePreview as unknown as Handler)._handler(ctx, { transactions });

  it("defaults small income without calling a model and authenticates before inference", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("CATEGORIZATION_AI_PROVIDER", "openrouter");
    vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const small = { rowId: "small", description: "Unspecified incoming credit", amount: 30, type: "Income" };
    expect((await run(context(), [small]))[0]).toMatchObject({ rowId: "small", category: "Offerings", fundId: "general", predictionSource: "rule" });
    const anonymous = context();
    anonymous.auth.getUserIdentity.mockResolvedValue(null as never);
    await expect(run(anonymous, [{ ...small, amount: 95 }])).rejects.toThrow("Unauthorized");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects duplicate row IDs before any work", async () => {
    const row = { rowId: "same", description: "Gift", amount: 50, type: "Income" };
    await expect(run(context(), [row, row])).rejects.toThrow("duplicate categorisation row IDs");
  });
});
