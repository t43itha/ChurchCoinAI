import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Multi-tenancy: Each organization is a separate tenant
  organizations: defineTable({
    name: v.string(),
    charityNumber: v.optional(v.string()),
    address: v.optional(v.string()),
    email: v.optional(v.string()),
    website: v.optional(v.string()),
    reportingPeriod: v.optional(v.union(v.literal("tax_year"), v.literal("calendar_year"))),
    logoUrl: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()), // Stripe customer ID for billing
    createdAt: v.number(),
    createdBy: v.string(), // Clerk userId
  })
    .index("by_createdBy", ["createdBy"])
    .index("by_stripeCustomerId", ["stripeCustomerId"]),

  // Users within an organization
  users: defineTable({
    clerkId: v.string(),
    organizationId: v.id("organizations"),
    name: v.string(),
    email: v.string(),
    role: v.union(
      v.literal("Admin"),
      v.literal("Finance Team"),
      v.literal("Pastorate"),
      v.literal("Guest")
    ),
    avatarUrl: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_organization", ["organizationId"])
    .index("by_clerkId_organization", ["clerkId", "organizationId"])
    .index("by_email", ["email"]),

  // Pending invitations for users not yet registered
  invitations: defineTable({
    organizationId: v.id("organizations"),
    email: v.string(),
    role: v.union(
      v.literal("Admin"),
      v.literal("Finance Team"),
      v.literal("Pastorate"),
      v.literal("Guest")
    ),
    invitedBy: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("expired")
    ),
    createdAt: v.number(),
    expiresAt: v.number(), // 30 days from creation
  })
    .index("by_email", ["email"])
    .index("by_organization", ["organizationId"])
    .index("by_email_organization", ["email", "organizationId"])
    .index("by_status", ["status"]),

  // Funds (no stored balance - computed from transactions)
  funds: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    type: v.union(
      v.literal("Unrestricted"),
      v.literal("Restricted"),
      v.literal("Designated"),
      v.literal("Endowment")
    ),
    description: v.optional(v.string()),
    targetAmount: v.optional(v.number()),
    deadline: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_type", ["organizationId", "type"]),

  // Donors
  donors: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    postcode: v.optional(v.string()),
    notes: v.optional(v.string()),
    type: v.union(v.literal("Individual"), v.literal("Organization")),
    isGiftAidActive: v.optional(v.boolean()),
    communicationPreference: v.optional(
      v.union(v.literal("Email"), v.literal("Post"), v.literal("Phone"))
    ),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_name", ["organizationId", "name"]),

  // Pledges
  pledges: defineTable({
    organizationId: v.id("organizations"),
    donorId: v.optional(v.id("donors")),
    donorName: v.string(), // Denormalized for display
    amount: v.number(),
    fundId: v.id("funds"),
    frequency: v.union(
      v.literal("One-off"),
      v.literal("Monthly"),
      v.literal("Annual"),
      v.literal("Weekly")
    ),
    startDate: v.string(),
    endDate: v.optional(v.string()),
    status: v.union(
      v.literal("Active"),
      v.literal("Completed"),
      v.literal("Cancelled")
    ),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_fund", ["fundId"])
    .index("by_donor", ["donorId"])
    .index("by_organization_status", ["organizationId", "status"])
    .index("by_donor_fund_amount", ["donorId", "fundId", "amount"]),

  // Transactions
  transactions: defineTable({
    organizationId: v.id("organizations"),
    date: v.string(), // ISO date string YYYY-MM-DD
    description: v.string(),
    amount: v.number(),
    type: v.union(v.literal("Income"), v.literal("Expenditure")),
    category: v.string(),
    fundId: v.id("funds"),
    isReconciled: v.boolean(),
    notes: v.optional(v.string()),
    isGiftAidEligible: v.optional(v.boolean()),
    donorName: v.optional(v.string()),
    donorId: v.optional(v.id("donors")),
    pledgeId: v.optional(v.union(v.id("pledges"), v.null())),
    paymentMethod: v.optional(v.union(
      v.literal("Cash"),
      v.literal("Cheque"),
      v.literal("Bank"),
      v.literal("Card"),
      v.literal("Online")
    )),
    cashCollectionId: v.optional(v.id("cashCollections")),
    isVoided: v.optional(v.boolean()),
    voidReason: v.optional(v.string()),
    voidedAt: v.optional(v.number()),
    voidedBy: v.optional(v.id("users")),
    unvoidedAt: v.optional(v.number()),
    unvoidedBy: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_fund", ["fundId"])
    .index("by_organization_date", ["organizationId", "date"])
    .index("by_pledge", ["pledgeId"])
    .index("by_donor", ["donorId"])
    .index("by_cashCollection", ["cashCollectionId"]),

  // Cash Collections (batch entry for weekly cash takings)
  cashCollections: defineTable({
    organizationId: v.id("organizations"),
    weekEndingDate: v.string(), // ISO date (Sunday)
    collectionDate: v.string(), // When cash was collected
    recordedAt: v.number(), // Timestamp when recorded
    recordedBy: v.id("users"), // Audit trail - which user recorded this
    notes: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("banked")
    ),
    bankedDate: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_weekEnding", ["organizationId", "weekEndingDate"])
    .index("by_organization_status", ["organizationId", "status"]),

  // Categories (per organization) - RCI hierarchical structure
  categories: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),                    // Subcategory (e.g., "Tithe")
    mainCategory: v.optional(v.string()), // Parent (e.g., "Donations")
    transactionType: v.optional(v.union(v.literal("Income"), v.literal("Expenditure"))),
    displayOrder: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_name", ["organizationId", "name"])
    .index("by_organization_mainCategory", ["organizationId", "mainCategory"]),

  // AI Chat History (for context persistence)
  chatHistory: defineTable({
    organizationId: v.id("organizations"),
    clerkId: v.string(),
    messages: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
        timestamp: v.number(),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organization_user", ["organizationId", "clerkId"]),

  // Per-organization AI rate limiting window state
  aiRateLimits: defineTable({
    organizationId: v.id("organizations"),
    windowStart: v.number(),
    requestCount: v.number(),
    updatedAt: v.number(),
  }).index("by_organization", ["organizationId"]),

  // Intelligence suggestions (rules-based insights with feedback tracking)
  intelligenceSuggestions: defineTable({
    organizationId: v.id("organizations"),
    insightType: v.union(
      v.literal("donor"),
      v.literal("operations"),
      v.literal("financial"),
      v.literal("compliance")
    ),
    ruleId: v.string(),
    title: v.string(),
    description: v.string(),
    severity: v.union(
      v.literal("info"),
      v.literal("warning"),
      v.literal("critical")
    ),
    confidence: v.number(),
    suggestedAction: v.optional(v.string()),
    actionUrl: v.optional(v.string()),
    actionData: v.optional(v.any()),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("dismissed"),
      v.literal("deferred")
    ),
    acceptedAt: v.optional(v.number()),
    dismissedAt: v.optional(v.number()),
    deferredUntil: v.optional(v.number()),
    dismissReason: v.optional(v.string()),
    wasHelpful: v.optional(v.boolean()),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_organization_status", ["organizationId", "status", "createdAt"])
    .index("by_organization_type", ["organizationId", "insightType", "createdAt"])
    .index("by_organization_rule", ["organizationId", "ruleId"]),

  // Subscriptions (billing per organization)
  subscriptions: defineTable({
    organizationId: v.id("organizations"),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    stripePriceId: v.string(),
    plan: v.union(
      v.literal("starter"),
      v.literal("growing"),
      v.literal("thriving")
    ),
    status: v.union(
      v.literal("active"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("incomplete")
    ),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_stripeCustomerId", ["stripeCustomerId"])
    .index("by_stripeSubscriptionId", ["stripeSubscriptionId"]),

  // Plaid bank connections
  plaidItems: defineTable({
    organizationId: v.id("organizations"),
    itemId: v.string(), // Plaid item_id
    accessToken: v.string(), // Plaid access_token (encrypted at rest by Convex)
    institutionId: v.string(),
    institutionName: v.string(),
    accounts: v.array(
      v.object({
        accountId: v.string(), // Plaid account_id
        name: v.string(),
        mask: v.optional(v.string()), // Last 4 digits
        type: v.string(), // depository, credit, etc.
        subtype: v.optional(v.string()), // checking, savings, etc.
        fundId: v.optional(v.id("funds")), // Mapped fund for this account
      })
    ),
    status: v.union(
      v.literal("active"),
      v.literal("error"),
      v.literal("consent_expired"),
      v.literal("pending_reauth")
    ),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
    lastSyncCursor: v.optional(v.string()), // Plaid cursor for incremental sync
    consentExpiresAt: v.optional(v.number()), // UK Open Banking 90-day consent
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_itemId", ["itemId"])
    .index("by_organization_status", ["organizationId", "status"]),

  // Provider-neutral bank connections
  bankConnections: defineTable({
    organizationId: v.id("organizations"),
    provider: v.union(v.literal("enable_banking")),
    providerConnectionId: v.string(),
    institutionName: v.string(),
    institutionCountry: v.string(),
    accounts: v.array(
      v.object({
        accountId: v.string(),
        providerAccountHash: v.optional(v.string()),
        providerAccountHashes: v.optional(v.array(v.string())),
        name: v.string(),
        mask: v.optional(v.string()),
        type: v.optional(v.string()),
        currency: v.optional(v.string()),
        fundId: v.optional(v.id("funds")),
      })
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("error"),
      v.literal("consent_expired"),
      v.literal("pending_reauth")
    ),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
    lastSyncedThrough: v.optional(v.string()),
    consentExpiresAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_provider_connection", ["provider", "providerConnectionId"])
    .index("by_organization_status", ["organizationId", "status"]),

  pendingBankConnections: defineTable({
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
    provider: v.union(v.literal("enable_banking")),
    state: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("error")
    ),
    aspspCountry: v.string(),
    aspspName: v.string(),
    existingConnectionId: v.optional(v.id("bankConnections")),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_state", ["state"])
    .index("by_organization", ["organizationId"])
    .index("by_organization_status", ["organizationId", "status"]),

  // AI Categorization corrections tracking (for ML learning)
  categorizationCorrections: defineTable({
    organizationId: v.id("organizations"),
    transactionId: v.id("transactions"),
    description: v.string(),
    aiPredictedCategory: v.string(),
    aiConfidence: v.string(),
    predictionSource: v.union(
      v.literal("gemini"),
      v.literal("rag"),
      v.literal("memory"),
      v.literal("none")
    ),
    ragScore: v.optional(v.number()),
    finalCategory: v.string(),
    wasCorrect: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_accuracy", ["organizationId", "wasCorrect"])
    .index("by_transaction", ["transactionId"]),

  transactionCategorizationMemory: defineTable({
    organizationId: v.id("organizations"),
    signature: v.string(),
    descriptionExample: v.string(),
    transactionType: v.union(v.literal("Income"), v.literal("Expenditure")),
    category: v.string(),
    fundId: v.id("funds"),
    isGiftAidEligible: v.optional(v.boolean()),
    donorName: v.optional(v.string()),
    sourceTransactionId: v.optional(v.id("transactions")),
    acceptedSourceTransactionIds: v.optional(v.array(v.id("transactions"))),
    acceptedCount: v.number(),
    correctedCount: v.number(),
    lastAcceptedAt: v.number(),
    lastCorrectedAt: v.optional(v.number()),
    confidence: v.number(),
  })
    .index("by_organization_signature", ["organizationId", "signature"])
    .index("by_organization_type", ["organizationId", "transactionType"])
    .index("by_organization_lastAccepted", ["organizationId", "lastAcceptedAt"]),

  categorizationFeedbackEvents: defineTable({
    organizationId: v.id("organizations"),
    transactionId: v.id("transactions"),
    signature: v.string(),
    transactionType: v.union(v.literal("Income"), v.literal("Expenditure")),
    source: v.union(
      v.literal("memory"),
      v.literal("rule"),
      v.literal("rag"),
      v.literal("gemini"),
      v.literal("none")
    ),
    confidence: v.number(),
    originalCategory: v.optional(v.string()),
    finalCategory: v.string(),
    categoryChanged: v.boolean(),
    originalFundId: v.optional(v.id("funds")),
    finalFundId: v.id("funds"),
    fundChanged: v.boolean(),
    originalGiftAidEligible: v.optional(v.boolean()),
    finalGiftAidEligible: v.optional(v.boolean()),
    giftAidChanged: v.boolean(),
    originalDonorName: v.optional(v.string()),
    finalDonorName: v.optional(v.string()),
    donorNameChanged: v.boolean(),
    learned: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_transaction", ["transactionId"])
    .index("by_organization_source", ["organizationId", "source"]),
});
