import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import churchcoin from "./eslint/churchcoin-rules.js";

// Focused config: hook correctness and cheap correctness rules only.
// The codebase predates linting, so stylistic rules stay off to keep
// the signal high; tighten incrementally as files are touched.
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "convex/_generated/**",
      "node_modules/**",
      ".worktrees/**",
      "*.cjs",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      // Classic hook rules only; the compiler-based diagnostics in the
      // plugin's recommended set are too noisy for this codebase today.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "prefer-const": "warn",
    },
  },
  // Repo rules for mistakes reviewers kept catching. Each block lists the
  // files that legitimately own the pattern; everything else gets the error.
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    ignores: ["lib/permissions.ts", "tests/**"],
    plugins: { churchcoin },
    rules: {
      "churchcoin/role-literal": "error",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: [
      "lib/voidedTransactions.ts",
      "lib/reportableTransactions.ts",
      "lib/movementCategories.ts",
      "lib/movementMatching.ts",
      "lib/cashChequeBanking.ts",
      "convex/schema.ts",
      "convex/mutations/**",
      // Write decisions (void and link state), not reporting decisions.
      "convex/lib/transactionWrites.ts",
      "convex/queries/cashBankingReconciliations.ts",
      "tests/**",
    ],
    plugins: { churchcoin },
    rules: {
      "churchcoin/reportable-transactions": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/voidedTransactions"],
              message:
                "Void-only helpers keep cash banking deposits, so totals double count. Use filterIncomeAndExpenditure / sumReportableIncome / sumFundBalance from lib/reportableTransactions.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: [
      "lib/transactionCategories.ts",
      "convex/lib/categoryIntegrity.ts",
      "convex/mutations/categories.ts",
      // Categorisation reads categories already resolved by categoryResolver,
      // and its memory rows have their own transactionType field.
      "convex/intelligence/**",
      "convex/schema.ts",
      "tests/**",
    ],
    plugins: { churchcoin },
    rules: {
      "churchcoin/category-type": "error",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["tests/**"],
    plugins: { churchcoin },
    rules: {
      "churchcoin/no-function-reference-strings": "error",
    },
  }
);
