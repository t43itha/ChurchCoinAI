import { components } from "../_generated/api";
import { RAG } from "@convex-dev/rag";
import { google } from "@ai-sdk/google";

/**
 * RAG instance for transaction categorization learning.
 * Uses Google's text-embedding-004 model for semantic similarity search.
 *
 * Embeddings capture semantic meaning, enabling matches like:
 * - "FT-J SMITH TITHE" matches "FT-JOHN SMITH TITHES"
 * - "Standing Order - Building" matches "SO Building Fund"
 *
 * Uses the same GEMINI_API_KEY as the rest of the application (via GOOGLE_GENERATIVE_AI_API_KEY).
 *
 * Note: The `components.rag` type will be generated after first deployment.
 * Until then, we use a type assertion.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const transactionRAG = new RAG((components as any).rag, {
  textEmbeddingModel: google.textEmbeddingModel("text-embedding-004"),
  embeddingDimension: 768, // Google text-embedding-004 dimension
});
