// Repo-specific lint rules. Each rule encodes a mistake that reviewers caught
// more than once; the message names the fix. See "Enforced rules" in CLAUDE.md.

const memberName = (node) =>
  !node.computed && node.property.type === "Identifier" ? node.property.name : null;

// `{ isVoided: transaction.isVoided }` copies a field into a projection; it
// doesn't decide anything, so it isn't a violation.
const isCopiedIntoObject = (node) =>
  node.parent.type === "Property" && node.parent.value === node;

const REPORTABLE_FIELDS = new Set(["isVoided", "cashBankingRole"]);

export const reportableTransactions = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Totals, reports, and matching must use lib/reportableTransactions instead of inline void or deposit checks.",
    },
    messages: {
      inline:
        "Don't check `{{field}}` inline. Use isReportableTransaction / filterReportableTransactions / sumReportableIncome / sumReportableSigned from lib/reportableTransactions (they exclude voided rows AND cash banking deposits), or isVoidedTransaction for display-only void badges.",
    },
    schema: [],
  },
  create(context) {
    return {
      MemberExpression(node) {
        const field = memberName(node);
        if (!field || !REPORTABLE_FIELDS.has(field)) return;
        if (isCopiedIntoObject(node)) return;
        // Writes (`row.isVoided = true`) are mutations, not reporting decisions.
        if (node.parent.type === "AssignmentExpression" && node.parent.left === node) return;
        context.report({ node, messageId: "inline", data: { field } });
      },
    };
  },
};

export const categoryType = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Category validity for a transaction type must go through the shared resolver, not category.transactionType.",
    },
    messages: {
      direct:
        "Don't read category.transactionType directly: legacy categories stay untyped until the server backfill runs, and names can be aliases. Use categoryNamesForTransactionTypes from lib/transactionCategories (client) or ensureTypedCategories + requireCanonicalCategory from convex/lib/categoryIntegrity (server writes).",
    },
    schema: [],
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (memberName(node) !== "transactionType") return;
        // Validated function arguments and plain field copies are fine.
        if (node.object.type === "Identifier" && node.object.name === "args") return;
        if (isCopiedIntoObject(node)) return;
        if (node.parent.type === "AssignmentExpression" && node.parent.left === node) return;
        context.report({ node, messageId: "direct" });
      },
    };
  },
};

export default {
  meta: { name: "churchcoin" },
  rules: {
    "reportable-transactions": reportableTransactions,
    "category-type": categoryType,
  },
};
