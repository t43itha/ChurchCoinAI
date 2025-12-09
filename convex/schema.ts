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
    createdAt: v.number(),
    createdBy: v.string(), // Clerk userId
  }).index("by_createdBy", ["createdBy"]),

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
    .index("by_clerkId_organization", ["clerkId", "organizationId"]),

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
    pledgeId: v.optional(v.id("pledges")),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_fund", ["fundId"])
    .index("by_organization_date", ["organizationId", "date"])
    .index("by_pledge", ["pledgeId"])
    .index("by_donor", ["donorId"]),

  // Categories (per organization)
  categories: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_name", ["organizationId", "name"]),

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
});
