# Yapily banking integration

## Decision

ChurchCoin uses Yapily as its sole active UK Open Banking provider. The provider
field remains in stored connection records only so historic rows can be identified
and removed safely. The implementation uses the Direct API because ChurchCoin owns the institution picker,
consent return, account-to-fund mapping, and transaction-review experience.
Yapily Connect can supply delegated AISP licensing for the same API flow.

Hosted Pages remain a future option if Yapily-managed bank selection and consent
screens become preferable. They are not required for this integration.

## User journey and system events

1. An Admin or Finance Team user opens **Settings → Bank Connections**.
2. ChurchCoin asks Yapily for its current UK institution list.
3. The user chooses a bank.
   Yapily institutions must advertise `INITIATE_ACCOUNT_REQUEST`, `ACCOUNTS`, and
   `ACCOUNT_TRANSACTIONS` before they are shown.
4. ChurchCoin revalidates the institution, creates a
   provider-bound state token that expires after 15 minutes, and records the
   attempt as `pending`.
5. ChurchCoin creates a Yapily account authorisation for read-only accounts and
   transactions, requests a one-time callback token, and redirects to the bank.
6. The bank authenticates the user and captures consent. Yapily returns the
   browser to `/yapily/callback` with the original ChurchCoin state and a
   short-lived `one-time-token`.
7. The callback atomically claims the state. Replays, expired states, and states
   created for another provider are rejected. The callback schedules completion
   and immediately redirects the browser to Bank Connections.
8. A background action exchanges the one-time token for a consent token,
   verifies the consent is `AUTHORIZED` and belongs to the selected institution,
   retrieves the accounts, and creates or refreshes the connection. Durable
   consent credentials stay in Convex and never enter a public query or export.
9. The connection appears reactively. The user maps each account to a ChurchCoin
   fund; unmapped accounts are never synchronised.
10. On manual sync, ChurchCoin retrieves at most 500 transactions per action in
    bounded pages, normalises Yapily's signed amounts and dates, and returns the
    rows for review. Existing provider transaction IDs prevent duplicate import.
11. The user approves selected transactions before they enter the ledger.
12. When Yapily reports `401` or `403`, ChurchCoin marks the connection as needing
    re-authorisation. Expiry and `reconfirmBy` dates also surface advance prompts.
13. Disconnecting revokes the Yapily consent before deleting the local record.
    Organisation deletion revokes every Yapily and Plaid link
    before removing local credentials and tenant data.

## Operator actions required

1. Sign up in the Yapily Console and create separate sandbox and production
   applications where appropriate.
2. Agree the regulatory route with Yapily: use Yapily Connect's delegated AISP
   licence unless ChurchCoin will operate under its own AISP permissions.
3. Ask Yapily to enable/register the UK institutions required by pilot churches.
   A bank appears in ChurchCoin only if it is available to the application and
   exposes the required data features.
4. Authorise the exact callback URL for each environment:
   `https://YOUR-CONVEX-DEPLOYMENT.convex.site/yapily/callback`.
5. Set these secrets in each Convex deployment (never in a `VITE_*` variable):
   `YAPILY_APPLICATION_ID`, `YAPILY_APPLICATION_SECRET`, and
   `YAPILY_CALLBACK_URL`. `YAPILY_API_BASE_URL` normally remains unset.
6. Confirm `APP_BASE_URL` is the correct public frontend origin so the callback
   returns to the intended environment.
7. In sandbox, complete authorisation, confirm accounts appear, map one account,
   sync transactions, review them, and disconnect. Verify the consent was
   deleted in Yapily.
8. Repeat one controlled end-to-end test with a live church bank account after
   Yapily approves production access. Validate the institution's business-account
   journey and available transaction history.
9. Review the updated Privacy Policy and Terms with the organisation's legal/data
   protection owner before production launch. Confirm that naming Yapily and
   Yapily Connect as applicable processors/regulatory providers is sufficient for
   the final commercial arrangement.
10. Before deploying over an installation that has historic non-Yapily connection
    records, revoke those provider sessions using the previous deployment or the
    provider console, then disconnect the legacy records in ChurchCoin. Remove all
    obsolete provider secrets from Convex after confirming no sessions remain.

## Documentation sources

- [Yapily documentation index](https://docs.yapily.com/llms.txt)
- [Direct API vs Hosted Pages](https://docs.yapily.com/concepts/hosted-vs-api)
- [Yapily Connect and delegated licensing](https://docs.yapily.com/tools-and-services/yapily-connect/overview)
- [Create account authorisation](https://docs.yapily.com/api-reference/authorisations/create-account-authorisation)
- [Callback and one-time-token guidance](https://docs.yapily.com/open-banking-flow/handling-redirects/callback-url)
- [Exchange one-time token](https://docs.yapily.com/api-reference/consents/exchange-one-time-token)
- [Get accounts](https://docs.yapily.com/api-reference/financial-data/get-accounts)
- [Get account transactions](https://docs.yapily.com/api-reference/financial-data/get-account-transactions)
- [Financial data consent lifecycle](https://docs.yapily.com/data/financial-data-resources/financial-data-consents)
