import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { DONOR_RULES, DonorRuleContext } from "./rules/donorRules";
import { OPERATIONS_RULES, OperationsRuleContext } from "./rules/operationsRules";
import { filterReportableTransactions } from "../../lib/reportableTransactions";

// Internal query to gather context for rules evaluation
export const gatherInsightContext = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    // Get all transactions
    const allTransactions = await ctx.db
      .query("transactions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const transactions = filterReportableTransactions(allTransactions);

    // Get all donors
    const donors = await ctx.db
      .query("donors")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    // Get all pledges
    const pledges = await ctx.db
      .query("pledges")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    // Pre-group transactions by donor once to avoid repeated full scans.
    const donorTransactionsById: Record<string, typeof transactions> = {};
    for (const tx of transactions) {
      if (!tx.donorId) continue;
      const key = tx.donorId as string;
      if (!donorTransactionsById[key]) {
        donorTransactionsById[key] = [];
      }
      donorTransactionsById[key].push(tx);
    }

    // Calculate church-wide 90th percentile for major donor detection
    const donorTotals = donors
      .map((d) => {
        const donorTransactions = donorTransactionsById[d._id as string] ?? [];
        const total = donorTransactions
          .filter((t) => t.type === "Income")
          .reduce((sum, t) => sum + t.amount, 0);
        return total;
      })
      .filter((t) => t > 0)
      .sort((a, b) => b - a);

    const church90thPercentile =
      donorTotals.length > 0
        ? donorTotals[Math.floor(donorTotals.length * 0.1)] || 0
        : 0;

    // Operations context
    const uncategorizedCount = transactions.filter(
      (t) => !t.category || t.category === "Uncategorized"
    ).length;
    const unreconciledCount = transactions.filter(
      (t) => !t.isReconciled
    ).length;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

    const pendingTransactionsOver30Days = transactions.filter(
      (t) => !t.isReconciled && t.date < thirtyDaysAgoStr
    ).length;

    const largeUncategorizedExpenses = transactions
      .filter(
        (t) =>
          t.type === "Expenditure" &&
          t.amount >= 500 &&
          (!t.category || t.category === "Uncategorized")
      )
      .sort((a, b) => b.amount - a.amount);

    // Days since last transaction
    const sortedByDate = [...transactions].sort((a, b) =>
      b.date.localeCompare(a.date)
    );
    const lastTransactionDate = sortedByDate[0]?.date;
    const daysSinceLastTransaction = lastTransactionDate
      ? Math.floor(
          (Date.now() - new Date(lastTransactionDate).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : undefined;

    return {
      transactions,
      donorTransactionsById,
      donors,
      pledges,
      church90thPercentile,
      operationsContext: {
        uncategorizedCount,
        unreconciledCount,
        totalTransactions: transactions.length,
        pendingTransactionsOver30Days,
        largeUncategorizedExpenses,
        daysSinceLastTransaction,
      } as OperationsRuleContext,
    };
  },
});

// Main mutation to generate and store insights
export const generateForOrganization = internalMutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      internal.intelligence.generateInsights.gatherInsightContext,
      {
        organizationId: args.organizationId,
      }
    );

    const newInsights: Array<{
      organizationId: typeof args.organizationId;
      insightType: "donor" | "operations" | "financial" | "compliance";
      ruleId: string;
      title: string;
      description: string;
      severity: "info" | "warning" | "critical";
      confidence: number;
      suggestedAction?: string;
      actionUrl?: string;
      actionData?: Record<string, unknown>;
      status: "pending";
      createdAt: number;
      expiresAt: number;
    }> = [];

    const now = Date.now();
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days

    // Current year for YTD calculations
    const currentYear = new Date().getFullYear().toString();
    const prevYear = (new Date().getFullYear() - 1).toString();

    // Evaluate donor rules
    for (const donor of context.donors) {
      const donorTransactions =
        context.donorTransactionsById[donor._id as string] ?? [];
      const donorPledges = context.pledges.filter(
        (p: any) => p.donorId === donor._id
      );

      // Calculate donor-specific metrics
      const incomeTransactions = donorTransactions
        .filter((t: any) => t.type === "Income")
        .sort((a: any, b: any) => b.date.localeCompare(a.date));

      if (incomeTransactions.length === 0) continue; // Skip donors with no income transactions

      const lastGiftDate = incomeTransactions[0]?.date;
      const daysSinceLastGift = lastGiftDate
        ? Math.floor(
            (Date.now() - new Date(lastGiftDate).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : 9999;

      // Calculate average frequency
      let avgGiftFrequencyDays: number | null = null;
      if (incomeTransactions.length >= 2) {
        const dates = incomeTransactions.map((t: any) =>
          new Date(t.date).getTime()
        );
        const gaps = dates
          .slice(0, -1)
          .map((d: number, i: number) => d - dates[i + 1]);
        avgGiftFrequencyDays =
          gaps.reduce((a: number, b: number) => a + b, 0) / gaps.length / (1000 * 60 * 60 * 24);
      }

      // YTD calculations
      const ytdGiving = incomeTransactions
        .filter((t: any) => t.date.startsWith(currentYear))
        .reduce((sum: number, t: any) => sum + t.amount, 0);
      const prevYtdGiving = incomeTransactions
        .filter((t: any) => t.date.startsWith(prevYear))
        .reduce((sum: number, t: any) => sum + t.amount, 0);

      const uniqueFunds = new Set(incomeTransactions.map((t: any) => t.fundId)).size;
      const firstGiftDate =
        incomeTransactions.length > 0
          ? incomeTransactions[incomeTransactions.length - 1].date
          : null;

      const donorContext: DonorRuleContext = {
        donor,
        transactions: donorTransactions,
        pledges: donorPledges,
        daysSinceLastGift,
        avgGiftFrequencyDays,
        totalGiving: incomeTransactions.reduce((sum: number, t: any) => sum + t.amount, 0),
        ytdGiving,
        prevYtdGiving,
        giftCount: incomeTransactions.length,
        uniqueFunds,
        firstGiftDate,
        church90thPercentile: context.church90thPercentile,
      };

      for (const rule of DONOR_RULES) {
        const result = rule.evaluate(donorContext);
        if (result) {
          // Check if similar insight already exists (same rule + same donor)
          const existingInsights = await ctx.db
            .query("intelligenceSuggestions")
            .withIndex("by_organization_rule", (q) =>
              q
                .eq("organizationId", args.organizationId)
                .eq("ruleId", rule.id)
            )
            .filter((q) => q.eq(q.field("status"), "pending"))
            .collect();

          // Check if this specific donor already has a pending insight for this rule
          const hasDuplicateForDonor = existingInsights.some(
            (e) =>
              e.actionData &&
              typeof e.actionData === "object" &&
              "donorId" in e.actionData &&
              e.actionData.donorId === donor._id
          );

          if (!hasDuplicateForDonor) {
            newInsights.push({
              organizationId: args.organizationId,
              insightType: rule.insightType,
              ruleId: rule.id,
              title: rule.title,
              description: result.description,
              severity: rule.severity,
              confidence: result.confidence,
              suggestedAction: result.suggestedAction,
              actionUrl: result.actionUrl,
              actionData: result.actionData,
              status: "pending",
              createdAt: now,
              expiresAt,
            });
          }
        }
      }
    }

    // Evaluate operations rules
    for (const rule of OPERATIONS_RULES) {
      const result = rule.evaluate(context.operationsContext);
      if (result) {
        const existingInsight = await ctx.db
          .query("intelligenceSuggestions")
          .withIndex("by_organization_rule", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("ruleId", rule.id)
          )
          .filter((q) => q.eq(q.field("status"), "pending"))
          .first();

        if (!existingInsight) {
          newInsights.push({
            organizationId: args.organizationId,
            insightType: rule.insightType,
            ruleId: rule.id,
            title: rule.title,
            description: result.description,
            severity: rule.severity,
            confidence: result.confidence,
            suggestedAction: result.suggestedAction,
            actionUrl: result.actionUrl,
            actionData: result.actionData,
            status: "pending",
            createdAt: now,
            expiresAt,
          });
        }
      }
    }

    // Insert new insights
    for (const insight of newInsights) {
      await ctx.db.insert("intelligenceSuggestions", insight);
    }

    return { generated: newInsights.length };
  },
});

// Clean up expired insights
export const cleanupExpiredInsights = internalMutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const now = Date.now();

    const expiredInsights = await ctx.db
      .query("intelligenceSuggestions")
      .withIndex("by_organization_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "pending")
      )
      .filter((q) =>
        q.and(
          q.neq(q.field("expiresAt"), undefined),
          q.lt(q.field("expiresAt"), now)
        )
      )
      .collect();

    for (const insight of expiredInsights) {
      await ctx.db.delete(insight._id);
    }

    return { deleted: expiredInsights.length };
  },
});
