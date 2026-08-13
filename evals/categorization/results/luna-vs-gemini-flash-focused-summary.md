# Focused Luna versus Gemini Flash evaluation — 13 August 2026

## Decision

GPT-5.6 Luna is the preferred candidate for a controlled rollout. It was more
accurate, more consistent, and about six times cheaper through the tested
OpenRouter route. The original latency calculation measured response headers, not
the complete structured response, so it is not used in this decision.

The production model has not been changed by this work.

## Method

- 100 synthetic UK church transactions, with no real donor or bank data.
- The original 50-case breadth set plus 50 targeted boundary cases.
- Three complete passes per model: 300 scored predictions per model.
- Ten transactions per request and 30 successful requests per model.
- Identical prompt and simplified strict JSON schema for both models.
- Provider fallback disabled and routing set to `data_collection: deny`.
- Reasoning disabled for both models.

## Result

| Measure | GPT-5.6 Luna | Gemini 2.5 Flash |
|---|---:|---:|
| Category accuracy | **100.0%** | 99.0% |
| All fields correct | **99.0%** | 98.0% |
| Fund accuracy | 100.0% | 100.0% |
| Gift Aid accuracy | 99.7% | **100.0%** |
| Donor accuracy | 99.0% | 99.0% |
| Category consistency across runs | **100.0%** | 98.0% |
| All-field consistency across runs | **99.0%** | 98.0% |
| Historical header latency p50 / 10† | 357 ms | 485 ms |
| Historical header latency p95 / 10† | 669 ms | 833 ms |
| Observed cost for 300 predictions | **$0.01169** | $0.06877 |
| Projected cost per 1,000* | **$0.039** | $0.229 |
| Request/schema failures | 0 | 0 |

\* Linear projection from this test route and batch size, not a contractual price.

† These historical figures stop when response headers arrive. They are not
end-to-end latency and should not be compared with user-visible wait time. The eval
runner now measures through body download and JSON parsing.

## Misses

Luna categorised all 300 rows and all funds correctly. Its three all-field misses
were the same merchandise purchase: it returned the named customer as a donor on
all passes and marked the purchase Gift Aid eligible once. This can be prevented
with a deterministic post-validation rule for merchandise.

Gemini missed the category on three predictions: one company thanksgiving payment
and the same income refund on two runs. It also omitted one abbreviated donor on
all three runs.

## Rollout gate

Before replacing Gemini in production:

1. Shadow Luna on anonymised or synthetic transaction text only.
2. Compare against finance-team corrections for at least 200 representative live
   cases; synthetic results alone are not sufficient.
3. Add deterministic validation for merchandise Gift Aid/donor fields and reject
   any income/expenditure category mismatch.
4. Require zero schema failures, category accuracy at or above the existing model,
   and acceptable OpenRouter retention and regional-processing terms.
5. Keep Gemini as an operational fallback until Luna has passed the shadow period.
