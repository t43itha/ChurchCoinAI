import { afterEach, describe, expect, it, vi } from "vitest";
import {
  categorizeWithOpenRouter,
  openRouterOutputText,
  OPENROUTER_CATEGORIZATION_MODEL,
} from "../convex/intelligence/categorization/openrouter";

const categories = [
  { name: "Offerings", transactionType: "Income" as const },
  { name: "Bank Charges", transactionType: "Expenditure" as const },
];
const funds = [{ _id: "fund-general", name: "General Fund" }];

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_CATEGORIZATION_MODEL;
});

describe("OpenRouter categorization adapter", () => {
  it("uses the evaluated Luna model slug", () => {
    expect(OPENROUTER_CATEGORIZATION_MODEL).toBe("openai/gpt-5.6-luna");
  });

  it("extracts output text from chat content", () => {
    expect(
      openRouterOutputText({
        choices: [
          { message: { content: '{"predictions":[]}' } },
        ],
      })
    ).toBe('{"predictions":[]}');
  });

  it("sends the strict, private, no-reasoning benchmark configuration", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        id: "gen_test",
        model: "openai/gpt-5.6-luna",
        provider: "OpenAI",
        choices: [
          {
            message: {
              content: JSON.stringify({
                predictions: [
                  {
                    description: "Donation",
                    category: "Offerings",
                    fundName: "General Fund",
                    confidence: "High",
                    isGiftAidEligible: false,
                    donorName: null,
                    evidence: "Donation reference",
                  },
                ],
              }),
            },
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          cost: 0.00004,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await categorizeWithOpenRouter(
      [{ description: "Donation", amount: 20, type: "Income" }],
      categories,
      funds,
      []
    );

    expect(result).toMatchObject({
      generationId: "gen_test",
      model: "openai/gpt-5.6-luna",
      provider: "OpenAI",
      suggestions: [{ category: "Offerings" }],
      usage: { cost: 0.00004 },
    });

    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({
      model: "openai/gpt-5.6-luna",
      reasoning: { effort: "none", exclude: true },
      response_format: {
        type: "json_schema",
        json_schema: { strict: true },
      },
      provider: {
        allow_fallbacks: false,
        require_parameters: true,
        data_collection: "deny",
      },
    });
    expect(body.response_format.json_schema.schema.additionalProperties).toBe(
      false
    );
    expect(request.headers).toMatchObject({
      Authorization: "Bearer test-key",
      "HTTP-Referer": "https://churchcoin.ai",
    });
  });

  it("fails clearly when the Convex secret is missing", async () => {
    await expect(
      categorizeWithOpenRouter(
        [{ description: "Donation", amount: 20, type: "Income" }],
        categories,
        funds,
        []
      )
    ).rejects.toThrow("OPENROUTER_API_KEY not configured");
  });
});
