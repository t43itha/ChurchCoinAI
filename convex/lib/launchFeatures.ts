// The only place the launch flags are read. Both default to off; set
// BILLING_ENABLED=true or BANK_FEEDS_ENABLED=true on the Convex deployment to
// turn a feature back on without a code change.
export type LaunchFeatures = { billing: boolean; bankFeeds: boolean };

export function getLaunchFeatures(): LaunchFeatures {
  return {
    billing: process.env.BILLING_ENABLED === "true",
    bankFeeds: process.env.BANK_FEEDS_ENABLED === "true",
  };
}

export function requireBillingEnabled() {
  if (!getLaunchFeatures().billing) {
    throw new Error("Billing is not available during early access.");
  }
}

export function requireBankFeedsEnabled() {
  if (!getLaunchFeatures().bankFeeds) {
    throw new Error("Bank feeds are not available yet. Import a statement instead.");
  }
}
