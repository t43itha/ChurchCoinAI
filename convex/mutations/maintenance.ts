import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";
import { Id } from "../_generated/dataModel";

const normalizeName = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/^(mr|mrs|ms|miss|dr|rev|pastor|deacon)\.?\s+/i, "")
    .replace(/\s+/g, " ");
};

export const backfillDonorIdsFromDonorName = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin", "Finance Team"]);
    const dryRun = args.dryRun ?? true;
    const limit = args.limit ?? 2000;

    const donors = await ctx.db
      .query("donors")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    const donorByNormalizedName = new Map<
      string,
      { id: Id<"donors">; name: string }
    >();
    const ambiguousNames = new Set<string>();

    for (const donor of donors) {
      const key = normalizeName(donor.name);
      if (!key) continue;
      if (ambiguousNames.has(key)) continue;
      if (donorByNormalizedName.has(key)) {
        donorByNormalizedName.delete(key);
        ambiguousNames.add(key);
        continue;
      }
      donorByNormalizedName.set(key, {
        id: donor._id as Id<"donors">,
        name: donor.name,
      });
    }

    // ---- Transactions ----
    const candidateTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("donorId"), undefined),
          q.neq(q.field("donorName"), undefined)
        )
      )
      .take(limit);

    let transactionsMatched = 0;
    let transactionsUpdated = 0;
    let transactionsAmbiguous = 0;
    let transactionsNoMatch = 0;

    for (const tx of candidateTransactions) {
      const donorName = (tx.donorName ?? "").trim();
      if (!donorName) {
        transactionsNoMatch++;
        continue;
      }
      const key = normalizeName(donorName);
      if (!key) {
        transactionsNoMatch++;
        continue;
      }
      if (ambiguousNames.has(key)) {
        transactionsAmbiguous++;
        continue;
      }

      const donor = donorByNormalizedName.get(key);
      if (!donor) {
        transactionsNoMatch++;
        continue;
      }

      transactionsMatched++;
      if (!dryRun) {
        await ctx.db.patch(tx._id, {
          donorId: donor.id,
          donorName: donor.name,
        });
        transactionsUpdated++;
      }
    }

    // ---- Pledges ----
    const candidatePledges = await ctx.db
      .query("pledges")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("donorId"), undefined),
          q.neq(q.field("donorName"), undefined)
        )
      )
      .take(limit);

    let pledgesMatched = 0;
    let pledgesUpdated = 0;
    let pledgesAmbiguous = 0;
    let pledgesNoMatch = 0;

    for (const pledge of candidatePledges) {
      const donorName = (pledge.donorName ?? "").trim();
      if (!donorName) {
        pledgesNoMatch++;
        continue;
      }
      const key = normalizeName(donorName);
      if (!key) {
        pledgesNoMatch++;
        continue;
      }
      if (ambiguousNames.has(key)) {
        pledgesAmbiguous++;
        continue;
      }

      const donor = donorByNormalizedName.get(key);
      if (!donor) {
        pledgesNoMatch++;
        continue;
      }

      pledgesMatched++;
      if (!dryRun) {
        await ctx.db.patch(pledge._id, {
          donorId: donor.id,
          donorName: donor.name,
        });
        pledgesUpdated++;
      }
    }

    return {
      organizationId: user.organizationId,
      asUser: {
        id: user._id,
        clerkId: user.clerkId,
        email: user.email,
        role: user.role,
      },
      dryRun,
      limit,
      ambiguousDonorNames: ambiguousNames.size,
      transactions: {
        scanned: candidateTransactions.length,
        matched: transactionsMatched,
        updated: transactionsUpdated,
        ambiguous: transactionsAmbiguous,
        noMatch: transactionsNoMatch,
      },
      pledges: {
        scanned: candidatePledges.length,
        matched: pledgesMatched,
        updated: pledgesUpdated,
        ambiguous: pledgesAmbiguous,
        noMatch: pledgesNoMatch,
      },
    };
  },
});
