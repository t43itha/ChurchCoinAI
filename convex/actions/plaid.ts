"use node";

import { action, type ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { getPlaid, PLAID_CONFIG, getPlaidWebhookUrl } from "../lib/plaid";
import { Products } from "plaid";
import { Id } from "../_generated/dataModel";

// Account fund mapping schema
const accountMappingSchema = v.object({
  accountId: v.string(),
  fundId: v.optional(v.id("funds")),
});

// Require an authenticated Convex user
const requireUser = async (ctx: ActionCtx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized: please sign in");
  }
  const { api } = await import("../_generated/api");
  const currentUser = await ctx.runQuery(api.queries.users.current, {});
  if (!currentUser) {
    throw new Error("Forbidden: complete onboarding first");
  }
  return currentUser;
};

const requireRole = (
  user: { role: "Admin" | "Finance Team" | "Pastorate" | "Guest" },
  allowed: string[]
) => {
  if (!allowed.includes(user.role)) {
    throw new Error("Forbidden: this action requires Admin or Finance Team role");
  }
};

// Create a Link token for Plaid Link initialization
export const createLinkToken = action({
  args: {},
  handler: async (ctx): Promise<{ linkToken: string }> => {
    const user = await requireUser(ctx);
    requireRole(user, ["Admin", "Finance Team"]);

    const plaid = getPlaid();

    const response = await plaid.linkTokenCreate({
      user: {
        client_user_id: user.clerkId,
      },
      client_name: "ChurchCoin",
      products: [...PLAID_CONFIG.products],
      country_codes: [...PLAID_CONFIG.countryCodes],
      language: PLAID_CONFIG.language,
      webhook: getPlaidWebhookUrl(),
    });

    return { linkToken: response.data.link_token };
  },
});

// Create Link token for updating/re-authenticating an existing item
export const createUpdateLinkToken = action({
  args: {
    plaidItemId: v.id("plaidItems"),
  },
  handler: async (ctx, args): Promise<{ linkToken: string }> => {
    const user = await requireUser(ctx);
    requireRole(user, ["Admin", "Finance Team"]);
    const { api } = await import("../_generated/api");

    // Get the item to re-authenticate
    const item = await ctx.runQuery(api.queries.plaid.getItem, {
      plaidItemId: args.plaidItemId,
    });

    if (!item) {
      throw new Error("Bank connection not found");
    }

    const plaid = getPlaid();

    const response = await plaid.linkTokenCreate({
      user: {
        client_user_id: user.clerkId,
      },
      client_name: "ChurchCoin",
      country_codes: [...PLAID_CONFIG.countryCodes],
      language: PLAID_CONFIG.language,
      webhook: getPlaidWebhookUrl(),
      access_token: await getAccessToken(ctx, args.plaidItemId),
    });

    return { linkToken: response.data.link_token };
  },
});

// Helper to get access token (internal use only)
async function getAccessToken(
  ctx: ActionCtx,
  plaidItemId: Id<"plaidItems">
): Promise<string> {
  const { internal } = await import("../_generated/api");
  const item = await ctx.runQuery(internal.mutations.plaid.getItemForAction, {
    plaidItemId,
  });
  if (!item) {
    throw new Error("Bank connection not found");
  }
  return item.accessToken;
}

// Exchange public token for access token and store connection
export const exchangePublicToken = action({
  args: {
    publicToken: v.string(),
    institutionId: v.string(),
    institutionName: v.string(),
    accountMappings: v.array(accountMappingSchema),
  },
  handler: async (ctx, args): Promise<{ success: boolean; itemId: string }> => {
    const user = await requireUser(ctx);
    requireRole(user, ["Admin", "Finance Team"]);
    const { internal } = await import("../_generated/api");

    const plaid = getPlaid();

    // Exchange public token for access token
    const exchangeResponse = await plaid.itemPublicTokenExchange({
      public_token: args.publicToken,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // Get account details
    const accountsResponse = await plaid.accountsGet({
      access_token: accessToken,
    });

    // Map accounts with fund IDs
    const accounts = accountsResponse.data.accounts.map((acc) => {
      const mapping = args.accountMappings.find((m) => m.accountId === acc.account_id);
      return {
        accountId: acc.account_id,
        name: acc.name,
        mask: acc.mask || undefined,
        type: acc.type,
        subtype: acc.subtype || undefined,
        fundId: mapping?.fundId,
      };
    });

    // Calculate consent expiry (UK Open Banking: 90 days from now)
    const consentExpiresAt = Date.now() + 90 * 24 * 60 * 60 * 1000;

    // Store the connection
    await ctx.runMutation(internal.mutations.plaid.createItem, {
      organizationId: user.organizationId,
      itemId,
      accessToken,
      institutionId: args.institutionId,
      institutionName: args.institutionName,
      accounts,
      consentExpiresAt,
    });

    return { success: true, itemId };
  },
});

// Sync transactions from Plaid
export const syncTransactions = action({
  args: {
    plaidItemId: v.id("plaidItems"),
    accountIds: v.optional(v.array(v.string())), // Optional: sync specific accounts only
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    transactions: Array<{
      date: string;
      description: string;
      amount: number;
      type: "Income" | "Expenditure";
      accountId: string;
      accountName: string;
      fundId: string | null;
      plaidTransactionId: string;
    }>;
    hasMore: boolean;
  }> => {
    const user = await requireUser(ctx);
    const { internal, api } = await import("../_generated/api");

    // Get item with access token
    const item = await ctx.runQuery(internal.mutations.plaid.getItemForAction, {
      plaidItemId: args.plaidItemId,
    });

    if (!item) {
      throw new Error("Bank connection not found");
    }

    if (item.organizationId !== user.organizationId) {
      throw new Error("Access denied");
    }

    if (item.status !== "active") {
      throw new Error(`Bank connection is ${item.status}. Please re-authenticate.`);
    }

    const plaid = getPlaid();

    // Use cursor-based sync
    const cursor = item.lastSyncCursor || undefined;

    const response = await plaid.transactionsSync({
      access_token: item.accessToken,
      cursor,
      count: 500, // Max per request
    });

    const { added, modified, removed, next_cursor, has_more } = response.data;

    // Filter by account IDs if specified
    const accountFilter = args.accountIds
      ? (t: any) => args.accountIds!.includes(t.account_id)
      : () => true;

    // Create account lookup map
    const accountMap = new Map(
      item.accounts.map((acc) => [acc.accountId, acc])
    );

    // Transform transactions
    const transactions = [...added, ...modified]
      .filter(accountFilter)
      .map((t) => {
        const account = accountMap.get(t.account_id);
        // Plaid amounts: positive = money out (expense), negative = money in (income)
        const isIncome = t.amount < 0;
        return {
          date: t.date,
          description: t.name || t.merchant_name || "Unknown",
          amount: Math.abs(t.amount),
          type: isIncome ? ("Income" as const) : ("Expenditure" as const),
          accountId: t.account_id,
          accountName: account?.name || "Unknown Account",
          fundId: account?.fundId || null,
          plaidTransactionId: t.transaction_id,
        };
      });

    // Update sync cursor
    await ctx.runMutation(internal.mutations.plaid.updateSyncCursor, {
      itemId: item.itemId,
      cursor: next_cursor,
    });

    return {
      transactions,
      hasMore: has_more,
    };
  },
});

// Remove bank connection from Plaid
export const removeItem = action({
  args: {
    plaidItemId: v.id("plaidItems"),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    await requireUser(ctx);
    const { internal } = await import("../_generated/api");

    // Get credentials for removal
    const credentials = await ctx.runMutation(internal.mutations.plaid.removeConnection, {
      plaidItemId: args.plaidItemId,
    });

    const plaid = getPlaid();

    try {
      // Remove from Plaid
      await plaid.itemRemove({
        access_token: credentials.accessToken,
      });
    } catch (error: any) {
      // If item is already removed from Plaid, continue with local cleanup
      if (error?.response?.data?.error_code !== "ITEM_NOT_FOUND") {
        throw error;
      }
    }

    // Remove from our database
    await ctx.runMutation(internal.mutations.plaid.deleteItem, {
      itemId: credentials.itemId,
    });

    return { success: true };
  },
});
