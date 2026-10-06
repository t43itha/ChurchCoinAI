import { afterEach, describe, expect, it, vi } from "vitest";
import {
  categorizeWithOpenRouter,
  openRouterOutputText,
  OPENROUTER_BATCH_SIZE,
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
      generationIds: ["gen_test"],
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

  it("splits large imports into ordered, bounded batches", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const transactions = Array.from(
      { length: OPENROUTER_BATCH_SIZE * 2 + 5 },
      (_, index) => ({
        description: `Donation ${index + 1}`,
        amount: index + 1,
        type: "Income" as const,
      })
    );
    const fetchMock = vi.fn().mockImplementation(async (_url, request) => {
      const body = JSON.parse(request.body);
      const batch = JSON.parse(
        body.messages[1].content.replace("Transactions JSON:\n", "")
      );
      const firstDescription = batch[0].description;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          id: `gen_${firstDescription}`,
          model: "openai/gpt-5.6-luna",
          provider: "OpenAI",
          choices: [
            {
              message: {
                content: JSON.stringify({
                  predictions: batch.map(
                    (transaction: { description: string }) => ({
                      description: transaction.description,
                      category: "Offerings",
                      fundName: "General Fund",
                      confidence: "High",
                      isGiftAidEligible: false,
                      donorName: null,
                      evidence: "Donation reference",
                    })
                  ),
                }),
              },
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
            cost: 0.0001,
          },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await categorizeWithOpenRouter(
      transactions,
      categories,
      funds,
      []
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.suggestions.map((item) => item.description)).toEqual(
      transactions.map((item) => item.description)
    );
    expect(result.generationIds).toHaveLength(3);
    expect(result.usage).toMatchObject({
      prompt_tokens: 30,
      completion_tokens: 60,
      total_tokens: 90,
    });
    expect(result.usage.cost).toBeCloseTo(0.0003);
  });

  it("cancels and settles sibling workers before surfacing a batch failure", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const transactions = Array.from(
      { length: OPENROUTER_BATCH_SIZE * 5 },
      (_, index) => ({
        description: `Donation ${index + 1}`,
        amount: index + 1,
        type: "Income" as const,
      })
    );
    let siblingAbortCount = 0;
    const fetchMock = vi.fn().mockImplementation((_url, request) => {
      if (fetchMock.mock.calls.length === 1) {
        return Promise.resolve({
          ok: false,
          status: 503,
          statusText: "Unavailable",
          json: async () => ({ error: { message: "Provider unavailable" } }),
        });
      }

      return new Promise((_resolve, reject) => {
        request.signal.addEventListener(
          "abort",
          () => {
            siblingAbortCount += 1;
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true }
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      categorizeWithOpenRouter(transactions, categories, funds, [])
    ).rejects.toThrow("OpenRouter 503: Provider unavailable");

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(siblingAbortCount).toBe(3);
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
