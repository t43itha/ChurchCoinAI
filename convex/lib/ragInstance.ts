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

/** Removes a church's search namespace and every entry in it. */
export async function clearOrganizationSearch(ctx: ActionCtx, organizationId: Id<"organizations">) {
  const namespace = await transactionRAG.getNamespace(ctx, { namespace: `org_${organizationId}` });
  if (namespace) {
    await ctx.runAction(transactionRAG.component.namespaces.deleteNamespaceSync, {
      namespaceId: namespace.namespaceId,
    });
  }
}

/**
 * Indexing jobs can run while, or after, a church erases its data. Erasure
 * records a marker before it clears anything, so this checks the marker
 * before adding and again once the add has finished: if erasure started in
 * between, its final clear may already have run, so the job clears the
 * namespace itself. Returns whether the entry was kept.
 */
export async function addForExistingOrganization(
  ctx: ActionCtx,
  organizationId: Id<"organizations">,
  entry: Parameters<typeof transactionRAG.add>[1]
): Promise<boolean> {
  const accepts = () => ctx.runQuery(internal.queries.organizations.acceptsSearchEntries, { organizationId });
  if (!(await accepts())) return false;
  await transactionRAG.add(ctx, entry);
  if (await accepts()) return true;
  await clearOrganizationSearch(ctx, organizationId);
  return false;
}
