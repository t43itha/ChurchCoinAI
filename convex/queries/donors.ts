import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth, requireRole } from "../lib/auth";
import { isReportableIncomeTransaction } from "../../lib/reportableTransactions";

// List all donors
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const donors = await ctx.db
      .query("donors")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    return donors;
  },
});

// Get a specific donor by ID
export const getById = query({
  args: { donorId: v.id("donors") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const donor = await ctx.db.get(args.donorId);

    if (!donor || donor.organizationId !== user.organizationId) {
      return null;
    }

    return donor;
  },
});

// Search donors by name
export const searchByName = query({
  args: { searchTerm: v.string() },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const donors = await ctx.db
      .query("donors")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    const searchLower = args.searchTerm.toLowerCase();
    return donors.filter((d) => d.name.toLowerCase().includes(searchLower));
  },
});

// Get donor with their pledges and giving history
export const getWithHistory = query({
  args: { donorId: v.id("donors") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const donor = await ctx.db.get(args.donorId);

    if (!donor || donor.organizationId !== user.organizationId) {
      return null;
    }

    // Get pledges for this donor
    const pledges = await ctx.db
      .query("pledges")
      .withIndex("by_donor", (q) => q.eq("donorId", args.donorId))
      .collect();

    // Get transactions for this donor
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_donor", (q) => q.eq("donorId", args.donorId))
      .collect();

    // Calculate total giving
    const totalGiving = transactions
      .filter(isReportableIncomeTransaction)
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      ...donor,
      pledges,
      transactions,
      totalGiving,
    };
  },
});

// Get Gift Aid eligible donors
export const listGiftAidEligible = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    const donors = await ctx.db
      .query("donors")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .filter((q) => q.eq(q.field("isGiftAidActive"), true))
      .collect();

    return donors;
  },
});

// Helper to normalize donor names for matching
const normalizeName = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/^(mr|mrs|ms|miss|dr|rev|pastor|deacon)\.?\s+/i, "")
    .replace(/\s+/g, " ");
};

// Find donor by fuzzy name match
export const findByNameFuzzy = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);

    if (!args.name || args.name.trim().length < 2) {
      return null;
    }

    const normalized = normalizeName(args.name);

    const donors = await ctx.db
      .query("donors")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    // Priority 1: Exact match (normalized)
    const exactMatch = donors.find(
      (d) => normalizeName(d.name) === normalized
    );
    if (exactMatch) return exactMatch;

    // Priority 2: One name contains the other
    const containsMatch = donors.find((d) => {
      const donorNormalized = normalizeName(d.name);
      return (
        donorNormalized.includes(normalized) ||
        normalized.includes(donorNormalized)
      );
    });
    if (containsMatch) return containsMatch;

    // Priority 3: Word-based matching (e.g., "J Smith" matches "John Smith")
    const inputWords = normalized.split(" ").filter((w) => w.length > 1);
    const wordMatch = donors.find((d) => {
      const donorWords = normalizeName(d.name).split(" ");
      // Check if all input words match start of donor words
      return inputWords.every((inputWord) =>
        donorWords.some(
          (donorWord) =>
            donorWord.startsWith(inputWord) || inputWord.startsWith(donorWord)
        )
      );
    });
    if (wordMatch) return wordMatch;

    return null;
  },
});
