/**
 * Tenant-owned tables included in a ChurchCoin data export.
 *
 * Keep this list in sync with the organization-scoped tables in convex/schema.ts.
 * The export query removes provider credentials and other operational secrets.
 */
export const ORGANIZATION_DATA_TABLES = [
  "organizations",
  "users",
  "invitations",
  "funds",
  "donors",
  "pledges",
  "transactions",
  "cashCollections",
  "reconciliationSessions",
  "cashBankingReconciliations",
  "categories",
  "aiRateLimits",
  "intelligenceSuggestions",
  "subscriptions",
  "plaidItems",
  "bankConnections",
  "pendingBankConnections",
  "categorizationCorrections",
  "transactionCategorizationMemory",
  "categorizationFeedbackEvents",
  "ragIndexingRuns",
  "ragIndexingItems",
] as const;

/** Global operational tables that must not be exported as tenant data. */
export const GLOBAL_OPERATIONAL_TABLES = ["ragIndexingSweeps"] as const;

export type OrganizationDataTable = (typeof ORGANIZATION_DATA_TABLES)[number];

/**
 * Delete dependent records first. Users are deliberately last because many
 * audit fields reference them; Convex does not enforce foreign keys, but this
 * order keeps the operation understandable and retryable.
 */
export const ORGANIZATION_DELETION_TABLES = [
  "ragIndexingItems",
  "ragIndexingRuns",
  "categorizationFeedbackEvents",
  "transactionCategorizationMemory",
  "categorizationCorrections",
  "intelligenceSuggestions",
  "aiRateLimits",
  "pendingBankConnections",
  "bankConnections",
  "plaidItems",
  "subscriptions",
  "cashBankingReconciliations",
  "reconciliationSessions",
  "cashCollections",
  "transactions",
  "pledges",
  "donors",
  "categories",
  "funds",
  "invitations",
  "users",
] as const satisfies readonly Exclude<OrganizationDataTable, "organizations">[];
