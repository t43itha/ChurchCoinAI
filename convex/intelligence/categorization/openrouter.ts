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
const OPENROUTER_TIMEOUT_MS = 30_000;
export const OPENROUTER_BATCH_SIZE = 20;
export const OPENROUTER_MAX_CONCURRENCY = 4;

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
  generationIds: string[];
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

const categorizeOpenRouterBatch = async (
  transactions: CategorizationInput[],
  categories: CategoryLike[],
  funds: FundLike[],
  evidence: CategorizationEvidence[],
  sharedSignal: AbortSignal
): Promise<OpenRouterCategorizationResult> => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured in Convex environment");
  }

  const model =
    process.env.OPENROUTER_CATEGORIZATION_MODEL?.trim() ||
    OPENROUTER_CATEGORIZATION_MODEL;
  const controller = new AbortController();
  let timedOut = false;
  const abortFromSharedSignal = () => controller.abort(sharedSignal.reason);
  if (sharedSignal.aborted) abortFromSharedSignal();
  else {
    sharedSignal.addEventListener("abort", abortFromSharedSignal, {
      once: true,
    });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, OPENROUTER_TIMEOUT_MS);

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

    const payload = (await response.json()) as OpenRouterResponse;
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
      generationIds: payload.id ? [payload.id] : [],
      model: payload.model ?? model,
      provider: payload.provider ?? null,
      usage: payload.usage ?? {},
    };
  } catch (error) {
    if (timedOut) {
      throw Object.assign(
        new Error(
          `OpenRouter categorization timed out after ${OPENROUTER_TIMEOUT_MS}ms`
        ),
        { cause: error }
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
    sharedSignal.removeEventListener("abort", abortFromSharedSignal);
  }
};

const sumUsage = (
  results: OpenRouterCategorizationResult[]
): NonNullable<OpenRouterResponse["usage"]> => ({
  prompt_tokens: results.reduce(
    (sum, result) => sum + (result.usage.prompt_tokens ?? 0),
    0
  ),
  completion_tokens: results.reduce(
    (sum, result) => sum + (result.usage.completion_tokens ?? 0),
    0
  ),
  total_tokens: results.reduce(
    (sum, result) => sum + (result.usage.total_tokens ?? 0),
    0
  ),
  cost: results.reduce(
    (sum, result) => sum + (result.usage.cost ?? 0),
    0
  ),
  completion_tokens_details: {
    reasoning_tokens: results.reduce(
      (sum, result) =>
        sum +
        (result.usage.completion_tokens_details?.reasoning_tokens ?? 0),
      0
    ),
  },
});

export const categorizeWithOpenRouter = async (
  transactions: CategorizationInput[],
  categories: CategoryLike[],
  funds: FundLike[],
  evidence: CategorizationEvidence[]
): Promise<OpenRouterCategorizationResult> => {
  const batches: CategorizationInput[][] = [];
  for (let index = 0; index < transactions.length; index += OPENROUTER_BATCH_SIZE) {
    batches.push(transactions.slice(index, index + OPENROUTER_BATCH_SIZE));
  }

  const results = new Array<OpenRouterCategorizationResult>(batches.length);
  const poolController = new AbortController();
  let nextBatchIndex = 0;
  let firstError: unknown;
  let hasError = false;
  const worker = async () => {
    while (!poolController.signal.aborted && nextBatchIndex < batches.length) {
      const batchIndex = nextBatchIndex;
      nextBatchIndex += 1;
      try {
        results[batchIndex] = await categorizeOpenRouterBatch(
          batches[batchIndex],
          categories,
          funds,
          evidence,
          poolController.signal
        );
      } catch (error) {
        if (!hasError) {
          hasError = true;
          firstError = error;
          poolController.abort(error);
        }
        return;
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(OPENROUTER_MAX_CONCURRENCY, batches.length) },
      () => worker()
    )
  );

  if (hasError) throw firstError;

  return {
    suggestions: results.flatMap((result) => result.suggestions),
    generationIds: results.flatMap((result) => result.generationIds),
    model: results[0]?.model ?? OPENROUTER_CATEGORIZATION_MODEL,
    provider: results[0]?.provider ?? null,
    usage: sumUsage(results),
  };
};
