import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { getStripe } from "./lib/stripe";
import { getPlaid } from "./lib/plaid";
import {
  getAccountDetails,
  getGoCardlessConsentExpiry,
  getRequisition,
  mapGoCardlessAccountDetails,
} from "./lib/gocardless";
import { isPendingStateExpired } from "./lib/bankConnectionUtils";
import type Stripe from "stripe";
import { decodeProtectedHeader, importJWK, jwtVerify } from "jose";

const http = httpRouter();

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
    console.error("Bank callback redirect is not configured:", error?.message);
    return new Response("APP_BASE_URL not configured", { status: 500 });
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
    },
  });
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
const getPlanFromPriceId = (priceId: string): "starter" | "growing" | "thriving" => {
  if (priceId === process.env.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === process.env.STRIPE_PRICE_GROWING) return "growing";
  if (priceId === process.env.STRIPE_PRICE_THRIVING) return "thriving";
  // Default to starter if unknown
  return "starter";
};

// Map Stripe status to our status type
const mapStripeStatus = (status: string): "active" | "past_due" | "canceled" | "incomplete" => {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
      return "canceled";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    default:
      return "active";
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
          const planFromMetadata = subscription.metadata?.plan as "starter" | "growing" | "thriving" | undefined;

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

          const priceId = subscription.items?.data?.[0]?.price?.id || "";
          const plan = planFromMetadata || getPlanFromPriceId(priceId);

          // Get period end from subscription object
          const periodEnd =
            (subscription as any).current_period_end ??
            (subscription as any).currentPeriodEnd ??
            0;

          await ctx.runMutation(internal.mutations.subscriptions.upsert, {
            organizationId: organization._id,
            stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || '',
            stripeSubscriptionId: subscription.id,
            stripePriceId: priceId,
            plan,
            status: mapStripeStatus(subscription.status),
            currentPeriodEnd: periodEnd * 1000,
            cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
          });
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          await ctx.runMutation(internal.mutations.subscriptions.markCanceled, {
            stripeSubscriptionId: subscription.id,
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
            });
          }
          break;
        }

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

// GoCardless callback endpoint
http.route({
  path: "/gocardless/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const state = trimCallbackValue(url.searchParams.get("ref"));
    const providerError = trimCallbackValue(url.searchParams.get("error"));
    const providerErrorDescription = trimCallbackValue(
      url.searchParams.get("error_description")
    );

    if (!state) {
      return new Response("GoCardless callback endpoint is ready.", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    const pending = await ctx.runQuery(
      internal.queries.bankConnections.getPendingByState,
      { state }
    );

    if (!pending || pending.status !== "pending") {
      return redirectToBankSettings(request, "error");
    }

    if (isPendingStateExpired({ expiresAt: pending.expiresAt })) {
      await ctx.runMutation(
        internal.mutations.bankConnections.markPendingError,
        {
          state,
          errorCode: "STATE_EXPIRED",
          errorMessage: "Bank authorization session expired",
        }
      );
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

    try {
      if (!pending.providerConnectionId) {
        await ctx.runMutation(
          internal.mutations.bankConnections.markPendingError,
          {
            state,
            errorCode: "MISSING_REQUISITION_ID",
            errorMessage: "Bank authorization session is missing a requisition ID",
          }
        );
        return redirectToBankSettings(request, "error");
      }

      const requisition = await getRequisition(pending.providerConnectionId);
      if (
        !Array.isArray(requisition.accounts) ||
        requisition.accounts.length === 0
      ) {
        await ctx.runMutation(
          internal.mutations.bankConnections.markPendingError,
          {
            state,
            errorCode: "NO_ACCOUNTS",
            errorMessage: "Bank authorization did not return any accounts",
          }
        );
        return redirectToBankSettings(request, "error");
      }

      const accounts = await Promise.all(
        requisition.accounts.map(async (accountId) =>
          mapGoCardlessAccountDetails(
            accountId,
            await getAccountDetails(accountId)
          )
        )
      );

      await ctx.runMutation(
        internal.mutations.bankConnections.completePending,
        {
          state,
          providerConnectionId: requisition.id,
          accounts,
          consentExpiresAt: getGoCardlessConsentExpiry({
            accessValidForDays: 90,
          }),
        }
      );

      return redirectToBankSettings(request, "success");
    } catch (error: any) {
      await ctx.runMutation(
        internal.mutations.bankConnections.markPendingError,
        {
          state,
          errorCode: "REQUISITION_EXCHANGE_FAILED",
          errorMessage:
            error?.message || "Failed to complete GoCardless bank authorization",
        }
      );
      return redirectToBankSettings(request, "error");
    }
  }),
});

// Legacy Enable Banking callback endpoint retained as a validator-friendly health route.
http.route({
  path: "/enable-banking/callback",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(
      "Enable Banking is no longer the active ChurchCoinAI bank provider.",
      {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      }
    );
  }),
});

export default http;
