import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import {
  confidenceFromCounts,
  nextAcceptedMemoryState,
} from "./categorization/memory";

export const getBySignature = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("transactionCategorizationMemory")
      .withIndex("by_organization_signature", (q) =>
        q.eq("organizationId", args.organizationId).eq("signature", args.signature)
      )
      .first();
  },
});

export const getBySignatures = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    signatures: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const uniqueSignatures = [...new Set(args.signatures)];
    const memories = await Promise.all(
      uniqueSignatures.map((signature) =>
        ctx.db
          .query("transactionCategorizationMemory")
          .withIndex("by_organization_signature", (q) =>
            q.eq("organizationId", args.organizationId).eq("signature", signature)
          )
          .first()
      )
    );

    return memories.filter((memory) => memory !== null);
  },
});

export const upsertAccepted = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    signature: v.string(),
    descriptionExample: v.string(),
    transactionType: v.union(v.literal("Income"), v.literal("Expenditure")),
    category: v.string(),
    fundId: v.id("funds"),
    isGiftAidEligible: v.optional(v.boolean()),
    donorName: v.optional(v.string()),
    sourceTransactionId: v.optional(v.id("transactions")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("transactionCategorizationMemory")
      .withIndex("by_organization_signature", (q) =>
        q.eq("organizationId", args.organizationId).eq("signature", args.signature)
      )
      .first();
    const now = Date.now();

    if (!existing) {
      return await ctx.db.insert("transactionCategorizationMemory", {
        organizationId: args.organizationId,
        signature: args.signature,
        descriptionExample: args.descriptionExample,
        transactionType: args.transactionType,
        category: args.category,
        fundId: args.fundId,
        isGiftAidEligible: args.isGiftAidEligible,
        donorName: args.donorName,
        sourceTransactionId: args.sourceTransactionId,
        acceptedSourceTransactionIds: args.sourceTransactionId
          ? [args.sourceTransactionId]
          : [],
        acceptedCount: 1,
        correctedCount: 0,
        lastAcceptedAt: now,
        confidence: confidenceFromCounts(1, 0),
      });
    }

    const next = nextAcceptedMemoryState(
      {
        transactionType: existing.transactionType,
        category: existing.category,
        fundId: existing.fundId,
        isGiftAidEligible: existing.isGiftAidEligible,
        donorName: existing.donorName,
        acceptedCount: existing.acceptedCount,
        correctedCount: existing.correctedCount,
        sourceTransactionId: existing.sourceTransactionId,
        acceptedSourceTransactionIds: existing.acceptedSourceTransactionIds,
      },
      {
        transactionType: args.transactionType,
        category: args.category,
        fundId: args.fundId,
        isGiftAidEligible: args.isGiftAidEligible,
        donorName: args.donorName,
        sourceTransactionId: args.sourceTransactionId,
      }
    );

    await ctx.db.patch(existing._id, {
      descriptionExample: args.descriptionExample,
      transactionType: args.transactionType,
      category: args.category,
      fundId: args.fundId,
      isGiftAidEligible: args.isGiftAidEligible,
      donorName: args.donorName,
      sourceTransactionId: args.sourceTransactionId,
      acceptedSourceTransactionIds:
        next.acceptedSourceTransactionIds as Id<"transactions">[],
      acceptedCount: next.acceptedCount,
      correctedCount: next.correctedCount,
      lastAcceptedAt: now,
      confidence: next.confidence,
    });

    return existing._id;
  },
});

export const recordCorrection = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("transactionCategorizationMemory")
      .withIndex("by_organization_signature", (q) =>
        q.eq("organizationId", args.organizationId).eq("signature", args.signature)
      )
      .first();

    if (!existing) return null;

    const correctedCount = existing.correctedCount + 1;
    await ctx.db.patch(existing._id, {
      correctedCount,
      lastCorrectedAt: Date.now(),
      confidence: confidenceFromCounts(existing.acceptedCount, correctedCount),
    });

    return existing._id;
  },
});
