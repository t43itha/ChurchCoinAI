import { importPKCS8, SignJWT } from "jose";
import {
  isGithubIssueForSupportTicket,
} from "../../lib/supportTickets";

export type GitHubSupportConfig = {
  owner: string;
  repo: string;
  repository: string;
  webhookSecret?: string;
  token?: string;
  appId?: string;
  privateKey?: string;
  installationId?: string;
};

export class GitHubSupportError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false
  ) {
    super(message);
    this.name = "GitHubSupportError";
  }
}

const required = (value: string | undefined, name: string) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new GitHubSupportError(
      `GitHub support integration is not configured (${name} is missing).`
    );
  }
  return trimmed;
};

export const getGitHubSupportConfig = (): GitHubSupportConfig => {
  const owner = required(process.env.GITHUB_SUPPORT_OWNER, "GITHUB_SUPPORT_OWNER");
  const repo = required(process.env.GITHUB_SUPPORT_REPO, "GITHUB_SUPPORT_REPO");
  const token = process.env.GITHUB_SUPPORT_TOKEN?.trim();
  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  const installationId = process.env.GITHUB_INSTALLATION_ID?.trim();

  if (!token && !(appId && privateKey && installationId)) {
    throw new GitHubSupportError(
      "GitHub support authentication is not configured. Set the GitHub App credentials or GITHUB_SUPPORT_TOKEN."
    );
  }

  return {
    owner,
    repo,
    repository: `${owner}/${repo}`,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET?.trim(),
    token,
    appId,
    privateKey,
    installationId,
  };
};

const githubHeaders = (token: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
});

export const getGitHubSupportToken = async (config: GitHubSupportConfig) => {
  if (config.token) return config.token;

  const appId = required(config.appId, "GITHUB_APP_ID");
  const privateKey = required(config.privateKey, "GITHUB_APP_PRIVATE_KEY").replace(
    /\\n/g,
    "\n"
  );
  const installationId = required(
    config.installationId,
    "GITHUB_INSTALLATION_ID"
  );
  const now = Math.floor(Date.now() / 1_000);
  const key = await importPKCS8(privateKey, "RS256");
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(appId)
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 9 * 60)
    .sign(key);

  const response = await fetch(
    `https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );

  if (!response.ok) {
    throw new GitHubSupportError(
      `GitHub installation authentication failed (${response.status}).`,
      response.status,
      response.status === 429 || response.status >= 500
    );
  }

  const payload = (await response.json()) as { token?: unknown };
  if (typeof payload.token !== "string" || !payload.token) {
    throw new GitHubSupportError("GitHub did not return an installation token.");
  }
  return payload.token;
};

const parseGithubResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const requestId = response.headers.get("x-github-request-id");
    throw new GitHubSupportError(
      `GitHub request failed (${response.status})${requestId ? ` [${requestId}]` : ""}.`,
      response.status,
      response.status === 429 || response.status >= 500
    );
  }
  return (await response.json()) as T;
};

export const findExistingSupportIssue = async (
  config: GitHubSupportConfig,
  token: string,
  reference: string,
  ticketCreatedAt: number
) => {
  // Repository issue listing is used instead of search because newly-created
  // issues can take time to enter GitHub's search index. This closes the
  // remote-create/local-persist recovery gap without creating a duplicate.
  const earliestRelevantCreation = ticketCreatedAt - 5 * 60_000;
  for (let page = 1; page <= 20; page += 1) {
    const params = new URLSearchParams({
      state: "all",
      sort: "created",
      direction: "desc",
      per_page: "100",
      page: String(page),
    });
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/issues?${params}`,
      { headers: githubHeaders(token) }
    );
    const issues = await parseGithubResponse<
      Array<{
        number: number;
        html_url: string;
        title: string;
        body?: string | null;
        created_at: string;
        pull_request?: unknown;
      }>
    >(response);
    const existing = issues.find(
      (issue) =>
        !issue.pull_request &&
        isGithubIssueForSupportTicket(issue, reference)
    );
    if (existing) return existing;
    if (issues.length < 100) return undefined;

    const oldestCreatedAt = Date.parse(issues[issues.length - 1].created_at);
    if (
      Number.isFinite(oldestCreatedAt) &&
      oldestCreatedAt < earliestRelevantCreation
    ) {
      return undefined;
    }
  }

  throw new GitHubSupportError(
    "GitHub support issue deduplication exceeded its safe page limit.",
    undefined,
    true
  );
};

export const assertPrivateSupportRepository = async (
  config: GitHubSupportConfig,
  token: string
) => {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`,
    { headers: githubHeaders(token) }
  );
  const repository = await parseGithubResponse<{ private?: boolean }>(response);
  if (repository.private !== true) {
    throw new GitHubSupportError(
      "GitHub support repository must be private before customer reports can be synced."
    );
  }
};

export const createSupportIssue = async (input: {
  config: GitHubSupportConfig;
  token: string;
  title: string;
  body: string;
  labels: string[];
}) => {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(input.config.owner)}/${encodeURIComponent(input.config.repo)}/issues`,
    {
      method: "POST",
      headers: githubHeaders(input.token),
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        labels: input.labels,
      }),
    }
  );
  return await parseGithubResponse<{
    number: number;
    html_url: string;
    title: string;
  }>(response);
};

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
};

export const verifyGitHubWebhookSignature = async (
  rawBody: string,
  signature: string | null,
  secret: string
) => {
  if (!signature?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody)
  );
  const expected = `sha256=${bytesToHex(new Uint8Array(digest))}`;
  return timingSafeEqual(expected, signature.toLowerCase());
};
