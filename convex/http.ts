import { httpRouter, makeFunctionReference } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { getPlanFromStripeProduct, getStripe } from "./lib/stripe";
import { getPlaid } from "./lib/plaid";
import { authorizeSession, getConsentValidUntil } from "./lib/enableBanking";
import type Stripe from "stripe";
import { decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import {
  getGitHubSupportConfig,
  verifyGitHubWebhookSignature,
} from "./lib/githubSupport";
import { statusFromGithubIssue } from "../lib/supportTickets";
import type { SupportTicketStatus } from "../lib/supportTickets";

const applyGithubSupportStatus = makeFunctionReference<
  "mutation",
  { repository: string; issueNumber: number; status: SupportTicketStatus },
  { updated: boolean }
>("mutations/supportTickets:applyGithubStatus");

const http = httpRouter();

type EnableBankingCallbackAccount = {
  uid?: unknown;
  identification_hash?: unknown;
  identification_hashes?: unknown;
  name?: unknown;
  details?: {
    name?: unknown;
    currency?: unknown;
    product?: unknown;
    cash_account_type?: unknown;
    iban?: unknown;
    bban?: unknown;
  };
};

const nonEmptyString = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const trimCallbackValue = (value: string | null) => {
  const trimmed = value?.trim();
  return trimmed || undefined;
};

const safeErrorMessage = (message: string, fallback: string) =>
  (message.trim() || fallback).slice(0, 500);

const isLocalCallbackOrigin = (origin: URL) =>
  origin.hostname === "localhost" ||
  origin.hostname === "127.0.0.1" ||
  origin.hostname === "::1";

const getBankSettingsOrigin = (request: Request) => {
  const requestOrigin = new URL(request.url);
  const configuredBaseUrl = process.env.APP_BASE_URL?.trim();

  if (!configuredBaseUrl) {
    if (isLocalCallbackOrigin(requestOrigin)) return requestOrigin.origin;
    throw new Error("APP_BASE_URL not configured");
  }

  try {
    const parsed = new URL(configuredBaseUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("APP_BASE_URL must be an HTTP(S) URL");
    }
    return parsed.origin;
  } catch {
    throw new Error("APP_BASE_URL not configured");
  }
};

const settingsBankUrl = (request: Request, result: "success" | "error") => {
  const url = new URL("/settings", getBankSettingsOrigin(request));
  url.searchParams.set("tab", "bank");
  url.searchParams.set("bankConnection", result);
  return url.toString();
};

const redirectToBankSettings = (
  request: Request,
  result: "success" | "error"
) => {
  let location: string;
  try {
    location = settingsBankUrl(request, result);
  } catch (error: any) {
    console.error("Enable Banking callback redirect is not configured:", error?.message);
    return new Response("APP_BASE_URL not configured", { status: 500 });
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
    },
  });
};

const getAccountMask = (account: EnableBankingCallbackAccount) => {
  const identifier =
    nonEmptyString(account.details?.iban) || nonEmptyString(account.details?.bban);
  if (!identifier) return undefined;
  const compactIdentifier = identifier.replace(/\s+/g, "");
  return compactIdentifier.slice(-4) || undefined;
};

const mapEnableBankingAccount = (account: EnableBankingCallbackAccount) => {
  const accountId = nonEmptyString(account.uid);
  if (!accountId) {
    throw new Error("Enable Banking account is missing uid");
  }

  const identificationHashes = Array.isArray(account.identification_hashes)
    ? account.identification_hashes
        .map(nonEmptyString)
        .filter((hash): hash is string => Boolean(hash))
    : undefined;

  const name =
    nonEmptyString(account.name) ||
    nonEmptyString(account.details?.name) ||
    nonEmptyString(account.details?.product) ||
    nonEmptyString(account.details?.iban) ||
    nonEmptyString(account.details?.bban) ||
    "Bank account";

  return {
    accountId,
    providerAccountHash: nonEmptyString(account.identification_hash),
    providerAccountHashes: identificationHashes?.length
      ? identificationHashes
      : undefined,
    name,
    mask: getAccountMask(account),
    type:
      nonEmptyString(account.details?.cash_account_type) ||
      nonEmptyString(account.details?.product),
    currency: nonEmptyString(account.details?.currency),
  };
};

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const timingSafeEqualString = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
};

const verifyPlaidWebhook = async (
  plaidVerificationHeader: string,
  rawBody: string
) => {
  const protectedHeader = decodeProtectedHeader(plaidVerificationHeader);
  if (!protectedHeader.kid || !protectedHeader.alg) {
    throw new Error("Plaid verification token is missing required header values");
  }

  if (protectedHeader.alg !== "ES256") {
    throw new Error(`Unexpected Plaid webhook algorithm: ${protectedHeader.alg}`);
  }

  const plaid = getPlaid();
  const verificationKeyResponse = await plaid.webhookVerificationKeyGet({
    key_id: protectedHeader.kid,
  });

  const jwk = verificationKeyResponse.data.key;
  const publicKey = await importJWK({
    kty: jwk.kty,
    crv: jwk.crv,
    x: jwk.x,
    y: jwk.y,
    kid: jwk.kid,
    use: jwk.use,
    alg: jwk.alg,
  }, "ES256");

  const verified = await jwtVerify(plaidVerificationHeader, publicKey, {
    algorithms: ["ES256"],
    maxTokenAge: "5m",
    clockTolerance: 5,
  });

  const requestBodyHash = verified.payload.request_body_sha256;
  if (typeof requestBodyHash !== "string") {
    throw new Error("Plaid webhook token is missing request body hash");
  }

  const hashed = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawBody)
  );
  const expectedHash = bytesToHex(new Uint8Array(hashed));
  if (!timingSafeEqualString(expectedHash, requestBodyHash.toLowerCase())) {
    throw new Error("Plaid webhook request body hash mismatch");
  }
};

// Price ID to plan tier mapping (reverse lookup)
const getPlanFromPrice = (
  priceId: string,
  productId: string
): "starter" | "growing" | "thriving" | null => {
  const productPlan = getPlanFromStripeProduct(productId);
  if (productPlan) return productPlan;
  if (priceId === process.env.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === process.env.STRIPE_PRICE_GROWING) return "growing";
  if (priceId === process.env.STRIPE_PRICE_THRIVING) return "thriving";
  return null;
};

// Map Stripe status to our status type
const mapStripeStatus = (status: string):
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused"
  | null => {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
      return "unpaid";
    case "incomplete":
      return "incomplete";
    case "incomplete_expired":
      return "incomplete_expired";
    case "paused":
      return "paused";
    default:
      return null;
  }
};

// Stripe webhook endpoint
http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not configured");
      return new Response("Server configuration error", { status: 500 });
    }

    const stripe = getStripe();

    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return new Response("No signature provided", { status: 400 });
    }

    let event: Stripe.Event;
    try {
      const body = await request.text();
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    // Handle the event
    try {
      switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          const organizationId = subscription.metadata?.organizationId;

          if (!organizationId || typeof organizationId !== "string") {
            console.error("No organizationId in subscription metadata");
            break;
          }

          const organization = await ctx.runQuery(
            internal.queries.organizations.getByIdInternal,
            {
              organizationId: organizationId as any,
            }
          );
          if (!organization) {
            console.error(
              `Ignoring Stripe webhook for unknown organizationId: ${organizationId}`
            );
            break;
          }
          if (organization.accessMode !== "subscription") {
            throw new Error(
              `Stripe event targeted a non-subscription organization: ${organizationId}`
            );
          }
          const stripeCustomerId =
            typeof subscription.customer === "string"
              ? subscription.customer
              : subscription.customer?.id || "";
          if (
            !stripeCustomerId ||
            (organization.stripeCustomerId &&
              organization.stripeCustomerId !== stripeCustomerId)
          ) {
            throw new Error(
              `Stripe customer mismatch for organization: ${organizationId}`
            );
          }

          // Always derive the plan from the verified price ID — subscription
          // metadata is writable outside the webhook and must not be trusted
          const priceId = subscription.items?.data?.[0]?.price?.id || "";
          const product = subscription.items?.data?.[0]?.price?.product;
          const productId = typeof product === "string" ? product : product?.id || "";
          const plan = getPlanFromPrice(priceId, productId);
          const status = mapStripeStatus(subscription.status);
          if (!plan) {
            throw new Error(
              `Unknown Stripe product/price: ${productId || "missing"}/${priceId || "missing"}`
            );
          }
          if (!status) {
            throw new Error(`Unknown Stripe subscription status: ${subscription.status}`);
          }

          // Get period end from subscription object
          const periodEnd =
            (subscription as any).current_period_end ??
            (subscription.items?.data?.[0] as any)?.current_period_end ??
            (subscription as any).currentPeriodEnd ??
            0;
          if (!Number.isFinite(periodEnd) || periodEnd <= 0) {
            throw new Error("Stripe subscription is missing its current period end");
          }

          await ctx.runMutation(internal.mutations.subscriptions.upsert, {
            organizationId: organization._id,
            stripeCustomerId,
            stripeSubscriptionId: subscription.id,
            stripePriceId: priceId,
            plan,
            status,
            currentPeriodEnd: periodEnd * 1000,
            cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
            eventTimestamp: event.created * 1000,
          });
          break;
        }

        case "customer.subscription.deleted": {
          // Stripe sends this when the subscription actually ends (including
          // at period end after a cancel_at_period_end), so canceling here
          // does not cut short a paid period
          const subscription = event.data.object as Stripe.Subscription;
          await ctx.runMutation(internal.mutations.subscriptions.markCanceled, {
            stripeSubscriptionId: subscription.id,
            eventTimestamp: event.created * 1000,
          });
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          const subscriptionRef = (invoice as any).subscription;
          const subscriptionId = typeof subscriptionRef === "string"
            ? subscriptionRef
            : subscriptionRef?.id;
          if (subscriptionId) {
            await ctx.runMutation(internal.mutations.subscriptions.updateStatus, {
              stripeSubscriptionId: subscriptionId,
              status: "past_due",
              eventTimestamp: event.created * 1000,
            });
          }
          break;
        }

        case "invoice.paid":
        case "invoice.payment_succeeded": {
          const invoice = event.data.object as Stripe.Invoice;
          const subscriptionRef = (invoice as any).subscription;
          const subscriptionId = typeof subscriptionRef === "string"
            ? subscriptionRef
            : subscriptionRef?.id;
          if (subscriptionId) {
            await ctx.runMutation(internal.mutations.subscriptions.updateStatus, {
              stripeSubscriptionId: subscriptionId,
              status: "active",
              eventTimestamp: event.created * 1000,
            });
          }
          break;
        }

        case "checkout.session.completed": {
          // Subscription events will handle the actual data sync
          const session = event.data.object as Stripe.Checkout.Session;
          console.log("Checkout completed for session:", session.id);
          break;
        }

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }
    } catch (err: any) {
      console.error(`Error handling event ${event.type}:`, err.message);
      // Return 500 so Stripe will retry the webhook
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Plaid webhook endpoint
http.route({
  path: "/plaid/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const rawBody = await request.text();
    const plaidVerification = request.headers.get("plaid-verification");
    if (!plaidVerification) {
      return new Response("Missing Plaid verification header", { status: 401 });
    }

    try {
      await verifyPlaidWebhook(plaidVerification, rawBody);
    } catch (err: any) {
      console.error("Plaid webhook verification failed:", err.message);
      return new Response("Invalid webhook signature", { status: 401 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch (err: any) {
      console.error("Failed to parse Plaid webhook body:", err.message);
      return new Response("Invalid JSON", { status: 400 });
    }

    const { webhook_type, webhook_code, item_id, error } = body;
    console.log(`Plaid webhook: ${webhook_type}/${webhook_code} for item ${item_id}`);

    try {
      // Handle different webhook types
      switch (webhook_type) {
        case "ITEM": {
          switch (webhook_code) {
            case "ERROR": {
              // Item has an error that needs attention
              await ctx.runMutation(internal.mutations.plaid.updateItemStatus, {
                itemId: item_id,
                status: "error",
                errorCode: error?.error_code,
                errorMessage: error?.error_message,
              });
              break;
            }
            case "PENDING_EXPIRATION": {
              // UK Open Banking: Consent is about to expire
              await ctx.runMutation(internal.mutations.plaid.updateItemStatus, {
                itemId: item_id,
                status: "pending_reauth",
              });
              break;
            }
            case "USER_PERMISSION_REVOKED": {
              // User revoked permission via bank
              await ctx.runMutation(internal.mutations.plaid.updateItemStatus, {
                itemId: item_id,
                status: "consent_expired",
                errorMessage: "User revoked bank permission",
              });
              break;
            }
            default:
              console.log(`Unhandled ITEM webhook code: ${webhook_code}`);
          }
          break;
        }

        case "TRANSACTIONS": {
          switch (webhook_code) {
            case "SYNC_UPDATES_AVAILABLE": {
              // New transactions available - just log for manual sync model
              console.log(`New transactions available for item ${item_id}`);
              break;
            }
            case "INITIAL_UPDATE":
            case "HISTORICAL_UPDATE": {
              console.log(`Transaction data ready for item ${item_id}: ${webhook_code}`);
              break;
            }
            default:
              console.log(`Unhandled TRANSACTIONS webhook code: ${webhook_code}`);
          }
          break;
        }

        default:
          console.log(`Unhandled Plaid webhook type: ${webhook_type}`);
      }
    } catch (err: any) {
      console.error(`Error handling Plaid webhook ${webhook_type}/${webhook_code}:`, err.message);
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Enable Banking callback endpoint
http.route({
  path: "/enable-banking/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const code = trimCallbackValue(url.searchParams.get("code"));
    const state = trimCallbackValue(url.searchParams.get("state"));
    const providerError = trimCallbackValue(url.searchParams.get("error"));
    const providerErrorDescription = trimCallbackValue(
      url.searchParams.get("error_description")
    );

    if (!state) {
      return new Response("Enable Banking callback endpoint is ready.", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    // Atomically consume the state token before doing anything else so a
    // replayed, raced, or guessed callback URL can never re-enter the flow.
    // Expired states are marked as errors inside the claim mutation.
    const claim = await ctx.runMutation(
      internal.mutations.bankConnections.claimPendingState,
      { state }
    );

    if (!claim.claimed) {
      return redirectToBankSettings(request, "error");
    }

    if (providerError) {
      await ctx.runMutation(
        internal.mutations.bankConnections.markPendingError,
        {
          state,
          errorCode: providerError.slice(0, 100),
          errorMessage: safeErrorMessage(
            providerErrorDescription || "",
            "Bank authorization was not completed"
          ),
        }
      );
      return redirectToBankSettings(request, "error");
    }

    if (!code) {
      await ctx.runMutation(
        internal.mutations.bankConnections.markPendingError,
        {
          state,
          errorCode: "MISSING_CODE",
          errorMessage: "Bank authorization callback did not include a code",
        }
      );
      return redirectToBankSettings(request, "error");
    }

    try {
      const session = await authorizeSession(code);
      const consentExpiresAt = new Date(getConsentValidUntil()).getTime();

      await ctx.runMutation(
        internal.mutations.bankConnections.completePending,
        {
          state,
          providerConnectionId: session.session_id,
          accounts: session.accounts.map(mapEnableBankingAccount),
          consentExpiresAt,
        }
      );

      return redirectToBankSettings(request, "success");
    } catch {
      await ctx.runMutation(
        internal.mutations.bankConnections.markPendingError,
        {
          state,
          errorCode: "SESSION_EXCHANGE_FAILED",
          errorMessage: "Failed to authorize bank session",
        }
      );
      return redirectToBankSettings(request, "error");
    }
  }),
});

// Private GitHub support-repository webhook. Only customer-safe ticket status
// is mirrored back into ChurchCoin; engineering comments remain internal.
http.route({
  path: "/github/support-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    let config;
    try {
      config = getGitHubSupportConfig();
    } catch (error) {
      console.error(
        "GitHub support webhook is not configured:",
        error instanceof Error ? error.message : error
      );
      return new Response("Server configuration error", { status: 500 });
    }

    if (!config.webhookSecret) {
      console.error("GITHUB_WEBHOOK_SECRET not configured");
      return new Response("Server configuration error", { status: 500 });
    }

    const rawBody = await request.text();
    const validSignature = await verifyGitHubWebhookSignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
      config.webhookSecret
    );
    if (!validSignature) {
      return new Response("Invalid webhook signature", { status: 401 });
    }

    const event = request.headers.get("x-github-event");
    if (event === "ping") {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (event !== "issues") {
      return new Response(JSON.stringify({ ignored: true }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    }

    let payload: {
      repository?: { full_name?: unknown };
      issue?: {
        number?: unknown;
        state?: unknown;
        labels?: Array<string | { name?: unknown }>;
      };
    };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    if (payload.repository?.full_name !== config.repository) {
      return new Response("Unexpected repository", { status: 403 });
    }
    const issueNumber = payload.issue?.number;
    const issueState = payload.issue?.state;
    if (typeof issueNumber !== "number" || typeof issueState !== "string") {
      return new Response("Invalid issue payload", { status: 400 });
    }

    const labels = (payload.issue?.labels ?? [])
      .map((label) => (typeof label === "string" ? label : label.name))
      .filter((label): label is string => typeof label === "string");
    await ctx.runMutation(
      applyGithubSupportStatus,
      {
        repository: config.repository,
        issueNumber,
        status: statusFromGithubIssue({ state: issueState, labels }),
      }
    );

    return new Response(JSON.stringify({ received: true }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
