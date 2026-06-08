# GoCardless Bank Account Data Design

Date: 2026-06-08

## Context

ChurchCoinAI currently has a provider-neutral `bankConnections` layer with Enable Banking as the active provider. Enable Banking proved unsuitable because its self-service account-linking flow does not support UK banks. The product target remains unchanged: UK church finance teams need read-only bank transaction data, primarily for Metro Bank business accounts, with manual review before anything enters the ledger.

GoCardless Bank Account Data is the replacement provider. It supports UK Open Banking Account Information Services through a redirect-based requisition flow:

1. The backend exchanges `GOCARDLESS_SECRET_ID` and `GOCARDLESS_SECRET_KEY` for an access token.
2. The backend creates an end-user agreement for a selected institution.
3. The backend creates a requisition with a redirect URL and reference.
4. The user completes bank authentication and returns to ChurchCoinAI through `/gocardless/callback`.
5. The backend reads the requisition, stores selected accounts, and later fetches account transactions on demand.

Official docs used for this design:

- GoCardless Bank Account Data overview: `https://developer.gocardless.com/bank-account-data/overview/`
- Quickstart guide: `https://developer.gocardless.com/bank-account-data/quick-start-guide/`
- Sandbox guide: `https://developer.gocardless.com/bank-account-data/sandbox`
- Transactions reference: `https://developer.gocardless.com/bank-account-data/transactions`

## Goals

- Replace Enable Banking as the active bank data provider with GoCardless Bank Account Data.
- Preserve the existing manual sync model: connect account, map account to fund, fetch transactions, review, then import.
- Support sandbox testing with `SANDBOXFINANCE_SFIN0000`.
- Keep the production switch simple by changing GoCardless credentials and institution ID, without rewriting ChurchCoinAI code.
- Keep provider-specific API details out of React components.
- Update public legal copy so it names GoCardless, not Enable Banking.
- Keep the preserved Plaid compatibility code untouched unless a file must change for the active provider migration.

## Non-Goals

- No automatic scheduled imports.
- No direct ledger writes during bank sync.
- No payment initiation or variable recurring payments.
- No multi-provider chooser in the UI.
- No attempt to migrate legacy Plaid item records.
- No storage of raw GoCardless transaction payloads in the ledger.
- No broad rewrite of Settings or Transactions screens beyond provider copy and required data shape changes.

## Recommended Approach

Replace Enable Banking inside the existing provider-neutral bank connection layer rather than adding a second user-facing provider path.

The UI should continue calling:

- `api.actions.bankConnections.startConnection`
- `api.actions.bankConnections.syncTransactions`
- `api.actions.bankConnections.removeConnection`
- `api.mutations.bankConnections.updateAccountFundMapping`
- `api.mutations.bankConnections.acknowledgeSyncThrough`

Those names already express ChurchCoinAI behavior and avoid leaking provider details into components. The provider value changes from `enable_banking` to `gocardless`, and the backend implementation changes from Enable Banking session APIs to GoCardless requisition APIs.

## Architecture

### Backend Provider Module

Create `convex/lib/gocardless.ts`.

Responsibilities:

- Read backend-only environment variables:
  - `GOCARDLESS_SECRET_ID`
  - `GOCARDLESS_SECRET_KEY`
  - `GOCARDLESS_REDIRECT_URL`
  - `GOCARDLESS_INSTITUTION_ID`
  - `GOCARDLESS_COUNTRY`
  - optional `GOCARDLESS_API_BASE_URL`
- Default API base URL to `https://bankaccountdata.gocardless.com/api/v2`.
- Create and cache short-lived access tokens within the action invocation.
- Create end-user agreements with a 90-day access validity.
- Create requisitions with `redirect`, `institution_id`, `reference`, and `agreement`.
- Retrieve requisitions after callback.
- Retrieve account details and balances when completing a connection.
- Retrieve booked and pending transactions for manual sync.
- Delete requisitions during disconnect where the API supports it.
- Throw typed `GoCardlessApiError` values with status codes so actions can mark reauthentication-required states.

### Convex Actions

Modify `convex/actions/bankConnections.ts`.

`startConnection` should:

1. Require Admin or Finance Team role.
2. Create a random state/reference.
3. Validate any `existingConnectionId` belongs to the current organization.
4. Insert `pendingBankConnections` with provider `gocardless`, country `GB`, and institution name from configuration.
5. Create a GoCardless end-user agreement.
6. Create a GoCardless requisition.
7. Return the GoCardless authorization link.

`syncTransactions` should:

1. Keep the current date range and pagination cursor behavior.
2. Fetch transactions for mapped accounts only.
3. Normalize GoCardless booked transactions into `ChurchCoinPendingBankTransaction`.
4. Ignore pending transactions in v1, because ChurchCoinAI imports reviewed ledger transactions and should avoid importing entries that may still change.
5. Mark the connection `pending_reauth` on 401, 403, or provider errors that indicate the requisition is expired or access has been revoked.

`removeConnection` should:

1. Require Admin role.
2. Attempt to delete the GoCardless requisition.
3. Treat 404 as already removed.
4. Delete the local connection record.

### HTTP Callback

Modify `convex/http.ts`.

Add or replace the active callback route:

- Path: `/gocardless/callback`
- Method: `GET`

Callback behavior:

1. If opened without parameters, return `200 OK` with a plain-text readiness message so provider URL validators pass.
2. Read `ref` and `error` query parameters. GoCardless commonly returns the requisition reference as `ref`.
3. Look up the pending connection by state/reference.
4. If provider error is present, mark pending as error and redirect to Settings bank tab.
5. Retrieve the GoCardless requisition.
6. Use the requisition `accounts` array to retrieve account details.
7. Complete the pending connection using the requisition ID as `providerConnectionId`.
8. Redirect to `APP_BASE_URL/settings?tab=bank&bankConnection=success` or the existing error equivalent.

Keep `/enable-banking/callback` only if needed as a backwards-compatible health or error route during deployment. The active configuration should use `/gocardless/callback`.

### Data Model

Modify `convex/schema.ts`.

`bankConnections.provider` should accept `gocardless`. Existing Enable Banking records can remain readable during development, but the active provider should be GoCardless. Recommended schema:

```ts
provider: v.union(v.literal("gocardless"), v.literal("enable_banking"))
```

`pendingBankConnections.provider` should use the same union during transition.

No new table is required. Use existing fields as follows:

- `providerConnectionId`: GoCardless requisition ID.
- `institutionName`: configured institution display name, such as `Metro Bank` or `GoCardless Sandbox`.
- `institutionCountry`: `GB`.
- `accounts[].accountId`: GoCardless account ID.
- `accounts[].providerAccountHash`: stable account identifier where available from account details, otherwise omitted.
- `accounts[].name`: account display name from details, falling back to owner name or account ID.
- `accounts[].mask`: final four characters from IBAN or BBAN where available.
- `accounts[].type`: cash account type or product where available.
- `accounts[].currency`: account currency.
- `consentExpiresAt`: 90 days from agreement creation unless provider response gives a more precise value.

### Transaction Normalization

Modify `convex/lib/bankConnectionUtils.ts`.

Add GoCardless transaction types and a `normalizeGoCardlessTransaction` function that returns `ChurchCoinPendingBankTransaction`.

Expected input fields:

- `transactionId`
- `entryReference`
- `bookingDate`
- `valueDate`
- `transactionAmount.amount`
- `transactionAmount.currency`
- `remittanceInformationUnstructured`
- `remittanceInformationUnstructuredArray`
- `creditorName`
- `debtorName`
- `additionalInformation`

Rules:

- Date priority: `bookingDate`, then `valueDate`.
- Identifier priority: `transactionId`, then `entryReference`.
- Amount must be finite and non-zero.
- Positive amount means income and negative amount means expenditure for GoCardless transaction data.
- Stored amount is always absolute.
- Description priority: unstructured remittance, unstructured remittance array joined with spaces, additional information, creditor name, debtor name, then `Bank transaction`.
- Malformed date, missing date, missing identifier, or malformed amount should throw provider-specific errors mentioning GoCardless.

### Frontend

Modify `components/BankConnectionsSettings.tsx`.

Required changes:

- Replace any Enable Banking copy with GoCardless/Open Banking copy.
- Add a short Metro Bank instruction near the connect button: when Metro Bank opens, select the business account/profile intended for ChurchCoinAI.
- Keep the same connection, mapping, reauthentication, and remove controls.

Modify `components/TransactionManager.tsx` only if copy mentions Enable Banking. The sync workflow should remain unchanged.

Modify `components/legal/LegalPage.tsx`.

Required changes:

- Replace Enable Banking with GoCardless in privacy and terms sections.
- Preserve the read-only, user-consent, manual-review language.

### Environment Variables

Update `.env.example`, `convex/README.md`, and `AGENTS.md` banking references.

Backend-only Convex variables:

```text
GOCARDLESS_SECRET_ID
GOCARDLESS_SECRET_KEY
GOCARDLESS_REDIRECT_URL
GOCARDLESS_INSTITUTION_ID
GOCARDLESS_COUNTRY
GOCARDLESS_INSTITUTION_NAME
GOCARDLESS_API_BASE_URL
APP_BASE_URL
```

Recommended sandbox values:

```text
GOCARDLESS_REDIRECT_URL=https://efficient-dogfish-623.convex.site/gocardless/callback
GOCARDLESS_INSTITUTION_ID=SANDBOXFINANCE_SFIN0000
GOCARDLESS_COUNTRY=GB
GOCARDLESS_INSTITUTION_NAME=GoCardless Sandbox
```

Production values should use the live GoCardless API credentials and the Metro Bank institution ID confirmed from GoCardless institution lookup.

## Testing

Add or update unit tests in `tests/bankConnectionUtils.test.ts`.

Required test coverage:

- Normalize a GoCardless positive amount as `Income`.
- Normalize a GoCardless negative amount as `Expenditure`.
- Use remittance arrays as descriptions.
- Fall back to `Bank transaction` when descriptions are blank.
- Reject missing dates.
- Reject malformed dates.
- Reject missing identifiers.
- Reject malformed amounts.

Add tests for provider URL validation or callback readiness only if the existing test structure supports it without heavy Convex HTTP harnessing.

Run before completion:

```bash
npm test
npm run typecheck
npm run build
```

## Rollout

1. Implement and test against the GoCardless sandbox institution `SANDBOXFINANCE_SFIN0000`.
2. Configure Convex dev environment with GoCardless sandbox credentials.
3. Start a bank connection from Settings and verify the requisition redirects and returns to `/gocardless/callback`.
4. Map the returned sandbox account to a fund.
5. Run manual sync from Transactions and verify transactions appear in review, not directly in the ledger.
6. Import a small test batch and verify the ledger values.
7. Switch production environment variables to live GoCardless credentials and the confirmed Metro Bank institution ID.
8. Repeat the flow with Metro Bank and verify the user selected the intended business account.

## Error Handling

- Missing GoCardless env vars should fail clearly with the missing variable name.
- Invalid authorization links should throw before returning to the browser.
- Callback without parameters should return `200 OK`.
- Callback with unknown or expired state should redirect to Settings with `bankConnection=error`.
- Provider authorization failure should store a concise error code and safe user-facing message.
- Expired or revoked requisitions should mark the connection `pending_reauth`.
- Transaction normalization errors should fail sync rather than silently importing malformed data.

## Security And Compliance

- GoCardless secrets must remain Convex backend env vars only. They must not use `VITE_*`.
- ChurchCoinAI must not receive or store online banking passwords.
- Bank sync remains read-only.
- The user must explicitly complete bank authorization.
- Manual review remains mandatory before ledger import.
- Legal pages must disclose GoCardless as the open banking connectivity processor.
- Metro Bank users should be told to select the business account/profile during bank authentication.

## Open Operational Decision

Before live Metro Bank rollout, confirm the Metro Bank institution ID from the GoCardless live institutions endpoint or dashboard. Do not hardcode an unverified institution ID from memory or third-party sources.
