# Transaction categorisation model eval

This eval compares hosted models on ChurchCoin's transaction categorisation contract.
The cases are synthetic and contain no real donor, church, or bank data.

It measures:

- category, fund, Gift Aid, and donor-name accuracy;
- all-fields-correct transaction accuracy;
- income/expenditure category violations;
- missing, duplicate, or malformed predictions;
- request latency, token usage, reasoning tokens, and billed cost.

The default model matrix is defined in `scripts/eval-categorization.mjs`. All models
receive the same prompt and strict JSON schema. Reasoning is disabled where the
model supports that setting and kept at the minimum where it is mandatory.
OpenRouter provider fallbacks are disabled and routing is restricted to providers
marked as not collecting prompts.

Run a local validation without making model calls:

```bash
node scripts/eval-categorization.mjs --dry-run
```

Run the complete matrix:

```bash
npm run eval:categorization
```

The runner reads `OPENROUTER_API_KEY` from the process environment. As a convenience,
it will also read that variable from Hermes' active `.env` file without printing it.
Results are written to `evals/categorization/results/` unless `--out` is supplied.

Useful options:

```bash
node scripts/eval-categorization.mjs --models google/gemini-2.5-flash-lite,openai/gpt-5-nano
node scripts/eval-categorization.mjs --chunk-size 8 --runs 2
node scripts/eval-categorization.mjs --zdr
```

Run the focused Luna versus Gemini Flash comparison:

```bash
node scripts/eval-categorization.mjs --dataset evals/categorization/focused-cases.json --models openai/gpt-5.6-luna,google/gemini-2.5-flash --chunk-size 10 --runs 3
```

Run Luna through the direct OpenAI Responses API:

```bash
node scripts/eval-categorization.mjs --provider openai --dataset evals/categorization/focused-cases.json --models gpt-5.6-luna --chunk-size 10 --runs 3
```

The direct run reads `OPENAI_API_KEY` from the process environment and calculates
observed cost using Luna's current direct token prices. Keep production keys in
the Convex environment rather than local files or the repository.

`--zdr` is stricter than the default `data_collection: deny` policy and may make a
model unavailable if OpenRouter has no zero-retention endpoint for it.
