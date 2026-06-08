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

const validNamedDonationPaymentMethods = new Set(["Cash", "Cheque", "Card"]);

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

export const submitCollection = mutation({
  args: {
    weekEndingDate: v.string(),
    collectionDate: v.string(),
    notes: v.optional(v.string()),
    status: v.optional(v.union(v.literal("draft"), v.literal("submitted"))),
    serviceRows: v.array(
      v.object({
        serviceDate: v.string(),
        serviceNote: v.string(),
        fundId: v.id("funds"),
        cash: v.number(),
        pdq: v.number(),
        cheque: v.number(),
      })
    ),
    namedDonations: v.optional(
      v.array(
        v.object({
          donorName: v.string(),
          donorId: v.optional(v.id("donors")),
          category: v.string(),
          fundId: v.id("funds"),
          paymentMethod: v.union(
            v.literal("Cash"),
            v.literal("Cheque"),
            v.literal("Card")
          ),
          amount: v.number(),
          isGiftAidEligible: v.boolean(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const validRows = args.serviceRows.filter(
      (row) => row.serviceDate && row.fundId && row.cash + row.pdq + row.cheque > 0
    );
    const validNamedDonations = (args.namedDonations ?? []).filter(
      (donation) =>
        donation.donorName.trim().length >= 2 &&
        donation.fundId &&
        donation.amount > 0 &&
        donation.category.trim().length > 0 &&
        validNamedDonationPaymentMethods.has(donation.paymentMethod)
    );

    if (validRows.length === 0 && validNamedDonations.length === 0) {
      throw new Error("Please add at least one service row or named donation with an amount.");
    }

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

    for (const row of validRows) {
      const fund = await ctx.db.get(row.fundId);
      if (!fund || fund.organizationId !== user.organizationId) {
        throw new Error(`Invalid fund: ${row.fundId}`);
      }
      const serviceNote = row.serviceNote.trim() || "Service";

      const methods = [
        { label: "Cash", amount: row.cash, paymentMethod: "Cash" as const },
        { label: "PDQ", amount: row.pdq, paymentMethod: "Card" as const },
        { label: "Cheque", amount: row.cheque, paymentMethod: "Cheque" as const },
      ];

      for (const method of methods) {
        if (method.amount <= 0) continue;

        const transactionId = await ctx.db.insert("transactions", {
          organizationId: user.organizationId,
          date: row.serviceDate,
          description: `${serviceNote} - ${method.label}`,
          amount: method.amount,
          type: "Income",
          category: "Offerings",
          fundId: row.fundId,
          isReconciled: false,
          paymentMethod: method.paymentMethod,
          cashCollectionId,
          notes: `service:${serviceNote}`,
          createdAt: Date.now(),
        });

        transactionIds.push(transactionId);
      }
    }

    for (const donation of validNamedDonations) {
      const fund = await ctx.db.get(donation.fundId);
      if (!fund || fund.organizationId !== user.organizationId) {
        throw new Error(`Invalid fund: ${donation.fundId}`);
      }

      let donorId: Id<"donors">;
      let matchedName: string;

      if (donation.donorId) {
        const donor = await ctx.db.get(donation.donorId);
        if (!donor || donor.organizationId !== user.organizationId) {
          throw new Error("Invalid donor");
        }
        donorId = donor._id;
        matchedName = donor.name;
      } else {
        const donorMatch = await findOrCreateDonor(
          ctx,
          user.organizationId,
          donation.donorName,
          donation.isGiftAidEligible
        );
        donorId = donorMatch.donorId;
        matchedName = donorMatch.matchedName;
      }

      const category = donation.category.trim();
      const transactionId = await ctx.db.insert("transactions", {
        organizationId: user.organizationId,
        date: args.weekEndingDate,
        description: `${category} - ${matchedName}`,
        amount: donation.amount,
        type: "Income",
        category,
        fundId: donation.fundId,
        isReconciled: false,
        paymentMethod: donation.paymentMethod,
        cashCollectionId,
        donorId,
        donorName: matchedName,
        isGiftAidEligible: donation.isGiftAidEligible,
        createdAt: Date.now(),
      });

      transactionIds.push(transactionId);
    }

    return {
      cashCollectionId,
      transactionCount: transactionIds.length,
      transactionIds,
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
