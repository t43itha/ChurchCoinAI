# Transaction Categorisation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a type-safe, layered transaction categorisation engine that learns from reviewed transactions, protects income/expenditure reporting buckets, and reduces Gemini calls.

**Architecture:** Add a focused `convex/intelligence/categorization/` module with pure helpers for normalization, category resolution, rules, model validation, and confidence handling, then wire those helpers into Convex actions/mutations. The runtime pipeline resolves suggestions in this order: memory, rules, RAG, Gemini Flash-Lite fallback, then feedback learning after review.

**Tech Stack:** TypeScript, React 19, Convex actions/mutations/queries, Convex RAG, Gemini API via `@google/genai`, Vitest.

---

## File Structure

Create these focused modules:

- `convex/intelligence/categorization/types.ts` - shared transaction, category, suggestion, feedback, and confidence types.
- `convex/intelligence/categorization/categoryResolver.ts` - type-safe category filtering, alias resolution, and reporting main-category fallback.
- `convex/intelligence/categorization/normalize.ts` - deterministic description normalization and memory signature generation.
- `convex/intelligence/categorization/confidence.ts` - numeric confidence to label mapping and source defaults.
- `convex/intelligence/categorization/rules.ts` - deterministic transaction rules.
- `convex/intelligence/categorization/gemini.ts` - model constants, Gemini prompt construction, response validation.
- `convex/intelligence/categorization/memory.ts` - memory record confidence calculations and DB lookup/upsert helpers.
- `convex/intelligence/categorization/rag.ts` - RAG metadata conversion, search result validation, and RAG suggestion selection.
- `convex/intelligence/categorization/pipeline.ts` - orchestration used by public AI actions.
- `convex/intelligence/categorization/feedback.ts` - feedback event construction and memory/RAG learning helpers.

Modify existing files:

- `convex/schema.ts` - add `transactionCategorizationMemory` and `categorizationFeedbackEvents`.
- `convex/actions/ai.ts` - route import categorisation through the new pipeline and centralize model names.
- `convex/intelligence/ragIndexer.ts` - store metadata and replacement keys in RAG.
- `convex/intelligence/bootstrapRAG.ts` - index metadata and key existing transactions by memory signature or transaction key.
- `convex/mutations/transactions.ts` - record detailed feedback after import and on manual updates.
- `convex/mutations/categories.ts` - add category type backfill maintenance mutation.
- `convex/queries/reports.ts` - use the shared category resolver behavior for type-aware reporting fallback.
- `components/TransactionManager.tsx` - preserve source/confidence metadata for all suggestion sources and submit reviewed feedback fields.

Create or update tests:

- `tests/categorization.categoryResolver.test.ts`
- `tests/categorization.normalize.test.ts`
- `tests/categorization.rules.test.ts`
- `tests/categorization.gemini.test.ts`
- `tests/categorization.confidence.test.ts`
- `tests/categorization.memory.test.ts`
- Update existing `tests/aiValidation.test.ts` only if shared validation moves.

---

## Task 1: Add Shared Types And Confidence Helpers

**Files:**
- Create: `convex/intelligence/categorization/types.ts`
- Create: `convex/intelligence/categorization/confidence.ts`
- Test: `tests/categorization.confidence.test.ts`

- [ ] **Step 1: Write the failing confidence tests**

Create `tests/categorization.confidence.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  confidenceLabel,
  defaultConfidenceForSource,
  isHighConfidence,
} from "../convex/intelligence/categorization/confidence";

describe("categorization confidence helpers", () => {
  it("maps numeric confidence to labels", () => {
    expect(confidenceLabel(0.95)).toBe("High");
    expect(confidenceLabel(0.85)).toBe("High");
    expect(confidenceLabel(0.7)).toBe("Medium");
    expect(confidenceLabel(0.64)).toBe("Low");
  });

  it("identifies high confidence suggestions", () => {
    expect(isHighConfidence(0.9)).toBe(true);
    expect(isHighConfidence(0.849)).toBe(false);
  });

  it("assigns conservative source defaults", () => {
    expect(defaultConfidenceForSource("memory")).toBe(0.95);
    expect(defaultConfidenceForSource("rule")).toBe(0.9);
    expect(defaultConfidenceForSource("rag")).toBe(0.86);
    expect(defaultConfidenceForSource("gemini")).toBe(0.72);
    expect(defaultConfidenceForSource("none")).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm test -- tests/categorization.confidence.test.ts
```

Expected: FAIL because `convex/intelligence/categorization/confidence` does not exist.

- [ ] **Step 3: Create shared types**

Create `convex/intelligence/categorization/types.ts`:

```ts
import { Id } from "../../_generated/dataModel";

export type TransactionType = "Income" | "Expenditure";

export type CategorizationSource = "memory" | "rule" | "rag" | "gemini" | "none";

export type ConfidenceLabel = "High" | "Medium" | "Low";

export type CategoryLike = {
  _id?: Id<"categories"> | string;
  name: string;
  mainCategory?: string;
  transactionType?: TransactionType;
  displayOrder?: number;
};

export type FundLike = {
  _id: Id<"funds"> | string;
  name: string;
};

export type CategorizationInput = {
  description: string;
  amount: number;
  type: TransactionType;
};

export type NormalizedTransaction = CategorizationInput & {
  normalizedDescription: string;
  tokens: string[];
  payeeHint: string | null;
  amountBucket: string;
  signature: string;
};

export type CategorizationEvidence = {
  source: CategorizationSource;
  reason: string;
  matchedDescription?: string;
  score?: number;
};

export type CategorizationSuggestion = {
  description: string;
  amount: number;
  type: TransactionType;
  category: string;
  categoryTransactionType?: TransactionType;
  fundName: string;
  fundId?: string;
  confidence: number;
  confidenceLabel: ConfidenceLabel;
  isGiftAidEligible: boolean;
  donorName?: string | null;
  predictionSource: CategorizationSource;
  ragScore?: number;
  requiresReview: boolean;
  evidence: CategorizationEvidence[];
};
```

- [ ] **Step 4: Implement confidence helpers**

Create `convex/intelligence/categorization/confidence.ts`:

```ts
import {
  CategorizationSource,
  ConfidenceLabel,
} from "./types";

export const confidenceLabel = (confidence: number): ConfidenceLabel => {
  if (confidence >= 0.85) return "High";
  if (confidence >= 0.65) return "Medium";
  return "Low";
};

export const isHighConfidence = (confidence: number): boolean =>
  confidence >= 0.85;

export const defaultConfidenceForSource = (
  source: CategorizationSource
): number => {
  switch (source) {
    case "memory":
      return 0.95;
    case "rule":
      return 0.9;
    case "rag":
      return 0.86;
    case "gemini":
      return 0.72;
    case "none":
      return 0;
  }
};
```

- [ ] **Step 5: Run the test and verify it passes**

Run:

```powershell
npm test -- tests/categorization.confidence.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add convex/intelligence/categorization/types.ts convex/intelligence/categorization/confidence.ts tests/categorization.confidence.test.ts
git commit -m "feat: add categorisation confidence types"
```

---

## Task 2: Add Type-Safe Category Resolver

**Files:**
- Create: `convex/intelligence/categorization/categoryResolver.ts`
- Test: `tests/categorization.categoryResolver.test.ts`
- Later integration targets: `convex/queries/reports.ts`, `convex/actions/ai.ts`

- [ ] **Step 1: Write the failing resolver tests**

Create `tests/categorization.categoryResolver.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  allowedCategoriesForType,
  resolveCategoryForTransaction,
  resolveReportingMainCategory,
} from "../convex/intelligence/categorization/categoryResolver";
import { CategoryLike } from "../convex/intelligence/categorization/types";

const categories: CategoryLike[] = [
  { name: "Tithes & First Fruits", mainCategory: "Donations", transactionType: "Income" },
  { name: "Offerings", mainCategory: "Donations", transactionType: "Income" },
  { name: "Bank Charges", mainCategory: "Admin & Governance", transactionType: "Expenditure" },
  { name: "Utilities", mainCategory: "Premises Costs", transactionType: "Expenditure" },
  { name: "Legacy", mainCategory: "Other" },
];

describe("category resolver", () => {
  it("filters categories by transaction type and excludes unknown type", () => {
    expect(allowedCategoriesForType(categories, "Income").map((c) => c.name)).toEqual([
      "Tithes & First Fruits",
      "Offerings",
    ]);
    expect(allowedCategoriesForType(categories, "Expenditure").map((c) => c.name)).toEqual([
      "Bank Charges",
      "Utilities",
    ]);
  });

  it("resolves aliases only when the canonical category type matches", () => {
    expect(resolveCategoryForTransaction("Tithe", "Income", categories)?.name).toBe(
      "Tithes & First Fruits"
    );
    expect(resolveCategoryForTransaction("Tithe", "Expenditure", categories)).toBeNull();
  });

  it("rejects mismatched and unknown type categories", () => {
    expect(resolveCategoryForTransaction("Bank Charges", "Income", categories)).toBeNull();
    expect(resolveCategoryForTransaction("Legacy", "Income", categories)).toBeNull();
  });

  it("returns reporting fallback by transaction type", () => {
    expect(resolveReportingMainCategory("Missing", "Income", categories)).toBe("Other Income");
    expect(resolveReportingMainCategory("Missing", "Expenditure", categories)).toBe(
      "Admin & Governance"
    );
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm test -- tests/categorization.categoryResolver.test.ts
```

Expected: FAIL because the resolver module does not exist.

- [ ] **Step 3: Implement the resolver**

Create `convex/intelligence/categorization/categoryResolver.ts`:

```ts
import { CATEGORY_ALIASES } from "../../../constants/rciCategories";
import { CategoryLike, TransactionType } from "./types";

const normalizeCategoryName = (value: string): string =>
  value.trim().toLowerCase();

export const allowedCategoriesForType = (
  categories: CategoryLike[],
  transactionType: TransactionType
): CategoryLike[] =>
  categories
    .filter((category) => category.transactionType === transactionType)
    .sort((a, b) => {
      const orderA = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

export const resolveCategoryForTransaction = (
  categoryName: string,
  transactionType: TransactionType,
  categories: CategoryLike[]
): CategoryLike | null => {
  const rawName = categoryName.trim();
  if (!rawName) return null;

  const canonicalName = CATEGORY_ALIASES[rawName] ?? rawName;
  const normalized = normalizeCategoryName(canonicalName);

  const match = categories.find(
    (category) =>
      normalizeCategoryName(category.name) === normalized &&
      category.transactionType === transactionType
  );

  return match ?? null;
};

export const resolveReportingMainCategory = (
  categoryName: string,
  transactionType: TransactionType,
  categories: CategoryLike[]
): string => {
  const resolved = resolveCategoryForTransaction(
    categoryName,
    transactionType,
    categories
  );

  if (resolved?.mainCategory) return resolved.mainCategory;
  return transactionType === "Income" ? "Other Income" : "Admin & Governance";
};

export const categoryNamesForPrompt = (
  categories: CategoryLike[],
  transactionType: TransactionType
): string[] =>
  allowedCategoriesForType(categories, transactionType).map(
    (category) => category.name
  );
```

- [ ] **Step 4: Run the resolver test**

Run:

```powershell
npm test -- tests/categorization.categoryResolver.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add convex/intelligence/categorization/categoryResolver.ts tests/categorization.categoryResolver.test.ts
git commit -m "feat: add type-safe category resolver"
```

---

## Task 3: Add Normalization And Signatures

**Files:**
- Create: `convex/intelligence/categorization/normalize.ts`
- Test: `tests/categorization.normalize.test.ts`

- [ ] **Step 1: Write failing normalization tests**

Create `tests/categorization.normalize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  amountBucket,
  normalizeDescription,
  normalizeTransaction,
} from "../convex/intelligence/categorization/normalize";

describe("transaction normalization", () => {
  it("normalizes common bank noise and punctuation", () => {
    expect(normalizeDescription("FT-J SMITH   TITHE Ref: 1234")).toBe(
      "j smith tithe"
    );
  });

  it("uses exact amount buckets for expenses", () => {
    expect(amountBucket(12.5, "Expenditure")).toBe("exact:12.50");
  });

  it("uses rounded amount buckets for income", () => {
    expect(amountBucket(102.49, "Income")).toBe("band:100");
    expect(amountBucket(107.5, "Income")).toBe("band:110");
  });

  it("creates type-safe deterministic signatures", () => {
    const normalized = normalizeTransaction({
      description: "Standing Order - J Smith Tithe",
      amount: 100,
      type: "Income",
    });

    expect(normalized.signature).toBe("Income:j smith tithe:band:100");
    expect(normalized.tokens).toContain("smith");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm test -- tests/categorization.normalize.test.ts
```

Expected: FAIL because `normalize.ts` does not exist.

- [ ] **Step 3: Implement normalization**

Create `convex/intelligence/categorization/normalize.ts`:

```ts
import {
  CategorizationInput,
  NormalizedTransaction,
  TransactionType,
} from "./types";

const BANK_NOISE_PATTERNS = [
  /\bstanding\s+order\b/g,
  /\bfaster\s+payment\b/g,
  /\bpayment\b/g,
  /\btransfer\b/g,
  /\btfr\b/g,
  /\bref\b/g,
  /\breference\b/g,
  /\bft\b/g,
  /\bso\b/g,
  /\bfp\b/g,
  /\b[0-9]{3,}\b/g,
];

export const normalizeDescription = (description: string): string => {
  let normalized = description.toLowerCase();
  normalized = normalized.replace(/[-_/.,:;()]/g, " ");
  for (const pattern of BANK_NOISE_PATTERNS) {
    normalized = normalized.replace(pattern, " ");
  }
  return normalized.replace(/\s+/g, " ").trim();
};

export const amountBucket = (
  amount: number,
  transactionType: TransactionType
): string => {
  if (transactionType === "Expenditure") {
    return `exact:${amount.toFixed(2)}`;
  }
  const rounded = Math.round(amount / 10) * 10;
  return `band:${rounded}`;
};

export const extractPayeeHint = (normalizedDescription: string): string | null => {
  const tokens = normalizedDescription.split(" ").filter(Boolean);
  const meaningful = tokens.filter((token) => token.length > 1);
  if (meaningful.length === 0) return null;
  return meaningful.slice(0, 3).join(" ");
};

export const normalizeTransaction = (
  transaction: CategorizationInput
): NormalizedTransaction => {
  const normalizedDescription = normalizeDescription(transaction.description);
  const tokens = normalizedDescription.split(" ").filter(Boolean);
  const bucket = amountBucket(transaction.amount, transaction.type);
  return {
    ...transaction,
    normalizedDescription,
    tokens,
    payeeHint: extractPayeeHint(normalizedDescription),
    amountBucket: bucket,
    signature: `${transaction.type}:${normalizedDescription}:${bucket}`,
  };
};
```

- [ ] **Step 4: Run normalization tests**

Run:

```powershell
npm test -- tests/categorization.normalize.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add convex/intelligence/categorization/normalize.ts tests/categorization.normalize.test.ts
git commit -m "feat: add transaction normalisation"
```

---

## Task 4: Add Schema Tables For Memory And Feedback

**Files:**
- Modify: `convex/schema.ts`
- Validate: `npx tsc --noEmit`

- [ ] **Step 1: Add schema tables**

In `convex/schema.ts`, add these tables near `categorizationCorrections`:

```ts
  transactionCategorizationMemory: defineTable({
    organizationId: v.id("organizations"),
    signature: v.string(),
    descriptionExample: v.string(),
    transactionType: v.union(v.literal("Income"), v.literal("Expenditure")),
    category: v.string(),
    fundId: v.id("funds"),
    isGiftAidEligible: v.optional(v.boolean()),
    donorName: v.optional(v.string()),
    sourceTransactionId: v.optional(v.id("transactions")),
    acceptedCount: v.number(),
    correctedCount: v.number(),
    lastAcceptedAt: v.number(),
    lastCorrectedAt: v.optional(v.number()),
    confidence: v.number(),
  })
    .index("by_organization_signature", ["organizationId", "signature"])
    .index("by_organization_type", ["organizationId", "transactionType"])
    .index("by_organization_lastAccepted", ["organizationId", "lastAcceptedAt"]),

  categorizationFeedbackEvents: defineTable({
    organizationId: v.id("organizations"),
    transactionId: v.id("transactions"),
    signature: v.string(),
    transactionType: v.union(v.literal("Income"), v.literal("Expenditure")),
    source: v.union(
      v.literal("memory"),
      v.literal("rule"),
      v.literal("rag"),
      v.literal("gemini"),
      v.literal("none")
    ),
    confidence: v.number(),
    originalCategory: v.optional(v.string()),
    finalCategory: v.string(),
    categoryChanged: v.boolean(),
    originalFundId: v.optional(v.id("funds")),
    finalFundId: v.id("funds"),
    fundChanged: v.boolean(),
    originalGiftAidEligible: v.optional(v.boolean()),
    finalGiftAidEligible: v.optional(v.boolean()),
    giftAidChanged: v.boolean(),
    originalDonorName: v.optional(v.string()),
    finalDonorName: v.optional(v.string()),
    donorNameChanged: v.boolean(),
    learned: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_transaction", ["transactionId"])
    .index("by_organization_source", ["organizationId", "source"]),
```

- [ ] **Step 2: Type-check**

Run:

```powershell
npx tsc --noEmit
```

Expected: PASS. If generated Convex types are stale, run `npx convex dev --once` in a separate implementation session and rerun typecheck.

- [ ] **Step 3: Commit**

```powershell
git add convex/schema.ts
git commit -m "feat: add categorisation memory schema"
```

---

## Task 5: Add Memory Confidence Helpers

**Files:**
- Create: `convex/intelligence/categorization/memory.ts`
- Test: `tests/categorization.memory.test.ts`

- [ ] **Step 1: Write failing memory tests**

Create `tests/categorization.memory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  confidenceFromCounts,
  shouldUseMemorySuggestion,
} from "../convex/intelligence/categorization/memory";

describe("categorization memory helpers", () => {
  it("increases confidence with accepted examples", () => {
    expect(confidenceFromCounts(1, 0)).toBe(0.86);
    expect(confidenceFromCounts(3, 0)).toBe(0.93);
    expect(confidenceFromCounts(5, 0)).toBe(0.95);
  });

  it("penalizes corrections", () => {
    expect(confidenceFromCounts(5, 2)).toBeLessThan(0.95);
  });

  it("uses only strong memory records", () => {
    expect(shouldUseMemorySuggestion({ acceptedCount: 3, confidence: 0.93 })).toBe(true);
    expect(shouldUseMemorySuggestion({ acceptedCount: 1, confidence: 0.86 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm test -- tests/categorization.memory.test.ts
```

Expected: FAIL because `memory.ts` does not exist.

- [ ] **Step 3: Implement pure memory helpers**

Create `convex/intelligence/categorization/memory.ts` with pure helpers first:

```ts
export type MemoryConfidenceInput = {
  acceptedCount: number;
  confidence: number;
};

export const confidenceFromCounts = (
  acceptedCount: number,
  correctedCount: number
): number => {
  const base = acceptedCount >= 5 ? 0.95 : acceptedCount >= 3 ? 0.93 : 0.86;
  const penalty = Math.min(correctedCount * 0.08, 0.32);
  return Math.max(0.5, Number((base - penalty).toFixed(2)));
};

export const shouldUseMemorySuggestion = (
  memory: MemoryConfidenceInput
): boolean => memory.acceptedCount >= 3 && memory.confidence >= 0.9;
```

- [ ] **Step 4: Run memory tests**

Run:

```powershell
npm test -- tests/categorization.memory.test.ts
```

Expected: PASS.

- [ ] **Step 5: Type-check**

Run:

```powershell
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add convex/intelligence/categorization/memory.ts tests/categorization.memory.test.ts
git commit -m "feat: add categorisation memory helpers"
```

---

## Task 6: Add Deterministic Rules

**Files:**
- Create: `convex/intelligence/categorization/rules.ts`
- Test: `tests/categorization.rules.test.ts`

- [ ] **Step 1: Write failing rules tests**

Create `tests/categorization.rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyDeterministicRules } from "../convex/intelligence/categorization/rules";
import { CategoryLike, FundLike } from "../convex/intelligence/categorization/types";

const categories: CategoryLike[] = [
  { name: "Bank Charges", transactionType: "Expenditure", mainCategory: "Admin & Governance" },
  { name: "Utilities", transactionType: "Expenditure", mainCategory: "Premises Costs" },
  { name: "Tithes & First Fruits", transactionType: "Income", mainCategory: "Donations" },
  { name: "Offerings", transactionType: "Income", mainCategory: "Donations" },
];

const funds: FundLike[] = [{ _id: "fund1", name: "General Fund" }];

describe("deterministic categorization rules", () => {
  it("categorizes bank charges as expenditure only", () => {
    const suggestion = applyDeterministicRules(
      { description: "Monthly bank charge", amount: 5, type: "Expenditure" },
      categories,
      funds
    );
    expect(suggestion?.category).toBe("Bank Charges");
  });

  it("does not apply bank charge rule to income", () => {
    const suggestion = applyDeterministicRules(
      { description: "Bank charge refund", amount: 5, type: "Income" },
      categories,
      funds
    );
    expect(suggestion).toBeNull();
  });

  it("categorizes tithe references as income", () => {
    const suggestion = applyDeterministicRules(
      { description: "FT J Smith Tithe", amount: 100, type: "Income" },
      categories,
      funds
    );
    expect(suggestion?.category).toBe("Tithes & First Fruits");
    expect(suggestion?.isGiftAidEligible).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm test -- tests/categorization.rules.test.ts
```

Expected: FAIL because `rules.ts` does not exist.

- [ ] **Step 3: Implement deterministic rules**

Create `convex/intelligence/categorization/rules.ts`:

```ts
import { confidenceLabel } from "./confidence";
import {
  CategoryLike,
  CategorizationInput,
  CategorizationSuggestion,
  FundLike,
  TransactionType,
} from "./types";
import { normalizeDescription } from "./normalize";
import { resolveCategoryForTransaction } from "./categoryResolver";

type RuleDefinition = {
  id: string;
  transactionType: TransactionType;
  pattern: RegExp;
  category: string;
  confidence: number;
  giftAidEligible?: boolean;
  reason: string;
};

const RULES: RuleDefinition[] = [
  {
    id: "bank-charges",
    transactionType: "Expenditure",
    pattern: /\bbank\s+(charge|fee|charges|fees)\b|\bmonthly\s+fee\b/,
    category: "Bank Charges",
    confidence: 0.94,
    reason: "Bank fee pattern matched.",
  },
  {
    id: "utilities",
    transactionType: "Expenditure",
    pattern: /\butility|utilities|electric|gas|water|thames|british\s+gas|eon\b/,
    category: "Utilities",
    confidence: 0.9,
    reason: "Utility supplier pattern matched.",
  },
  {
    id: "tithes",
    transactionType: "Income",
    pattern: /\btithe|tithes|first\s+fruit|firstfruit\b/,
    category: "Tithes & First Fruits",
    confidence: 0.92,
    giftAidEligible: true,
    reason: "Giving reference matched tithe or first fruit.",
  },
  {
    id: "offerings",
    transactionType: "Income",
    pattern: /\boffering|offerings|thanksgiving|donation\b/,
    category: "Offerings",
    confidence: 0.86,
    giftAidEligible: true,
    reason: "Giving reference matched offering or donation.",
  },
];

export const applyDeterministicRules = (
  transaction: CategorizationInput,
  categories: CategoryLike[],
  funds: FundLike[]
): CategorizationSuggestion | null => {
  const normalized = normalizeDescription(transaction.description);
  const defaultFund = funds[0];
  if (!defaultFund) return null;

  for (const rule of RULES) {
    if (rule.transactionType !== transaction.type) continue;
    if (!rule.pattern.test(normalized)) continue;

    const category = resolveCategoryForTransaction(
      rule.category,
      transaction.type,
      categories
    );
    if (!category) return null;

    return {
      description: transaction.description,
      amount: transaction.amount,
      type: transaction.type,
      category: category.name,
      categoryTransactionType: category.transactionType,
      fundName: defaultFund.name,
      fundId: String(defaultFund._id),
      confidence: rule.confidence,
      confidenceLabel: confidenceLabel(rule.confidence),
      isGiftAidEligible: rule.giftAidEligible ?? false,
      donorName: null,
      predictionSource: "rule",
      requiresReview: rule.confidence < 0.95,
      evidence: [{ source: "rule", reason: rule.reason }],
    };
  }

  return null;
};
```

- [ ] **Step 4: Run rules tests**

Run:

```powershell
npm test -- tests/categorization.rules.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add convex/intelligence/categorization/rules.ts tests/categorization.rules.test.ts
git commit -m "feat: add deterministic categorisation rules"
```

---

## Task 7: Add Gemini Prompt And Validation Helpers

**Files:**
- Create: `convex/intelligence/categorization/gemini.ts`
- Test: `tests/categorization.gemini.test.ts`
- Modify later: `convex/actions/ai.ts`

- [ ] **Step 1: Write failing Gemini validation tests**

Create `tests/categorization.gemini.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CATEGORIZATION_MODEL,
  buildGeminiCategorizationPrompt,
  validateGeminiSuggestion,
} from "../convex/intelligence/categorization/gemini";
import { CategoryLike, FundLike } from "../convex/intelligence/categorization/types";

const categories: CategoryLike[] = [
  { name: "Offerings", transactionType: "Income", mainCategory: "Donations" },
  { name: "Bank Charges", transactionType: "Expenditure", mainCategory: "Admin & Governance" },
];
const funds: FundLike[] = [{ _id: "fund1", name: "General Fund" }];

describe("Gemini categorization helpers", () => {
  it("uses Flash-Lite for categorization fallback", () => {
    expect(CATEGORIZATION_MODEL).toBe("gemini-2.5-flash-lite");
  });

  it("filters prompt categories by transaction type", () => {
    const prompt = buildGeminiCategorizationPrompt(
      [{ description: "Donation from Jane", amount: 50, type: "Income" }],
      categories,
      funds,
      []
    );
    expect(prompt).toContain("Income categories: Offerings");
    expect(prompt).not.toContain("Bank Charges");
  });

  it("rejects model output with mismatched category type", () => {
    const result = validateGeminiSuggestion(
      { category: "Bank Charges", fundName: "General Fund", confidence: "High", isGiftAidEligible: false, donorName: "" },
      { description: "Donation", amount: 50, type: "Income" },
      categories,
      funds
    );
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm test -- tests/categorization.gemini.test.ts
```

Expected: FAIL because `gemini.ts` does not exist.

- [ ] **Step 3: Implement Gemini helpers**

Create `convex/intelligence/categorization/gemini.ts`:

```ts
import { confidenceLabel } from "./confidence";
import {
  CategoryLike,
  CategorizationEvidence,
  CategorizationInput,
  CategorizationSuggestion,
  FundLike,
} from "./types";
import {
  categoryNamesForPrompt,
  resolveCategoryForTransaction,
} from "./categoryResolver";

export const CATEGORIZATION_MODEL = "gemini-2.5-flash-lite";
export const COMPLEX_AI_MODEL = "gemini-2.5-flash";

const confidenceFromModelLabel = (label: unknown): number => {
  if (typeof label !== "string") return 0.65;
  const normalized = label.toLowerCase();
  if (normalized === "high") return 0.78;
  if (normalized === "medium") return 0.68;
  return 0.55;
};

export const buildGeminiCategorizationPrompt = (
  transactions: CategorizationInput[],
  categories: CategoryLike[],
  funds: FundLike[],
  evidence: CategorizationEvidence[]
): string => {
  const incomeCategories = categoryNamesForPrompt(categories, "Income");
  const expenditureCategories = categoryNamesForPrompt(categories, "Expenditure");
  return `
You are a UK church finance categorisation assistant.
Return strict JSON matching the requested schema.

Income categories: ${incomeCategories.join(", ")}
Expenditure categories: ${expenditureCategories.join(", ")}
Funds: ${funds.map((fund) => fund.name).join(", ")}

Rules:
- Income transactions must use only Income categories.
- Expenditure transactions must use only Expenditure categories.
- If uncertain, choose an allowed category and mark confidence Low.
- Do not invent category or fund names.

Relevant examples:
${evidence.map((item) => `- ${item.reason}`).join("\n")}

Transactions:
${JSON.stringify(transactions)}
`;
};

export const validateGeminiSuggestion = (
  rawSuggestion: Record<string, unknown>,
  transaction: CategorizationInput,
  categories: CategoryLike[],
  funds: FundLike[]
): CategorizationSuggestion | null => {
  const categoryName =
    typeof rawSuggestion.category === "string" ? rawSuggestion.category : "";
  const category = resolveCategoryForTransaction(
    categoryName,
    transaction.type,
    categories
  );
  if (!category) return null;

  const fundName =
    typeof rawSuggestion.fundName === "string" ? rawSuggestion.fundName : "";
  const fund =
    funds.find((item) => item.name.toLowerCase() === fundName.toLowerCase()) ??
    funds[0];
  if (!fund) return null;

  const confidence = confidenceFromModelLabel(rawSuggestion.confidence);
  const donorName =
    typeof rawSuggestion.donorName === "string" && rawSuggestion.donorName.trim()
      ? rawSuggestion.donorName.trim()
      : null;

  return {
    description: transaction.description,
    amount: transaction.amount,
    type: transaction.type,
    category: category.name,
    categoryTransactionType: category.transactionType,
    fundName: fund.name,
    fundId: String(fund._id),
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    isGiftAidEligible:
      typeof rawSuggestion.isGiftAidEligible === "boolean"
        ? rawSuggestion.isGiftAidEligible
        : false,
    donorName,
    predictionSource: "gemini",
    requiresReview: true,
    evidence: [{ source: "gemini", reason: "Gemini fallback suggestion." }],
  };
};
```

- [ ] **Step 4: Run Gemini helper tests**

Run:

```powershell
npm test -- tests/categorization.gemini.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add convex/intelligence/categorization/gemini.ts tests/categorization.gemini.test.ts
git commit -m "feat: add Gemini categorisation validation"
```

---

## Task 8: Fix RAG Metadata Helpers And Indexer Storage

**Files:**
- Create: `convex/intelligence/categorization/rag.ts`
- Modify: `convex/intelligence/ragIndexer.ts`
- Modify: `convex/intelligence/bootstrapRAG.ts`
- Test: add focused pure helper tests to `tests/categorization.rag.test.ts`

- [ ] **Step 1: Write failing RAG metadata tests**

Create `tests/categorization.rag.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildRagEntryKey,
  metadataToSuggestion,
} from "../convex/intelligence/categorization/rag";
import { CategoryLike, FundLike } from "../convex/intelligence/categorization/types";

const categories: CategoryLike[] = [
  { name: "Offerings", transactionType: "Income", mainCategory: "Donations" },
  { name: "Bank Charges", transactionType: "Expenditure", mainCategory: "Admin & Governance" },
];
const funds: FundLike[] = [{ _id: "fund1", name: "General Fund" }];

describe("RAG categorization helpers", () => {
  it("builds stable aggregate memory keys", () => {
    expect(buildRagEntryKey("org1", "Income:jane:band:50")).toBe(
      "memory:org1:Income:jane:band:50"
    );
  });

  it("rejects mismatched metadata transaction type", () => {
    const suggestion = metadataToSuggestion(
      {
        category: "Bank Charges",
        fundId: "fund1",
        type: "Expenditure",
        isGiftAidEligible: false,
        donorName: "",
        acceptedCount: 4,
      },
      { description: "Donation", amount: 50, type: "Income" },
      0.94,
      categories,
      funds
    );
    expect(suggestion).toBeNull();
  });
});
```

- [ ] **Step 2: Run RAG helper test and verify it fails**

Run:

```powershell
npm test -- tests/categorization.rag.test.ts
```

Expected: FAIL because `rag.ts` does not exist.

- [ ] **Step 3: Implement RAG helper module**

Create `convex/intelligence/categorization/rag.ts`:

```ts
import { confidenceLabel } from "./confidence";
import { resolveCategoryForTransaction } from "./categoryResolver";
import {
  CategoryLike,
  CategorizationInput,
  CategorizationSuggestion,
  FundLike,
  TransactionType,
} from "./types";

export type CategorizationRagMetadata = {
  transactionId?: string;
  category: string;
  fundId: string;
  type: TransactionType;
  isGiftAidEligible?: boolean;
  donorName?: string;
  acceptedCount?: number;
};

export const buildRagEntryKey = (
  organizationId: string,
  signature: string
): string => `memory:${organizationId}:${signature}`;

export const metadataToSuggestion = (
  metadata: CategorizationRagMetadata,
  transaction: CategorizationInput,
  score: number,
  categories: CategoryLike[],
  funds: FundLike[]
): CategorizationSuggestion | null => {
  if (metadata.type !== transaction.type) return null;
  const category = resolveCategoryForTransaction(
    metadata.category,
    transaction.type,
    categories
  );
  const fund = funds.find((item) => String(item._id) === String(metadata.fundId));
  if (!category || !fund) return null;

  const confidence = score >= 0.95 ? 0.92 : 0.86;
  return {
    description: transaction.description,
    amount: transaction.amount,
    type: transaction.type,
    category: category.name,
    categoryTransactionType: category.transactionType,
    fundName: fund.name,
    fundId: String(fund._id),
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    isGiftAidEligible: metadata.isGiftAidEligible ?? false,
    donorName: metadata.donorName || null,
    predictionSource: "rag",
    ragScore: score,
    requiresReview: confidence < 0.9,
    evidence: [
      {
        source: "rag",
        reason: `Semantic match from ${metadata.acceptedCount ?? 1} accepted categorisation(s).`,
        score,
      },
    ],
  };
};
```

- [ ] **Step 4: Update `ragIndexer.ts` to pass metadata and keys**

In `convex/intelligence/ragIndexer.ts`, update all `transactionRAG.add(ctx, ...)` calls to include `key` and `metadata`.

For `indexTransaction`, use:

```ts
await transactionRAG.add(ctx, {
  namespace,
  key: `tx:${args.transactionId}`,
  text: args.searchText,
  metadata: {
    transactionId: String(args.transactionId),
    category: args.metadata.category,
    fundId: String(args.metadata.fundId),
    type: args.metadata.type,
    isGiftAidEligible: args.metadata.isGiftAidEligible ?? false,
    donorName: args.metadata.donorName ?? "",
    acceptedCount: 1,
  },
});
```

For `batchIndexTransactions`, use:

```ts
await transactionRAG.add(ctx, {
  namespace,
  key: `tx:${tx.transactionId}`,
  text: tx.searchText,
  metadata: {
    transactionId: String(tx.transactionId),
    category: tx.metadata.category,
    fundId: String(tx.metadata.fundId),
    type: tx.metadata.type,
    isGiftAidEligible: tx.metadata.isGiftAidEligible ?? false,
    donorName: tx.metadata.donorName ?? "",
    acceptedCount: 1,
  },
});
```

For `updateInIndex`, extend args to accept metadata:

```ts
metadata: v.object({
  category: v.string(),
  fundId: v.id("funds"),
  type: v.union(v.literal("Income"), v.literal("Expenditure")),
  isGiftAidEligible: v.optional(v.boolean()),
  donorName: v.optional(v.string()),
  acceptedCount: v.optional(v.number()),
}),
```

and call:

```ts
await transactionRAG.add(ctx, {
  namespace,
  key: `tx:${args.transactionId}`,
  text: args.newSearchText,
  metadata: {
    transactionId: String(args.transactionId),
    category: args.metadata.category,
    fundId: String(args.metadata.fundId),
    type: args.metadata.type,
    isGiftAidEligible: args.metadata.isGiftAidEligible ?? false,
    donorName: args.metadata.donorName ?? "",
    acceptedCount: args.metadata.acceptedCount ?? 1,
  },
});
```

- [ ] **Step 5: Update `bootstrapRAG.ts` to include metadata**

In `convex/intelligence/bootstrapRAG.ts`, update `transactionRAG.add(ctx, ...)` in `indexSingleTransaction`:

```ts
await transactionRAG.add(ctx, {
  namespace,
  key: `tx:${args.transactionId}`,
  text: args.searchText,
  metadata: {
    transactionId: String(args.transactionId),
    category: args.metadata.category,
    fundId: String(args.metadata.fundId),
    type: args.metadata.type,
    isGiftAidEligible: args.metadata.isGiftAidEligible ?? false,
    donorName: args.metadata.donorName ?? "",
    acceptedCount: 1,
  },
});
```

- [ ] **Step 6: Run RAG helper tests and typecheck**

Run:

```powershell
npm test -- tests/categorization.rag.test.ts
npx tsc --noEmit
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```powershell
git add convex/intelligence/categorization/rag.ts convex/intelligence/ragIndexer.ts convex/intelligence/bootstrapRAG.ts tests/categorization.rag.test.ts
git commit -m "fix: store categorisation metadata in RAG"
```

---

## Task 9: Add Category Type Backfill

**Files:**
- Modify: `convex/mutations/categories.ts`
- Validate: `npx tsc --noEmit`

- [ ] **Step 1: Add backfill mutation**

In `convex/mutations/categories.ts`, add this mutation near the existing category migration functions:

```ts
export const backfillCategoryTransactionTypes = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, ["Admin"]);

    const categories = await ctx.db
      .query("categories")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", user.organizationId)
      )
      .collect();

    const incomeLookup = new Map<string, string>();
    for (const [mainCategory, subcategories] of Object.entries(RCI_INCOME_CATEGORIES)) {
      const names = subcategories.length === 0 ? [mainCategory] : subcategories;
      for (const name of names) incomeLookup.set(name.toLowerCase(), mainCategory);
    }

    const expenditureLookup = new Map<string, string>();
    for (const [mainCategory, subcategories] of Object.entries(RCI_EXPENDITURE_CATEGORIES)) {
      const names = subcategories.length === 0 ? [mainCategory] : subcategories;
      for (const name of names) expenditureLookup.set(name.toLowerCase(), mainCategory);
    }

    let updated = 0;
    const skipped: string[] = [];

    for (const category of categories) {
      if (category.transactionType) continue;
      const canonicalName = CATEGORY_ALIASES[category.name] ?? category.name;
      const normalized = canonicalName.toLowerCase();
      const incomeMain = incomeLookup.get(normalized);
      const expenditureMain = expenditureLookup.get(normalized);

      if (incomeMain) {
        await ctx.db.patch(category._id, {
          mainCategory: incomeMain,
          transactionType: "Income",
        });
        updated++;
      } else if (expenditureMain) {
        await ctx.db.patch(category._id, {
          mainCategory: expenditureMain,
          transactionType: "Expenditure",
        });
        updated++;
      } else {
        skipped.push(category.name);
      }
    }

    return { updated, skipped };
  },
});
```

- [ ] **Step 2: Type-check**

Run:

```powershell
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```powershell
git add convex/mutations/categories.ts
git commit -m "feat: add category type backfill"
```

---

## Task 10: Add Internal Memory Lookup And Upsert Functions

**Files:**
- Create: `convex/intelligence/categorizationMemory.ts`
- Modify: `convex/intelligence/categorization/memory.ts`
- Validate: `npx tsc --noEmit`

- [ ] **Step 1: Create internal memory functions**

Create `convex/intelligence/categorizationMemory.ts`:

```ts
import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import {
  confidenceFromCounts,
} from "./categorization/memory";

export const getBySignature = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("transactionCategorizationMemory")
      .withIndex("by_organization_signature", (q) =>
        q.eq("organizationId", args.organizationId).eq("signature", args.signature)
      )
      .first();
  },
});

export const upsertAccepted = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    signature: v.string(),
    descriptionExample: v.string(),
    transactionType: v.union(v.literal("Income"), v.literal("Expenditure")),
    category: v.string(),
    fundId: v.id("funds"),
    isGiftAidEligible: v.optional(v.boolean()),
    donorName: v.optional(v.string()),
    sourceTransactionId: v.optional(v.id("transactions")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("transactionCategorizationMemory")
      .withIndex("by_organization_signature", (q) =>
        q.eq("organizationId", args.organizationId).eq("signature", args.signature)
      )
      .first();

    const now = Date.now();
    if (!existing) {
      const acceptedCount = 1;
      const correctedCount = 0;
      return await ctx.db.insert("transactionCategorizationMemory", {
        organizationId: args.organizationId,
        signature: args.signature,
        descriptionExample: args.descriptionExample,
        transactionType: args.transactionType,
        category: args.category,
        fundId: args.fundId,
        isGiftAidEligible: args.isGiftAidEligible,
        donorName: args.donorName,
        sourceTransactionId: args.sourceTransactionId,
        acceptedCount,
        correctedCount,
        lastAcceptedAt: now,
        confidence: confidenceFromCounts(acceptedCount, correctedCount),
      });
    }

    const acceptedCount = existing.acceptedCount + 1;
    const correctedCount = existing.correctedCount;
    await ctx.db.patch(existing._id, {
      descriptionExample: args.descriptionExample,
      transactionType: args.transactionType,
      category: args.category,
      fundId: args.fundId,
      isGiftAidEligible: args.isGiftAidEligible,
      donorName: args.donorName,
      sourceTransactionId: args.sourceTransactionId,
      acceptedCount,
      lastAcceptedAt: now,
      confidence: confidenceFromCounts(acceptedCount, correctedCount),
    });
    return existing._id as Id<"transactionCategorizationMemory">;
  },
});

export const recordCorrection = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("transactionCategorizationMemory")
      .withIndex("by_organization_signature", (q) =>
        q.eq("organizationId", args.organizationId).eq("signature", args.signature)
      )
      .first();

    if (!existing) return null;
    const correctedCount = existing.correctedCount + 1;
    await ctx.db.patch(existing._id, {
      correctedCount,
      lastCorrectedAt: Date.now(),
      confidence: confidenceFromCounts(existing.acceptedCount, correctedCount),
    });
    return existing._id;
  },
});
```

- [ ] **Step 2: Add memory suggestion builder**

Append to `convex/intelligence/categorization/memory.ts`:

```ts
import { Id } from "../../_generated/dataModel";
import { confidenceLabel } from "./confidence";
import { resolveCategoryForTransaction } from "./categoryResolver";
import {
  CategoryLike,
  FundLike,
  NormalizedTransaction,
} from "./types";

export const buildMemorySuggestion = (
  memory: {
    category: string;
    fundId: Id<"funds">;
    isGiftAidEligible?: boolean;
    donorName?: string;
    acceptedCount: number;
    confidence: number;
    transactionType: "Income" | "Expenditure";
  },
  normalized: NormalizedTransaction,
  categories: CategoryLike[],
  funds: FundLike[]
) => {
  if (memory.transactionType !== normalized.type) return null;
  const category = resolveCategoryForTransaction(
    memory.category,
    normalized.type,
    categories
  );
  const fund = funds.find((item) => String(item._id) === String(memory.fundId));
  if (!category || !fund || !shouldUseMemorySuggestion(memory)) return null;

  return {
    description: normalized.description,
    amount: normalized.amount,
    type: normalized.type,
    category: category.name,
    categoryTransactionType: category.transactionType,
    fundName: fund.name,
    fundId: String(fund._id),
    confidence: memory.confidence,
    confidenceLabel: confidenceLabel(memory.confidence),
    isGiftAidEligible: memory.isGiftAidEligible ?? false,
    donorName: memory.donorName ?? null,
    predictionSource: "memory" as const,
    requiresReview: false,
    evidence: [
      {
        source: "memory" as const,
        reason: `Matched ${memory.acceptedCount} accepted categorisations.`,
      },
    ],
  };
};
```

- [ ] **Step 3: Type-check**

Run:

```powershell
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add convex/intelligence/categorizationMemory.ts convex/intelligence/categorization/memory.ts
git commit -m "feat: add categorisation memory storage"
```

---

## Task 11: Add Pipeline Skeleton With Memory And Rules

**Files:**
- Create: `convex/intelligence/categorization/pipeline.ts`
- Modify: `convex/actions/ai.ts`
- Validate: `npx tsc --noEmit`

- [ ] **Step 1: Implement no-match suggestion helper in pipeline**

Create `convex/intelligence/categorization/pipeline.ts`:

```ts
import { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { Id } from "../../_generated/dataModel";
import { confidenceLabel } from "./confidence";
import { applyDeterministicRules } from "./rules";
import { buildMemorySuggestion } from "./memory";
import { normalizeTransaction } from "./normalize";
import {
  CategoryLike,
  CategorizationInput,
  CategorizationSuggestion,
  FundLike,
} from "./types";

const unresolvedSuggestion = (
  transaction: CategorizationInput
): CategorizationSuggestion => ({
  description: transaction.description,
  amount: transaction.amount,
  type: transaction.type,
  category: "",
  fundName: "",
  confidence: 0,
  confidenceLabel: confidenceLabel(0),
  isGiftAidEligible: false,
  donorName: null,
  predictionSource: "none",
  requiresReview: true,
  evidence: [{ source: "none", reason: "No confident categorisation found." }],
});

export const categorizeWithoutExternalAI = async (
  ctx: ActionCtx,
  organizationId: Id<"organizations">,
  transactions: CategorizationInput[],
  categories: CategoryLike[],
  funds: FundLike[]
): Promise<CategorizationSuggestion[]> => {
  const suggestions: CategorizationSuggestion[] = [];

  for (const transaction of transactions) {
    const normalized = normalizeTransaction(transaction);
    const memory = await ctx.runQuery(
      internal.intelligence.categorizationMemory.getBySignature,
      {
        organizationId,
        signature: normalized.signature,
      }
    );
    if (memory) {
      const memorySuggestion = buildMemorySuggestion(
        memory,
        normalized,
        categories,
        funds
      );
      if (memorySuggestion) {
        suggestions.push(memorySuggestion);
        continue;
      }
    }

    const ruleSuggestion = applyDeterministicRules(
      transaction,
      categories,
      funds
    );
    suggestions.push(ruleSuggestion ?? unresolvedSuggestion(transaction));
  }

  return suggestions;
};
```

- [ ] **Step 2: Add compatibility action in `ai.ts`**

In `convex/actions/ai.ts`, import the skeleton:

```ts
import { categorizeWithoutExternalAI } from "../intelligence/categorization/pipeline";
```

Add a new action after `categorizeWithRAG` or near it:

```ts
export const categorizeWithPipelinePreview = action({
  args: {
    transactions: v.array(
      v.object({
        description: v.string(),
        amount: v.number(),
        type: v.union(v.literal("Income"), v.literal("Expenditure")),
      })
    ),
    fundNames: v.array(v.string()),
    categories: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { api } = await import("../_generated/api");
    const [categoryDetails, funds] = await Promise.all([
      ctx.runQuery(api.queries.categories.listWithDetails, {}),
      ctx.runQuery(api.queries.funds.list, {}),
    ]);

    return await categorizeWithoutExternalAI(
      ctx,
      user.organizationId,
      args.transactions,
      categoryDetails,
      funds
    );
  },
});
```

This action is a preview bridge. It should not replace the current frontend flow until RAG/Gemini fallback is added.

- [ ] **Step 3: Type-check**

Run:

```powershell
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add convex/intelligence/categorization/pipeline.ts convex/actions/ai.ts
git commit -m "feat: add categorisation pipeline preview"
```

---

## Task 12: Add Gemini Fallback To Pipeline

**Files:**
- Modify: `convex/intelligence/categorization/pipeline.ts`
- Modify: `convex/actions/ai.ts`
- Validate: `npx tsc --noEmit`

- [ ] **Step 1: Extend pipeline with validated Gemini fallback interface**

In `pipeline.ts`, add:

```ts
import { validateGeminiSuggestion } from "./gemini";

export const mergeGeminiFallback = (
  currentSuggestions: CategorizationSuggestion[],
  rawGeminiSuggestions: Record<string, unknown>[],
  originalTransactions: CategorizationInput[],
  categories: CategoryLike[],
  funds: FundLike[]
): CategorizationSuggestion[] => {
  let geminiIndex = 0;
  return currentSuggestions.map((suggestion, index) => {
    if (suggestion.predictionSource !== "none") return suggestion;
    const raw = rawGeminiSuggestions[geminiIndex++] ?? {};
    return (
      validateGeminiSuggestion(
        raw,
        originalTransactions[index],
        categories,
        funds
      ) ?? suggestion
    );
  });
};
```

- [ ] **Step 2: Update `categorizeWithPipelinePreview` to call Gemini for unresolved**

In `convex/actions/ai.ts`, import:

```ts
import {
  CATEGORIZATION_MODEL,
  buildGeminiCategorizationPrompt,
} from "../intelligence/categorization/gemini";
import {
  categorizeWithoutExternalAI,
  mergeGeminiFallback,
} from "../intelligence/categorization/pipeline";
```

Update the action body after initial suggestions:

```ts
const initialSuggestions = await categorizeWithoutExternalAI(
  ctx,
  user.organizationId,
  args.transactions,
  categoryDetails,
  funds
);
const unresolvedTransactions = args.transactions.filter(
  (_, index) => initialSuggestions[index].predictionSource === "none"
);

if (unresolvedTransactions.length === 0) return initialSuggestions;

const ai = getAI();
const prompt = buildGeminiCategorizationPrompt(
  unresolvedTransactions,
  categoryDetails,
  funds,
  initialSuggestions.flatMap((suggestion) => suggestion.evidence)
);

const response = await ai.models.generateContent({
  model: CATEGORIZATION_MODEL,
  contents: prompt,
  config: {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING },
          category: { type: Type.STRING },
          fundName: { type: Type.STRING },
          confidence: { type: Type.STRING },
          isGiftAidEligible: { type: Type.BOOLEAN },
          donorName: { type: Type.STRING },
        },
      },
    },
    thinkingConfig: { thinkingBudget: 0 },
  },
});

const text = response.text;
const rawSuggestions = text
  ? safeJsonParse<Record<string, unknown>[]>(
      text,
      "categorizeWithPipelinePreview response"
    )
  : [];

return mergeGeminiFallback(
  initialSuggestions,
  rawSuggestions,
  args.transactions,
  categoryDetails,
  funds
);
```

- [ ] **Step 3: Type-check**

Run:

```powershell
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add convex/intelligence/categorization/pipeline.ts convex/actions/ai.ts
git commit -m "feat: add validated Gemini categorisation fallback"
```

---

## Task 13: Wire Frontend Import Review To Pipeline Preview

**Files:**
- Modify: `components/TransactionManager.tsx`
- Validate: `npx tsc --noEmit`

- [ ] **Step 1: Add pipeline action hook**

In `components/TransactionManager.tsx`, replace:

```ts
const categorizeWithRAG = useAction(api.actions.ai.categorizeWithRAG);
```

with:

```ts
const categorizeWithPipeline = useAction(api.actions.ai.categorizeWithPipelinePreview);
```

- [ ] **Step 2: Call the pipeline action in `handleApplyAI`**

Replace:

```ts
const suggestions = await categorizeWithRAG({
    transactions: transactionsForAI,
    fundNames: funds.map(f => f.name),
    categories: categoryNames
});
```

with:

```ts
const suggestions = await categorizeWithPipeline({
    transactions: transactionsForAI,
    fundNames: funds.map(f => f.name),
    categories: categoryNames
});
```

- [ ] **Step 3: Preserve source metadata for all sources**

Update the `originalPredictions` state shape near the top of the component:

```ts
const [originalPredictions, setOriginalPredictions] = useState<Map<number, {
  category: string;
  fundId?: string;
  isGiftAidEligible?: boolean;
  donorName?: string | null;
  confidence: string;
  confidenceScore?: number;
  predictionSource: 'memory' | 'rule' | 'gemini' | 'rag' | 'none';
  ragScore?: number;
}>>(new Map());
```

Update `predictions.set(idx, ...)`:

```ts
predictions.set(idx, {
  category: suggestion.category || '',
  fundId: suggestion.fundId,
  isGiftAidEligible: suggestion.isGiftAidEligible,
  donorName: suggestion.donorName,
  confidence: suggestion.confidenceLabel || suggestion.confidence || 'Low',
  confidenceScore: typeof suggestion.confidence === 'number' ? suggestion.confidence : undefined,
  predictionSource: suggestion.predictionSource || 'none',
  ragScore: suggestion.ragScore,
});
```

- [ ] **Step 4: Update source label display**

Replace the existing `sourceLabel` calculation with:

```ts
const sourceLabel =
  suggestion.predictionSource === 'memory'
    ? 'Learned Match'
    : suggestion.predictionSource === 'rule'
      ? 'Rule Match'
      : suggestion.predictionSource === 'rag'
        ? `RAG Match (${Math.round((suggestion.ragScore || 0) * 100)}%)`
        : suggestion.predictionSource === 'gemini'
          ? 'Gemini AI'
          : 'Manual';
```

- [ ] **Step 5: Type-check**

Run:

```powershell
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add components/TransactionManager.tsx
git commit -m "feat: use type-safe categorisation pipeline"
```

---

## Task 14: Add Feedback Event Recording And Memory Learning

**Files:**
- Create: `convex/intelligence/categorization/feedback.ts`
- Modify: `convex/mutations/transactions.ts`
- Validate: `npx tsc --noEmit`

- [ ] **Step 1: Create feedback event builder**

Create `convex/intelligence/categorization/feedback.ts`:

```ts
import { Id } from "../../_generated/dataModel";
import { CategorizationSource, TransactionType } from "./types";
import { normalizeTransaction } from "./normalize";

export type FeedbackEventInput = {
  organizationId: Id<"organizations">;
  transactionId: Id<"transactions">;
  description: string;
  amount: number;
  transactionType: TransactionType;
  source: CategorizationSource;
  confidence: number;
  originalCategory?: string;
  finalCategory: string;
  originalFundId?: Id<"funds">;
  finalFundId: Id<"funds">;
  originalGiftAidEligible?: boolean;
  finalGiftAidEligible?: boolean;
  originalDonorName?: string;
  finalDonorName?: string;
  learned: boolean;
};

export const buildFeedbackEvent = (input: FeedbackEventInput) => {
  const normalized = normalizeTransaction({
    description: input.description,
    amount: input.amount,
    type: input.transactionType,
  });

  return {
    organizationId: input.organizationId,
    transactionId: input.transactionId,
    signature: normalized.signature,
    transactionType: input.transactionType,
    source: input.source,
    confidence: input.confidence,
    originalCategory: input.originalCategory,
    finalCategory: input.finalCategory,
    categoryChanged: input.originalCategory !== input.finalCategory,
    originalFundId: input.originalFundId,
    finalFundId: input.finalFundId,
    fundChanged: String(input.originalFundId ?? "") !== String(input.finalFundId),
    originalGiftAidEligible: input.originalGiftAidEligible,
    finalGiftAidEligible: input.finalGiftAidEligible,
    giftAidChanged: input.originalGiftAidEligible !== input.finalGiftAidEligible,
    originalDonorName: input.originalDonorName,
    finalDonorName: input.finalDonorName,
    donorNameChanged: (input.originalDonorName ?? "") !== (input.finalDonorName ?? ""),
    learned: input.learned,
    createdAt: Date.now(),
  };
};
```

- [ ] **Step 2: Extend `recordCorrections` args**

In `convex/mutations/transactions.ts`, extend each correction object with optional fields:

```ts
aiPredictedFundId: v.optional(v.id("funds")),
aiPredictedGiftAidEligible: v.optional(v.boolean()),
aiPredictedDonorName: v.optional(v.string()),
aiConfidenceScore: v.optional(v.number()),
finalFundId: v.optional(v.id("funds")),
finalGiftAidEligible: v.optional(v.boolean()),
finalDonorName: v.optional(v.string()),
```

- [ ] **Step 3: Insert feedback events in `recordCorrections`**

Import:

```ts
import { buildFeedbackEvent } from "../intelligence/categorization/feedback";
import { resolveCategoryForTransaction } from "../intelligence/categorization/categoryResolver";
import { normalizeTransaction } from "../intelligence/categorization/normalize";
```

After inserting `categorizationCorrections`, add:

```ts
const categories = await ctx.db
  .query("categories")
  .withIndex("by_organization", (q) =>
    q.eq("organizationId", user.organizationId)
  )
  .collect();

const finalCategory = resolveCategoryForTransaction(
  correction.finalCategory,
  transaction.type,
  categories
);
const finalFundId = correction.finalFundId ?? transaction.fundId;
const learned = Boolean(finalCategory);

await ctx.db.insert(
  "categorizationFeedbackEvents",
  buildFeedbackEvent({
    organizationId: user.organizationId,
    transactionId: correction.transactionId,
    description: correction.description,
    amount: transaction.amount,
    transactionType: transaction.type,
    source: correction.predictionSource,
    confidence: correction.aiConfidenceScore ?? correction.ragScore ?? 0,
    originalCategory: correction.aiPredictedCategory,
    finalCategory: correction.finalCategory,
    originalFundId: correction.aiPredictedFundId,
    finalFundId,
    originalGiftAidEligible: correction.aiPredictedGiftAidEligible,
    finalGiftAidEligible:
      correction.finalGiftAidEligible ?? transaction.isGiftAidEligible,
    originalDonorName: correction.aiPredictedDonorName,
    finalDonorName: correction.finalDonorName ?? transaction.donorName,
    learned,
  })
);
```

When `learned` is true, schedule accepted memory upsert:

```ts
if (learned) {
  const normalized = normalizeTransaction({
    description: correction.description,
    amount: transaction.amount,
    type: transaction.type,
  });

  await ctx.scheduler.runAfter(
    0,
    internal.intelligence.categorizationMemory.upsertAccepted,
    {
      organizationId: user.organizationId,
      signature: normalized.signature,
      descriptionExample: correction.description,
      transactionType: transaction.type,
      category: correction.finalCategory,
      fundId: finalFundId,
      isGiftAidEligible:
        correction.finalGiftAidEligible ?? transaction.isGiftAidEligible,
      donorName: correction.finalDonorName ?? transaction.donorName,
      sourceTransactionId: correction.transactionId,
    }
  );
}
```

- [ ] **Step 4: Update RAG correction scheduling metadata**

Inside the existing `if (!wasCorrect)` block, only schedule RAG update when `finalCategory` exists, and pass metadata:

```ts
if (!wasCorrect && finalCategory) {
  const searchText = buildRAGSearchText({
    description: correction.description,
    category: correction.finalCategory,
    type: transaction.type,
    donorName: transaction.donorName,
  });

  await ctx.scheduler.runAfter(
    0,
    internal.intelligence.ragIndexer.updateInIndex,
    {
      organizationId: user.organizationId,
      transactionId: correction.transactionId,
      newSearchText: searchText,
      metadata: {
        category: correction.finalCategory,
        fundId: finalFundId,
        type: transaction.type,
        isGiftAidEligible:
          correction.finalGiftAidEligible ?? transaction.isGiftAidEligible,
        donorName: correction.finalDonorName ?? transaction.donorName,
        acceptedCount: 1,
      },
    }
  );
}
```

- [ ] **Step 5: Type-check**

Run:

```powershell
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add convex/intelligence/categorization/feedback.ts convex/mutations/transactions.ts
git commit -m "feat: record detailed categorisation feedback"
```

---

## Task 15: Send Detailed Feedback From Import Review

**Files:**
- Modify: `components/TransactionManager.tsx`
- Validate: `npx tsc --noEmit`

- [ ] **Step 1: Extend correction payload in `handleConfirmImport`**

In `components/TransactionManager.tsx`, update the object returned inside `correctionsToRecord`:

```ts
return {
  transactionId: result.ids[idx] as Id<"transactions">,
  description: pt.description || '',
  aiPredictedCategory: prediction.category,
  aiPredictedFundId: prediction.fundId as Id<"funds"> | undefined,
  aiPredictedGiftAidEligible: prediction.isGiftAidEligible,
  aiPredictedDonorName: prediction.donorName || undefined,
  aiConfidence: prediction.confidence,
  aiConfidenceScore: prediction.confidenceScore,
  predictionSource: prediction.predictionSource,
  ragScore: prediction.ragScore,
  finalCategory: pt.category || categoryNames[0] || 'Donation',
  finalFundId: (pt.fundId || funds[0]._id) as Id<"funds">,
  finalGiftAidEligible: pt.isGiftAidEligible || false,
  finalDonorName: pt.donorName || undefined,
};
```

- [ ] **Step 2: Type-check**

Run:

```powershell
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```powershell
git add components/TransactionManager.tsx
git commit -m "feat: submit detailed categorisation feedback"
```

---

## Task 16: Align Reporting With Category Resolver Behavior

**Files:**
- Modify: `convex/queries/reports.ts`
- Validate: `npx tsc --noEmit`

- [ ] **Step 1: Import resolver**

At the top of `convex/queries/reports.ts`, add:

```ts
import { resolveReportingMainCategory } from "../intelligence/categorization/categoryResolver";
```

- [ ] **Step 2: Replace local main-category fallback in monthly report**

In `monthlyReportData`, build category details as the resolver input:

```ts
const categoryDetails = categories.map((category) => ({
  name: category.name,
  mainCategory: category.mainCategory,
  transactionType: category.transactionType,
  displayOrder: category.displayOrder,
}));
```

Where income grouping currently uses `catData?.mainCategory || "Other Income"`, replace with:

```ts
const mainCategory = resolveReportingMainCategory(
  t.category,
  "Income",
  categoryDetails
);
```

Where expenditure grouping currently uses `catData?.mainCategory || "Admin & Governance"`, replace with:

```ts
const mainCategory = resolveReportingMainCategory(
  t.category,
  "Expenditure",
  categoryDetails
);
```

- [ ] **Step 3: Replace statement report fallback if duplicated**

Search in the same file:

```powershell
rg -n "Other Income|Admin & Governance|categoryToMain|getMainCategory" convex\queries\reports.ts
```

For each fallback that groups by transaction category, use `resolveReportingMainCategory(category, transactionType, categoryDetails)` rather than looking up by name only.

- [ ] **Step 4: Type-check**

Run:

```powershell
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add convex/queries/reports.ts
git commit -m "fix: use type-safe category resolver in reports"
```

---

## Task 17: Final Verification

**Files:**
- All changed files

- [ ] **Step 1: Run categorisation test suite**

Run:

```powershell
npm test -- tests/categorization.confidence.test.ts tests/categorization.categoryResolver.test.ts tests/categorization.normalize.test.ts tests/categorization.memory.test.ts tests/categorization.rules.test.ts tests/categorization.gemini.test.ts tests/categorization.rag.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```powershell
npm test
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```powershell
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Build**

Run:

```powershell
npm run build
```

Expected: PASS with Vite production build output.

- [ ] **Step 5: Manual application check**

Start the required dev processes in separate terminals:

```powershell
npm run dev
```

```powershell
npx convex dev
```

Manual checks:

1. Open `http://localhost:3000`.
2. Import a small CSV or bank review batch with one income tithe, one expenditure bank charge, and one ambiguous row.
3. Click Apply AI.
4. Confirm income suggestions only show income categories.
5. Confirm expenditure suggestions only show expenditure categories.
6. Confirm the ambiguous row remains reviewable.
7. Confirm final import succeeds.
8. Open reports and confirm income and expenditure totals group under the correct main category buckets.

- [ ] **Step 6: Final commit if verification required fixes**

If verification required small fixes, commit them:

```powershell
git add convex components tests
git commit -m "fix: verify categorisation engine integration"
```

If no fixes were required, do not create an empty commit.

---

## Notes For Execution

- Keep each task on its own commit.
- Do not edit `convex/_generated/*` by hand.
- If Convex generated API types lag new functions, run `npx convex dev --once` rather than manually editing generated files.
- Do not remove the existing `categorizeWithRAG` action until the new pipeline has been verified in the frontend.
- The first release keeps all imported rows in the review modal; it does not auto-post high-confidence suggestions.
- Backend secrets must remain in Convex environment variables, not `VITE_*` variables.
