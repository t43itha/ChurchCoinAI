import { importPKCS8, SignJWT } from "jose";

export type EnableBankingAccount = {
  uid: string;
  identification_hash?: string;
  identification_hashes?: string[];
  name?: string;
  account_id?: {
    iban?: string;
    bban?: string;
  };
  all_account_ids?: Array<{
    identification?: string;
    scheme_name?: string;
  }>;
  account_servicer?: {
    name?: string;
  };
  details?: string | {
    name?: string;
    iban?: string;
    bban?: string;
    currency?: string;
    product?: string;
    cash_account_type?: string;
  };
  cash_account_type?: string;
  product?: string;
  currency?: string;
};

type EnableBankingAspsp = {
  name?: unknown;
  country?: unknown;
  logo?: unknown;
  maximum_consent_validity?: unknown;
  psu_types?: unknown;
  beta?: unknown;
};

export type EnableBankingInstitution = {
  name: string;
  country: string;
  logoUrl: string | null;
  maximumConsentValiditySeconds: number;
  beta: boolean;
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
  access: {
    valid_until: string;
  };
  psu_id_hash?: string;
};

export type EnableBankingStartAuthorizationResponse = {
  url: string;
  authorization_id?: string;
  psu_id_hash?: string;
};

export type EnableBankingTransactionsResponse = {
  transactions: unknown[];
  continuation_key?: string | null;
};

export class EnableBankingApiError extends Error {
  status: number;
  statusText?: string;
  code?: string;

  constructor(
    status: number,
    statusText?: string,
    code?: string,
    providerMessage?: string
  ) {
    super(
      providerMessage ||
        `Enable Banking API request failed with status ${status}${
          statusText ? ` ${statusText}` : ""
        }`
    );
    this.name = "EnableBankingApiError";
    this.status = status;
    this.statusText = statusText;
    this.code = code;
  }
}

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

const nonEmptyString = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const parseEnableBankingError = (body: unknown) => {
  if (!body || typeof body !== "object") {
    return { code: undefined, message: undefined };
  }

  const record = body as Record<string, unknown>;
  const code =
    nonEmptyString(record.code) ||
    nonEmptyString(record.error) ||
    nonEmptyString(record.error_code);
  const message =
    nonEmptyString(record.detail) ||
    nonEmptyString(record.message) ||
    nonEmptyString(record.error_description);

  return {
    code,
    message: message?.slice(0, 500),
  };
};

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

  const body = await response.text();
  let parsedBody: unknown;
  if (body) {
    try {
      parsedBody = JSON.parse(body);
    } catch {
      if (response.ok) {
        throw new Error("Enable Banking API returned invalid JSON");
      }
    }
  }

  if (!response.ok) {
    const providerError = parseEnableBankingError(parsedBody);
    throw new EnableBankingApiError(
      response.status,
      response.statusText || undefined,
      providerError.code,
      providerError.message
    );
  }

  if (!body) {
    return {} as T;
  }

  return parsedBody as T;
};

export const getEnableBankingDefaults = () => ({
  aspspCountry: process.env.ENABLE_BANKING_DEFAULT_COUNTRY || "GB",
  redirectUrl: getRequiredEnv("ENABLE_BANKING_REDIRECT_URL"),
});

export const getConsentValidUntil = (maximumValiditySeconds: number) => {
  if (
    !Number.isSafeInteger(maximumValiditySeconds) ||
    maximumValiditySeconds <= 0
  ) {
    throw new Error("Enable Banking returned invalid consent validity");
  }

  const validUntil = new Date(Date.now() + maximumValiditySeconds * 1000);
  return validUntil.toISOString();
};

export const normalizeEnableBankingInstitutions = (
  response: unknown
): EnableBankingInstitution[] => {
  if (!response || typeof response !== "object") {
    throw new Error("Enable Banking ASPSP response is invalid");
  }

  const aspsps = (response as { aspsps?: unknown }).aspsps;
  if (!Array.isArray(aspsps)) {
    throw new Error("Enable Banking ASPSP response is invalid");
  }

  const institutions = aspsps.flatMap((raw): EnableBankingInstitution[] => {
    const aspsp = raw as EnableBankingAspsp;
    const name = nonEmptyString(aspsp.name);
    const country = nonEmptyString(aspsp.country)?.toUpperCase();
    const logoUrl = nonEmptyString(aspsp.logo) || null;
    const maximumConsentValiditySeconds = aspsp.maximum_consent_validity;
    const supportsBusiness =
      Array.isArray(aspsp.psu_types) && aspsp.psu_types.includes("business");

    if (
      !name ||
      !country ||
      !supportsBusiness ||
      !Number.isSafeInteger(maximumConsentValiditySeconds) ||
      (maximumConsentValiditySeconds as number) <= 0
    ) {
      return [];
    }

    return [{
      name,
      country,
      logoUrl,
      maximumConsentValiditySeconds: maximumConsentValiditySeconds as number,
      beta: aspsp.beta === true,
    }];
  });

  const uniqueInstitutions = new Map(
    institutions.map((institution) => [
      `${institution.country}\u0000${institution.name}`,
      institution,
    ])
  );

  return [...uniqueInstitutions.values()].sort((first, second) =>
    first.name.localeCompare(second.name)
  );
};

export const getAvailableInstitutions = async (country: string) => {
  const params = new URLSearchParams({
    country: country.toUpperCase(),
    psu_type: "business",
    service: "AIS",
  });
  const response = await enableBankingRequest<unknown>(`/aspsps?${params}`);
  return normalizeEnableBankingInstitutions(response);
};

export const isEnableBankingExpiredSessionError = (error: unknown) =>
  error instanceof EnableBankingApiError &&
  error.code?.toUpperCase() === "EXPIRED_SESSION";

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
  continuationKey,
}: {
  accountId: string;
  dateFrom: string;
  dateTo: string;
  continuationKey?: string;
}) => {
  const params = new URLSearchParams({
    date_from: dateFrom,
    date_to: dateTo,
  });
  if (continuationKey != null) {
    params.set("continuation_key", continuationKey);
  }

  return await enableBankingRequest<EnableBankingTransactionsResponse>(
    `/accounts/${encodeURIComponent(accountId)}/transactions?${params}`
  );
};

export const closeSession = async (sessionId: string) =>
  await enableBankingRequest<{ message: string }>(
    `/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" }
  );
