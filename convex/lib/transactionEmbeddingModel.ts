import { google } from "@ai-sdk/google";
import {
  wrapEmbeddingModel,
  type EmbeddingModel,
  type EmbeddingModelMiddleware,
} from "ai";

export const TRANSACTION_EMBEDDING_MODEL = "gemini-embedding-2";
export const TRANSACTION_EMBEDDING_DIMENSION = 768;

// The custom ID is part of Convex RAG's namespace identity. Increment it if
// either the prompt format or embedding settings change so incompatible
// vectors are never searched together.
export const TRANSACTION_EMBEDDING_INDEX_VERSION =
  "gemini-embedding-2-transaction-similarity-768-v1";

export const transactionEmbeddingMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  transformParams: async ({ params }) => ({
    ...params,
    // Gemini Embedding 2 uses prompt instructions instead of task_type.
    // The same prefix is applied to stored transactions and search queries,
    // making this a symmetric semantic-similarity index.
    values: params.values.map(
      (value) => `task: sentence similarity | query: ${value}`
    ),
    providerOptions: {
      ...params.providerOptions,
      google: {
        ...params.providerOptions?.google,
        outputDimensionality: TRANSACTION_EMBEDDING_DIMENSION,
      },
    },
  }),
};

export function createTransactionEmbeddingModel(
  model: Exclude<EmbeddingModel, string> = google.embedding(
    TRANSACTION_EMBEDDING_MODEL
  )
) {
  if (model.specificationVersion !== "v3") {
    throw new Error("Transaction embeddings require an AI SDK v3 model");
  }

  return wrapEmbeddingModel({
    model,
    middleware: transactionEmbeddingMiddleware,
    modelId: TRANSACTION_EMBEDDING_INDEX_VERSION,
  });
}
