# Production launch

Run these steps only after PR-A, PR-B and PR-C have been reviewed and merged. The commands below are for the authorised cutover operator, not for implementation agents. Use Node 22 and a clean checkout of the agreed main commit. Do not let new merges or automatic deployments run during cutover.

The live backend is `efficient-dogfish-623`; the target is `valuable-akita-907`. The public origin stays `https://www.churchcoin.co.uk`. Until the operator sets a Convex deploy key in Vercel Production, the build script continues to run only `npm run build`; it does not switch backend or Clerk instance. The new headers and generated CSP do ship on merge.

## 1. Prepare Clerk and DNS

In Clerk, create the production instance for `churchcoin.co.uk`. Add the exact records supplied by Clerk in **IONOS**, which hosts the domain's DNS. No Clerk records existed at the start of this launch. Wait for Clerk to verify every record. Preserve the existing website records and Resend DKIM/SPF records; invitation DNS already resolves.

Enable the same sign-in methods, configure production OAuth credentials where needed, and apply [Clerk branding](CLERK_BRANDING_RUNBOOK.md). Create the `convex` JWT template with audience `convex` and the custom claim `"email_verified": "{{user.email_verified}}"`. Add that claim to the current **development** instance's `convex` JWT template as well, before PR-C reaches the live backend. Sign-up and invitation acceptance fail closed without verified email. Record the production publishable key and issuer domain; these two values are public.

Rollback: leave the live development instance selected. Correct or remove only the new Clerk DNS records. Retain the verified-email JWT claim on development while PR-C is deployed.

## 2. Create the existing accounts

In the Clerk production dashboard, create the three existing users with their current primary email addresses. Verify ownership through the approved Clerk verification process; the mapping script accepts only verified primary emails. Do not ask users to sign into the application yet. They will sign in after relinking, using an email code or their social provider.

Compare these emails with the three Convex user rows. Save the original email-to-development-ID mapping privately for recovery. Do not commit account inventories or mapping files.

Rollback: the live application still uses Clerk development. Correct incorrectly created production accounts before continuing.

## 3. Prepare Convex production and run preflight

Use the Convex dashboard to confirm the project and production deployment name. Set `CLERK_JWT_ISSUER_DOMAIN` to the production issuer before deploying code that validates it. Most production variables already exist, but the issuer still points to Clerk development. Deploy the agreed trunk commit to production, which the live application does not yet use:

```sh
npx convex deploy
```

Use a production deployment key for **valuable-akita-907** supplied securely through `CONVEX_DEPLOY_KEY`, never as a command argument or in a committed file. Confirm the CLI target before approving. For the explicitly targeted commands below, use an operator checkout authenticated to the correct project, with no deployment-key override or anonymous `.env.local` left over from development.

In the production dashboard set or confirm:

- `CLERK_JWT_ISSUER_DOMAIN`: the verified production issuer.
- `APP_BASE_URL=https://www.churchcoin.co.uk`.
- `GEMINI_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` always: reports, Smart Link and chat call Gemini, and AI search embeds through Google, whichever provider categorises. Add the categorisation provider key too: `OPENAI_API_KEY` for `CATEGORIZATION_AI_PROVIDER=openai`, `OPENROUTER_API_KEY` for `openrouter`.
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` on the verified custom domain, never `resend.dev`. Confirm sender verification in Resend even though DNS resolves.
- Leave `BILLING_ENABLED` and `BANK_FEEDS_ENABLED` unset (or `false`). Stripe and Yapily credentials are not launch prerequisites.
- Optional AI budgets: `AI_USER_UNITS_PER_MINUTE=600`, `AI_ORG_UNITS_PER_MINUTE=1000`, `AI_ORG_DAILY_UNITS=10000`, `AI_DAILY_UNITS=200000`. These are the defaults. `AI_RATE_LIMIT_PER_MINUTE` is no longer read.
- Optional per-person and invitation caps from PR-C (defaults): `AI_PERSON_DAILY_UNITS=10000`, `CHURCH_CREATIONS_PER_PERSON_DAILY=2`, `INVITE_EMAILS_PER_PERSON_DAILY=25`, `INVITE_EMAILS_DAILY=200`. Keep `INVITE_EMAILS_DAILY` at or below the Resend plan's daily sending quota.

```sh
npx convex run --deployment valuable-akita-907 mutations/maintenance:launchPreflight '{}'
```

Proceed only when the result is `[]`. Failures contain variable names only. Never use `convex env list` to inspect secrets. Check Sentry's native Convex integration in the production dashboard separately.

Rollback: restore the previous production code/configuration if needed; the live site still uses development. Do not change the development issuer to the production issuer.

## 4. Freeze writes and copy data

Announce the write freeze and obtain acknowledgement from every church user. Stop imports and external writers and prevent concurrent deployments. Keep the freeze through all checks below. Record each church's dashboard totals and per-table counts. If a write occurs after the export, stop and repeat the snapshot before proceeding.

Keep snapshots outside the repository in restricted storage. Back up the old production dataset, then export development, including file storage:

```sh
npx convex export --deployment valuable-akita-907 --include-file-storage --path ../prod-before-cutover.zip
npx convex export --deployment efficient-dogfish-623 --include-file-storage --path ../dev-cutover.zip
npx convex import --deployment valuable-akita-907 --replace-all ../dev-cutover.zip
```

Read the destructive import confirmation and check the destination is **valuable-akita-907**. `--replace-all` clears target tables absent from the snapshot; this is intentional. Use the full ZIP to preserve IDs and references. Compare all table counts with the snapshot and development, including component data and storage where applicable. Record any discrepancy and stop until explained. Repeat preflight after import; environment settings are not imported with data.

Rollback: development data is unchanged. Keep the site on development; restore `prod-before-cutover.zip` to production if required. Never import a production backup into development as part of this step.

## 5. Relink Clerk IDs

Supply `CLERK_PRODUCTION_SECRET_KEY` through a secure environment loader. Do not paste it into shell history or command arguments. The script calls Clerk's read-only `GET /v1/users` endpoint on the production instance with offset pagination and writes one entry per verified primary email. It refuses two production accounts that share an email.

```sh
node scripts/clerk-relink-mapping.mjs ../clerk-relink-mapping.json
```

Review the output file against the three existing Convex users. Resolve missing or unverified accounts in Clerk; do not substitute secondary or unverified emails. If the production instance holds any other account (an operator test account, say), remove it from the reviewed mapping so only the three intended users remain. The mutation refuses unknown or ambiguous email matches and ID ownership conflicts for the whole batch.

In the **valuable-akita-907** Convex dashboard, run internal `mutations/maintenance:relinkClerkIds` with `{"mapping": <the reviewed array>, "dryRun": true}`. Review every before/after summary, then repeat with `dryRun: false`. Repeat the dry run: all `changed` fields must be false. IDs in summaries are truncated; validate the full IDs in the privately held mapping. Defaults are dry-run, with a limit of 100 mapping entries and 1,000 user rows; exceeding these limits refuses the transaction.

Stored Clerk ID copies are `users.clerkId` and `organizations.createdBy`. Both change atomically. Other user references are Convex document IDs and remain unchanged. Existing external Stripe metadata and historical logs are not rewritten; billing and banking remain disabled.

Rollback: while frozen, restore the saved development-ID mapping with the same internal mutation, or repeat the untouched development snapshot import into production. Never run relinking on development during this cutover.

## 6. Set Vercel Production variables

The Vercel CLI on this machine is logged out. Use the dashboard for project **church-coin-ai**, **Production** environment only:

- `VITE_CLERK_PUBLISHABLE_KEY`: the production `pk_live_` key.
- `CONVEX_DEPLOY_KEY`: the production key for `valuable-akita-907`, format `prod:valuable-akita-907|…`.
- `REQUIRE_PRODUCTION_KEYS=1`.
- Remove the old hard-coded `VITE_CONVEX_URL`, or set it to `https://valuable-akita-907.convex.cloud`. The deploy command supplies this value to Vite.
- `VITE_SENTRY_DSN` and `VITE_SENTRY_ENVIRONMENT=production`.
- Optionally `VITE_APP_RELEASE`; otherwise it uses `VERCEL_GIT_COMMIT_SHA`.

Keep Preview on its current development values. Save the previous Production configuration privately. Never prefix a backend secret with `VITE_`.

Rollback: restore the previous Clerk publishable key and development Convex URL, **remove `CONVEX_DEPLOY_KEY` and `REQUIRE_PRODUCTION_KEYS`**, and redeploy. Leaving the deploy key in place would override the intended development URL or fail the strict gate. This simple rollback is safe only while writes remain frozen.

## 7. Deploy and smoke-test

Trigger a Production redeploy of the agreed commit. Check that the build runs:

```sh
npx convex deploy --cmd "npm run build" --cmd-url-env-var-name VITE_CONVEX_URL
```

The build and backend deployment share the same target. This is not an atomic rollback of frontend and backend: a later Vercel publication failure can leave new backend code active. Keep backend changes compatible with the previous frontend and inspect both deployment statuses on failure.

```sh
node scripts/smoke-prod.mjs https://www.churchcoin.co.uk --expect-convex https://valuable-akita-907.convex.cloud --expect-live-clerk
```

Require exit code zero. The script checks the three public routes, response headers, bundled production configuration, Convex availability, and `queries/launchFeatures:get` returning both flags false. A missing query is a failure: deploy PR-A before continuing. Test invitation delivery and inspect Sentry release tagging without sending private donor data.

Rollback: inside the freeze, restore the Vercel settings from step 6 and redeploy. Check the development-backed site before releasing users.

## 8. Verify accounts and lift the freeze

Have each existing user sign in. Each must land in their own church, never onboarding, and see the recorded dashboard totals. Check Admin organisation settings, Finance Team editing permissions, Pastorate read-only donor access, and Guest donor redaction and lack of Reports access using approved role test accounts. Confirm no billing paywall or bank-connect entry is offered. Do not save financial changes during these checks.

Only after all checks pass, announce that writes may resume and record the time. Keep the snapshots and original ID mapping under the organisation's retention/access policy; clear temporary Clerk secret environment variables.

Rollback before lifting the freeze: use step 6. **After lifting the freeze, production holds the only copy of new work.** Prefer fixing forward. Any rollback then needs another freeze, a production backup, a reviewed production-to-development data migration, and reversal of Clerk IDs before switching the frontend. Simply selecting the old backend would lose new work.

## Switching billing on later

Configure and test production Stripe products, prices, secrets and webhook handling first. Announce the change and back up production. Set `BILLING_ENABLED=true` on Convex, then run internal `mutations/organizations:startTrialsAfterEarlyAccess` with `{}` and repeat with `{"cursor": "<returned continueCursor>"}` until `isDone` is true. PR-A gives early-access churches a full trial from the switch date. Confirm trial dates and checkout before inviting payments. Do not stop after the first page.

Rollback: set `BILLING_ENABLED=false` to restore free early access. Review any Stripe subscriptions/payments already created separately; disabling the feature does not cancel them.

## Switching bank feeds on later

Configure and test live Yapily credentials, consent/callback URLs and `APP_BASE_URL`. Set `BANK_FEEDS_ENABLED=true` on Convex only after end-to-end consent and sync verification. Rollback: set it to `false`; separately revoke any consents that should no longer remain valid.

## References

- [Convex Vercel integration](https://docs.convex.dev/production/hosting/vercel) and [deploy-key formats](https://docs.convex.dev/cli/deploy-key-types).
- [Clerk CSP requirements](https://clerk.com/docs/guides/secure/best-practices/csp-headers) and [Backend API user listing](https://clerk.com/docs/reference/backend-api/tag/users/get/users).
- [Convex snapshot export](https://docs.convex.dev/database/import-export/export) and [import](https://docs.convex.dev/database/import-export/import). Confirm installed CLI options with `--help` before cutover.
