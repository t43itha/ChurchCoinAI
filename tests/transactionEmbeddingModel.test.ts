import { describe, expect, it, vi } from "vitest";
import type { EmbeddingModelV3 } from "@ai-sdk/provider";
import {
  createTransactionEmbeddingModel,
  TRANSACTION_EMBEDDING_INDEX_VERSION,
} from "../convex/lib/transactionEmbeddingModel";

describe("transaction embedding model", () => {
  it("requests 768 dimensions and applies the similarity instruction", async () => {
    const doEmbed = vi.fn(async () => ({
      embeddings: [[0.1, 0.2]],
      warnings: [],
    }));
    const baseModel: EmbeddingModelV3 = {
      specificationVersion: "v3",
      provider: "test",
      modelId: "gemini-embedding-2",
      maxEmbeddingsPerCall: 100,
      supportsParallelCalls: true,
      doEmbed,
    };

    const model = createTransactionEmbeddingModel(baseModel);
    await model.doEmbed({
      values: ["CARD PAYMENT ST MARYS"],
      providerOptions: { google: { existingOption: true } },
    });

    expect(model.modelId).toBe(TRANSACTION_EMBEDDING_INDEX_VERSION);
    expect(doEmbed).toHaveBeenCalledWith(
      expect.objectContaining({
        values: [
          "task: sentence similarity | query: CARD PAYMENT ST MARYS",
        ],
        providerOptions: {
          google: {
            existingOption: true,
            outputDimensionality: 768,
          },
        },
      })
    );
  });
});
