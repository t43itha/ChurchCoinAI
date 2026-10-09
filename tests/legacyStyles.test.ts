// Ratchet for legacy Refined Ledger classes (swiss-card, btn-*, ledger-table,
// badge-*). New and reworked screens use the walkthrough kit in
// components/wizard/ui.tsx. Existing uses are counted per file and the counts may
// only go down. After removing legacy uses, run
// UPDATE_LEGACY_BASELINE=1 npx vitest run tests/legacyStyles.test.ts to rewrite
// tests/legacyStyles.baseline.json.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const baselinePath = path.join(__dirname, "legacyStyles.baseline.json");
const legacyClass =
  /(?<![\w-])(swiss-card-static|swiss-card|btn-primary|btn-secondary|btn-outline|ledger-table|badge-success|badge-warning|badge-error)(?![\w-])/g;
const skipDirs = new Set(["node_modules", "dist", "tests", "_generated"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return skipDirs.has(entry) ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

const files = [
  ...["components", "services", "lib"].flatMap((dir) => sourceFiles(path.join(root, dir))),
  path.join(root, "App.tsx"),
  path.join(root, "index.tsx"),
];

type Hit = { file: string; line: number; token: string };

function scan(): Hit[] {
  return files.flatMap((full) => {
    const file = path.relative(root, full).replace(/\\/g, "/");
    return readFileSync(full, "utf8")
      .split("\n")
      .flatMap((text, index) =>
        [...text.matchAll(legacyClass)].map((match) => ({ file, line: index + 1, token: match[1] }))
      );
  });
}

function countByFile(hits: Hit[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const hit of hits) counts[hit.file] = (counts[hit.file] ?? 0) + 1;
  return Object.fromEntries(Object.keys(counts).sort().map((file) => [file, counts[file]]));
}

describe("legacy Refined Ledger class ratchet", () => {
  it("adds no legacy classes and only lowers counts", () => {
    const hits = scan();
    const counts = countByFile(hits);

    if (process.env.UPDATE_LEGACY_BASELINE === "1") {
      writeFileSync(baselinePath, `${JSON.stringify(counts, null, 2)}\n`);
      return;
    }

    const known: Record<string, number> = JSON.parse(readFileSync(baselinePath, "utf8"));

    const grown = Object.keys(counts).filter((file) => counts[file] > (known[file] ?? 0));
    expect(
      hits.filter((hit) => grown.includes(hit.file)).map((hit) => `${hit.file}:${hit.line} ${hit.token}`),
      "New legacy Refined Ledger classes. Use the walkthrough kit in components/wizard/ui.tsx."
    ).toEqual([]);

    const shrunk = Object.keys(known).filter((file) => (counts[file] ?? 0) < known[file]);
    expect(
      shrunk.map((file) => `${file}: ${known[file]} -> ${counts[file] ?? 0}`),
      "Legacy classes were removed. Lower these counts in tests/legacyStyles.baseline.json."
    ).toEqual([]);
  });
});
