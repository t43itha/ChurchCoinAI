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

// Fields that hold pounds. Summing them as floats drifts by fractions of a penny.
const MONEY_FIELDS = new Set([
  "amount",
  "balance",
  "total",
  "targetAmount",
  "cashAmount",
  "chequeAmount",
  "totalDonation",
]);

const isMoneyMember = (node) =>
  node?.type === "MemberExpression" && MONEY_FIELDS.has(memberName(node));

const containsMoneyArithmetic = (node) => {
  let found = false;
  const visit = (current) => {
    if (found || !current || typeof current.type !== "string") return;
    if (
      current.type === "BinaryExpression" &&
      (current.operator === "+" || current.operator === "-") &&
      (isMoneyMember(current.left) || isMoneyMember(current.right))
    ) {
      found = true;
      return;
    }
    for (const key of Object.keys(current)) {
      if (key === "parent") continue;
      const child = current[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child.type === "string") visit(child);
    }
  };
  visit(node);
  return found;
};

export const moneyArithmetic = {
  meta: {
    type: "problem",
    docs: {
      description: "Money totals use sumMoney and targets use meetsMoneyTarget from convex/lib/money.",
    },
    messages: {
      sum: "Raw float money sum. Use sumMoney(items, getAmount) from convex/lib/money.ts; float accumulation drifts by fractions of a penny (see a7cfd70).",
      compare:
        "Compare a money total with a target using meetsMoneyTarget(total, target) from convex/lib/money.ts; a raw comparison fails on float drift (see 809c966).",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== "MemberExpression" || memberName(node.callee) !== "reduce") return;
        const callback = node.arguments[0];
        if (
          callback &&
          (callback.type === "ArrowFunctionExpression" || callback.type === "FunctionExpression") &&
          containsMoneyArithmetic(callback.body)
        ) {
          context.report({ node, messageId: "sum" });
        }
      },
      AssignmentExpression(node) {
        if ((node.operator === "+=" || node.operator === "-=") && isMoneyMember(node.right)) {
          context.report({ node, messageId: "sum" });
        }
      },
      BinaryExpression(node) {
        if (!["<", ">=", "<=", ">"].includes(node.operator)) return;
        const target = [node.left, node.right].find(
          (side) => side.type === "MemberExpression" && ["amount", "targetAmount"].includes(memberName(side))
        );
        const other = target === node.left ? node.right : node.left;
        if (target && other.type !== "Literal" && other.type !== "UnaryExpression" && !isMoneyMember(other)) {
          context.report({ node, messageId: "compare" });
        }
      },
    };
  },
};

export const noFunctionReferenceStrings = {
  meta: {
    type: "problem",
    docs: {
      description: "Convex function calls must use the generated typed references.",
    },
    messages: {
      untyped:
        "Use typed api/internal refs from convex/_generated/api instead of makeFunctionReference. Run `npx convex codegen` if a function is missing.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          (node.callee.type === "Identifier" && node.callee.name === "makeFunctionReference") ||
          (node.callee.type === "MemberExpression" && memberName(node.callee) === "makeFunctionReference")
        ) {
          context.report({ node, messageId: "untyped" });
        }
      },
    };
  },
};

export default {
  meta: { name: "churchcoin" },
  rules: {
    "reportable-transactions": reportableTransactions,
    "category-type": categoryType,
    "money-arithmetic": moneyArithmetic,
    "no-function-reference-strings": noFunctionReferenceStrings,
  },
};
