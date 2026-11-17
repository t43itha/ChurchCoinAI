"use node";

import { action } from "../_generated/server";
import { assertCapability } from "../lib/auth";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import {
  ORGANIZATION_DELETION_TABLES,
  type OrganizationDataTable,
} from "../../lib/organizationData";
import { getPlaid } from "../lib/plaid";
import {
  deleteYapilyConsent,
  YapilyApiError,
} from "../lib/yapily";
import { getStripe } from "../lib/stripe";
import { clearOrganizationSearch } from "../lib/ragInstance";

const BATCH_SIZE = 75;
const MAX_BATCHES_PER_TABLE = 10_000;

export const deleteOrganization = action({
  args: { confirmation: v.string() },
  handler: async (ctx, args): Promise<{ success: true; deletedRecords: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized: please sign in");
    }

    const user = await ctx.runQuery(api.queries.users.current, {});
    if (!user) {
      throw new Error("Forbidden: only organization admins can delete data");
    }

    assertCapability(user, "organization.delete");

    const manifest = await ctx.runQuery(
      internal.queries.organizations.getDeletionManifest,
      { organizationId: user.organizationId }
    );
    if (!manifest) {
      throw new Error("Organization not found");
    }

    if (args.confirmation.trim() !== manifest.organization.name.trim()) {
      throw new Error("The organization name did not match");
    }

    // Revoke third-party access before deleting the local credentials needed
    // to do so. All provider operations are retry-safe for already-removed IDs.
    for (const connection of manifest.bankConnections) {
      if (connection.provider !== "yapily") continue;

      try {
        await deleteYapilyConsent(connection.providerConnectionId);
      } catch (error) {
        if (
          !(error instanceof YapilyApiError && error.status === 404)
        ) {
          throw error;
        }
      }
    }

    if (manifest.plaidItems.length > 0) {
      const plaid = getPlaid();
      for (const item of manifest.plaidItems) {
        try {
          await plaid.itemRemove({ access_token: item.accessToken });
        } catch (error: any) {
          if (error?.response?.data?.error_code !== "ITEM_NOT_FOUND") {
            throw error;
          }
        }
      }
    }

    if (manifest.organization.stripeCustomerId) {
      try {
        await getStripe().customers.del(manifest.organization.stripeCustomerId);
      } catch (error: any) {
        if (error?.code !== "resource_missing") {
          throw error;
        }
      }
    }

    // RAG entries contain derived transaction text and live in a Convex
    // component database, so they must be removed separately from app tables.
    // The marker goes first: an indexing job that sees it after its own write
    // clears the namespace again (see addForExistingOrganization).
    await ctx.runMutation(internal.mutations.organizations.recordErasure, {
      organizationId: user.organizationId,
    });
    const clearRagNamespace = () => clearOrganizationSearch(ctx, user.organizationId);
    await clearRagNamespace();

    let deletedRecords = 0;
    for (let pass = 0; pass < 5; pass += 1) {
      for (const table of ORGANIZATION_DELETION_TABLES) {
        let batches = 0;
        while (true) {
          if (batches++ >= MAX_BATCHES_PER_TABLE) {
            throw new Error(`Deletion did not converge for table ${table}`);
          }

          const result = await ctx.runMutation(
            internal.mutations.organizations.deleteDataBatch,
            {
              organizationId: user.organizationId,
              table: table as Exclude<OrganizationDataTable, "organizations">,
              batchSize: BATCH_SIZE,
            }
          );
          deletedRecords += result.deleted;
          if (result.deleted === 0) break;
        }
      }

      const finalized = await ctx.runMutation(
        internal.mutations.organizations.finalizeDeletion,
        { organizationId: user.organizationId }
      );
      if (finalized.deleted) {
        // Clears entries written since the first clear. A job whose write
        // lands after this one sees the marker and clears them itself.
        await clearRagNamespace();
        console.info("Organization data deleted", {
          organizationId: user.organizationId,
          requestedBy: identity.subject,
          deletedRecords,
        });

        return { success: true, deletedRecords };
      }
    }

    throw new Error("Organization data changed during deletion; please try again");
  },
});
