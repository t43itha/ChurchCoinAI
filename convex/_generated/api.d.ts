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
import type * as lib_auth from "../lib/auth.js";
import type * as mutations_categories from "../mutations/categories.js";
import type * as mutations_donors from "../mutations/donors.js";
import type * as mutations_funds from "../mutations/funds.js";
import type * as mutations_organizations from "../mutations/organizations.js";
import type * as mutations_pledges from "../mutations/pledges.js";
import type * as mutations_transactions from "../mutations/transactions.js";
import type * as mutations_users from "../mutations/users.js";
import type * as queries_categories from "../queries/categories.js";
import type * as queries_dashboard from "../queries/dashboard.js";
import type * as queries_donors from "../queries/donors.js";
import type * as queries_funds from "../queries/funds.js";
import type * as queries_organizations from "../queries/organizations.js";
import type * as queries_pledges from "../queries/pledges.js";
import type * as queries_transactions from "../queries/transactions.js";
import type * as queries_users from "../queries/users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/ai": typeof actions_ai;
  "lib/auth": typeof lib_auth;
  "mutations/categories": typeof mutations_categories;
  "mutations/donors": typeof mutations_donors;
  "mutations/funds": typeof mutations_funds;
  "mutations/organizations": typeof mutations_organizations;
  "mutations/pledges": typeof mutations_pledges;
  "mutations/transactions": typeof mutations_transactions;
  "mutations/users": typeof mutations_users;
  "queries/categories": typeof queries_categories;
  "queries/dashboard": typeof queries_dashboard;
  "queries/donors": typeof queries_donors;
  "queries/funds": typeof queries_funds;
  "queries/organizations": typeof queries_organizations;
  "queries/pledges": typeof queries_pledges;
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

export declare const components: {};
