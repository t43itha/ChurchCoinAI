# Direct OpenAI Luna status — 13 August 2026

The direct OpenAI Responses API benchmark completed after credits were enabled.
Authentication, strict structured output, and all 30 requests succeeded, but the
standard direct service tier did not beat the existing options on this workload.

| Measure | OpenAI direct Luna | OpenRouter Luna | Gemini 2.5 Flash via OpenRouter |
|---|---:|---:|---:|
| Category accuracy | 98.7% | **100.0%** | 99.0% |
| All fields correct | 97.3% | **99.0%** | 98.0% |
| Category consistency | 97.0% | **100.0%** | 98.0% |
| Median latency / 10 | 3,081 ms | **357 ms** | 485 ms |
| P95 latency / 10 | 13,436 ms | **669 ms** | 833 ms |
| Cost / 300 predictions | $0.11525 | **$0.01169** | $0.06877 |
| Projected cost / 1,000 | $0.384 | **$0.039** | $0.229 |
| Request/schema failures | 0 | 0 | 0 |

Direct Chat Completions was also smoke-tested with the same contract. It succeeded
but took 3,392 ms, so the endpoint choice does not explain the direct latency.

The production validation guards deterministically fix four of the direct run's
eight all-field misses (merchandise donor attribution and impossible expenditure
Gift Aid), which would raise post-validation all-field accuracy to approximately
98.7%. They do not improve the 98.7% raw category score.

## Decision

Keep `CATEGORIZATION_AI_PROVIDER` on Gemini for now. The direct Luna adapter remains
deployed and ready for shadow use, with automatic Gemini fallback, but direct Luna
should not be made the synchronous UI default while its measured p95 is 13.4 seconds.

OpenAI Priority processing is a possible future latency experiment if enabled for
the project, but it is a different service tier and should be evaluated separately
for price, effective tier returned, latency, and accuracy.
