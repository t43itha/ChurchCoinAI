# Enable Banking Provider Design

Date: 2026-05-14

## Context

ChurchCoin currently exposes bank connectivity through Plaid-specific backend modules, a Plaid React hook, Plaid-specific schema naming, and a manual "Sync from Bank" transaction review flow. The target direction is to use Enable Banking first for an internal Metro Bank business account, while keeping the architecture suitable for later tenant bank connections once the commercial and compliance position is resolved.

Enable Banking's Accounts API uses a redirect and session model:

1. The application signs API requests with an RS256 JWT using its private key.
2. `POST https://api.enablebanking.com/auth` returns an authorization URL.
3. The user completes bank authorization and returns to the application with a `code` and `state`.
4. `POST https://api.enablebanking.com/sessions` exchanges the code for an authorized session and account list.
5. `GET https://api.enablebanking.com/accounts/{account_id}/transactions` fetches transactions for authorized accounts.

The first implementation is manually triggered sync only. It must not automatically write ledger transactions. It should return normalized pending transactions into ChurchCoin's existing review/import flow.

## Goals

- Replace the active Plaid user flow with a provider-neutral `bankConnections` layer.
- Implement Enable Banking as the first active provider.
- Support manual on-demand sync from the linked Metro Bank account.
- Reuse the existing account-to-fund mapping and transaction review/import experience.
- Keep provider-specific API details out of React components.
- Preserve a clear compliance boundary: v1 validates the internal linked-account use case and should not be presented as broadly available tenant banking until Enable Banking commercial terms are resolved.

## Non-Goals

- No automatic scheduled imports in v1.
- No direct ledger writes during bank sync.
- No public tenant rollout copy or onboarding that claims broad Enable Banking availability.
- No payment initiation.
- No multi-provider UI chooser in v1.
- No large transaction schema migration unless source-level de-duplication becomes necessary during implementation.

## Recommended Approach

Use a provider boundary with Enable Banking as the active implementation.

The UI and ChurchCoin business logic should call generic banking APIs such as `bankConnections.startConnection`, `bankConnections.syncTransactions`, and `bankConnections.updateAccountFundMapping`. Enable Banking request signing, callback handling, session exchange, and transaction normalization stay in backend provider code.

Existing Plaid code may remain temporarily during the first migration if that reduces risk, but the active UI and transaction sync paths should stop calling Plaid modules. After the Metro flow is proven, Plaid dependencies and dead files can be removed in a follow-up cleanup.

## Architecture

### Backend

Add provider-neutral Convex modules:

- `convex/actions/bankConnections.ts`
- `convex/queries/bankConnections.ts`
- `convex/mutations/bankConnections.ts`
- `convex/lib/enableBanking.ts`

`convex/lib/enableBanking.ts` owns:

- JWT creation with the Enable Banking private key.
- API base URL selection.
- `startAuthorization`.
- `authorizeSession`.
- `getTransactions`.
- Enable Banking response validation and mapping helpers.

`convex/actions/bankConnections.ts` owns:

- Role checks for Admin and Finance Team.
- Starting a connection.
- Syncing transactions.
- Removing a connection.
- Provider-specific orchestration through `enableBanking.ts`.

`convex/http.ts` owns:

- `/enable-banking/callback`.
- Callback query parameter parsing.
- Safe redirect back to the Settings bank connections UI.
- Calling internal mutations/actions to finish or fail pending connections.

### Data Model

Introduce a new provider-neutral connection table named `bankConnections`. Keep the existing Plaid table untouched during the first implementation so historical Plaid code can be removed separately after Enable Banking is validated.

Core fields:

- `organizationId`
- `provider`: initially `"enable_banking"`
- `providerConnectionId`: Enable Banking session ID or equivalent provider session reference
- `institutionName`
- `institutionCountry`
- `accounts`
- `status`: `"pending" | "active" | "error" | "consent_expired" | "pending_reauth"`
- `errorCode`
- `errorMessage`
- `lastSyncAt`
- `lastSyncedThrough`
- `consentExpiresAt`
- `createdBy`
- `createdAt`
- `updatedAt`

Account fields:

- `accountId`: Enable Banking account `uid`
- `providerAccountHash`: Enable Banking `identification_hash` when available
- `providerAccountHashes`: Enable Banking `identification_hashes` when available
- `name`
- `mask`
- `type`
- `currency`
- `fundId`

Pending connection state should store:

- `organizationId`
- `createdBy`
- `provider`
- `state`
- `expiresAt`
- requested ASPSP country/name
- optional existing connection ID for re-auth

The `state` value must be random, short-lived, and validated before exchanging any callback `code`.

### Environment Variables

Backend-only Convex env vars:

- `ENABLE_BANKING_APPLICATION_ID`
- `ENABLE_BANKING_PRIVATE_KEY`
- `ENABLE_BANKING_REDIRECT_URL`
- `ENABLE_BANKING_DEFAULT_COUNTRY=GB`
- `ENABLE_BANKING_DEFAULT_ASPSP=Metro Bank`
- Optional `ENABLE_BANKING_API_BASE_URL`, defaulting to `https://api.enablebanking.com`

Do not expose Enable Banking secrets through `VITE_*` variables.

Use `jose` for RS256 signing because it is already installed. The JWT should follow Enable Banking's current quick-start shape: `iss: "enablebanking.com"`, `aud: "api.enablebanking.com"`, `iat`, `exp`, with the application ID in the JWT header `kid`.

## Connection Flow

1. Admin or Finance Team clicks "Connect Bank".
2. React calls `api.actions.bankConnections.startConnection`.
3. The action creates a pending connection state and calls Enable Banking `POST /auth`.
4. The action returns the Enable Banking authorization URL.
5. The browser navigates to Enable Banking and then Metro Bank.
6. Metro/Enable Banking redirects to `/enable-banking/callback` with `code` and `state`, or with `error` details.
7. The callback validates `state`.
8. If the callback contains an error, the pending connection is marked `error` and the user is redirected back to Settings with a failure indicator.
9. If valid, the backend exchanges `code` with `POST /sessions`.
10. The returned session and accounts are stored in `bankConnections`.
11. The user returns to Settings and maps returned account(s) to ChurchCoin funds.

Re-auth uses the same flow. If the returned account hash matches an existing connection account, update that existing connection rather than creating a duplicate.

## Manual Sync Flow

1. User clicks "Sync from Bank" in Transactions.
2. If one active mapped bank connection exists, sync it directly. If multiple active mapped connections exist, show the existing selector pattern.
3. `api.actions.bankConnections.syncTransactions` validates the user organization and connection status.
4. The sync date range is:
   - `date_from = lastSyncedThrough + 1 day` when available.
   - Otherwise `date_from = today - 30 days`.
   - `date_to = today`.
5. The action fetches transactions for mapped accounts only.
6. Enable Banking transactions are normalized into ChurchCoin's pending import shape:
   - `date`
   - `description`
   - positive absolute `amount`
   - `type`: `"Income"` or `"Expenditure"`
   - `accountId`
   - `accountName`
   - `fundId`
   - `providerTransactionId`
7. The action returns pending transactions and updates `lastSyncAt` and `lastSyncedThrough` after a successful fetch.
8. The existing transaction review modal handles AI categorization, duplicate warnings, edits, and final import.

The existing front-end duplicate warning based on same date and amount remains in v1. Keep `providerTransactionId` in the normalized result so durable source-level de-duplication can be added later if the transaction schema is extended.

## UI Changes

`components/BankConnectionsSettings.tsx`:

- Replace Plaid hooks and calls with provider-neutral bank connection actions/queries.
- Keep the main layout, status badges, attention alerts, remove flow, and account-to-fund mapping modal.
- Keep the primary action as "Connect Bank".
- In v1, use configured defaults for country and ASPSP instead of exposing a bank picker.
- Use provider-neutral labels such as "Connected", "Needs re-auth", "Consent expired", and "Sync error".

`components/TransactionManager.tsx`:

- Replace Plaid query/action calls with bank connection query/action calls.
- Keep the current manual "Sync from Bank" behavior and pending transaction review modal.
- Continue to sync one connection directly when only one mapped connection exists, or show the selector for multiple mapped connections.

Do not add public marketing or onboarding claims that Enable Banking is generally available for all tenants in v1.

## Error Handling

Callback errors:

- If `error` is present, store the error and redirect back to Settings.
- If `state` is missing, unknown, or expired, do not exchange the code.
- Unknown callback failures should produce a safe redirect or small error response without leaking secrets.

Sync errors:

- Authorization/session expiry maps to `consent_expired` or `pending_reauth`.
- Provider/API failures map to `error` with a concise stored message.
- Organization mismatch returns access denied.
- Inactive connections cannot sync.

UI:

- Show existing attention-alert style for connections that require re-auth or have errors.
- The sync action should surface a concise error notification and leave existing pending review state unchanged.

## Security

- Store the private key only as a Convex backend env var.
- Never return private key material, session IDs, raw callback codes, or provider credentials to React.
- Validate `state` before exchanging callback codes.
- Keep all connection records scoped to `organizationId`.
- Require Admin or Finance Team for connect, map, sync, and remove operations in v1.
- Avoid logging secrets, callback codes, private keys, or raw authorization headers.

## Compliance Boundary

The first release is for internal validation against the linked Metro Bank account. The implementation should avoid tenant-facing claims or general availability controls until Enable Banking's commercial terms are resolved.

The provider-neutral architecture is intentionally compatible with a later tenant rollout, but the product should treat tenant access as a separate launch decision.

## Test Plan

Automated:

- Run `npm run typecheck`.
- Add focused tests for pure helpers where practical:
  - Enable Banking transaction normalization.
  - Income/expenditure sign handling.
  - Sync date range calculation.
  - Callback state validation if extracted as a pure helper.

Manual:

- Start the Enable Banking connection from Settings.
- Confirm redirect to Enable Banking/Metro Bank.
- Confirm callback creates an active connection and account records.
- Map account(s) to funds.
- Click "Sync from Bank".
- Confirm transactions appear in the existing review modal.
- Confirm duplicate warnings still appear for same date and amount.
- Import selected reviewed transactions.
- Remove a connection and confirm local connection data is removed.
- Simulate callback error and expired state handling.
- Simulate provider authorization/session error and confirm the connection needs attention.

## Rollout

1. Add provider-neutral backend and UI calls.
2. Implement Enable Banking provider support.
3. Wire callback route.
4. Validate against the Metro Bank account manually.
5. Stop active UI calls to Plaid.
6. After validation, remove Plaid dependencies/files in a separate cleanup and update project docs from Plaid-specific wording to provider-neutral banking wording.
