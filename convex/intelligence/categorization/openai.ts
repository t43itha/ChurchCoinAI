import {
  categorizationModelInstructions,
  categorizationOutputSchema,
} from "./modelContract";
import {
  CategoryLike,
  CategorizationEvidence,
  CategorizationInput,
  FundLike,
} from "./types";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_TIMEOUT_MS = 60_000;

export const OPENAI_CATEGORIZATION_MODEL = "gpt-5.6-luna";

type OpenAIResponse = {
  id?: string;
  status?: string;
  error?: { message?: string } | null;
  incomplete_details?: { reason?: string } | null;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  };
};

export type OpenAICategorizationResult = {
  suggestions: Record<string, unknown>[];
  responseId: string | null;
  usage: NonNullable<OpenAIResponse["usage"]>;
};

export const openAIOutputText = (response: OpenAIResponse): string => {
  for (const output of response.output ?? []) {
    if (output.type !== "message") continue;
    for (const content of output.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  return "";
};

export const categorizeWithOpenAI = async (
  transactions: CategorizationInput[],
  categories: CategoryLike[],
  funds: FundLike[],
  evidence: CategorizationEvidence[]
): Promise<OpenAICategorizationResult> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured in Convex environment");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model:
          process.env.OPENAI_CATEGORIZATION_MODEL?.trim() ||
          OPENAI_CATEGORIZATION_MODEL,
        instructions: categorizationModelInstructions(
          categories,
          funds,
          evidence
        ),
        input: `Transactions JSON:\n${JSON.stringify(transactions)}`,
        reasoning: { effort: "none" },
        text: {
          format: {
            type: "json_schema",
            name: "churchcoin_transaction_categorization",
            strict: true,
            schema: categorizationOutputSchema(categories, funds),
          },
        },
        max_output_tokens: Math.min(
          128_000,
          Math.max(4000, transactions.length * 300)
        ),
        store: false,
      }),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => ({}))) as OpenAIResponse;
    if (!response.ok) {
      throw new Error(
        `OpenAI ${response.status}: ${payload.error?.message || response.statusText}`
      );
    }
    if (payload.status === "incomplete") {
      throw new Error(
        `OpenAI response incomplete: ${payload.incomplete_details?.reason || "unknown reason"}`
      );
    }

    const text = openAIOutputText(payload);
    if (!text) throw new Error("OpenAI response did not contain output text");
    const parsed = JSON.parse(text) as { predictions?: unknown };
    if (!Array.isArray(parsed.predictions)) {
      throw new Error("OpenAI response did not contain a predictions array");
    }

    return {
      suggestions: parsed.predictions as Record<string, unknown>[],
      responseId: payload.id ?? null,
      usage: payload.usage ?? {},
    };
  } finally {
    clearTimeout(timer);
  }
};
