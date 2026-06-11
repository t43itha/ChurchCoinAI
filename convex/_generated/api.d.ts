/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_ai from "../actions/ai.js";
import type * as actions_bankConnections from "../actions/bankConnections.js";
import type * as actions_invitations from "../actions/invitations.js";
import type * as actions_plaid from "../actions/plaid.js";
import type * as actions_stripe from "../actions/stripe.js";
import type * as http from "../http.js";
import type * as intelligence_bootstrapRAG from "../intelligence/bootstrapRAG.js";
import type * as intelligence_categorizationMemory from "../intelligence/categorizationMemory.js";
import type * as intelligence_categorization_categoryResolver from "../intelligence/categorization/categoryResolver.js";
import type * as intelligence_categorization_confidence from "../intelligence/categorization/confidence.js";
import type * as intelligence_categorization_feedback from "../intelligence/categorization/feedback.js";
import type * as intelligence_categorization_gemini from "../intelligence/categorization/gemini.js";
import type * as intelligence_categorization_memory from "../intelligence/categorization/memory.js";
import type * as intelligence_categorization_normalize from "../intelligence/categorization/normalize.js";
import type * as intelligence_categorization_pipeline from "../intelligence/categorization/pipeline.js";
import type * as intelligence_categorization_rag from "../intelligence/categorization/rag.js";
import type * as intelligence_categorization_rules from "../intelligence/categorization/rules.js";
import type * as intelligence_categorization_types from "../intelligence/categorization/types.js";
import type * as intelligence_generateInsights from "../intelligence/generateInsights.js";
import type * as intelligence_index from "../intelligence/index.js";
import type * as intelligence_ragIndexer from "../intelligence/ragIndexer.js";
import type * as intelligence_rules_donorRules from "../intelligence/rules/donorRules.js";
import type * as intelligence_rules_operationsRules from "../intelligence/rules/operationsRules.js";
import type * as lib_aiValidation from "../lib/aiValidation.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_bankConnectionUtils from "../lib/bankConnectionUtils.js";
import type * as lib_enableBanking from "../lib/enableBanking.js";
import type * as lib_money from "../lib/money.js";
import type * as lib_plaid from "../lib/plaid.js";
import type * as lib_ragInstance from "../lib/ragInstance.js";
import type * as lib_stripe from "../lib/stripe.js";
import type * as lib_transactionValidation from "../lib/transactionValidation.js";
import type * as lib_urlValidation from "../lib/urlValidation.js";
import type * as mutations_aiRateLimit from "../mutations/aiRateLimit.js";
import type * as mutations_bankConnections from "../mutations/bankConnections.js";
import type * as mutations_cashBankingReconciliations from "../mutations/cashBankingReconciliations.js";
import type * as mutations_cashCollections from "../mutations/cashCollections.js";
import type * as mutations_categories from "../mutations/categories.js";
import type * as mutations_donors from "../mutations/donors.js";
import type * as mutations_funds from "../mutations/funds.js";
import type * as mutations_intelligence from "../mutations/intelligence.js";
import type * as mutations_invitations from "../mutations/invitations.js";
import type * as mutations_maintenance from "../mutations/maintenance.js";
import type * as mutations_organizations from "../mutations/organizations.js";
import type * as mutations_plaid from "../mutations/plaid.js";
import type * as mutations_pledges from "../mutations/pledges.js";
import type * as mutations_reconciliationSessions from "../mutations/reconciliationSessions.js";
import type * as mutations_subscriptions from "../mutations/subscriptions.js";
import type * as mutations_transactions from "../mutations/transactions.js";
import type * as mutations_users from "../mutations/users.js";
import type * as queries_aiContext from "../queries/aiContext.js";
import type * as queries_bankConnections from "../queries/bankConnections.js";
import type * as queries_cashBankingReconciliations from "../queries/cashBankingReconciliations.js";
import type * as queries_cashCollections from "../queries/cashCollections.js";
import type * as queries_categories from "../queries/categories.js";
import type * as queries_dashboard from "../queries/dashboard.js";
import type * as queries_donors from "../queries/donors.js";
import type * as queries_funds from "../queries/funds.js";
import type * as queries_intelligence from "../queries/intelligence.js";
import type * as queries_invitations from "../queries/invitations.js";
import type * as queries_organizations from "../queries/organizations.js";
import type * as queries_plaid from "../queries/plaid.js";
import type * as queries_pledges from "../queries/pledges.js";
import type * as queries_reconciliationSessions from "../queries/reconciliationSessions.js";
import type * as queries_reports from "../queries/reports.js";
import type * as queries_subscriptions from "../queries/subscriptions.js";
import type * as queries_transactions from "../queries/transactions.js";
import type * as queries_users from "../queries/users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/ai": typeof actions_ai;
  "actions/bankConnections": typeof actions_bankConnections;
  "actions/invitations": typeof actions_invitations;
  "actions/plaid": typeof actions_plaid;
  "actions/stripe": typeof actions_stripe;
  http: typeof http;
  "intelligence/bootstrapRAG": typeof intelligence_bootstrapRAG;
  "intelligence/categorizationMemory": typeof intelligence_categorizationMemory;
  "intelligence/categorization/categoryResolver": typeof intelligence_categorization_categoryResolver;
  "intelligence/categorization/confidence": typeof intelligence_categorization_confidence;
  "intelligence/categorization/feedback": typeof intelligence_categorization_feedback;
  "intelligence/categorization/gemini": typeof intelligence_categorization_gemini;
  "intelligence/categorization/memory": typeof intelligence_categorization_memory;
  "intelligence/categorization/normalize": typeof intelligence_categorization_normalize;
  "intelligence/categorization/pipeline": typeof intelligence_categorization_pipeline;
  "intelligence/categorization/rag": typeof intelligence_categorization_rag;
  "intelligence/categorization/rules": typeof intelligence_categorization_rules;
  "intelligence/categorization/types": typeof intelligence_categorization_types;
  "intelligence/generateInsights": typeof intelligence_generateInsights;
  "intelligence/index": typeof intelligence_index;
  "intelligence/ragIndexer": typeof intelligence_ragIndexer;
  "intelligence/rules/donorRules": typeof intelligence_rules_donorRules;
  "intelligence/rules/operationsRules": typeof intelligence_rules_operationsRules;
  "lib/aiValidation": typeof lib_aiValidation;
  "lib/auth": typeof lib_auth;
  "lib/bankConnectionUtils": typeof lib_bankConnectionUtils;
  "lib/enableBanking": typeof lib_enableBanking;
  "lib/money": typeof lib_money;
  "lib/plaid": typeof lib_plaid;
  "lib/ragInstance": typeof lib_ragInstance;
  "lib/stripe": typeof lib_stripe;
  "lib/transactionValidation": typeof lib_transactionValidation;
  "lib/urlValidation": typeof lib_urlValidation;
  "mutations/aiRateLimit": typeof mutations_aiRateLimit;
  "mutations/bankConnections": typeof mutations_bankConnections;
  "mutations/cashBankingReconciliations": typeof mutations_cashBankingReconciliations;
  "mutations/cashCollections": typeof mutations_cashCollections;
  "mutations/categories": typeof mutations_categories;
  "mutations/donors": typeof mutations_donors;
  "mutations/funds": typeof mutations_funds;
  "mutations/intelligence": typeof mutations_intelligence;
  "mutations/invitations": typeof mutations_invitations;
  "mutations/maintenance": typeof mutations_maintenance;
  "mutations/organizations": typeof mutations_organizations;
  "mutations/plaid": typeof mutations_plaid;
  "mutations/pledges": typeof mutations_pledges;
  "mutations/reconciliationSessions": typeof mutations_reconciliationSessions;
  "mutations/subscriptions": typeof mutations_subscriptions;
  "mutations/transactions": typeof mutations_transactions;
  "mutations/users": typeof mutations_users;
  "queries/aiContext": typeof queries_aiContext;
  "queries/bankConnections": typeof queries_bankConnections;
  "queries/cashBankingReconciliations": typeof queries_cashBankingReconciliations;
  "queries/cashCollections": typeof queries_cashCollections;
  "queries/categories": typeof queries_categories;
  "queries/dashboard": typeof queries_dashboard;
  "queries/donors": typeof queries_donors;
  "queries/funds": typeof queries_funds;
  "queries/intelligence": typeof queries_intelligence;
  "queries/invitations": typeof queries_invitations;
  "queries/organizations": typeof queries_organizations;
  "queries/plaid": typeof queries_plaid;
  "queries/pledges": typeof queries_pledges;
  "queries/reconciliationSessions": typeof queries_reconciliationSessions;
  "queries/reports": typeof queries_reports;
  "queries/subscriptions": typeof queries_subscriptions;
  "queries/transactions": typeof queries_transactions;
  "queries/users": typeof queries_users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rag: {
    chunks: {
      insert: FunctionReference<
        "mutation",
        "internal",
        {
          chunks: Array<{
            content: { metadata?: Record<string, any>; text: string };
            embedding: Array<number>;
            searchableText?: string;
          }>;
          entryId: string;
          startOrder: number;
        },
        { status: "pending" | "ready" | "replaced" }
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          entryId: string;
          order: "desc" | "asc";
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            metadata?: Record<string, any>;
            order: number;
            state: "pending" | "ready" | "replaced";
            text: string;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        }
      >;
      replaceChunksPage: FunctionReference<
        "mutation",
        "internal",
        { entryId: string; startOrder: number },
        { nextStartOrder: number; status: "pending" | "ready" | "replaced" }
      >;
    };
    entries: {
      add: FunctionReference<
        "mutation",
        "internal",
        {
          allChunks?: Array<{
            content: { metadata?: Record<string, any>; text: string };
            embedding: Array<number>;
            searchableText?: string;
          }>;
          entry: {
            contentHash?: string;
            filterValues: Array<{ name: string; value: any }>;
            importance: number;
            key?: string;
            metadata?: Record<string, any>;
            namespaceId: string;
            title?: string;
          };
          onComplete?: string;
        },
        {
          created: boolean;
          entryId: string;
          status: "pending" | "ready" | "replaced";
        }
      >;
      addAsync: FunctionReference<
        "mutation",
        "internal",
        {
          chunker: string;
          entry: {
            contentHash?: string;
            filterValues: Array<{ name: string; value: any }>;
            importance: number;
            key?: string;
            metadata?: Record<string, any>;
            namespaceId: string;
            title?: string;
          };
          onComplete?: string;
        },
        { created: boolean; entryId: string; status: "pending" | "ready" }
      >;
      deleteAsync: FunctionReference<
        "mutation",
        "internal",
        { entryId: string; startOrder: number },
        null
      >;
      deleteByKeyAsync: FunctionReference<
        "mutation",
        "internal",
        { beforeVersion?: number; key: string; namespaceId: string },
        null
      >;
      deleteByKeySync: FunctionReference<
        "action",
        "internal",
        { key: string; namespaceId: string },
        null
      >;
      deleteSync: FunctionReference<
        "action",
        "internal",
        { entryId: string },
        null
      >;
      findByContentHash: FunctionReference<
        "query",
        "internal",
        {
          contentHash: string;
          dimension: number;
          filterNames: Array<string>;
          key: string;
          modelId: string;
          namespace: string;
        },
        {
          contentHash?: string;
          entryId: string;
          filterValues: Array<{ name: string; value: any }>;
          importance: number;
          key?: string;
          metadata?: Record<string, any>;
          replacedAt?: number;
          status: "pending" | "ready" | "replaced";
          title?: string;
        } | null
      >;
      get: FunctionReference<
        "query",
        "internal",
        { entryId: string },
        {
          contentHash?: string;
          entryId: string;
          filterValues: Array<{ name: string; value: any }>;
          importance: number;
          key?: string;
          metadata?: Record<string, any>;
          replacedAt?: number;
          status: "pending" | "ready" | "replaced";
          title?: string;
        } | null
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          namespaceId?: string;
          order?: "desc" | "asc";
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          status: "pending" | "ready" | "replaced";
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            contentHash?: string;
            entryId: string;
            filterValues: Array<{ name: string; value: any }>;
            importance: number;
            key?: string;
            metadata?: Record<string, any>;
            replacedAt?: number;
            status: "pending" | "ready" | "replaced";
            title?: string;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        }
      >;
      promoteToReady: FunctionReference<
        "mutation",
        "internal",
        { entryId: string },
        {
          replacedEntry: {
            contentHash?: string;
            entryId: string;
            filterValues: Array<{ name: string; value: any }>;
            importance: number;
            key?: string;
            metadata?: Record<string, any>;
            replacedAt?: number;
            status: "pending" | "ready" | "replaced";
            title?: string;
          } | null;
        }
      >;
    };
    namespaces: {
      deleteNamespace: FunctionReference<
        "mutation",
        "internal",
        { namespaceId: string },
        {
          deletedNamespace: null | {
            createdAt: number;
            dimension: number;
            filterNames: Array<string>;
            modelId: string;
            namespace: string;
            namespaceId: string;
            status: "pending" | "ready" | "replaced";
            version: number;
          };
        }
      >;
      deleteNamespaceSync: FunctionReference<
        "action",
        "internal",
        { namespaceId: string },
        null
      >;
      get: FunctionReference<
        "query",
        "internal",
        {
          dimension: number;
          filterNames: Array<string>;
          modelId: string;
          namespace: string;
        },
        null | {
          createdAt: number;
          dimension: number;
          filterNames: Array<string>;
          modelId: string;
          namespace: string;
          namespaceId: string;
          status: "pending" | "ready" | "replaced";
          version: number;
        }
      >;
      getOrCreate: FunctionReference<
        "mutation",
        "internal",
        {
          dimension: number;
          filterNames: Array<string>;
          modelId: string;
          namespace: string;
          onComplete?: string;
          status: "pending" | "ready";
        },
        { namespaceId: string; status: "pending" | "ready" }
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          status: "pending" | "ready" | "replaced";
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            createdAt: number;
            dimension: number;
            filterNames: Array<string>;
            modelId: string;
            namespace: string;
            namespaceId: string;
            status: "pending" | "ready" | "replaced";
            version: number;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        }
      >;
      listNamespaceVersions: FunctionReference<
        "query",
        "internal",
        {
          namespace: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            createdAt: number;
            dimension: number;
            filterNames: Array<string>;
            modelId: string;
            namespace: string;
            namespaceId: string;
            status: "pending" | "ready" | "replaced";
            version: number;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        }
      >;
      lookup: FunctionReference<
        "query",
        "internal",
        {
          dimension: number;
          filterNames: Array<string>;
          modelId: string;
          namespace: string;
        },
        null | string
      >;
      promoteToReady: FunctionReference<
        "mutation",
        "internal",
        { namespaceId: string },
        {
          replacedNamespace: null | {
            createdAt: number;
            dimension: number;
            filterNames: Array<string>;
            modelId: string;
            namespace: string;
            namespaceId: string;
            status: "pending" | "ready" | "replaced";
            version: number;
          };
        }
      >;
    };
    search: {
      search: FunctionReference<
        "action",
        "internal",
        {
          chunkContext?: { after: number; before: number };
          embedding: Array<number>;
          filters: Array<{ name: string; value: any }>;
          limit: number;
          modelId: string;
          namespace: string;
          vectorScoreThreshold?: number;
        },
        {
          entries: Array<{
            contentHash?: string;
            entryId: string;
            filterValues: Array<{ name: string; value: any }>;
            importance: number;
            key?: string;
            metadata?: Record<string, any>;
            replacedAt?: number;
            status: "pending" | "ready" | "replaced";
            title?: string;
          }>;
          results: Array<{
            content: Array<{ metadata?: Record<string, any>; text: string }>;
            entryId: string;
            order: number;
            score: number;
            startOrder: number;
          }>;
        }
      >;
    };
  };
};
