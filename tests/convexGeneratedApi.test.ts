// convex/_generated/api.d.ts must list exactly the modules under convex/.
// Greptile flagged hand-edited or stale bindings on PRs #31, #36 and #43, and
// `npm run typecheck` can't catch it (skipLibCheck skips .d.ts files). Codegen
// needs a live deployment, so this offline check compares the two directly.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const convexDir = path.resolve(__dirname, "..", "convex");

// Modules already missing from the committed bindings. Shrink-only: run
// `npx convex codegen` (or `npx convex dev --once`), commit convex/_generated,
// and delete the entries it fixes. Never add to this list.
const KNOWN_STALE = new Set([
  "actions/supportTickets",
  "lib/categoryIntegrity",
  "lib/githubSupport",
  "lib/pledgeStatus",
  "lib/transactionWrites",
  "mutations/supportTickets",
  "queries/supportTickets",
]);

function convexModules(dir = convexDir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "_generated" ? [] : convexModules(full);
    const rel = path.relative(convexDir, full).replace(/\\/g, "/");
    // Convex skips schema.ts and config files such as auth.config.ts.
    if (!/\.(ts|js)$/.test(rel) || rel === "schema.ts" || /\.[^/]+\.(ts|js)$/.test(rel)) return [];
    return [rel.replace(/\.(ts|js)$/, "")];
  });
}

function boundModules(): string[] {
  const source = readFileSync(path.join(convexDir, "_generated", "api.d.ts"), "utf8");
  return [...source.matchAll(/^import type \* as \w+ from "\.\.\/(.+)\.js";$/gm)].map((m) => m[1]);
}

describe("convex/_generated/api.d.ts", () => {
  const modules = new Set(convexModules());
  const bound = new Set(boundModules());

  it("only references modules that exist", () => {
    expect(
      [...bound].filter((name) => !modules.has(name)),
      "api.d.ts references a module that doesn't exist. Run `npx convex codegen` and commit convex/_generated; never hand-edit it."
    ).toEqual([]);
  });

  it("covers every Convex module", () => {
    expect(
      [...modules].filter((name) => !bound.has(name) && !KNOWN_STALE.has(name)),
      "api.d.ts is missing these modules. Run `npx convex codegen` and commit convex/_generated in the same change; don't work around stale bindings with makeFunctionReference."
    ).toEqual([]);
  });

  it("keeps the stale baseline shrinking", () => {
    expect(
      [...KNOWN_STALE].filter((name) => bound.has(name) || !modules.has(name)),
      "These KNOWN_STALE entries are fixed or gone. Delete them from the list."
    ).toEqual([]);
  });
});
