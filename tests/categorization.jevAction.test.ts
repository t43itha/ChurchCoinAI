import { afterEach, describe, expect, it, vi } from "vitest";
import { categorizeWithPipelinePreview } from "../convex/actions/ai";
import { JEV_URL } from "../lib/jevDecisions";
import { getPipelineContext } from "../convex/intelligence/categorizationMemory";

vi.mock("../convex/lib/ragInstance", () => ({ transactionRAG: {} }));

const categories = [{ name: "Offerings", transactionType: "Income" }, { name: "IT Costs", transactionType: "Expenditure" }];
const funds = [{ _id: "general", name: "General Fund", description: "Unrestricted church activity" }];
const input = { rowId: "stable-donor", description: "JANE SMITH SPONTANEOUS GIFT", amount: 95, type: "Income" };
function context() {
  return {
    auth: { getUserIdentity: vi.fn(async () => ({ subject: "owner" })) },
    runQuery: vi.fn(async (_ref, args) => "signatures" in args ? { categories, funds, memories: [] } : { user: { organizationId: "our-church", role: "Admin" }, access: { canUseApp: true } }),
    runMutation: vi.fn(async () => null), scheduler: { runAfter: vi.fn() },
  };
}
type Handler = { _handler: (ctx: ReturnType<typeof context>, args: { transactions: typeof input[] }) => Promise<Record<string, any>[]> };
const run = (ctx: ReturnType<typeof context>, rows = [input]) => (categorizeWithPipelinePreview as unknown as Handler)._handler(ctx, { transactions: rows });
function configure() {
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubEnv("CATEGORIZATION_AI_PROVIDER", "openrouter");
  vi.stubEnv("CATEGORIZATION_JEV_MODE", "assist");
  vi.stubEnv("CATEGORIZATION_JEV_ORGANIZATIONS", "our-church");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
}
function jevResponse(body: any) {
  const answers = Object.fromEntries(Object.entries(body.questions).map(([key, question]: [string, any]) => {
    const choice = key.endsWith("donor") ? "individual" : Object.keys(question.criteria)[0];
    return [key, { type: "choice", choice, confidence: 1, probabilities: Object.fromEntries(Object.keys(question.criteria).map((id) => [id, id === choice ? 1 : 0])) }];
  }));
  return { ok: true, json: async () => ({ answers, usage: { input_tokens: 120, cost: .00001 } }) };
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Jev through the authenticated preview action", () => {
  it("sends a donor-only fallback and retains accounting decisions in the returned result", async () => {
    configure();
    const fetchMock = vi.fn(async (url, init) => {
      const body = JSON.parse(init.body);
      if (url === JEV_URL) return jevResponse(body);
      const rows = JSON.parse(body.messages[1].content.replace("Transactions JSON:\n", ""));
      expect(rows[0]).toMatchObject({ rowId: input.rowId, requestedFields: ["donor"], category: "Offerings", fundName: "General Fund" });
      expect(body.response_format.json_schema.schema.properties.predictions.items.required).not.toContain("description");
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ predictions: [{ rowId: input.rowId, category: null, fundName: null, donorName: "Jane Smith", confidence: "High" }] }) } }], usage: { cost: .00002 } }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const ctx = context();
    const [result] = await run(ctx);
    expect(result).toMatchObject({ rowId: input.rowId, category: "Offerings", fundId: "general", donorName: "Jane Smith", isGiftAidEligible: false, requiresReview: true,
      decisionMetadata: { fieldSources: { category: "jev", fund: "jev", donor: "openrouter" }, fallbackReasons: ["donor-extraction"] } });
    expect(ctx.runQuery.mock.calls[1][1]).toMatchObject({ organizationId: "our-church" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("retains Jev accounting fields when both generative providers are unavailable", async () => {
    configure(); vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      if (url === JEV_URL) return jevResponse(JSON.parse(init.body));
      throw new Error("provider unavailable");
    }));
    expect((await run(context()))[0]).toMatchObject({ category: "Offerings", fundId: "general", donorName: null, confidenceLabel: "Low", requiresReview: true,
      decisionMetadata: { fieldSources: { category: "jev", fund: "jev" } } });
  });
  it("uses no model for the small-income default and checks authentication before inference", async () => {
    configure(); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect((await run(context(), [{ ...input, description: "Unspecified incoming credit", amount: 30 }]))[0]).toMatchObject({ category: "Offerings", fundId: "general", predictionSource: "rule" });
    const ctx = context(); ctx.auth.getUserIdentity.mockResolvedValue(null as never);
    await expect(run(ctx)).rejects.toThrow("Unauthorized");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not load the donor directory for a Guest", async () => {
    configure(); vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const ctx = context();
    ctx.runQuery.mockImplementation(async (_ref, args) => "signatures" in args ? { categories, funds, memories: [] } : { user: { organizationId: "our-church", role: "Guest" }, access: { canUseApp: true } });
    await run(ctx);
    expect(ctx.runQuery.mock.calls[1][1]).toMatchObject({ organizationId: "our-church", includeKnownDonors: false });
  });
  it("bounds the tenant donor directory and declines matching against an incomplete directory", async () => {
    let count = 2;
    const take = vi.fn(async (limit: number) => Array.from({ length: Math.min(limit, count) }, (_, i) => ({ name: `Donor ${i}`, type: i === 0 ? "Organization" : "Individual" })));
    const eq = vi.fn();
    const ctx = { db: { query: (table: string) => ({ withIndex: (_name: string, build: (q: unknown) => void) => {
      build({ eq });
      return { collect: async () => [], take: table === "donors" ? take : vi.fn() };
    } }) } };
    const query = getPipelineContext as unknown as { _handler: (context: unknown, args: unknown) => Promise<{ knownDonorNames: string[] }> };
    const args = { organizationId: "our-church", signatures: [], includeKnownDonors: true };
    expect((await query._handler(ctx, args)).knownDonorNames).toEqual(["Donor 1"]);
    expect(eq).toHaveBeenCalledWith("organizationId", "our-church");
    expect(take).toHaveBeenCalledWith(501);
    count = 501;
    expect((await query._handler(ctx, args)).knownDonorNames).toEqual([]);
    take.mockClear();
    expect((await query._handler(ctx, { ...args, includeKnownDonors: false })).knownDonorNames).toEqual([]);
    expect(take).not.toHaveBeenCalled();
  });
});
