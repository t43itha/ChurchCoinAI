import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";
import { Id } from "../_generated/dataModel";

// Helper to normalize donor names for matching
const normalizeName = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/^(mr|mrs|ms|miss|dr|rev|pastor|deacon)\.?\s+/i, "")
    .replace(/\s+/g, " ");
};

// Find or create donor by name (internal helper)
async function findOrCreateDonor(
  ctx: any,
  organizationId: Id<"organizations">,
  name: string,
  isGiftAidEligible: boolean
): Promise<{ donorId: Id<"donors">; matchedName: string; isNew: boolean }> {
  if (!name || name.trim().length < 2) {
    throw new Error("Donor name is required");
  }

  const normalized = normalizeName(name);

  const donors = await ctx.db
    .query("donors")
    .withIndex("by_organization", (q: any) =>
      q.eq("organizationId", organizationId)
    )
    .collect();

  // Priority 1: Exact match (normalized)
  let match = donors.find((d: any) => normalizeName(d.name) === normalized);

  // Priority 2: Contains match
  if (!match) {
    match = donors.find((d: any) => {
      const donorNormalized = normalizeName(d.name);
      return (
        donorNormalized.includes(normalized) ||
        normalized.includes(donorNormalized)
      );
    });
  }

  // Priority 3: Word-based matching
  if (!match) {
    const inputWords = normalized.split(" ").filter((w) => w.length > 1);
    match = donors.find((d: any) => {
      const donorWords = normalizeName(d.name).split(" ");
      return inputWords.every((inputWord) =>
        donorWords.some(
          (donorWord: string) =>
            donorWord.startsWith(inputWord) || inputWord.startsWith(donorWord)
        )
      );
    });
  }

  if (match) {
    return { donorId: match._id, matchedName: match.name, isNew: false };
  }

  // No match found - create new donor
  const donorId = await ctx.db.insert("donors", {
    organizationId,
    name: name.trim(),
    type: "Individual",
    isGiftAidActive: isGiftAidEligible,
    createdAt: Date.now(),
  });

  return { donorId, matchedName: name.trim(), isNew: true };
}

// Submit a cash collection with all entries
export const submitCollection = mutation({
  args: {
    weekEndingDate: v.string(),
    collectionDate: v.string(),
    notes: v.optional(v.string()),
    status: v.optional(v.union(v.literal("draft"), v.literal("submitted"))),
    // Named contributions with donor attribution (tithes, pledges, etc.)
    namedContributions: v.array(
      v.object({
        donorName: v.string(),
        donorId: v.optional(v.id("donors")),
        amount: v.number(),
        isGiftAidEligible: v.boolean(),
        type: v.union(
          v.literal("Tithe"),
          v.literal("Pledge"),
          v.literal("First Fruit"),
          v.literal("Thanksgiving"),
          v.literal("Offering")
        ),
        fundId: v.optional(v.id("funds")), // Required for Pledge type
      })
    ),
    // Category totals (offering, restricted funds, etc.)
    categoryTotals: v.array(
      v.object({
        category: v.string(),
        fundId: v.id("funds"),
        amount: v.number(),
      })
    ),
    // Petty cash withdrawals
    pettyCash: v.array(
      v.object({
        purpose: v.string(),
        amount: v.number(),
        category: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    // Get the unrestricted fund for tithes (usually "General Fund")
    const unrestrictedFund = await ctx.db
      .query("funds")
      .withIndex("by_organization_type", (q) =>
        q.eq("organizationId", user.organizationId).eq("type", "Unrestricted")
      )
      .first();

    if (!unrestrictedFund) {
      throw new Error("No unrestricted fund found for tithes");
    }

    // Create the cash collection record
    const cashCollectionId = await ctx.db.insert("cashCollections", {
      organizationId: user.organizationId,
      weekEndingDate: args.weekEndingDate,
      collectionDate: args.collectionDate,
      recordedAt: Date.now(),
      recordedBy: user._id,
      notes: args.notes,
      status: args.status || "submitted",
      createdAt: Date.now(),
    });

    const transactionIds: Id<"transactions">[] = [];
    const newDonors: { name: string; id: Id<"donors"> }[] = [];

    // Process named contributions (tithes, pledges, etc.)
    for (const contribution of args.namedContributions) {
      // Find or create donor
      let donorId = contribution.donorId;
      let donorName = contribution.donorName;

      if (!donorId && contribution.donorName) {
        const result = await findOrCreateDonor(
          ctx,
          user.organizationId,
          contribution.donorName,
          contribution.isGiftAidEligible
        );
        donorId = result.donorId;
        donorName = result.matchedName;
        if (result.isNew) {
          newDonors.push({ name: donorName, id: donorId });
        }
      }

      // Determine the fund: pledges use their specified fund, others use unrestricted
      let transactionFundId = unrestrictedFund._id;
      if (contribution.type === "Pledge" && contribution.fundId) {
        // Verify fund belongs to organization
        const pledgeFund = await ctx.db.get(contribution.fundId);
        if (!pledgeFund || pledgeFund.organizationId !== user.organizationId) {
          throw new Error(`Invalid fund for pledge: ${contribution.fundId}`);
        }
        transactionFundId = contribution.fundId;
      }

      const transactionId = await ctx.db.insert("transactions", {
        organizationId: user.organizationId,
        date: args.collectionDate,
        description: `${contribution.type} - ${donorName}`,
        amount: contribution.amount,
        type: "Income",
        category: contribution.type,
        fundId: transactionFundId,
        isReconciled: false,
        isGiftAidEligible: contribution.isGiftAidEligible,
        donorName,
        donorId,
        paymentMethod: "Cash",
        cashCollectionId,
        createdAt: Date.now(),
      });

      transactionIds.push(transactionId);
    }

    // Process category totals
    for (const categoryTotal of args.categoryTotals) {
      // Verify fund belongs to organization
      const fund = await ctx.db.get(categoryTotal.fundId);
      if (!fund || fund.organizationId !== user.organizationId) {
        throw new Error(`Invalid fund: ${categoryTotal.fundId}`);
      }

      const transactionId = await ctx.db.insert("transactions", {
        organizationId: user.organizationId,
        date: args.collectionDate,
        description: `${categoryTotal.category} Collection`,
        amount: categoryTotal.amount,
        type: "Income",
        category: categoryTotal.category,
        fundId: categoryTotal.fundId,
        isReconciled: false,
        paymentMethod: "Cash",
        cashCollectionId,
        createdAt: Date.now(),
      });

      transactionIds.push(transactionId);
    }

    // Process petty cash (expenditure transactions)
    for (const petty of args.pettyCash) {
      const transactionId = await ctx.db.insert("transactions", {
        organizationId: user.organizationId,
        date: args.collectionDate,
        description: `Petty Cash - ${petty.purpose}`,
        amount: petty.amount,
        type: "Expenditure",
        category: petty.category,
        fundId: unrestrictedFund._id,
        isReconciled: false,
        paymentMethod: "Cash",
        cashCollectionId,
        createdAt: Date.now(),
      });

      transactionIds.push(transactionId);
    }

    return {
      cashCollectionId,
      transactionCount: transactionIds.length,
      transactionIds,
      newDonorsCreated: newDonors,
    };
  },
});

// Update a draft cash collection
export const updateCollection = mutation({
  args: {
    cashCollectionId: v.id("cashCollections"),
    weekEndingDate: v.optional(v.string()),
    collectionDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(v.union(v.literal("draft"), v.literal("submitted"))),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const collection = await ctx.db.get(args.cashCollectionId);
    if (!collection || collection.organizationId !== user.organizationId) {
      throw new Error("Cash collection not found");
    }

    if (collection.status === "banked") {
      throw new Error("Cannot update a banked collection");
    }

    const updates: Record<string, any> = {};
    if (args.weekEndingDate !== undefined)
      updates.weekEndingDate = args.weekEndingDate;
    if (args.collectionDate !== undefined)
      updates.collectionDate = args.collectionDate;
    if (args.notes !== undefined) updates.notes = args.notes;
    if (args.status !== undefined) updates.status = args.status;

    await ctx.db.patch(args.cashCollectionId, updates);

    return args.cashCollectionId;
  },
});

// Mark a collection as banked
export const markAsBanked = mutation({
  args: {
    cashCollectionId: v.id("cashCollections"),
    bankedDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const collection = await ctx.db.get(args.cashCollectionId);
    if (!collection || collection.organizationId !== user.organizationId) {
      throw new Error("Cash collection not found");
    }

    if (collection.status === "banked") {
      throw new Error("Collection is already marked as banked");
    }

    await ctx.db.patch(args.cashCollectionId, {
      status: "banked",
      bankedDate: args.bankedDate,
    });

    // Also mark all linked transactions as reconciled
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_cashCollection", (q) =>
        q.eq("cashCollectionId", args.cashCollectionId)
      )
      .collect();

    for (const t of transactions) {
      await ctx.db.patch(t._id, { isReconciled: true });
    }

    return {
      cashCollectionId: args.cashCollectionId,
      reconciledTransactions: transactions.length,
    };
  },
});

// Delete a draft cash collection and all its transactions
export const deleteCollection = mutation({
  args: {
    cashCollectionId: v.id("cashCollections"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin"]);

    const collection = await ctx.db.get(args.cashCollectionId);
    if (!collection || collection.organizationId !== user.organizationId) {
      throw new Error("Cash collection not found");
    }

    if (collection.status === "banked") {
      throw new Error("Cannot delete a banked collection");
    }

    // Delete all linked transactions
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_cashCollection", (q) =>
        q.eq("cashCollectionId", args.cashCollectionId)
      )
      .collect();

    for (const t of transactions) {
      await ctx.db.delete(t._id);
    }

    // Delete the collection
    await ctx.db.delete(args.cashCollectionId);

    return {
      deletedTransactions: transactions.length,
    };
  },
});
