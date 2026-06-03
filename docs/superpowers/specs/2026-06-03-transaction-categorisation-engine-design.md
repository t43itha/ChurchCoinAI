# Transaction Categorisation Engine Design

**Date:** 2026-06-03
**Status:** Approved design

## Problem

ChurchCoinAI should reduce treasurer review work by learning from past transaction categorisations. The current RAG-enhanced categorisation flow has the right intent, but it has reliability and cost issues:

1. RAG indexer actions accept metadata but do not pass it to `transactionRAG.add()`, while categorisation reads `best.document.category`. This can produce blank high-confidence RAG suggestions.
2. Low-confidence RAG examples sent to Gemini can become `Category: Unknown`, weakening the prompt.
3. User corrections mainly capture final category, not fund, Gift Aid, donor name, or which field was changed.
4. Manual transaction edits outside the import review flow do not teach the system.
5. Corrected RAG entries are appended rather than replacing stale entries.
6. RAG is used before cheaper deterministic matching, so repeated descriptions can still spend embedding/search work.

The goal is a broader transaction categorisation engine: deterministic and historical memory first, semantic matching second, AI model fallback only where needed.

## Goals

- Use reviewed past categorisations to inform future categorisation.
- Reduce Gemini usage by resolving repeated and obvious transactions before model fallback.
- Preserve user review control: AI and automation suggest; treasurers approve.
- Make suggestions explainable with a source, confidence, and evidence.
- Capture feedback for category, fund, Gift Aid, and donor extraction.
- Keep implementation incremental and aligned with the existing Convex architecture.

## Non-Goals

- Build custom model training infrastructure.
- Auto-post transactions without review in the first rollout.
- Replace the existing transaction review modal with a new workflow.
- Add external ML services beyond the existing Gemini and Convex RAG setup.
- Convert transaction categories to foreign-key category IDs as part of this work.

## Recommended Approach

Implement a layered categorisation pipeline:

1. Normalize transaction input.
2. Try exact historical memory.
3. Try deterministic rules and category aliases.
4. Try RAG with correct metadata and replacement keys.
5. Send only unresolved or ambiguous transactions to `gemini-2.5-flash-lite`.
6. Record reviewed outcomes as structured feedback.

This gives the strongest cost and quality profile. It is also easier to explain than a RAG-first system because each stage has a clear purpose and confidence policy.

## Architecture

Create a focused backend categorisation module under `convex/intelligence/categorization/`:

| File | Responsibility |
| --- | --- |
| `normalize.ts` | Canonicalizes descriptions, reference tokens, direction, amount bucket, and likely payee/donor hints. |
| `rules.ts` | Deterministic rules for common church finance and banking patterns. |
| `memory.ts` | Exact and near-exact historical lookup from accepted categorisations. |
| `rag.ts` | Semantic retrieval from accepted examples with metadata round-trip. |
| `gemini.ts` | Gemini fallback with strict JSON output and output validation. |
| `pipeline.ts` | Orchestrates the stages and returns suggestions. |
| `feedback.ts` | Records review outcomes and updates memory/RAG. |
| `types.ts` | Shared categorisation input, suggestion, evidence, and feedback types. |

The public action used by the frontend should call the pipeline instead of embedding all logic in `convex/actions/ai.ts`. Existing `categorizeWithRAG` can be retained temporarily as a compatibility wrapper during migration.

## Data Model

Add a compact learning table:

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
  .index("by_organization_lastAccepted", ["organizationId", "lastAcceptedAt"])
```

`signature` must be deterministic and stable. The first release should combine:

- transaction type
- normalized description/payee tokens after stripping common bank noise
- amount bucket, using exact amount for expenditure and donor/payment-processor patterns where amount is stable

Keep `categorizationCorrections` for current audit and accuracy stats. Add a sibling table, `categorizationFeedbackEvents`, for detailed field-level feedback so the existing stats table can remain backward compatible. Feedback events should include original and final values for:

- category
- fund
- Gift Aid eligibility
- donor name
- source stage
- confidence
- whether each field changed

This avoids a risky migration of existing correction records and makes the new learning loop explicit.

## RAG Design

Fix RAG storage and retrieval so semantic matches can produce valid suggestions:

- Pass `metadata` into `transactionRAG.add()`.
- Use `key: memory:${organizationId}:${signature}` for aggregate memory entries. A later migration may also add transaction-specific entries, but the first release should index aggregate accepted patterns.
- Store metadata:
  - `transactionId`
  - `category`
  - `fundId`
  - `type`
  - `isGiftAidEligible`
  - `donorName`
  - `acceptedCount`
- Use type filtering where available so income searches do not retrieve expense examples. If filter values are not configured in the RAG component, include type in metadata and apply the filter after retrieval.
- Prefer metadata from `entries` or documented RAG result shapes rather than non-existent `document.category` properties.

RAG should not be the first layer. It should handle semantically similar but non-identical descriptions after exact memory and rules have failed.

## Categorisation Flow

### 1. Normalize

Normalize each transaction into a structured representation:

- lowercased description
- stripped bank noise and punctuation
- reference tokens
- likely donor/payee hint
- transaction type
- amount and amount bucket
- exact signature

This stage must be deterministic and unit-tested.

### 2. Exact Memory

Look up `transactionCategorizationMemory` by `organizationId + signature`.

Return immediately if:

- confidence is high enough,
- accepted history is strong enough,
- the stored fund still belongs to the organization,
- the stored category still exists or is accepted as an organization category.

### 3. Rules

Apply curated rules for known cases:

- bank charges and interest
- Stripe, card, and payment processor fees
- utility suppliers
- internal transfers
- cash collection patterns
- tithes, offerings, first fruits, thanksgiving aliases
- restricted/building/mission fund keywords

Rules return a suggestion, confidence, and explanation. Rules should only auto-suggest when narrow enough to avoid category drift.

### 4. RAG

Search similar accepted examples for the organization and transaction type.

Use high-confidence RAG only when:

- one result is very strong, or
- top results agree on category/fund, and
- retrieved metadata validates against current organization data.

If results disagree, pass the most relevant examples to Gemini rather than returning an automatic RAG suggestion.

### 5. Gemini Fallback

Send only unresolved rows to `gemini-2.5-flash-lite`.

The prompt should include:

- transaction descriptions, amounts, and types
- allowed categories
- allowed funds
- a small set of relevant historical examples
- concise rule hints

The response must use strict JSON schema. Returned category and fund names must be validated against organization data. Invalid model output becomes unresolved rather than accepted.

### 6. Review Requirement

Every suggestion returns:

- `category`
- `fundId` or `fundName`
- `isGiftAidEligible`
- `donorName`
- `source`: `memory | rule | rag | gemini | none`
- `confidence`
- `confidenceLabel`
- `requiresReview`
- `evidence`

Initially, imported rows should still go through the review modal. Low-confidence rows should be visually distinguishable, but no new major UI workflow is required for the first implementation.

## Confidence Policy

Use numeric confidence internally:

| Confidence | Meaning |
| --- | --- |
| `0.95+` | Exact repeated memory or very strong deterministic rule. |
| `0.85-0.94` | Strong RAG or repeated memory with fewer examples. |
| `0.65-0.84` | Gemini suggestion or mixed evidence. |
| `<0.65` | Manual selection needed. |

The UI can continue to display `High`, `Medium`, or `Low`, but backend analytics should store the numeric value.

## Learning Loop

On import review confirmation:

1. Compare original suggestion to final reviewed transaction.
2. Write audit feedback.
3. Upsert memory by normalized signature.
4. Replace or update the RAG entry with corrected metadata.
5. Track per-source accuracy.

On manual transaction update:

1. Detect changes to category, fund, Gift Aid, or donor name.
2. Treat those changes as feedback.
3. Upsert memory and RAG.
4. Avoid requiring the original suggestion to have come from the Apply AI flow.

Reviewed user choices are authoritative. Model and RAG output only provide proposals.

## Model Policy

Use `gemini-2.5-flash-lite` as the default fallback model for basic transaction categorisation. It is significantly cheaper than `gemini-2.5-flash` and is well suited to strict JSON classification.

Keep `gemini-2.5-flash` available for harder tasks such as:

- pledge reconciliation
- ambiguous donor extraction
- longer financial narrative generation
- complex Treasurer CoPilot responses

Centralize model names in a small config/helper so actions do not hardcode model IDs repeatedly.

## Error Handling

Failures should degrade by stage:

- If memory lookup fails, continue to rules.
- If rules throw, log and continue to RAG.
- If RAG search fails, continue to Gemini.
- If Gemini fails, return unresolved low-confidence suggestions.
- If feedback recording or indexing fails after import, do not roll back the financial transaction.

Validation rules:

- Model outputs must match existing organization categories and funds.
- Suggested funds must belong to the organization.
- RAG metadata must be organization-scoped and transaction-type filtered.
- Empty categories are unresolved.
- External model confidence labels are advisory only.

## Privacy And Cost Controls

- Send Gemini the minimum fields needed for categorisation.
- Do not send full donor or pledge tables for basic categorisation.
- Keep per-organization AI rate limiting in front of model calls.
- Track stage counts, Gemini rows avoided, correction rate, and per-source accuracy.
- Log enough metadata to tune thresholds without exposing sensitive values unnecessarily.

## Frontend Changes

Keep the current transaction import review modal, with small additions:

- store original suggestion metadata for all sources, not only Gemini/RAG
- show source and confidence consistently
- mark unresolved or low-confidence rows clearly
- pass final reviewed values into feedback recording

The first implementation should avoid a large UI redesign.

## Testing

Unit tests:

- normalization signatures
- deterministic rules
- memory confidence updates
- Gemini output validation
- confidence label mapping

Backend integration or isolated Convex tests where practical:

- exact memory avoids Gemini fallback
- RAG metadata round-trip returns category and fund
- corrected transaction replaces stale RAG entry
- manual transaction update teaches memory
- invalid model category/fund output falls back safely

Manual verification:

1. Import a batch with repeated known transactions.
2. Apply categorisation.
3. Correct several rows.
4. Import similar rows again.
5. Confirm repeated items resolve from memory or RAG.
6. Confirm Gemini handles only unresolved rows.
7. Confirm low-confidence rows remain easy to review.

## Rollout Plan

Phase 1: repair RAG metadata and replacement keys, add output validation.

Phase 2: add memory table, normalization, and deterministic rules.

Phase 3: route import categorisation through the new pipeline and switch fallback to Flash-Lite.

Phase 4: record manual update feedback and add accuracy/cost metrics.

Phase 5: tune thresholds using real correction data.

## First-Release Implementation Decisions

- Add `categorizationFeedbackEvents` rather than changing the meaning of existing `categorizationCorrections` records.
- Use aggregate memory signatures as the primary RAG entries.
- Teach memory from changes made by Admin and Finance Team users only, matching existing edit permissions.
- Start with deterministic rules for bank charges, payment processor fees, utilities, internal transfers, cash collections, giving aliases, and fund keyword hints.
- Use the confidence thresholds defined in this spec for the first release, then tune them from source accuracy metrics.

## Success Metrics

- At least 50% of repeated transactions resolved before Gemini after enough history exists.
- RAG suggestions never return blank category/fund values.
- Per-source accuracy is visible in backend stats.
- Gemini calls per import decrease compared with the current RAG-first action.
- Treasurers can still review and correct every imported transaction before saving.
