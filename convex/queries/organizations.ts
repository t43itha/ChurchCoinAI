import { query, internalQuery } from "../_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { getCurrentUser, getIdentity, requireRole } from "../lib/auth";
import {
  ORGANIZATION_DATA_TABLES,
  type OrganizationDataTable,
} from "../../lib/organizationData";

const organizationDataTableValidator = v.union(
  ...ORGANIZATION_DATA_TABLES.map((table) => v.literal(table))
);

const sanitizeExportRecord = (
  table: OrganizationDataTable,
  record: Record<string, any>
) => {
  if (table === "organizations") {
    const { stripeCustomerId: _stripeCustomerId, createdBy: _createdBy, ...safe } = record;
    return safe;
  }

  if (table === "users") {
    const { clerkId: _clerkId, ...safe } = record;
    return safe;
  }

  if (table === "invitations") {
    const { token: _token, ...safe } = record;
    return safe;
  }

  if (table === "subscriptions") {
    const {
      stripeCustomerId: _stripeCustomerId,
      stripeSubscriptionId: _stripeSubscriptionId,
      stripePriceId: _stripePriceId,
      lastStripeEventAt: _lastStripeEventAt,
      ...safe
    } = record;
    return safe;
  }

  if (table === "plaidItems") {
    const {
      itemId: _itemId,
      accessToken: _accessToken,
      lastSyncCursor: _lastSyncCursor,
      accounts,
      ...safe
    } = record;
    return {
      ...safe,
      accounts: (accounts ?? []).map(
        ({ accountId: _accountId, ...account }: Record<string, any>) => account
      ),
    };
  }

  if (table === "bankConnections") {
    const { providerConnectionId: _providerConnectionId, accounts, ...safe } = record;
    return {
      ...safe,
      accounts: (accounts ?? []).map(
        ({
          accountId: _accountId,
          providerAccountHash: _providerAccountHash,
          providerAccountHashes: _providerAccountHashes,
          ...account
        }: Record<string, any>) => account
      ),
    };
  }

  if (table === "pendingBankConnections") {
    const { state: _state, ...safe } = record;
    return safe;
  }

  return record;
};

// Get the current user's organization
export const current = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const organization = await ctx.db.get(user.organizationId);
    return organization;
  },
});

// Check if current Clerk user has completed onboarding
export const hasOrganization = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getIdentity(ctx);
    if (!identity) return false;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    return !!user;
  },
});

// Paginated, admin-only export. Pagination keeps the workflow reliable for
// organizations whose transaction history has grown beyond a single query.
export const exportDataPage = query({
  args: {
    table: organizationDataTableValidator,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["Admin"]);

    if (args.table === "organizations") {
      const organization = await ctx.db.get(user.organizationId);
      return {
        page: organization
          ? [sanitizeExportRecord("organizations", organization)]
          : [],
        isDone: true,
        continueCursor: "",
      };
    }

    let result: {
      page: Array<Record<string, any>>;
      isDone: boolean;
      continueCursor: string;
    };
    const organizationId = user.organizationId;

    switch (args.table) {
      case "users":
        result = await ctx.db.query("users").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).paginate(args.paginationOpts);
        break;
      case "invitations":
        result = await ctx.db.query("invitations").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).paginate(args.paginationOpts);
        break;
      case "funds":
        result = await ctx.db.query("funds").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).paginate(args.paginationOpts);
        break;
      case "donors":
        result = await ctx.db.query("donors").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).paginate(args.paginationOpts);
        break;
      case "pledges":
        result = await ctx.db.query("pledges").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).paginate(args.paginationOpts);
        break;
      case "transactions":
        result = await ctx.db.query("transactions").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).paginate(args.paginationOpts);
        break;
      case "cashCollections":
        result = await ctx.db.query("cashCollections").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).paginate(args.paginationOpts);
        break;
      case "reconciliationSessions":
        result = await ctx.db.query("reconciliationSessions").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).paginate(args.paginationOpts);
        break;
      case "cashBankingReconciliations":
        result = await ctx.db.query("cashBankingReconciliations").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).paginate(args.paginationOpts);
        break;
      case "categories":
        result = await ctx.db.query("categories").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).paginate(args.paginationOpts);
        break;
      case "aiRateLimits":
        result = await ctx.db.query("aiRateLimits").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).paginate(args.paginationOpts);
        break;
      case "intelligenceSuggestions":
        result = await ctx.db.query("intelligenceSuggestions").withIndex("by_organization_status", (q) => q.eq("organizationId", organizationId)).paginate(args.paginationOpts);
        break;
      case "subscriptions":
        result = await ctx.db.query("subscriptions").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).paginate(args.paginationOpts);
        break;
      case "plaidItems":
        result = await ctx.db.query("plaidItems").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).paginate(args.paginationOpts);
        break;
      case "bankConnections":
        result = await ctx.db.query("bankConnections").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).paginate(args.paginationOpts);
        break;
      case "pendingBankConnections":
        result = await ctx.db.query("pendingBankConnections").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).paginate(args.paginationOpts);
        break;
      case "categorizationCorrections":
        result = await ctx.db.query("categorizationCorrections").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).paginate(args.paginationOpts);
        break;
      case "transactionCategorizationMemory":
        result = await ctx.db.query("transactionCategorizationMemory").withIndex("by_organization_signature", (q) => q.eq("organizationId", organizationId)).paginate(args.paginationOpts);
        break;
      case "categorizationFeedbackEvents":
        result = await ctx.db.query("categorizationFeedbackEvents").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).paginate(args.paginationOpts);
        break;
    }

    return {
      ...result,
      page: result.page.map((record) => sanitizeExportRecord(args.table, record)),
    };
  },
});

// Internal query to list all organizations (for admin/seeding purposes)
export const listAll = internalQuery({
  args: {},
  handler: async (ctx) => {
    const organizations = await ctx.db.query("organizations").collect();
    return organizations.map((org) => ({
      _id: org._id,
      name: org.name,
    }));
  },
});

export const getByIdInternal = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.organizationId);
  },
});

export const getDeletionManifest = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const organization = await ctx.db.get(args.organizationId);
    if (!organization) return null;

    const [bankConnections, plaidItems] = await Promise.all([
      ctx.db
        .query("bankConnections")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect(),
      ctx.db
        .query("plaidItems")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect(),
    ]);

    return { organization, bankConnections, plaidItems };
  },
});
