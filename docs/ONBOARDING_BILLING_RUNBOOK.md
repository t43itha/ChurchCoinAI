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

If explicit Price IDs are absent, ChurchCoin looks up exactly one active monthly GBP price whose amount matches the tier under these products:

| Tier | Amount | Stripe Product |
|---|---:|---|
| Starter | £29 | `prod_TaoILVcX3Js9gF` |
| Growing | £59 | `prod_TaoJy477MupSeI` |
| Thriving | £99 | `prod_TaoMzQFnBGlIm2` |

Default recurring Prices:

| Tier | Stripe Price |
|---|---|
| Starter | `price_1SdcgM3ta3s0o656P0DP6BD9` |
| Growing | `price_1SdchC3ta3s0o656YOnYfii8` |
| Thriving | `price_1SdcjP3ta3s0o656LO347Jgv` |

Environment values override these defaults, allowing separate Stripe test and live configurations. If an explicit/default Price is unavailable, product-based discovery requires exactly one matching active monthly GBP price and otherwise fails closed.

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
