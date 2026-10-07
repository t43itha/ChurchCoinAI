import { internalMutation, mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireCapability } from "../lib/auth";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { patchTransaction } from "../lib/transactionWrites";
import { importKeyOccurrence, importKeyPrefix } from "../../lib/importKeys";

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
    const user = await requireCapability(ctx, "donors.write");
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
        await patchTransaction(ctx, tx._id, {
          donorId: donor.id,
          donorName: donor.name,
        }, { lockOverride: "donor-cascade" });
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

// Keys rows created before import keys existed, so re-uploading an older
// statement is still caught. Bank, cash collection and cash banking rows are
// left alone. Keyed rows are skipped, so reruns and resumes converge.
// Run with: npx convex run mutations/maintenance:backfillImportKeys
export const backfillImportKeys = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("transactions")
      .paginate({ cursor: args.cursor ?? null, numItems: 200 });
    let keyed = 0;
    for (const row of page.page) {
      if (row.importKey || row.providerTransactionId || row.cashCollectionId || row.cashBankingRole) continue;
      const prefix = importKeyPrefix(row);
      const sameContent = await ctx.db
        .query("transactions")
        .withIndex("by_organization_importKey", (q) =>
          q.eq("organizationId", row.organizationId).gte("importKey", prefix).lt("importKey", `${prefix}\uffff`)
        )
        .collect();
      const occurrence = Math.max(0, ...sameContent.map((other) => importKeyOccurrence(other.importKey ?? "", row) ?? 0)) + 1;
      await patchTransaction(ctx, row._id, { importKey: `${prefix}${occurrence}` }, { lockOverride: "import-key-backfill" });
      keyed += 1;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.mutations.maintenance.backfillImportKeys, { cursor: page.continueCursor });
    }
    return { keyed, isDone: page.isDone };
  },
});
