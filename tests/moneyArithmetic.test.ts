// Ratchet for churchcoin/money-arithmetic. Raw float money sums and target
// comparisons were fixed three times (a7cfd70, 809c966, 2d1e3af) and dozens
// remain. New code must use sumMoney / meetsMoneyTarget from convex/lib/money;
// existing sites are counted per file and the counts may only go down.
import { readFileSync } from "node:fs";
import path from "node:path";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const baseline: Record<string, number> = JSON.parse(
  readFileSync(path.join(__dirname, "moneyArithmetic.baseline.json"), "utf8")
);

async function lintMoney() {
  const rulesPath = "../eslint/churchcoin-rules.js";
  const { default: churchcoin } = await import(/* @vite-ignore */ rulesPath);
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      { ignores: ["convex/_generated/**", "convex/lib/money.ts", "tests/**", "node_modules/**", "dist/**"] },
      {
        files: ["**/*.{ts,tsx}"],
        languageOptions: { parser: tseslint.parser },
        plugins: { churchcoin },
        rules: { "churchcoin/money-arithmetic": "error" },
      },
    ],
  });
  const results = await eslint.lintFiles(["components", "lib", "services", "convex", "*.tsx"]);
  return results.flatMap((result) =>
    result.messages
      .filter((message) => message.ruleId === "churchcoin/money-arithmetic")
      .map((message) => ({
        file: path.relative(root, result.filePath).replace(/\\/g, "/"),
        line: message.line,
        message: message.message,
      }))
  );
}

describe("money arithmetic ratchet", () => {
  it("adds no raw money sums or target comparisons", async () => {
    const violations = await lintMoney();
    const counts: Record<string, number> = {};
    for (const violation of violations) counts[violation.file] = (counts[violation.file] ?? 0) + 1;
    const known = baseline;

    const grown = Object.keys(counts).filter((file) => counts[file] > (known[file] ?? 0));
    expect(
      violations
        .filter((violation) => grown.includes(violation.file))
        .map((violation) => `${violation.file}:${violation.line} ${violation.message}`),
      "New raw money arithmetic. Use sumMoney / meetsMoneyTarget from convex/lib/money.ts."
    ).toEqual([]);

    const shrunk = Object.keys(known).filter((file) => (counts[file] ?? 0) < known[file]);
    expect(
      shrunk.map((file) => `${file}: ${known[file]} -> ${counts[file] ?? 0}`),
      "Money sites were fixed. Lower these counts in tests/moneyArithmetic.baseline.json."
    ).toEqual([]);
  }, 120_000);
});
