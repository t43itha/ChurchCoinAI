# Onboarding and Billing Operations Runbook

## Required production configuration

1. Enable public sign-up in the production Clerk instance and confirm email verification and redirect settings.
2. Set these Convex environment variables:
   - `APP_BASE_URL`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWING`, and `STRIPE_PRICE_THRIVING`
   - `STRIPE_PRODUCT_STARTER`, `STRIPE_PRODUCT_GROWING`, and `STRIPE_PRODUCT_THRIVING`

   ChurchCoin fails fast with the missing variable name when any catalog ID is
   absent. Keep test and live catalog IDs in their corresponding Convex
   deployments; the application does not fall back to account-specific IDs.
3. Register the Convex `/stripe/webhook` endpoint in Stripe for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

Stripe recurring price amounts are immutable. Before deploying this catalogue,
create new monthly GBP prices and set each deployment's environment variable to
the corresponding new Price ID:

| Internal tier | Public plan | Monthly amount | Price environment variable |
|---|---|---:|---|
| `starter` | Core | £19 | `STRIPE_PRICE_STARTER` |
| `growing` | Standard | £29 | `STRIPE_PRICE_GROWING` |
| `thriving` | Plus | £49 | `STRIPE_PRICE_THRIVING` |

The internal tier and environment-variable names remain unchanged for existing
subscription compatibility. Product IDs may continue to point at the existing
Stripe products, but their names should be updated to match the public plans.
Existing subscribers stay on their current prices unless they are migrated
separately in Stripe; do not silently move them as part of this release.

## Existing-organisation migration

The code treats an organisation without an `accessMode` as a temporary legacy grant, preventing deployment from locking existing churches.

Run the internal `mutations/organizations:backfillLegacyAccess` function repeatedly until `updated` is zero. Then classify each existing organisation deliberately with `mutations/organizations:classifyAccess`:

- `subscription` for Stripe-billed live churches;
- `legacy` for an explicitly temporary/manual grant;
- do not convert a live organisation to `demo`.

Classify Stripe-billed organisations before enabling their webhook traffic because webhook processing rejects non-subscription organisations.

## Provision a synthetic demo church

1. Create or identify a dedicated Clerk account for the demo owner.
2. Copy its Clerk user ID.
3. Run internal function `mutations/organizations:provisionDemo` with:

```json
{
  "clerkId": "user_...",
  "ownerEmail": "demo-owner@example.org",
  "ownerName": "Demo Treasurer",
  "organizationName": "St Mark's Demonstration Church",
  "accessExpiresAt": 1798675200000
}
```

`accessExpiresAt` is optional and is a millisecond Unix timestamp. The target Clerk user must not already belong to another ChurchCoin organisation.

The function creates a synthetic organisation, Admin membership, three funds, standard categories, fictional donors, pledges, and twelve months of transactions. It never creates Stripe or banking objects.

To restore the original dataset, run internal function `mutations/organizations:resetDemo` with the exact demo `organizationId`. The reset refuses to operate unless the organisation is marked both `demo` and `synthetic`.

## Test-mode release check

Before production rollout:

1. Complete generic Get Started and pricing-selected sign-up journeys.
2. Test successful, cancelled, and delayed-webhook Checkout returns.
3. Replay duplicate and out-of-order subscription events.
4. Test a failed renewal, Billing Portal recovery, and grace-period expiry.
5. Accept an invitation into both an active and an unpaid church.
6. Provision and reset a demo tenant; verify Stripe, invitations, and live bank connections are unavailable.
