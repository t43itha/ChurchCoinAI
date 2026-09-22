/* global console, performance */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadTypeScript } from "./lib/load-typescript.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => loadTypeScript(path.join(root, "convex/intelligence/categorization", `${name}.ts`));
const { categorizeFromContext, mergeAIFallbackSafely } = await load("pipeline");
const { categorizeWithJev, mergeJevSuggestions, jevFallbackInput, jevRoutingMetrics } = await load("jev");
const { categorizeWithOpenRouter } = await load("openrouter");
const argv = process.argv.slice(2);
const option = (name, fallback) => argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback;
const datasetPath = path.resolve(option("--dataset", path.join(root, "evals/categorization/jev-holdout-2026-09-22.json")));
const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf8"));
const modes = option("--modes", "luna,jev-single,jev-batch").split(",");
const runs = Number(option("--runs", "1"));
if (!Number.isInteger(runs) || runs < 1 || runs > 5 || modes.some((mode) => !["luna", "jev-single", "jev-batch"].includes(mode))) throw new Error("Invalid evaluation options");
if (!Array.isArray(dataset.cases) || new Set(dataset.cases.map((row) => row.rowId)).size !== dataset.cases.length) throw new Error("Invalid case IDs");
console.log(`${dataset.cases.length} synthetic cases; modes ${modes.join(", ")}; ${runs} run(s). Production helpers with rules/defaults, excluding Convex/database/UI latency.`);
if (argv.includes("--dry-run")) process.exit(0);
if (!process.env.OPENROUTER_API_KEY) throw new Error("Set OPENROUTER_API_KEY in the server process environment.");

const records = [];
for (let run = 0; run < runs; run++) {
  // Rotate ordering between repeats to reduce systematic provider timing bias.
  for (const mode of [...modes.slice(run % modes.length), ...modes.slice(0, run % modes.length)]) {
    for (let offset = 0; offset < dataset.cases.length; offset += 20) {
      const cases = dataset.cases.slice(offset, offset + 20);
      const inputs = cases.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "expected")));
      const started = performance.now();
      let suggestions = categorizeFromContext(inputs, dataset.categories, dataset.funds, dataset.memories ?? []);
      const localCount = suggestions.filter((row) => row.predictionSource !== "none").length;
      let jev = null, fallback = null, fallbackError = null;
      if (mode !== "luna") {
        const unresolved = inputs.map((row, i) => ({ ...row,
          ...(suggestions[i].category ? { category: suggestions[i].category } : {}),
          ...(suggestions[i].fundId ? { fundId: suggestions[i].fundId } : {}),
        })).filter((_, i) => suggestions[i].predictionSource === "none");
        jev = await categorizeWithJev(unresolved, dataset.categories, dataset.funds, { batchSize: mode === "jev-batch" ? 10 : 1 });
        suggestions = mergeJevSuggestions(suggestions, jev.decisions, inputs, jev.failures);
      }
      const pending = inputs.map((row, i) => jevFallbackInput(row, suggestions[i])).filter((_, i) => suggestions[i].predictionSource === "none");
      const fallbackStarted = performance.now();
      if (pending.length) suggestions = await mergeAIFallbackSafely(suggestions, async () => {
        fallback = await categorizeWithOpenRouter(pending, dataset.categories, dataset.funds, suggestions.flatMap((row) => row.evidence));
        return { suggestions: fallback.suggestions, source: "openrouter" };
      }, inputs, dataset.categories, dataset.funds, (error) => { fallbackError = error instanceof Error ? error.message : String(error); });
      const knownCost = (jev === null || jev.costUsd !== null) && (!pending.length || typeof fallback?.usage.cost === "number");
      records.push({ run: run + 1, mode, offset, latencyMs: Math.round(performance.now() - started), fallbackMs: pending.length ? Math.round(performance.now() - fallbackStarted) : 0,
        localCount, fallbackRows: pending.length, fallbackFields: pending.reduce((count, row) => count + (row.requestedFields?.length ?? 3), 0), fallbackError,
        costUsd: knownCost ? (jev?.costUsd ?? 0) + (fallback?.usage.cost ?? 0) : null,
        inputTokens: (jev?.inputTokens ?? 0) + (fallback?.usage.prompt_tokens ?? 0),
        jev: jev ? { ...jev, routing: jevRoutingMetrics(jev) } : null,
        fallbackUsage: fallback?.usage ?? null, generationIds: fallback?.generationIds ?? [],
        rows: suggestions.map((prediction, i) => ({ rowId: inputs[i].rowId, expected: cases[i].expected, prediction,
          categoryCorrect: prediction.category === cases[i].expected.category,
          fundCorrect: prediction.fundName === cases[i].expected.fundName,
          donorCorrect: (prediction.donorName ?? "").toLowerCase() === (cases[i].expected.donorName ?? "").toLowerCase(),
        })),
      });
      console.log(`${mode} run ${run + 1} rows ${offset + 1}-${offset + cases.length}: ${records.at(-1).latencyMs} ms, ${pending.length} fallback rows`);
    }
  }
}
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)];
const summaries = modes.map((mode) => {
  const batches = records.filter((record) => record.mode === mode), rows = batches.flatMap((record) => record.rows);
  const percent = (fn) => Math.round(rows.filter(fn).length / rows.length * 10000) / 100;
  return { mode, rows: rows.length, category: percent((row) => row.categoryCorrect), fund: percent((row) => row.fundCorrect), joint: percent((row) => row.categoryCorrect && row.fundCorrect), donor: percent((row) => row.donorCorrect),
    costUsd: batches.every((record) => record.costUsd !== null) ? batches.reduce((n, record) => n + record.costUsd, 0) : null,
    inputTokens: batches.reduce((n, record) => n + record.inputTokens, 0),
    fallbackRows: batches.reduce((n, record) => n + record.fallbackRows, 0), fallbackFields: batches.reduce((n, record) => n + record.fallbackFields, 0),
    p50ms: percentile(batches.map((record) => record.latencyMs), .5), p95ms: percentile(batches.map((record) => record.latencyMs), .95),
    errors: batches.filter((record) => record.fallbackError || record.jev?.failedBatches).length,
  };
});
console.table(summaries);
const output = path.resolve(option("--out", path.join(root, "evals/categorization/results", `jev-pipeline-${Date.now()}.json`)));
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), dataset: path.relative(root, datasetPath), summaries, records }, null, 2));
console.log(`Results: ${output}`);
