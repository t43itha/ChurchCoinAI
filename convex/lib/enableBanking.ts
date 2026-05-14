import { importPKCS8, SignJWT } from "jose";

type EnableBankingAccount = {
  uid: string;
  identification_hash?: string;
  identification_hashes?: string[];
  name?: string;
  details?: {
    name?: string;
    currency?: string;
    product?: string;
    cash_account_type?: string;
    iban?: string;
    bban?: string;
  };
};

type StartAuthorizationArgs = {
  state: string;
  aspspCountry: string;
  aspspName: string;
  redirectUrl: string;
  validUntil: string;
};

export type EnableBankingSessionResponse = {
  session_id: string;
  accounts: EnableBankingAccount[];
  psu_id_hash?: string;
};

export type EnableBankingStartAuthorizationResponse = {
  url: string;
  authorization_id?: string;
  psu_id_hash?: string;
};

export type EnableBankingTransactionsResponse = {
  transactions: unknown[];
};

const getRequiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} not configured`);
  }
  return value;
};

const getApiBaseUrl = () =>
  process.env.ENABLE_BANKING_API_BASE_URL || "https://api.enablebanking.com";

const getNormalizedApiBaseUrl = () => `${getApiBaseUrl().replace(/\/+$/, "")}/`;

const normalizePrivateKey = (key: string) =>
  key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;

export const createEnableBankingJwt = async () => {
  const applicationId = getRequiredEnv("ENABLE_BANKING_APPLICATION_ID");
  const privateKey = normalizePrivateKey(
    getRequiredEnv("ENABLE_BANKING_PRIVATE_KEY")
  );
  const key = await importPKCS8(privateKey, "RS256");
  const now = Math.floor(Date.now() / 1000);

  return await new SignJWT({})
    .setProtectedHeader({
      typ: "JWT",
      alg: "RS256",
      kid: applicationId,
    })
    .setIssuer("enablebanking.com")
    .setAudience("api.enablebanking.com")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
};

const enableBankingRequest = async <T>(
  path: string,
  init: RequestInit = {}
): Promise<T> => {
  const jwt = await createEnableBankingJwt();
  const url = new URL(path.replace(/^\/+/, ""), getNormalizedApiBaseUrl());
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${jwt}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(
      `Enable Banking API request failed with status ${response.status}`
    );
  }

  const body = await response.text();
  if (!body) {
    return {} as T;
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error("Enable Banking API returned invalid JSON");
  }
};

export const getEnableBankingDefaults = () => ({
  aspspCountry: process.env.ENABLE_BANKING_DEFAULT_COUNTRY || "GB",
  aspspName: process.env.ENABLE_BANKING_DEFAULT_ASPSP || "Metro Bank",
  redirectUrl: getRequiredEnv("ENABLE_BANKING_REDIRECT_URL"),
});

export const getConsentValidUntil = (days = 90) => {
  const validUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return validUntil.toISOString();
};

export const startAuthorization = async ({
  state,
  aspspCountry,
  aspspName,
  redirectUrl,
  validUntil,
}: StartAuthorizationArgs) =>
  await enableBankingRequest<EnableBankingStartAuthorizationResponse>("/auth", {
    method: "POST",
    body: JSON.stringify({
      access: {
        balances: true,
        transactions: true,
        valid_until: validUntil,
      },
      aspsp: {
        country: aspspCountry,
        name: aspspName,
      },
      psu_type: "business",
      redirect_url: redirectUrl,
      state,
    }),
  });

export const authorizeSession = async (code: string) =>
  await enableBankingRequest<EnableBankingSessionResponse>("/sessions", {
    method: "POST",
    body: JSON.stringify({ code }),
  });

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
  return await enableBankingRequest<EnableBankingTransactionsResponse>(
    `/accounts/${encodeURIComponent(accountId)}/transactions?${params}`
  );
};

export const closeSession = async (sessionId: string) =>
  await enableBankingRequest<{ message: string }>(
    `/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" }
  );
