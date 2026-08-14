const DEFAULT_YAPILY_API_BASE_URL = "https://api.yapily.com";

type YapilyConfig = {
  applicationId: string;
  applicationSecret: string;
  apiBaseUrl: string;
  callbackUrl: string;
};

export type YapilyInstitutionLike = {
  id?: unknown;
  name?: unknown;
  fullName?: unknown;
  countries?: unknown;
  environmentType?: unknown;
  media?: unknown;
  features?: unknown;
};

export type YapilyInstitution = {
  institutionId: string;
  name: string;
  country: string;
  logoUrl: string | null;
  environmentType: string | null;
};

export type YapilyAccountLike = {
  id?: unknown;
  type?: unknown;
  description?: unknown;
  currency?: unknown;
  nickname?: unknown;
  accountNames?: unknown;
  accountIdentifications?: unknown;
};

export type YapilyTransactionLike = {
  id?: unknown;
  date?: unknown;
  bookingDateTime?: unknown;
  valueDateTime?: unknown;
  amount?: unknown;
  transactionAmount?: unknown;
  reference?: unknown;
  description?: unknown;
  transactionInformation?: unknown;
  enrichment?: unknown;
};

type YapilyConsent = {
  id: string;
  institutionId: string;
  status: string;
  consentToken: string;
  expiresAt?: string;
  reconfirmBy?: string;
};

export class YapilyApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly providerCode?: string
  ) {
    super(message);
    this.name = "YapilyApiError";
  }
}

const nonEmptyString = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const readConfig = (): YapilyConfig => {
  const applicationId = process.env.YAPILY_APPLICATION_ID?.trim();
  const applicationSecret = process.env.YAPILY_APPLICATION_SECRET?.trim();
  const callbackUrl = process.env.YAPILY_CALLBACK_URL?.trim();
  const apiBaseUrl =
    process.env.YAPILY_API_BASE_URL?.trim() || DEFAULT_YAPILY_API_BASE_URL;

  if (!applicationId || !applicationSecret || !callbackUrl) {
    throw new Error(
      "Yapily is not configured. Set YAPILY_APPLICATION_ID, YAPILY_APPLICATION_SECRET, and YAPILY_CALLBACK_URL."
    );
  }

  let parsedCallback: URL;
  let parsedApiBase: URL;
  try {
    parsedCallback = new URL(callbackUrl);
    parsedApiBase = new URL(apiBaseUrl);
  } catch {
    throw new Error("Yapily callback or API base URL is invalid");
  }

  if (parsedCallback.protocol !== "https:" || parsedApiBase.protocol !== "https:") {
    throw new Error("Yapily callback and API base URLs must use HTTPS");
  }

  return {
    applicationId,
    applicationSecret,
    callbackUrl: parsedCallback.toString(),
    apiBaseUrl: parsedApiBase.toString().replace(/\/$/, ""),
  };
};

const getErrorDetails = (body: unknown) => {
  if (!body || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  const error =
    record.error && typeof record.error === "object"
      ? (record.error as Record<string, unknown>)
      : undefined;
  const providerCode =
    nonEmptyString(error?.code) ||
    nonEmptyString(record.code) ||
    nonEmptyString(record.status);
  const message =
    nonEmptyString(error?.message) ||
    nonEmptyString(record.message) ||
    nonEmptyString(record.error_description);
  return { providerCode, message };
};

const yapilyRequest = async <T>(
  path: string,
  init: RequestInit = {},
  consentToken?: string
): Promise<T> => {
  const config = readConfig();
  const basicAuth = Buffer.from(
    `${config.applicationId}:${config.applicationSecret}`,
    "utf8"
  ).toString("base64");
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(30_000),
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${basicAuth}`,
      ...(consentToken ? { consent: consentToken } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const details = getErrorDetails(body);
    throw new YapilyApiError(
      response.status,
      details.message || `Yapily request failed (${response.status})`,
      details.providerCode
    );
  }

  return body as T;
};

const requiredString = (value: unknown, message: string) => {
  const normalized = nonEmptyString(value);
  if (!normalized) throw new Error(message);
  return normalized;
};

export const normalizeYapilyInstitutions = (
  payload: unknown
): YapilyInstitution[] => {
  if (!payload || typeof payload !== "object") {
    throw new Error("Yapily institutions response is invalid");
  }

  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) {
    throw new Error("Yapily institutions response is invalid");
  }

  const requiredFeatures = [
    "INITIATE_ACCOUNT_REQUEST",
    "ACCOUNTS",
    "ACCOUNT_TRANSACTIONS",
  ];

  return (data as YapilyInstitutionLike[])
    .filter((institution) => {
      const countries = Array.isArray(institution.countries)
        ? institution.countries
        : [];
      const supportsGb = countries.some(
        (country) =>
          country &&
          typeof country === "object" &&
          nonEmptyString((country as { countryCode2?: unknown }).countryCode2)?.toUpperCase() ===
            "GB"
      );
      const features = Array.isArray(institution.features)
        ? institution.features.filter(
            (feature): feature is string => typeof feature === "string"
          )
        : [];
      return (
        supportsGb && requiredFeatures.every((feature) => features.includes(feature))
      );
    })
    .map((institution) => {
      const media = Array.isArray(institution.media) ? institution.media : [];
      const preferredMedia =
        media.find(
          (item) =>
            item &&
            typeof item === "object" &&
            nonEmptyString((item as { type?: unknown }).type)?.toLowerCase() ===
              "logo"
        ) || media[0];

      return {
        institutionId: requiredString(
          institution.id,
          "Yapily institution is missing id"
        ),
        name:
          nonEmptyString(institution.name) ||
          nonEmptyString(institution.fullName) ||
          "UK bank",
        country: "GB",
        logoUrl:
          preferredMedia && typeof preferredMedia === "object"
            ? nonEmptyString((preferredMedia as { source?: unknown }).source) || null
            : null,
        environmentType: nonEmptyString(institution.environmentType) || null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const getYapilyCallbackUrl = (state: string) => {
  const callback = new URL(readConfig().callbackUrl);
  callback.searchParams.set("state", state);
  return callback.toString();
};

export const getYapilyInstitutions = async () =>
  normalizeYapilyInstitutions(await yapilyRequest<unknown>("/institutions"));

export const startYapilyAccountAuthorization = async ({
  applicationUserId,
  institutionId,
  callback,
}: {
  applicationUserId: string;
  institutionId: string;
  callback: string;
}) => {
  const transactionFrom = new Date();
  transactionFrom.setUTCFullYear(transactionFrom.getUTCFullYear() - 1);

  const response = await yapilyRequest<{
    data?: { id?: unknown; authorisationUrl?: unknown };
  }>("/account-auth-requests", {
    method: "POST",
    body: JSON.stringify({
      applicationUserId,
      institutionId,
      callback,
      oneTimeToken: true,
      accountRequest: {
        transactionFrom: transactionFrom.toISOString(),
        featureScope: ["ACCOUNTS", "ACCOUNT_TRANSACTIONS"],
      },
    }),
  });

  return {
    consentId: requiredString(
      response.data?.id,
      "Yapily authorisation response is missing consent id"
    ),
    authorizationUrl: requiredString(
      response.data?.authorisationUrl,
      "Yapily authorisation response is missing redirect URL"
    ),
  };
};

export const exchangeYapilyOneTimeToken = async (
  oneTimeToken: string
): Promise<YapilyConsent> => {
  const response = await yapilyRequest<Partial<YapilyConsent>>(
    "/consent-one-time-token",
    {
      method: "POST",
      body: JSON.stringify({ oneTimeToken }),
    }
  );

  return {
    id: requiredString(response.id, "Yapily consent is missing id"),
    institutionId: requiredString(
      response.institutionId,
      "Yapily consent is missing institution id"
    ),
    status: requiredString(response.status, "Yapily consent is missing status"),
    consentToken: requiredString(
      response.consentToken,
      "Yapily consent is missing access token"
    ),
    ...(nonEmptyString(response.expiresAt)
      ? { expiresAt: nonEmptyString(response.expiresAt) }
      : {}),
    ...(nonEmptyString(response.reconfirmBy)
      ? { reconfirmBy: nonEmptyString(response.reconfirmBy) }
      : {}),
  };
};

export const getYapilyAccounts = async (consentToken: string) => {
  const response = await yapilyRequest<{ data?: unknown }>(
    "/accounts",
    {},
    consentToken
  );
  if (!Array.isArray(response.data)) {
    throw new Error("Yapily accounts response is invalid");
  }
  return response.data as YapilyAccountLike[];
};

export const getYapilyAccountTransactions = async ({
  consentToken,
  accountId,
  dateFrom,
  dateTo,
  limit,
  offset,
}: {
  consentToken: string;
  accountId: string;
  dateFrom: string;
  dateTo: string;
  limit: number;
  offset: number;
}) => {
  const query = new URLSearchParams({
    from: `${dateFrom}T00:00:00.000Z`,
    before: `${dateTo}T23:59:59.999Z`,
    limit: String(limit),
    offset: String(offset),
    sort: "date",
  });
  const response = await yapilyRequest<{
    data?: unknown;
    meta?: { pagination?: { totalCount?: unknown; next?: { offset?: unknown } } };
  }>(
    `/accounts/${encodeURIComponent(accountId)}/transactions?${query}`,
    {},
    consentToken
  );

  if (!Array.isArray(response.data)) {
    throw new Error("Yapily transactions response is invalid");
  }

  const totalCount = response.meta?.pagination?.totalCount;
  const explicitNextOffset = response.meta?.pagination?.next?.offset;
  const fallbackNextOffset = offset + response.data.length;
  const nextOffset =
    typeof explicitNextOffset === "number" &&
    Number.isInteger(explicitNextOffset) &&
    explicitNextOffset > offset
      ? explicitNextOffset
      : typeof totalCount === "number" &&
          fallbackNextOffset > offset &&
          fallbackNextOffset < totalCount
        ? fallbackNextOffset
        : undefined;

  return {
    transactions: response.data as YapilyTransactionLike[],
    nextOffset,
  };
};

export const deleteYapilyConsent = async (consentId: string) => {
  await yapilyRequest(`/consents/${encodeURIComponent(consentId)}?forceDelete=true`, {
    method: "DELETE",
  });
};

export const isYapilyAuthorizationError = (error: unknown) =>
  error instanceof YapilyApiError && (error.status === 401 || error.status === 403);
