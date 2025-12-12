"use node";

import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  CountryCode,
  Products,
} from "plaid";

let plaidInstance: PlaidApi | null = null;

export const getPlaid = (): PlaidApi => {
  if (plaidInstance) return plaidInstance;

  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = process.env.PLAID_ENV || "sandbox";

  if (!clientId) {
    throw new Error("PLAID_CLIENT_ID not configured");
  }
  if (!secret) {
    throw new Error("PLAID_SECRET not configured");
  }

  const configuration = new Configuration({
    basePath: PlaidEnvironments[env as keyof typeof PlaidEnvironments],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });

  plaidInstance = new PlaidApi(configuration);
  return plaidInstance;
};

// UK-specific configuration for Open Banking
export const PLAID_CONFIG = {
  countryCodes: [CountryCode.Gb],
  products: [Products.Transactions],
  language: "en",
} as const;

// Webhook URL (set in environment)
export const getPlaidWebhookUrl = (): string => {
  const url = process.env.PLAID_WEBHOOK_URL;
  if (!url) {
    throw new Error("PLAID_WEBHOOK_URL not configured");
  }
  return url;
};
