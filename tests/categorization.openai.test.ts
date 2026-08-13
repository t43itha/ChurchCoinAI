import { afterEach, describe, expect, it, vi } from "vitest";
import {
  categorizeWithOpenAI,
  openAIOutputText,
  OPENAI_CATEGORIZATION_MODEL,
} from "../convex/intelligence/categorization/openai";

const categories = [
  { name: "Offerings", transactionType: "Income" as const },
  { name: "Bank Charges", transactionType: "Expenditure" as const },
];
const funds = [{ _id: "fund-general", name: "General Fund" }];

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
});

describe("OpenAI categorization adapter", () => {
  it("uses the direct Luna model", () => {
    expect(OPENAI_CATEGORIZATION_MODEL).toBe("gpt-5.6-luna");
  });

  it("extracts output text from a Responses API message", () => {
    expect(
      openAIOutputText({
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: '{"predictions":[]}' }],
          },
        ],
      })
    ).toBe('{"predictions":[]}');
  });

  it("sends a non-stored, strict, no-reasoning Responses request", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        id: "resp_test",
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
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
            ],
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await categorizeWithOpenAI(
      [{ description: "Donation", amount: 20, type: "Income" }],
      categories,
      funds,
      []
    );

    expect(result.suggestions).toHaveLength(1);
    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({
      model: "gpt-5.6-luna",
      reasoning: { effort: "none" },
      store: false,
      text: {
        format: {
          type: "json_schema",
          strict: true,
        },
      },
    });
    expect(body.text.format.schema.additionalProperties).toBe(false);
    expect(request.headers.Authorization).toBe("Bearer test-key");
  });
});
