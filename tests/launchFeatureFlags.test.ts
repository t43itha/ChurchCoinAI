import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const OWNER = "convex/lib/launchFeatures.ts";
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage", "tests", "_generated", ".vercel"]);
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

// A read is `env.FLAG`, `env["FLAG"]`, or destructuring the flag out of an env object.
// Any VITE_ copy of a flag counts too: the browser must read the server's answer.
const READS = [
  /\benv\s*(?:\.\s*|\[\s*["'`])(?:VITE_)?(?:BILLING_ENABLED|BANK_FEEDS_ENABLED)\b/,
  /\{[^}]*\b(?:BILLING_ENABLED|BANK_FEEDS_ENABLED)\b[^}]*\}\s*=\s*(?:process|import\.meta)\.env/,
  /\bVITE_(?:BILLING_ENABLED|BANK_FEEDS_ENABLED)\b/,
];

function codeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : codeFiles(join(dir, entry.name));
    return CODE.test(entry.name) ? [join(dir, entry.name)] : [];
  });
}

const readsFlags = (source: string) => READS.some((pattern) => pattern.test(source));

describe("launch feature flags", () => {
  it("recognises a flag read, so the scan below can't pass by matching nothing", () => {
    expect(readsFlags('const on = process.env.BILLING_ENABLED === "true";')).toBe(true);
    expect(readsFlags("const { BANK_FEEDS_ENABLED } = process.env;")).toBe(true);
    expect(readsFlags('import.meta.env["VITE_BILLING_ENABLED"]')).toBe(true);
    expect(readFileSync(join(ROOT, OWNER), "utf8")).toMatch(READS[0]);
  });

  it("are read only in convex/lib/launchFeatures.ts", () => {
    const offenders = codeFiles(ROOT)
      .map((file) => relative(ROOT, file).split(sep).join("/"))
      .filter((file) => file !== OWNER && readsFlags(readFileSync(join(ROOT, file), "utf8")));

    expect(offenders).toEqual([]);
  });
});
