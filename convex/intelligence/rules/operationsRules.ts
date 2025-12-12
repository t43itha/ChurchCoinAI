import { Doc } from "../../_generated/dataModel";

export interface OperationsRuleContext {
  uncategorizedCount: number;
  unreconciledCount: number;
  totalTransactions: number;
  pendingTransactionsOver30Days: number;
  largeUncategorizedExpenses: Doc<"transactions">[];
  daysSinceLastTransaction?: number;
}

export interface InsightResult {
  description: string;
  confidence: number;
  suggestedAction?: string;
  actionUrl?: string;
  actionData?: Record<string, unknown>;
}

export interface OperationsInsightRule {
  id: string;
  title: string;
  insightType: "operations";
  severity: "info" | "warning" | "critical";
  evaluate: (context: OperationsRuleContext) => InsightResult | null;
}

export const OPERATIONS_RULES: OperationsInsightRule[] = [
  {
    id: "high_uncategorized_queue",
    title: "Many transactions need categorization",
    insightType: "operations",
    severity: "info",
    evaluate: (ctx) => {
      if (ctx.uncategorizedCount >= 20) {
        return {
          description: `You have ${ctx.uncategorizedCount} uncategorized transactions waiting for review.`,
          confidence: 1.0,
          suggestedAction: "Bulk categorize transactions",
          actionUrl: "/transactions",
        };
      }
      return null;
    },
  },
  {
    id: "month_end_almost_complete",
    title: "Period almost ready to close",
    insightType: "operations",
    severity: "info",
    evaluate: (ctx) => {
      if (ctx.totalTransactions === 0) return null;
      const reconciledCount = ctx.totalTransactions - ctx.unreconciledCount;
      const reviewedPercent = reconciledCount / ctx.totalTransactions;
      if (reviewedPercent >= 0.9 && ctx.unreconciledCount > 0) {
        return {
          description: `${Math.round(reviewedPercent * 100)}% of transactions are reconciled. Just ${ctx.unreconciledCount} left to review.`,
          confidence: 0.9,
          suggestedAction: "Complete month-end reconciliation",
          actionUrl: "/transactions",
        };
      }
      return null;
    },
  },
  {
    id: "stale_pending_transactions",
    title: "Old pending transactions need attention",
    insightType: "operations",
    severity: "warning",
    evaluate: (ctx) => {
      if (ctx.pendingTransactionsOver30Days > 0) {
        return {
          description: `${ctx.pendingTransactionsOver30Days} transaction${ctx.pendingTransactionsOver30Days > 1 ? "s are" : " is"} over 30 days old and still unreconciled.`,
          confidence: 0.85,
          suggestedAction: "Review and reconcile old transactions",
          actionUrl: "/transactions",
        };
      }
      return null;
    },
  },
  {
    id: "uncategorized_large_expense",
    title: "Large expense needs categorization",
    insightType: "operations",
    severity: "warning",
    evaluate: (ctx) => {
      if (ctx.largeUncategorizedExpenses.length > 0) {
        const largest = ctx.largeUncategorizedExpenses[0];
        return {
          description: `A £${largest.amount.toLocaleString()} expense "${largest.description.slice(0, 50)}${largest.description.length > 50 ? "..." : ""}" needs categorization.`,
          confidence: 1.0,
          suggestedAction: "Categorize large expense",
          actionUrl: "/transactions",
          actionData: { transactionId: largest._id },
        };
      }
      return null;
    },
  },
  {
    id: "no_recent_activity",
    title: "No recent transaction activity",
    insightType: "operations",
    severity: "info",
    evaluate: (ctx) => {
      if (
        ctx.daysSinceLastTransaction &&
        ctx.daysSinceLastTransaction > 35 &&
        ctx.totalTransactions > 0
      ) {
        return {
          description: `No new transactions in ${ctx.daysSinceLastTransaction} days. Consider uploading a bank statement.`,
          confidence: 0.8,
          suggestedAction: "Upload bank statement",
          actionUrl: "/transactions",
        };
      }
      return null;
    },
  },
];
