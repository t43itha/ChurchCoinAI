# ChurchCoin

ChurchCoin is a multi-tenant financial management platform for UK churches. It brings fund accounting, donor and pledge management, bank transaction imports, reconciliation, reporting, and AI-assisted categorisation into one workspace.

The product is currently being prepared for a supervised pilot with a small number of churches. It is not yet offered as an unattended self-serve service.

## What it does

- Tracks unrestricted, restricted, designated, and endowment funds.
- Manages donors, Gift Aid indicators, pledges, campaigns, and in-person giving.
- Imports UK Open Banking transactions through Yapily or Enable Banking.
- Reconciles statements, cash collections, cheques, and bank deposits.
- Suggests transaction categories using Gemini and organization-scoped RAG memory.
- Produces trustee-friendly reports and PDF/Excel exports.
- Supports Admin, Finance Team, Pastorate, and Guest roles.
- Provides tokenised email invitations and organization onboarding.

## Technology

- React 19, TypeScript, Vite, and Tailwind CSS
- Convex for the database, real-time queries, actions, and HTTP endpoints
- Clerk for authentication
- Google Gemini and Convex RAG for categorisation
- Yapily (recommended) and Enable Banking for UK Open Banking connections
- Stripe for subscriptions
- Resend for invitations
- Sentry for browser error reporting, with Convex's native exception integration recommended for backend functions

## Local development

Requirements: Node.js 22.12 or newer, npm, a Convex project, and a Clerk application.

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Copy `.env.example` to `.env.local` and set at least:

   ```dotenv
   VITE_CONVEX_URL=https://your-deployment.convex.cloud
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
   ```

3. Configure backend values in the Convex Dashboard or with `npx convex env set`. The full inventory is documented in `.env.example`.

4. Run the frontend and backend together in separate terminals:

   ```bash
   npm run dev
   npx convex dev
   ```

The frontend is available at `http://127.0.0.1:3000`.

## Quality checks

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint
npm test            # Vitest suite
npm run build       # Production bundle
npm audit           # Dependency advisories
```

GitHub Actions runs the dependency audit, type-check, lint, tests, and production build on every pull request and on pushes to `main`.

## Production configuration

### Invitation email

Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in Convex. The sender must belong to a domain verified in Resend. ChurchCoin intentionally refuses the `resend.dev` sandbox sender so a pilot invitation cannot appear successful when it is only deliverable to the Resend account owner.

### Monitoring

Set `VITE_SENTRY_DSN` and `VITE_SENTRY_ENVIRONMENT` in the frontend deployment to capture browser exceptions. The integration does not send default personally identifying information; authenticated events are tagged with internal Clerk user and organization IDs for support correlation.

For backend exceptions, enable the native Sentry integration for each production Convex deployment under **Deployment Settings → Integrations**. This is a deployment-level setting and is not activated by the frontend DSN.

### In-app support tickets

Signed-in members can submit bugs, questions, and product ideas from **Help & feedback**. The report is stored in Convex first and then mirrored to GitHub in the background, so a GitHub outage cannot lose the customer's request.

Create a separate **private** repository such as `ChurchCoinAI-Support`; never point this integration at the public source repository. Create a GitHub App installed only on the support repository with **Metadata: read** and **Issues: read/write** permissions, then set the `GITHUB_*` values documented in `.env.example` in the Convex deployment.

Configure the GitHub App's webhook URL as:

```text
https://YOUR-CONVEX-DEPLOYMENT.convex.site/github/support-webhook
```

Subscribe it to **Issues** events and use the same secret as `GITHUB_WEBHOOK_SECRET`. The following optional labels drive the customer-visible workflow:

- `customer-report`
- `status:triage`
- `status:under-review`
- `status:in-progress`
- `status:waiting-for-customer`
- `status:resolved`

GitHub comments remain internal. Only the issue state and explicit status labels are mirrored back to the customer's **My requests** view. The backend refuses to create customer issues if the configured repository is public.

### Banking and billing

To activate Yapily access:

1. Create a Yapily Console application and arrange production access through Yapily Connect (delegated AISP licensing) or your own regulated registration.
2. In Yapily, authorise the exact callback URL `https://YOUR-CONVEX-DEPLOYMENT.convex.site/yapily/callback`. Yapily Connect uses `https://auth.yapily.com/` as the bank redirect and returns the browser to this callback.
3. Set `YAPILY_APPLICATION_ID`, `YAPILY_APPLICATION_SECRET`, `YAPILY_CALLBACK_URL`, and `APP_BASE_URL` in the target Convex deployment. `YAPILY_API_BASE_URL` is optional.
4. Enable/register the UK institutions required by the pilot churches. ChurchCoin lists only institutions exposed to the application with account-authorisation, account, and transaction features.
5. Test first with a Yapily sandbox institution, then complete a live-bank consent in **Settings → Bank Connections** and map each account to a ChurchCoin fund.

ChurchCoin requests a Yapily one-time token at callback, exchanges it server-side,
stores the resulting consent credential only in Convex, and revokes the consent
when a connection or organisation is deleted. The callback schedules account
discovery before redirecting so it meets Yapily's fast-response guidance.

To activate Enable Banking access:

1. Register a sandbox or production API application in the Enable Banking control panel and retain its application ID and generated private key.
2. Allowlist the exact Convex callback URL, `https://YOUR-CONVEX-DEPLOYMENT.convex.site/enable-banking/callback`, on that application.
3. Set `ENABLE_BANKING_APPLICATION_ID`, `ENABLE_BANKING_PRIVATE_KEY`, `ENABLE_BANKING_REDIRECT_URL`, `ENABLE_BANKING_DEFAULT_COUNTRY=GB`, and `APP_BASE_URL` in the target Convex deployment. `ENABLE_BANKING_API_BASE_URL` is optional.
4. Activate the production application. A restricted production application can be tested only with accounts linked in Enable Banking until commercial access is approved.
5. In **Settings → Bank Connections**, choose a bank from the live business-AISP list, complete consent, and map each returned account to a ChurchCoin fund.

ChurchCoin revalidates the selected bank immediately before starting consent,
stores the expiry returned by the authorised session, and keeps transaction sync
manual so imported entries can be reviewed before they reach the ledger.

Set Yapily and/or Enable Banking, Stripe, and callback variables listed in `.env.example`. `APP_BASE_URL` must be the deployed frontend origin. Keep all provider secrets in Convex—never place them in `VITE_*` values, which are shipped to browsers.

## Data protection and retention

Organization admins can use **Settings → Data & Privacy** to:

- download a paginated JSON export covering every organization-scoped table, with invitation, banking, and Stripe credentials removed; and
- permanently delete an organization after an exact-name confirmation.

Deletion first revokes Yapily, Enable Banking, and legacy Plaid access, removes the Stripe customer, clears organization RAG data, and then erases tenant records in bounded batches. The user's Clerk sign-in is retained so they can join or create another organization.

Deletion is not a substitute for a retention policy. UK charities generally need accounting and Gift Aid records for at least six years. Pilot churches should export and retain legally required records before deletion and document their own retention schedule and data-processing responsibilities.

## Security model

- Every application table is scoped by `organizationId`.
- Server-side auth helpers derive identity from Clerk and enforce roles in Convex.
- Stripe webhooks verify signatures.
- Yapily and Enable Banking callback state is provider-bound, single-use, and time-limited; Yapily callbacks expose only a short-lived one-time token.
- Preserved Plaid webhooks verify JWT signatures and request body hashes.
- GitHub support webhooks verify HMAC signatures, and customer issue syncing is restricted to a private repository.
- Financial values use shared money-precision helpers.
- Provider secrets remain server-side and are excluded from data exports.

Please report security issues privately to the project owner rather than opening a public issue.

## Repository map

```text
components/       React application and settings UI
convex/           Schema, queries, mutations, actions, and HTTP endpoints
convex/lib/       Authentication, banking, money, and validation helpers
lib/              Shared frontend/domain helpers
services/         PDF and spreadsheet export services
tests/            Vitest unit and pipeline tests
docs/             Product, architecture, design, and implementation notes
```

## Deployment

Build the frontend with `npm run build` and deploy `dist/` to the configured host. Deploy Convex functions separately:

```bash
npx convex deploy
```

Before inviting a pilot church, verify the production Resend sender, Sentry projects, Clerk JWT issuer, Stripe webhook, Yapily/Enable Banking callbacks, backup/export procedure, and the complete CI run.
