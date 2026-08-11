import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

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
  }
);
