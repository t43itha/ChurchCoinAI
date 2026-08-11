import { mutation, internalMutation, type MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { getIdentity, requireAuth, isAdmin } from "../lib/auth";

// Default categories for new organizations
const DEFAULT_CATEGORIES = [
  "Tithe",
  "Donations",
  "Grants",
  "Fundraising",
  "Investment Income",
  "Gift Aid",
  "Utilities",
  "Salaries",
  "Maintenance",
  "Ministry",
  "Mission Giving",
  "Administration",
  "Sundries",
];

const DEMO_SEED_VERSION = "uk-church-v1";

async function seedDemoOrganization(
  ctx: MutationCtx,
  organizationId: any,
  now: number
) {
  const categoryIds = new Map<string, any>();
  for (const categoryName of DEFAULT_CATEGORIES) {
    const categoryId = await ctx.db.insert("categories", {
      organizationId,
      name: categoryName,
      createdAt: now,
    });
    categoryIds.set(categoryName, categoryId);
  }

  const generalFundId = await ctx.db.insert("funds", {
    organizationId,
    name: "General Fund",
    type: "Unrestricted",
    description: "Day-to-day ministry and church operations",
    createdAt: now,
  });
  const buildingFundId = await ctx.db.insert("funds", {
    organizationId,
    name: "Building Renewal Fund",
    type: "Restricted",
    description: "Fictional roof and accessibility improvement appeal",
    targetAmount: 45000,
    createdAt: now,
  });
  const youthFundId = await ctx.db.insert("funds", {
    organizationId,
    name: "Youth Ministry",
    type: "Designated",
    description: "Youth activities and residential weekends",
    targetAmount: 12000,
    createdAt: now,
  });

  const donorDefinitions = [
    ["Amelia Hart", "amelia.hart@example.test"],
    ["Daniel Okoro", "daniel.okoro@example.test"],
    ["Priya Shah", "priya.shah@example.test"],
    ["Thomas Green", "thomas.green@example.test"],
    ["Grace Mensah", "grace.mensah@example.test"],
    ["Willow Community Trust", "giving@willow-trust.example.test"],
  ] as const;
  const donorIds: any[] = [];
  for (const [name, email] of donorDefinitions) {
    donorIds.push(await ctx.db.insert("donors", {
      organizationId,
      name,
      email,
      postcode: "DEMO 1AA",
      notes: "Synthetic demonstration record",
      type: name.includes("Trust") ? "Organization" : "Individual",
      isGiftAidActive: !name.includes("Trust"),
      communicationPreference: "Email",
      createdAt: now,
    }));
  }

  const isoDateMonthsAgo = (monthsAgo: number, day: number) => {
    const date = new Date(now);
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - monthsAgo);
    date.setUTCDate(Math.min(day, 28));
    return date.toISOString().slice(0, 10);
  };

  const pledgeIds = [
    await ctx.db.insert("pledges", {
      organizationId,
      donorId: donorIds[0],
      donorName: donorDefinitions[0][0],
      amount: 150,
      fundId: generalFundId,
      frequency: "Monthly",
      startDate: isoDateMonthsAgo(11, 3),
      status: "Active",
      createdAt: now,
    }),
    await ctx.db.insert("pledges", {
      organizationId,
      donorId: donorIds[2],
      donorName: donorDefinitions[2][0],
      amount: 75,
      fundId: youthFundId,
      frequency: "Monthly",
      startDate: isoDateMonthsAgo(8, 8),
      status: "Active",
      createdAt: now,
    }),
    await ctx.db.insert("pledges", {
      organizationId,
      donorId: donorIds[5],
      donorName: donorDefinitions[5][0],
      amount: 5000,
      fundId: buildingFundId,
      frequency: "One-off",
      startDate: isoDateMonthsAgo(5, 15),
      endDate: isoDateMonthsAgo(5, 15),
      status: "Completed",
      createdAt: now,
    }),
  ];

  let transactionCount = 0;
  for (let month = 11; month >= 0; month -= 1) {
    const donorIndex = (11 - month) % 5;
    const monthlyIncome = 120 + ((11 - month) % 4) * 25;
    await ctx.db.insert("transactions", {
      organizationId,
      date: isoDateMonthsAgo(month, 3),
      description: `Standing order — ${donorDefinitions[donorIndex][0]}`,
      amount: monthlyIncome,
      type: "Income",
      category: "Tithe",
      fundId: generalFundId,
      isReconciled: month > 0,
      isGiftAidEligible: true,
      donorName: donorDefinitions[donorIndex][0],
      donorId: donorIds[donorIndex],
      pledgeId: donorIndex === 0 ? pledgeIds[0] : null,
      paymentMethod: "Bank",
      notes: "Synthetic demonstration transaction",
      createdAt: now,
    });
    transactionCount += 1;

    await ctx.db.insert("transactions", {
      organizationId,
      date: isoDateMonthsAgo(month, 12),
      description: "Northshire Energy — electricity and gas",
      amount: 310 + ((month + 2) % 3) * 35,
      type: "Expenditure",
      category: "Utilities",
      fundId: generalFundId,
      isReconciled: month > 0,
      isGiftAidEligible: false,
      paymentMethod: "Bank",
      notes: "Synthetic demonstration transaction",
      createdAt: now,
    });
    transactionCount += 1;

    await ctx.db.insert("transactions", {
      organizationId,
      date: isoDateMonthsAgo(month, 21),
      description: month % 2 === 0 ? "Building appeal gift" : "Youth activity costs",
      amount: month % 2 === 0 ? 650 + month * 20 : 180 + month * 5,
      type: month % 2 === 0 ? "Income" : "Expenditure",
      category: month % 2 === 0 ? "Donations" : "Ministry",
      fundId: month % 2 === 0 ? buildingFundId : youthFundId,
      isReconciled: month > 1,
      isGiftAidEligible: month % 2 === 0,
      donorName: month % 2 === 0 ? donorDefinitions[4][0] : undefined,
      donorId: month % 2 === 0 ? donorIds[4] : undefined,
      paymentMethod: month % 2 === 0 ? "Online" : "Card",
      notes: "Synthetic demonstration transaction",
      createdAt: now,
    });
    transactionCount += 1;
  }

  return {
    funds: 3,
    categories: categoryIds.size,
    donors: donorIds.length,
    pledges: pledgeIds.length,
    transactions: transactionCount,
  };
}

const deletableOrganizationTableValidator = v.union(
  v.literal("users"),
  v.literal("invitations"),
  v.literal("funds"),
  v.literal("donors"),
  v.literal("pledges"),
  v.literal("transactions"),
  v.literal("cashCollections"),
  v.literal("reconciliationSessions"),
  v.literal("cashBankingReconciliations"),
  v.literal("categories"),
  v.literal("aiRateLimits"),
  v.literal("intelligenceSuggestions"),
  v.literal("subscriptions"),
  v.literal("plaidItems"),
  v.literal("bankConnections"),
  v.literal("pendingBankConnections"),
  v.literal("categorizationCorrections"),
  v.literal("transactionCategorizationMemory"),
  v.literal("categorizationFeedbackEvents")
);

// Create a new organization (onboarding)
export const create = mutation({
  args: {
    name: v.string(),
    charityNumber: v.optional(v.string()),
    address: v.optional(v.string()),
    email: v.optional(v.string()),
    website: v.optional(v.string()),
    reportingPeriod: v.optional(
      v.union(v.literal("tax_year"), v.literal("calendar_year"))
    ),
    logoUrl: v.optional(v.string()),
    userName: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    if (!identity) {
      throw new Error("Must be signed in to create an organization");
    }

    // Email always comes from the verified Clerk identity, never the client
    const userEmail = identity.email?.toLowerCase().trim();
    if (!userEmail) {
      throw new Error("No email found on your account");
    }

    // Check if user already has an organization
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (existingUser) {
      throw new Error("User already belongs to an organization");
    }

    // Create the organization
    const organizationId = await ctx.db.insert("organizations", {
      name: args.name,
      charityNumber: args.charityNumber,
      address: args.address,
      email: args.email,
      website: args.website,
      reportingPeriod: args.reportingPeriod ?? "tax_year",
      logoUrl: args.logoUrl,
      accessMode: "subscription",
      dataMode: "live",
      createdAt: Date.now(),
      createdBy: identity.subject,
    });

    // Create the user as Admin
    await ctx.db.insert("users", {
      clerkId: identity.subject,
      organizationId,
      name: args.userName,
      email: userEmail,
      role: "Admin",
      createdAt: Date.now(),
    });

    // Create default categories
    for (const categoryName of DEFAULT_CATEGORIES) {
      await ctx.db.insert("categories", {
        organizationId,
        name: categoryName,
        createdAt: Date.now(),
      });
    }

    // Create default General Fund
    await ctx.db.insert("funds", {
      organizationId,
      name: "General Fund",
      type: "Unrestricted",
      description: "Main unrestricted fund for general operations",
      createdAt: Date.now(),
    });

    return organizationId;
  },
});

// Internal-only demo provisioning. Run from the Convex dashboard/CLI after a
// dedicated demo owner has a Clerk account. Public onboarding cannot select
// demo access or synthetic data mode.
export const provisionDemo = internalMutation({
  args: {
    clerkId: v.string(),
    ownerEmail: v.string(),
    ownerName: v.string(),
    organizationName: v.string(),
    accessExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const clerkId = args.clerkId.trim();
    const ownerEmail = args.ownerEmail.toLowerCase().trim();
    const ownerName = args.ownerName.trim();
    const organizationName = args.organizationName.trim();
    if (!clerkId || !ownerEmail || !ownerName || !organizationName) {
      throw new Error("Demo owner and organization details are required");
    }
    if (!ownerEmail.includes("@")) {
      throw new Error("A valid demo owner email is required");
    }
    if (args.accessExpiresAt && args.accessExpiresAt <= Date.now()) {
      throw new Error("Demo expiry must be in the future");
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .first();
    if (existingUser) {
      throw new Error("This Clerk user already belongs to an organization");
    }

    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", {
      name: organizationName,
      email: ownerEmail,
      reportingPeriod: "tax_year",
      accessMode: "demo",
      dataMode: "synthetic",
      accessExpiresAt: args.accessExpiresAt,
      demoSeedStatus: "pending",
      demoSeedVersion: DEMO_SEED_VERSION,
      createdAt: now,
      createdBy: clerkId,
    });

    const userId = await ctx.db.insert("users", {
      clerkId,
      organizationId,
      name: ownerName,
      email: ownerEmail,
      role: "Admin",
      createdAt: now,
    });

    const counts = await seedDemoOrganization(ctx, organizationId, now);
    await ctx.db.patch(organizationId, { demoSeedStatus: "ready" });

    return {
      organizationId,
      userId,
      seedVersion: DEMO_SEED_VERSION,
      counts,
    };
  },
});

export const resetDemo = internalMutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const organization = await ctx.db.get(args.organizationId);
    if (
      !organization ||
      organization.accessMode !== "demo" ||
      organization.dataMode !== "synthetic"
    ) {
      throw new Error("Reset is restricted to synthetic demo organizations");
    }

    await ctx.db.patch(args.organizationId, { demoSeedStatus: "pending" });
    const tables = ["transactions", "pledges", "donors", "funds", "categories"] as const;
    const deleted: Record<string, number> = {};
    for (const table of tables) {
      const records = await ctx.db
        .query(table)
        .withIndex("by_organization", (q: any) => q.eq("organizationId", args.organizationId))
        .collect();
      for (const record of records) await ctx.db.delete(record._id);
      deleted[table] = records.length;
    }

    const counts = await seedDemoOrganization(ctx, args.organizationId, Date.now());
    await ctx.db.patch(args.organizationId, {
      demoSeedStatus: "ready",
      demoSeedVersion: DEMO_SEED_VERSION,
    });
    return { deleted, counts, seedVersion: DEMO_SEED_VERSION };
  },
});

// Explicit operator-controlled classification used during the billing
// re-enable rollout. This is internal so tenants cannot grant themselves
// legacy or demo access.
export const classifyAccess = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    accessMode: v.union(
      v.literal("subscription"),
      v.literal("demo"),
      v.literal("legacy")
    ),
    accessExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const organization = await ctx.db.get(args.organizationId);
    if (!organization) throw new Error("Organization not found");
    if (args.accessExpiresAt && args.accessExpiresAt <= Date.now()) {
      throw new Error("Access expiry must be in the future");
    }
    if (args.accessMode === "demo" && organization.dataMode !== "synthetic") {
      throw new Error("Live organizations cannot be reclassified as demos");
    }

    await ctx.db.patch(args.organizationId, {
      accessMode: args.accessMode,
      dataMode: organization.dataMode ?? "live",
      accessExpiresAt: args.accessExpiresAt,
    });
    return args.organizationId;
  },
});

// Run repeatedly until updated is zero. Batching avoids an unbounded migration
// transaction while making the temporary legacy state explicit in storage.
export const backfillLegacyAccess = internalMutation({
  args: {},
  handler: async (ctx) => {
    const organizations = await ctx.db
      .query("organizations")
      .filter((q) => q.eq(q.field("accessMode"), undefined))
      .take(100);
    let updated = 0;
    for (const organization of organizations) {
      await ctx.db.patch(organization._id, {
        accessMode: "legacy",
        dataMode: organization.dataMode ?? "live",
      });
      updated += 1;
    }
    return { scanned: organizations.length, updated };
  },
});

// Update organization details
export const update = mutation({
  args: {
    name: v.optional(v.string()),
    charityNumber: v.optional(v.string()),
    address: v.optional(v.string()),
    email: v.optional(v.string()),
    website: v.optional(v.string()),
    reportingPeriod: v.optional(
      v.union(v.literal("tax_year"), v.literal("calendar_year"))
    ),
    logoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    if (!isAdmin(user)) {
      throw new Error("Only admins can update organization settings");
    }

    const updates: Record<string, any> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.charityNumber !== undefined)
      updates.charityNumber = args.charityNumber;
    if (args.address !== undefined) updates.address = args.address;
    if (args.email !== undefined) updates.email = args.email;
    if (args.website !== undefined) updates.website = args.website;
    if (args.reportingPeriod !== undefined)
      updates.reportingPeriod = args.reportingPeriod;
    if (args.logoUrl !== undefined) updates.logoUrl = args.logoUrl;

    await ctx.db.patch(user.organizationId, updates);

    return user.organizationId;
  },
});

// Internal mutation to update Stripe customer ID (called by stripe action)
export const updateStripeCustomerId = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.organizationId, {
      stripeCustomerId: args.stripeCustomerId,
    });
    return args.organizationId;
  },
});

// Delete a bounded number of tenant records per transaction. The public action
// loops this mutation so larger organizations do not exceed Convex transaction
// limits and interrupted deletion attempts can safely be retried.
export const deleteDataBatch = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    table: deletableOrganizationTableValidator,
    batchSize: v.number(),
  },
  handler: async (ctx, args) => {
    const batchSize = Math.max(1, Math.min(Math.floor(args.batchSize), 100));
    const organizationId = args.organizationId;
    let records: Array<{ _id: any }>;

    switch (args.table) {
      case "users":
        records = await ctx.db.query("users").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(batchSize);
        break;
      case "invitations":
        records = await ctx.db.query("invitations").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(batchSize);
        break;
      case "funds":
        records = await ctx.db.query("funds").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(batchSize);
        break;
      case "donors":
        records = await ctx.db.query("donors").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(batchSize);
        break;
      case "pledges":
        records = await ctx.db.query("pledges").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(batchSize);
        break;
      case "transactions":
        records = await ctx.db.query("transactions").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(batchSize);
        break;
      case "cashCollections":
        records = await ctx.db.query("cashCollections").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(batchSize);
        break;
      case "reconciliationSessions":
        records = await ctx.db.query("reconciliationSessions").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(batchSize);
        break;
      case "cashBankingReconciliations":
        records = await ctx.db.query("cashBankingReconciliations").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(batchSize);
        break;
      case "categories":
        records = await ctx.db.query("categories").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(batchSize);
        break;
      case "aiRateLimits":
        records = await ctx.db.query("aiRateLimits").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(batchSize);
        break;
      case "intelligenceSuggestions":
        records = await ctx.db.query("intelligenceSuggestions").withIndex("by_organization_status", (q) => q.eq("organizationId", organizationId)).take(batchSize);
        break;
      case "subscriptions":
        records = await ctx.db.query("subscriptions").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(batchSize);
        break;
      case "plaidItems":
        records = await ctx.db.query("plaidItems").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(batchSize);
        break;
      case "bankConnections":
        records = await ctx.db.query("bankConnections").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(batchSize);
        break;
      case "pendingBankConnections":
        records = await ctx.db.query("pendingBankConnections").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(batchSize);
        break;
      case "categorizationCorrections":
        records = await ctx.db.query("categorizationCorrections").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(batchSize);
        break;
      case "transactionCategorizationMemory":
        records = await ctx.db.query("transactionCategorizationMemory").withIndex("by_organization_signature", (q) => q.eq("organizationId", organizationId)).take(batchSize);
        break;
      case "categorizationFeedbackEvents":
        records = await ctx.db.query("categorizationFeedbackEvents").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(batchSize);
        break;
    }

    await Promise.all(records.map((record) => ctx.db.delete(record._id)));
    return { deleted: records.length };
  },
});

// Convex tracks each index-range read in this mutation. If a concurrent write
// inserts tenant data between these checks and the organization delete, the
// mutation is retried and cannot commit an orphaned record.
export const finalizeDeletion = internalMutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const organization = await ctx.db.get(args.organizationId);
    if (!organization) return { deleted: true, pendingTable: null };

    const organizationId = args.organizationId;
    const checks: Array<[string, unknown]> = [
      ["users", await ctx.db.query("users").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).first()],
      ["invitations", await ctx.db.query("invitations").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).first()],
      ["funds", await ctx.db.query("funds").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).first()],
      ["donors", await ctx.db.query("donors").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).first()],
      ["pledges", await ctx.db.query("pledges").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).first()],
      ["transactions", await ctx.db.query("transactions").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).first()],
      ["cashCollections", await ctx.db.query("cashCollections").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).first()],
      ["reconciliationSessions", await ctx.db.query("reconciliationSessions").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).first()],
      ["cashBankingReconciliations", await ctx.db.query("cashBankingReconciliations").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).first()],
      ["categories", await ctx.db.query("categories").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).first()],
      ["aiRateLimits", await ctx.db.query("aiRateLimits").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).first()],
      ["intelligenceSuggestions", await ctx.db.query("intelligenceSuggestions").withIndex("by_organization_status", (q) => q.eq("organizationId", organizationId)).first()],
      ["subscriptions", await ctx.db.query("subscriptions").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).first()],
      ["plaidItems", await ctx.db.query("plaidItems").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).first()],
      ["bankConnections", await ctx.db.query("bankConnections").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).first()],
      ["pendingBankConnections", await ctx.db.query("pendingBankConnections").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).first()],
      ["categorizationCorrections", await ctx.db.query("categorizationCorrections").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).first()],
      ["transactionCategorizationMemory", await ctx.db.query("transactionCategorizationMemory").withIndex("by_organization_signature", (q) => q.eq("organizationId", organizationId)).first()],
      ["categorizationFeedbackEvents", await ctx.db.query("categorizationFeedbackEvents").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).first()],
    ];
    const pending = checks.find(([, record]) => Boolean(record));
    if (pending) {
      return { deleted: false, pendingTable: pending[0] };
    }

    await ctx.db.delete(args.organizationId);
    return { deleted: true, pendingTable: null };
  },
});
