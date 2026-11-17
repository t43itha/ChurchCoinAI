# Production launch plan

Written 17 November 2026. Scope: put ChurchCoin on real production infrastructure for churches to use, with Stripe billing and bank feeds switched off until a later release.

## Where we are (measured 17 Nov 2026)

| Piece | Today | Production target |
|---|---|---|
| Frontend | Vercel project `church-coin-ai`, served at `www.churchcoin.co.uk` and `church-coin-ai.vercel.app` | Same project and domain |
| Backend the live site calls | Convex **dev** deployment `efficient-dogfish-623` | Convex **prod** deployment `valuable-akita-907` |
| Convex prod | 270 functions (trunk has 273), holds a copy of the dev data (3 churches, 3 users, 5,795 transactions, newest row 6 Oct 2026) | Trunk code, data re-synced at cutover |
| Sign-in | Clerk **development** instance (`pk_test`, `possible-sturgeon-75.clerk.accounts.dev`) | Clerk **production** instance on `churchcoin.co.uk` (`pk_live`) |
| Billing | Stripe test keys; a 14-day trial then a paywall | Off. Churches get free early access |
| Bank feeds | Yapily wiring, no live connections (0 rows) | Off. Statement import is the route in |
| Trunk health | typecheck clean, lint 0 errors, 1,654 tests pass, build passes | Same, on every PR |

The gap is three things: code that still assumes billing and bank feeds, a deploy path that can put frontend and backend out of step, and the identity/infrastructure cutover that only the account owner can click through.

## Decisions taken (each is reversible; say the word to change it)

1. **Billing off means free early access.** No card, no trial countdown, no paywall. Plans and prices stay on the landing page with an "early access is free" note. Reverse with `BILLING_ENABLED=true` on the Convex deployment.
2. **Bank feeds are hidden, not half-shown.** No "Connect your bank" in onboarding, Settings, Transactions or the dashboard. Reverse with `BANK_FEEDS_ENABLED=true`.
3. **Production origin is `https://www.churchcoin.co.uk`** (already set as `APP_BASE_URL` on both deployments).
4. **The three existing users keep their churches.** Clerk production issues new user ids, so the users are created in Clerk production first and each user row is relinked by an explicit email-to-id mapping, never by automatic email matching.
5. **Vercel deploys the backend.** A production build with a deploy key runs `convex deploy` and the Vite build together, so the site and its backend cannot drift again.

## Workstreams

Each workstream is one PR against `main`. Builders work in their own git worktree and never touch a shared Convex deployment.

### PR-A. Launch mode: billing and bank feeds off — builder: Claude Opus 5.5

One server-owned shape decides what is live:

```ts
// convex/lib/launchFeatures.ts
export type LaunchFeatures = { billing: boolean; bankFeeds: boolean };
// billing   = process.env.BILLING_ENABLED === "true"
// bankFeeds = process.env.BANK_FEEDS_ENABLED === "true"
```

- [ ] `convex/lib/launchFeatures.ts` reads the two env flags (default off). One public, unauthenticated query returns the two booleans so the landing page and the app read the same source. No `VITE_*` duplicate of either flag.
- [ ] `resolveOrganizationAccess` gains an `early_access` state: a `subscription`-mode church can use the app while billing is off, whatever its trial or Stripe status. Demo and legacy rules are unchanged.
- [ ] New churches created while billing is off start no trial clock. Turning billing on later must give every early-access church a full trial from that date (an internal mutation plus a runbook line), never an instant paywall.
- [ ] Billing off in the UI: no trial banner or countdown in the sidebar, no Billing row in Settings, no checkout hand-off after onboarding, `SubscriptionRequired` never offers a payment that cannot complete. Stripe actions and the `/stripe/webhook` route fail closed with a clear message.
- [ ] Bank feeds off in the UI: onboarding "Connect your bank" step, Settings "Bank connections" row, Transactions bank-sync entry, dashboard "No bank feed connected" line. Bank-connection actions and the `/yapily/callback` route fail closed.
- [ ] Landing page and legal pages say only what is true at launch: bank feeds read as coming later, statement import is the headline route, pricing carries the early-access note.
- [ ] Tests: the access table covers `early_access` for every role; a test fails if a flag is read anywhere but `launchFeatures`.

### PR-B. Deploy pipeline, hardening and cutover tooling — builder: GPT-6 Astra

- [ ] `scripts/vercel-build.mjs` plus `buildCommand` in `vercel.json`. Production with `CONVEX_DEPLOY_KEY` runs `npx convex deploy --cmd "npm run build" --cmd-url-env-var-name VITE_CONVEX_URL`. Anything else runs the plain build, so merging this changes nothing until the key is set. With `REQUIRE_PRODUCTION_KEYS=1` the build fails on a `pk_test` key or a non-prod Convex URL.
- [ ] Content-Security-Policy built from the Clerk publishable key (the key encodes the Clerk Frontend API host), so the production Clerk domain is allowed without hand-editing `index.html`. `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy` move to response headers in `vercel.json` (a meta tag cannot enforce `frame-ancestors`).
- [ ] A readable error screen when `VITE_CONVEX_URL` or the Clerk key is missing, in place of a blank page. `VITE_APP_RELEASE` defaults to the Vercel commit sha for Sentry and support diagnostics.
- [ ] `launchPreflight` internal function: reports, by name only, env vars that are missing or still point at development (Clerk `*.clerk.accounts.dev` issuer, `resend.dev` sender, non-https `APP_BASE_URL`). Never returns a value.
- [ ] Clerk id relink: an idempotent internal mutation that takes `[{ email, clerkId }]`, refuses ambiguous or unknown emails, updates every stored copy of the id and reports what changed. A script builds the mapping from the two Clerk instances without printing keys.
- [ ] `scripts/smoke-prod.mjs <origin>`: page and legal routes return 200, security headers present, the bundle points at the prod Convex URL with a `pk_live` key, the launch-features query answers.
- [ ] `docs/PRODUCTION_LAUNCH_RUNBOOK.md`: the operator's exact steps, in order, with the rollback for each.

### PR-C. Tenant isolation and access fixes — builder: Claude Opus 5.5, after the audit

- [ ] Two independent read-only audits (Opus 5.5 and GPT-6 Astra, same brief) of every public Convex function and HTTP route: authentication, organisation scoping, capability checks, cross-church ids, donor redaction, webhook signature checks, fail-closed behaviour with env missing.
- [ ] Fix every confirmed finding. Findings both models report are treated as confirmed; single-model findings are reproduced before they are fixed or dismissed.
- [ ] A structural test so a new public function cannot ship without an auth helper.

### Review

Every PR is reviewed by the other model before merge (Astra reviews Opus, Opus reviews Astra). The coordinator checks each diff, runs typecheck, lint, tests and build at the PR head, and drives the launch-mode screens in a browser against a local anonymous Convex backend.

## Order

1. PR-A, PR-B and both audits run in parallel (disjoint files).
2. PR-C starts from the merged audit findings once PR-A is up, so it does not collide with PR-A in `convex/lib/access.ts`.
3. Cross-review, fixes, merge. Any PR that adds Convex functions is pushed to the dev deployment before its frontend reaches Vercel, because the live site still calls dev until cutover.
4. Cutover (below).

## Cutover checklist

Operator steps are marked **You**. Everything else the coordinator runs, on your go.

The order matters. Convex prod gets trunk code before anything is checked against it, and the three users exist in Clerk production before the site switches, so nobody lands in onboarding.

- [ ] **You.** Clerk dashboard: create the production instance for `churchcoin.co.uk`, add its DNS records (DNS is at IONOS; none exist yet), switch on the same sign-in methods, add production OAuth credentials for any social login, create the `convex` JWT template, apply `docs/CLERK_BRANDING_RUNBOOK.md`.
- [ ] **You.** Give the coordinator the production publishable key and issuer domain (both public values).
- [ ] **You.** In the Clerk production dashboard, create the three existing users with the same email addresses they use today. They sign in afterwards with an email code or the same social login.
- [ ] Deploy trunk to Convex prod (nothing reads it yet). Set `CLERK_JWT_ISSUER_DOMAIN` to the production issuer; confirm `BILLING_ENABLED` and `BANK_FEEDS_ENABLED` are unset; run `launchPreflight` until it reports nothing.
- [ ] Freeze writes (announce a short window). Export dev, import into prod with `--replace-all`, compare row counts per table, and record each church's dashboard totals.
- [ ] Build the email-to-id mapping from Clerk production, run the relink as a dry run, read the summary, then run it for real.
- [ ] **You.** Vercel, Production environment only: `VITE_CLERK_PUBLISHABLE_KEY` (pk_live), `CONVEX_DEPLOY_KEY` (prod deploy key from the Convex dashboard), `REQUIRE_PRODUCTION_KEYS=1`, `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT=production`. Leave Preview on the dev values.
- [ ] Trigger the production deploy. Run `scripts/smoke-prod.mjs https://www.churchcoin.co.uk`.
- [ ] **You.** Sign in with each existing account. Each must land in its own church, not onboarding, and the dashboard totals must match the recorded figures. Then lift the freeze.
- [ ] Rollback, inside the freeze window only: point the Vercel Production env vars back at the dev values and redeploy. Dev data is untouched by the cutover, so nothing is lost while no church has saved on prod. Once the freeze is lifted, prod holds the only copy of new work; fix forward, or export prod and import it into dev before pointing back.

## Not in this launch

Stripe checkout and webhooks, Yapily bank feeds, the pending "Internal Transfer" reclassification (waits for your decision on the December 2025 deposits), removal of the last legacy style classes, PR #26.

## Risks

- **Frontend and backend out of step** (the 6 Oct outage). PR-B removes the cause; until cutover, backend-first pushes to dev cover it.
- **Existing users land in onboarding after the Clerk switch.** The relink covers it; the smoke check signs in as an existing user before the window closes.
- **A church locked out when billing is switched on later.** PR-A's trial-from-switch-on rule and its test cover it.
- **Clerk production needs DNS.** Propagation can take hours; start that step first.
