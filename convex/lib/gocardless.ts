type GoCardlessTokenResponse = {
  access?: string;
  access_expires?: number;
  refresh?: string;
  refresh_expires?: number;
};

type GoCardlessAgreementResponse = {
  id: string;
  access_valid_for_days?: number;
};

type GoCardlessRequisitionResponse = {
  id: string;
  status?: string;
  link?: string;
  accounts?: string[];
  reference?: string;
};

export type GoCardlessAccountDetailsResponse = {
  account?: {
    name?: string;
    ownerName?: string;
    iban?: string;
    bban?: string;
    maskedPan?: string;
    cashAccountType?: string;
    product?: string;
    currency?: string;
  };
};

export type GoCardlessTransactionsResponse = {
  transactions?: {
    booked?: unknown[];
    pending?: unknown[];
  };
};

export class GoCardlessApiError extends Error {
  status: number;
  statusText?: string;
  summary?: string;
  detail?: string;

  constructor({
    status,
    statusText,
    summary,
    detail,
  }: {
    status: number;
    statusText?: string;
    summary?: string;
    detail?: string;
  }) {
    super(
      summary || detail
        ? `GoCardless API request failed with status ${status}: ${summary || detail}`
        : `GoCardless API request failed with status ${status}${
            statusText ? ` ${statusText}` : ""
          }`
    );
    this.name = "GoCardlessApiError";
    this.status = status;
    this.statusText = statusText;
    this.summary = summary;
    this.detail = detail;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

const getRequiredEnv = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} not configured`);
  }
  return value;
};

const getApiBaseUrl = () =>
  process.env.GOCARDLESS_API_BASE_URL ||
  "https://bankaccountdata.gocardless.com/api/v2";

const getNormalizedApiBaseUrl = () => `${getApiBaseUrl().replace(/\/+$/, "")}/`;

const nonEmptyString = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

export const getGoCardlessDefaults = () => ({
  country: process.env.GOCARDLESS_COUNTRY || "GB",
  institutionId:
    process.env.GOCARDLESS_INSTITUTION_ID || "SANDBOXFINANCE_SFIN0000",
  institutionName:
    process.env.GOCARDLESS_INSTITUTION_NAME || "GoCardless Sandbox",
  redirectUrl: getRequiredEnv("GOCARDLESS_REDIRECT_URL"),
});

export const getGoCardlessConsentExpiry = ({
  now = Date.now(),
  accessValidForDays = 90,
}: {
  now?: number;
  accessValidForDays?: number;
}) => now + accessValidForDays * DAY_MS;

const getAccountMask = (account?: GoCardlessAccountDetailsResponse["account"]) => {
  const identifier =
    nonEmptyString(account?.iban) ||
    nonEmptyString(account?.bban) ||
    nonEmptyString(account?.maskedPan);
  if (!identifier) return undefined;
  const compactIdentifier = identifier.replace(/\s+/g, "");
  return compactIdentifier.slice(-4) || undefined;
};

export const mapGoCardlessAccountDetails = (
  accountId: string,
  details: GoCardlessAccountDetailsResponse
) => {
  const account = details.account || {};
  return {
    accountId,
    providerAccountHash:
      nonEmptyString(account.iban) ||
      nonEmptyString(account.bban) ||
      nonEmptyString(account.maskedPan),
    name:
      nonEmptyString(account.name) ||
      nonEmptyString(account.ownerName) ||
      nonEmptyString(account.product) ||
      `Bank account ${accountId}`,
    mask: getAccountMask(account),
    type:
      nonEmptyString(account.cashAccountType) ||
      nonEmptyString(account.product),
    currency: nonEmptyString(account.currency),
  };
};

export const isGoCardlessReauthError = (error: unknown) => {
  const candidate = error as {
    status?: unknown;
    summary?: unknown;
  };
  const status = candidate?.status;
  const summary =
    typeof candidate?.summary === "string" ? candidate.summary : undefined;

  return (
    status === 401 ||
    status === 403 ||
    (status === 409 && summary === "Account Suspended")
  );
};

let cachedToken:
  | {
      access: string;
      expiresAt: number;
    }
  | undefined;

const parseErrorBody = async (response: Response) => {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as { summary?: string; detail?: string };
  } catch {
    return { detail: text };
  }
};

const fetchToken = async <T>(path: string, body: Record<string, string>) => {
  const response = await fetch(new URL(path, getNormalizedApiBaseUrl()), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await parseErrorBody(response);
    throw new GoCardlessApiError({
      status: response.status,
      statusText: response.statusText || undefined,
      summary: error.summary,
      detail: error.detail,
    });
  }

  return (await response.json()) as T;
};

const cacheAccessToken = (token: GoCardlessTokenResponse) => {
  if (!token.access || typeof token.access !== "string") {
    throw new Error("GoCardless token response is invalid");
  }

  cachedToken = {
    access: token.access,
    expiresAt:
      Date.now() + Math.max((token.access_expires || 3600) - 60, 1) * 1000,
  };

  return cachedToken.access;
};

const createAccessToken = async () => {
  const token = await fetchToken<GoCardlessTokenResponse>("token/new/", {
    secret_id: getRequiredEnv("GOCARDLESS_SECRET_ID"),
    secret_key: getRequiredEnv("GOCARDLESS_SECRET_KEY"),
  });

  if (token.access) {
    return cacheAccessToken(token);
  }

  if (!token.refresh || typeof token.refresh !== "string") {
    throw new Error("GoCardless token response is invalid");
  }

  const refreshed = await fetchToken<GoCardlessTokenResponse>(
    "token/refresh/",
    { refresh: token.refresh }
  );
  return cacheAccessToken(refreshed);
};

const getAccessToken = async () => {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.access;
  }
  return await createAccessToken();
};

const goCardlessRequest = async <T>(
  path: string,
  init: RequestInit = {}
): Promise<T> => {
  const accessToken = await getAccessToken();
  const url = new URL(path.replace(/^\/+/, ""), getNormalizedApiBaseUrl());
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    const error = await parseErrorBody(response);
    throw new GoCardlessApiError({
      status: response.status,
      statusText: response.statusText || undefined,
      summary: error.summary,
      detail: error.detail,
    });
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
};

export const createEndUserAgreement = async ({
  institutionId,
  maxHistoricalDays = 90,
  accessValidForDays = 90,
}: {
  institutionId: string;
  maxHistoricalDays?: number;
  accessValidForDays?: number;
}) =>
  await goCardlessRequest<GoCardlessAgreementResponse>(
    "agreements/enduser/",
    {
      method: "POST",
      body: JSON.stringify({
        institution_id: institutionId,
        max_historical_days: maxHistoricalDays,
        access_valid_for_days: accessValidForDays,
        access_scope: ["balances", "details", "transactions"],
      }),
    }
  );

export const createRequisition = async ({
  redirectUrl,
  institutionId,
  reference,
  agreementId,
}: {
  redirectUrl: string;
  institutionId: string;
  reference: string;
  agreementId: string;
}) =>
  await goCardlessRequest<GoCardlessRequisitionResponse>("requisitions/", {
    method: "POST",
    body: JSON.stringify({
      redirect: redirectUrl,
      institution_id: institutionId,
      reference,
      agreement: agreementId,
      user_language: "EN",
    }),
  });

export const getRequisition = async (requisitionId: string) =>
  await goCardlessRequest<GoCardlessRequisitionResponse>(
    `requisitions/${encodeURIComponent(requisitionId)}/`
  );

export const getAccountDetails = async (accountId: string) =>
  await goCardlessRequest<GoCardlessAccountDetailsResponse>(
    `accounts/${encodeURIComponent(accountId)}/details/`
  );

export const getAccountTransactions = async ({
  accountId,
  dateFrom,
  dateTo,
}: {
  accountId: string;
  dateFrom: string;
  dateTo: string;
}) => {
  const params = new URLSearchParams({
    date_from: dateFrom,
    date_to: dateTo,
  });

  return await goCardlessRequest<GoCardlessTransactionsResponse>(
    `accounts/${encodeURIComponent(accountId)}/transactions/?${params}`
  );
};

export const deleteRequisition = async (requisitionId: string) =>
  await goCardlessRequest<Record<string, never>>(
    `requisitions/${encodeURIComponent(requisitionId)}/`,
    { method: "DELETE" }
  );
