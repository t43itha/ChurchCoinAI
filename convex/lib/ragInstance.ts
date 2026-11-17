import { components, internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { RAG } from "@convex-dev/rag";
import {
  createTransactionEmbeddingModel,
  TRANSACTION_EMBEDDING_DIMENSION,
} from "./transactionEmbeddingModel";

/**
 * RAG instance for transaction categorization learning.
 * Uses Google's Gemini Embedding 2 model for semantic similarity search.
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
export const transactionRAG = new RAG((components as any).rag, {
  textEmbeddingModel: createTransactionEmbeddingModel(),
  // Keep the existing vector shape while moving to the new model. The model
  // wrapper requests this output size from Gemini on every call.
  embeddingDimension: TRANSACTION_EMBEDDING_DIMENSION,
});

/**
 * Indexing jobs scheduled before a church erased its data can run after the
 * erasure cleared its namespace. Adding only while the organization still
 * exists stops them recreating entries; returns whether the entry was added.
 */
export async function addForExistingOrganization(
  ctx: ActionCtx,
  organizationId: Id<"organizations">,
  entry: Parameters<typeof transactionRAG.add>[1]
): Promise<boolean> {
  const organization = await ctx.runQuery(internal.queries.organizations.getByIdInternal, { organizationId });
  if (!organization) return false;
  await transactionRAG.add(ctx, entry);
  return true;
}
