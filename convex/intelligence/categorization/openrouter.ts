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

const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_TIMEOUT_MS = 10_000;

export const OPENROUTER_CATEGORIZATION_MODEL = "openai/gpt-5.6-luna";

type OpenRouterResponse = {
  id?: string;
  model?: string;
  provider?: string;
  error?: { message?: string } | null;
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
};

export type OpenRouterCategorizationResult = {
  suggestions: Record<string, unknown>[];
  generationId: string | null;
  model: string;
  provider: string | null;
  usage: NonNullable<OpenRouterResponse["usage"]>;
};

export const openRouterOutputText = (
  response: OpenRouterResponse
): string => {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("");
};

export const categorizeWithOpenRouter = async (
  transactions: CategorizationInput[],
  categories: CategoryLike[],
  funds: FundLike[],
  evidence: CategorizationEvidence[]
): Promise<OpenRouterCategorizationResult> => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured in Convex environment");
  }

  const model =
    process.env.OPENROUTER_CATEGORIZATION_MODEL?.trim() ||
    OPENROUTER_CATEGORIZATION_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

  try {
    const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://churchcoin.ai",
        "X-Title": "ChurchCoin transaction categorisation",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: categorizationModelInstructions(
              categories,
              funds,
              evidence
            ),
          },
          {
            role: "user",
            content: `Transactions JSON:\n${JSON.stringify(transactions)}`,
          },
        ],
        reasoning: { effort: "none", exclude: true },
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "churchcoin_transaction_categorization",
            strict: true,
            schema: categorizationOutputSchema(categories, funds),
          },
        },
        max_tokens: Math.min(
          128_000,
          Math.max(4000, transactions.length * 300)
        ),
        provider: {
          allow_fallbacks: false,
          require_parameters: true,
          data_collection: "deny",
        },
      }),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => ({}))) as OpenRouterResponse;
    if (!response.ok) {
      throw new Error(
        `OpenRouter ${response.status}: ${payload.error?.message || response.statusText}`
      );
    }

    const text = openRouterOutputText(payload);
    if (!text) {
      throw new Error("OpenRouter response did not contain output text");
    }

    const parsed = JSON.parse(text) as { predictions?: unknown };
    if (!Array.isArray(parsed.predictions)) {
      throw new Error(
        "OpenRouter response did not contain a predictions array"
      );
    }

    return {
      suggestions: parsed.predictions as Record<string, unknown>[],
      generationId: payload.id ?? null,
      model: payload.model ?? model,
      provider: payload.provider ?? null,
      usage: payload.usage ?? {},
    };
  } finally {
    clearTimeout(timer);
  }
};
