/* global AbortController, clearTimeout, console, fetch, performance, setTimeout */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CASES_PATH = path.join(ROOT, "evals", "categorization", "cases.json");
const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const OPENAI_CHAT_API_URL = "https://api.openai.com/v1/chat/completions";

const INCOME_CATEGORIES = [
  "Tithes & First Fruits",
  "Offerings",
  "Thanksgiving",
  "Building Fund",
  "Charity Fund",
  "Gender Ministries",
  "Merchandise",
  "Uncategorised",
];

const EXPENDITURE_CATEGORIES = [
  "MP Honorarium",
  "MP Accommodation",
  "MP Refreshments",
  "Church Provisions",
  "Travel & Transport",
  "Gross Salary",
  "Allowances",
  "Rent",
  "Rent - Premises for Worship",
  "Premises - Manse",
  "Utilities",
  "Missions-Tithe",
  "Mission Support",
  "Bank Charges",
  "IT Costs",
  "Love Gifts",
];

const FUNDS = [
  "General Fund",
  "Building Fund",
  "Youth Ministry Fund",
  "Missions Fund",
  "Women's Ministry Fund",
];

const DEFAULT_MODELS = [
  { id: "google/gemini-2.5-flash-lite", reasoning: "none" },
  { id: "deepseek/deepseek-v4-flash-0731", reasoning: "none" },
  { id: "google/gemini-2.5-flash", reasoning: "none" },
  { id: "openai/gpt-4o-mini", reasoning: null },
  { id: "openai/gpt-5-nano", reasoning: "minimal" },
  { id: "openai/gpt-oss-20b", reasoning: "minimal" },
  { id: "mistralai/ministral-14b-2512", reasoning: null },
  { id: "openai/gpt-5.6-luna", reasoning: "none" },
];

const MODEL_SETTINGS = new Map(DEFAULT_MODELS.map((model) => [model.id, model]));

const SYSTEM_PROMPT = `You classify synthetic UK church bank transactions.
Return exactly one prediction for every supplied rowId using the required JSON schema.

Rules:
- Use only a category permitted for the transaction's Income or Expenditure type.
- Use only one of the supplied funds. Use General Fund when there is no clear restricted or designated fund reference.
- [GA] means the named individual has a valid Gift Aid declaration. Gift Aid is true only when [GA] is present and the payment is from an identifiable individual.
- Cash, card-reader totals, companies, councils, trusts, foundations, grants, sales, refunds, and expenditure are not Gift Aid eligible.
- donorName is only an identifiable individual donor. Do not return company, charity, trust, council, supplier, pastor, employee, or speaker names as donorName.
- If an Income description has no supported purpose, use Uncategorised. Never use an Expenditure category for Income.
- Charity Fund is for explicit charitable activity, outreach, relief, community, youth charity, or overseas mission income. Do not use it for a generic donation.
- Gender Ministries is for explicit women's or men's ministry income.
- Building Fund is for explicit building, roof, renovation, or premises appeals and their fundraising receipts.
- Thanksgiving is only for an explicit thanksgiving gift or service; generic donations and offerings use Offerings.
- Premises - Manse is for costs tied explicitly to the minister's residence, including its utilities and council tax.
- Rent - Premises for Worship is for hired worship space. Generic non-worship rent uses Rent.
- MP categories are major-program costs: speaker honoraria, guest accommodation, and event refreshments.
- Missions-Tithe is an explicit church tithe allocation to missions. Other mission payments use Mission Support.
- Do not invent category names, fund names, or donors.
- Evidence must be a short phrase based only on the transaction description.`;

function parseArgs(argv) {
  const options = {
    chunkSize: 10,
    runs: 1,
    dryRun: false,
    zdr: false,
    out: null,
    dataset: DEFAULT_CASES_PATH,
    limit: null,
    provider: "openrouter",
    models: DEFAULT_MODELS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--zdr") options.zdr = true;
    else if (arg === "--chunk-size") options.chunkSize = Number(argv[++index]);
    else if (arg === "--runs") options.runs = Number(argv[++index]);
    else if (arg === "--out") options.out = path.resolve(argv[++index]);
    else if (arg === "--dataset") options.dataset = path.resolve(argv[++index]);
    else if (arg === "--limit") options.limit = Number(argv[++index]);
    else if (arg === "--provider") options.provider = argv[++index];
    else if (arg === "--models") {
      options.models = argv[++index]
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
        .map((id) => MODEL_SETTINGS.get(id) || { id, reasoning: null });
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.chunkSize) || options.chunkSize < 1 || options.chunkSize > 50) {
    throw new Error("--chunk-size must be an integer from 1 to 50");
  }
  if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 10) {
    throw new Error("--runs must be an integer from 1 to 10");
  }
  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }
  if (options.models.length === 0) throw new Error("At least one model is required");
  if (!["openrouter", "openai", "openai-chat"].includes(options.provider)) {
    throw new Error("--provider must be openrouter, openai, or openai-chat");
  }
  return options;
}

function parseDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function resolveApiKey(provider) {
  if (["openai", "openai-chat"].includes(provider)) {
    return process.env.OPENAI_API_KEY || null;
  }
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const hermesHome = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "hermes")
    : path.join(os.homedir(), ".hermes");
  return parseDotEnv(path.join(hermesHome, ".env")).OPENROUTER_API_KEY || null;
}

function openAIDirectBody(model, chunk) {
  return {
    model: model.id,
    instructions: SYSTEM_PROMPT,
    input: JSON.stringify({
      incomeCategories: INCOME_CATEGORIES,
      expenditureCategories: EXPENDITURE_CATEGORIES,
      funds: FUNDS,
      transactions: chunk.map(({ id, description, amount, type }) => ({
        rowId: id,
        description,
        amount,
        type,
      })),
    }),
    reasoning: { effort: "none" },
    text: {
      format: {
        type: "json_schema",
        name: "churchcoin_categorization_eval",
        strict: true,
        schema: schemaFor(),
      },
    },
    max_output_tokens: Math.max(4000, chunk.length * 300),
    store: false,
  };
}

function openAIChatBody(model, chunk, options) {
  const body = requestBody(model, chunk, options);
  const maxCompletionTokens = body.max_tokens;
  delete body.provider;
  delete body.reasoning;
  delete body.max_tokens;
  return {
    ...body,
    model: model.id.replace(/^openai\//, ""),
    reasoning_effort: "none",
    max_completion_tokens: maxCompletionTokens,
    store: false,
  };
}

function loadCaseFile(filePath, visited = new Set()) {
  const resolvedPath = path.resolve(filePath);
  if (visited.has(resolvedPath)) throw new Error(`Circular dataset include: ${resolvedPath}`);
  visited.add(resolvedPath);
  const payload = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  if (Array.isArray(payload)) return payload;
  if (!payload || !Array.isArray(payload.cases)) {
    throw new Error(`${resolvedPath} must contain an array or an object with a cases array`);
  }
  const included = payload.include
    ? loadCaseFile(path.resolve(path.dirname(resolvedPath), payload.include), visited)
    : [];
  return [...included, ...payload.cases];
}

function loadCases(filePath) {
  const cases = loadCaseFile(filePath);
  const ids = new Set();
  for (const item of cases) {
    if (!item.id || ids.has(item.id)) throw new Error(`Invalid or duplicate case id: ${item.id}`);
    ids.add(item.id);
    const allowed = item.type === "Income" ? INCOME_CATEGORIES : EXPENDITURE_CATEGORIES;
    if (!allowed.includes(item.expected.category)) {
      throw new Error(`${item.id} has invalid expected category ${item.expected.category}`);
    }
    if (!FUNDS.includes(item.expected.fundName)) {
      throw new Error(`${item.id} has invalid expected fund ${item.expected.fundName}`);
    }
  }
  return cases;
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function schemaFor() {
  return {
    type: "object",
    properties: {
      predictions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            rowId: { type: "string" },
            category: { type: "string", enum: [...INCOME_CATEGORIES, ...EXPENDITURE_CATEGORIES] },
            fundName: { type: "string", enum: FUNDS },
            confidence: { type: "string", enum: ["High", "Medium", "Low"] },
            isGiftAidEligible: { type: "boolean" },
            donorName: { type: ["string", "null"] },
            evidence: { type: "string" },
          },
          required: [
            "rowId",
            "category",
            "fundName",
            "confidence",
            "isGiftAidEligible",
            "donorName",
            "evidence",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["predictions"],
    additionalProperties: false,
  };
}

function requestBody(model, chunk, options) {
  const body = {
    model: model.id,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          incomeCategories: INCOME_CATEGORIES,
          expenditureCategories: EXPENDITURE_CATEGORIES,
          funds: FUNDS,
          transactions: chunk.map(({ id, description, amount, type }) => ({
            rowId: id,
            description,
            amount,
            type,
          })),
        }),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "churchcoin_categorization_eval",
        strict: true,
        schema: schemaFor(),
      },
    },
    max_tokens: Math.max(4000, chunk.length * 300),
    provider: {
      allow_fallbacks: false,
      require_parameters: true,
      data_collection: "deny",
      ...(options.zdr ? { zdr: true } : {}),
    },
  };
  if (model.reasoning) body.reasoning = { effort: model.reasoning, exclude: true };
  return body;
}

async function sleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function callOpenRouter(apiKey, body, attempt = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  const startedAt = performance.now();
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://churchcoin.ai",
        "X-Title": "ChurchCoin categorization eval",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    const latencyMs = performance.now() - startedAt;
    if (!response.ok) {
      if (attempt === 0 && [429, 502, 503].includes(response.status)) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 10_000) : 1500);
        return callOpenRouter(apiKey, body, attempt + 1);
      }
      const errorDetail = payload.error?.metadata
        ? ` ${JSON.stringify(payload.error.metadata)}`
        : "";
      throw new Error(
        `OpenRouter ${response.status}: ${payload.error?.message || response.statusText}${errorDetail}`
      );
    }
    return { payload, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}

function openAIOutputText(payload) {
  for (const output of payload.output || []) {
    if (output.type !== "message") continue;
    for (const content of output.content || []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  return "";
}

function directOpenAIUsage(usage) {
  const inputTokens = usage?.input_tokens ?? usage?.prompt_tokens ?? 0;
  const cachedTokens = usage?.input_tokens_details?.cached_tokens
    ?? usage?.prompt_tokens_details?.cached_tokens
    ?? 0;
  const outputTokens = usage?.output_tokens ?? usage?.completion_tokens ?? 0;
  const reasoningTokens = usage?.output_tokens_details?.reasoning_tokens
    ?? usage?.completion_tokens_details?.reasoning_tokens
    ?? 0;
  const uncachedTokens = Math.max(0, inputTokens - cachedTokens);
  return {
    prompt_tokens: inputTokens,
    completion_tokens: outputTokens,
    completion_tokens_details: { reasoning_tokens: reasoningTokens },
    cost:
      uncachedTokens * 0.000001 +
      cachedTokens * 0.0000001 +
      outputTokens * 0.000006,
  };
}

async function callOpenAIDirect(apiKey, body, attempt = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  const startedAt = performance.now();
  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    const latencyMs = performance.now() - startedAt;
    if (!response.ok) {
      if (attempt === 0 && [429, 500, 502, 503].includes(response.status)) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 10_000) : 1500);
        return callOpenAIDirect(apiKey, body, attempt + 1);
      }
      throw new Error(`OpenAI ${response.status}: ${payload.error?.message || response.statusText}`);
    }
    if (payload.status === "incomplete") {
      throw new Error(`OpenAI response incomplete: ${payload.incomplete_details?.reason || "unknown"}`);
    }
    return { payload, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAIChat(apiKey, body, attempt = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  const startedAt = performance.now();
  try {
    const response = await fetch(OPENAI_CHAT_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    const latencyMs = performance.now() - startedAt;
    if (!response.ok) {
      if (attempt === 0 && [429, 500, 502, 503].includes(response.status)) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 10_000) : 1500);
        return callOpenAIChat(apiKey, body, attempt + 1);
      }
      throw new Error(
        `OpenAI Chat ${response.status}: ${payload.error?.message || response.statusText}`
      );
    }
    return { payload, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}

function normalized(value) {
  if (value === null || value === undefined) return "";
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function scoreModel(cases, requestRecords) {
  const casesById = new Map(cases.map((item) => [item.id, item]));
  const duplicateIds = new Set();
  const rows = [];

  for (const record of requestRecords) {
    const predictionsById = new Map();
    for (const prediction of record.predictions || []) {
      if (predictionsById.has(prediction.rowId)) duplicateIds.add(`${record.run}:${prediction.rowId}`);
      else predictionsById.set(prediction.rowId, prediction);
    }

    for (const caseId of record.caseIds) {
      const item = casesById.get(caseId);
      const predicted = predictionsById.get(caseId) || null;
    const categoryCorrect = normalized(predicted?.category) === normalized(item.expected.category);
    const fundCorrect = normalized(predicted?.fundName) === normalized(item.expected.fundName);
    const giftAidCorrect = predicted?.isGiftAidEligible === item.expected.isGiftAidEligible;
      const donorCorrect = Boolean(predicted)
        && normalized(predicted.donorName) === normalized(item.expected.donorName);
    const allowed = item.type === "Income" ? INCOME_CATEGORIES : EXPENDITURE_CATEGORIES;
    const typeViolation = Boolean(predicted) && !allowed.includes(predicted.category);
      rows.push({
        run: record.run,
        id: item.id,
      difficulty: item.difficulty,
      expected: item.expected,
      predicted,
      categoryCorrect,
      fundCorrect,
      giftAidCorrect,
      donorCorrect,
      allFieldsCorrect: categoryCorrect && fundCorrect && giftAidCorrect && donorCorrect,
      typeViolation,
      });
    }
  }

  const countCorrect = (field) => rows.filter((row) => row[field]).length;
  const accuracy = (field) => Number((countCorrect(field) / rows.length).toFixed(4));
  const difficulty = Object.fromEntries(
    [...new Set(rows.map((row) => row.difficulty))].map((name) => {
      const subset = rows.filter((row) => row.difficulty === name);
      return [name, {
        count: subset.length,
        categoryAccuracy: Number((subset.filter((row) => row.categoryCorrect).length / subset.length).toFixed(4)),
        allFieldsAccuracy: Number((subset.filter((row) => row.allFieldsCorrect).length / subset.length).toFixed(4)),
      }];
    })
  );

  const usage = requestRecords.reduce(
    (total, record) => {
      const item = record.usage || {};
      total.promptTokens += item.prompt_tokens || 0;
      total.completionTokens += item.completion_tokens || 0;
      total.reasoningTokens += item.completion_tokens_details?.reasoning_tokens || 0;
      total.cost += item.cost || 0;
      return total;
    },
    { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, cost: 0 }
  );
  usage.cost = Number(usage.cost.toFixed(8));
  const latencies = requestRecords.map((record) => record.latencyMs).filter(Number.isFinite);
  const rowsByCase = new Map();
  for (const row of rows) {
    const caseRows = rowsByCase.get(row.id) || [];
    caseRows.push(row);
    rowsByCase.set(row.id, caseRows);
  }
  const completeCaseRows = [...rowsByCase.values()].filter(
    (caseRows) => caseRows.length > 1 && caseRows.every((row) => row.predicted)
  );
  const categoryStable = completeCaseRows.filter((caseRows) =>
    caseRows.every(
      (row) => normalized(row.predicted.category) === normalized(caseRows[0].predicted.category)
    )
  ).length;
  const allFieldsStable = completeCaseRows.filter((caseRows) =>
    caseRows.every((row) =>
      ["category", "fundName", "isGiftAidEligible", "donorName"].every(
        (field) => normalized(row.predicted[field]) === normalized(caseRows[0].predicted[field])
      )
    )
  ).length;

  return {
    metrics: {
      rows: rows.length,
      categoryAccuracy: accuracy("categoryCorrect"),
      fundAccuracy: accuracy("fundCorrect"),
      giftAidAccuracy: accuracy("giftAidCorrect"),
      donorAccuracy: accuracy("donorCorrect"),
      allFieldsAccuracy: accuracy("allFieldsCorrect"),
      typeViolationRate: Number((rows.filter((row) => row.typeViolation).length / rows.length).toFixed(4)),
      missingPredictions: rows.filter((row) => !row.predicted).length,
      duplicatePredictions: duplicateIds.size,
      requestErrors: requestRecords.filter((record) => record.error).length,
      consistency: {
        comparableCases: completeCaseRows.length,
        category: completeCaseRows.length
          ? Number((categoryStable / completeCaseRows.length).toFixed(4))
          : null,
        allFields: completeCaseRows.length
          ? Number((allFieldsStable / completeCaseRows.length).toFixed(4))
          : null,
      },
      difficulty,
      latencyMs: {
        mean: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null,
        p50: latencies.length ? Math.round(percentile(latencies, 0.5)) : null,
        p95: latencies.length ? Math.round(percentile(latencies, 0.95)) : null,
      },
      usage,
      providers: [...new Set(requestRecords.map((record) => record.provider).filter(Boolean))],
    },
    rows,
  };
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function printSummary(results) {
  const rows = results.map((result) => ({
    model: result.model,
    exact: formatPercent(result.metrics.allFieldsAccuracy),
    category: formatPercent(result.metrics.categoryAccuracy),
    fund: formatPercent(result.metrics.fundAccuracy),
    giftAid: formatPercent(result.metrics.giftAidAccuracy),
    donor: formatPercent(result.metrics.donorAccuracy),
    p50ms: result.metrics.latencyMs.p50 ?? "-",
    p95ms: result.metrics.latencyMs.p95 ?? "-",
    tokens: result.metrics.usage.promptTokens + result.metrics.usage.completionTokens,
    costUsd: result.metrics.usage.cost.toFixed(5),
    errors: result.metrics.requestErrors,
  }));
  console.table(rows);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const loadedCases = loadCases(options.dataset);
  const cases = options.limit === null
    ? loadedCases
    : loadedCases.slice(0, options.limit);
  const caseChunks = chunks(cases, options.chunkSize);
  const totalRequests = options.models.length * caseChunks.length * options.runs;
  console.log(`Validated ${cases.length} synthetic cases across ${caseChunks.length} chunks.`);
  console.log(`Models: ${options.models.map((model) => model.id).join(", ")}`);
  console.log(`Provider: ${options.provider}`);
  console.log(`Planned API requests: ${totalRequests}`);
  if (options.dryRun) {
    console.log("Dry run complete; no external requests were made.");
    return;
  }

  const apiKey = resolveApiKey(options.provider);
  if (!apiKey) {
    throw new Error(
      ["openai", "openai-chat"].includes(options.provider)
        ? "OPENAI_API_KEY was not found in the process environment."
        : "OPENROUTER_API_KEY was not found in the process environment or Hermes .env file. Configure it in Hermes, then rerun."
    );
  }

  const results = [];
  for (const model of options.models) {
    console.log(`\nEvaluating ${model.id}`);
    const requestRecords = [];
    for (let run = 1; run <= options.runs; run += 1) {
      for (let chunkIndex = 0; chunkIndex < caseChunks.length; chunkIndex += 1) {
        const chunk = caseChunks[chunkIndex];
        process.stdout.write(`  run ${run}/${options.runs}, chunk ${chunkIndex + 1}/${caseChunks.length} ... `);
        try {
          const { payload, latencyMs } = options.provider === "openai"
            ? await callOpenAIDirect(apiKey, openAIDirectBody(model, chunk))
            : options.provider === "openai-chat"
              ? await callOpenAIChat(apiKey, openAIChatBody(model, chunk, options))
              : await callOpenRouter(apiKey, requestBody(model, chunk, options));
          const content = options.provider === "openai"
            ? openAIOutputText(payload)
            : payload.choices?.[0]?.message?.content;
          const parsed = typeof content === "string" ? JSON.parse(content) : content;
          requestRecords.push({
            run,
            chunkIndex,
            caseIds: chunk.map((item) => item.id),
            latencyMs,
            provider: options.provider === "openai"
              ? "OpenAI Direct"
              : options.provider === "openai-chat"
                ? "OpenAI Direct Chat"
                : payload.provider || null,
            usage: ["openai", "openai-chat"].includes(options.provider)
              ? directOpenAIUsage(payload.usage)
              : payload.usage || {},
            predictions: Array.isArray(parsed?.predictions) ? parsed.predictions : [],
            generationId: payload.id || null,
          });
          console.log(`${Math.round(latencyMs)} ms`);
        } catch (error) {
          requestRecords.push({
            run,
            chunkIndex,
            caseIds: chunk.map((item) => item.id),
            latencyMs: null,
            provider: null,
            usage: {},
            predictions: [],
            error: error instanceof Error ? error.message : String(error),
          });
          console.log(`failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    const scored = scoreModel(cases, requestRecords);
    results.push({ model: model.id, ...scored, requests: requestRecords });
  }

  printSummary(results);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = options.out || path.join(ROOT, "evals", "categorization", "results", `${timestamp}.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      dataset: path.relative(ROOT, options.dataset),
      options: { ...options, models: options.models.map((model) => model.id) },
      results,
    }, null, 2)
  );
  console.log(`Results written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
