export type SupportTicketType = "bug" | "question" | "feature";
export type SupportTicketImpact = "blocking" | "difficult" | "minor";
export type SupportTicketStatus =
  | "submitted"
  | "under_review"
  | "in_progress"
  | "waiting_for_reporter"
  | "resolved"
  | "closed";

export const SUPPORT_TICKET_LIMITS = {
  title: 120,
  description: 5_000,
  expectedBehaviour: 2_000,
  reproductionSteps: 3_000,
  appPath: 240,
  appRelease: 100,
  browserSummary: 300,
} as const;

export const SUPPORT_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  in_progress: "In progress",
  waiting_for_reporter: "Waiting for you",
  resolved: "Resolved",
  closed: "Closed",
};

export const normalizeSupportText = (value: string, maxLength: number) =>
  value.replace(/\r\n/g, "\n").trim().slice(0, maxLength);

export const validateSupportTicketInput = (input: {
  title: string;
  description: string;
}) => {
  const title = normalizeSupportText(input.title, SUPPORT_TICKET_LIMITS.title);
  const description = normalizeSupportText(
    input.description,
    SUPPORT_TICKET_LIMITS.description
  );

  if (title.length < 5) {
    throw new Error("Add a short title of at least 5 characters.");
  }
  if (description.length < 20) {
    throw new Error("Tell us a little more about what happened.");
  }

  return { title, description };
};

export const createSupportReference = (ticketId: string) =>
  `CC-${ticketId.replace(/[^a-z0-9]/gi, "").slice(-8).toUpperCase()}`;

const escapeGithubText = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Prevent customer-entered text from notifying arbitrary GitHub users.
    .replace(/@/g, "＠");

const quoteGithubText = (value?: string) => {
  if (!value?.trim()) return "_Not provided_";
  return escapeGithubText(value)
    .split("\n")
    .map((line) => `> ${line || " "}`)
    .join("\n");
};

const ticketTypeLabel: Record<SupportTicketType, string> = {
  bug: "Bug",
  question: "Question",
  feature: "Feature request",
};

const ticketImpactLabel: Record<SupportTicketImpact, string> = {
  blocking: "Blocking work",
  difficult: "Difficult to continue",
  minor: "Minor issue",
};

export const buildGithubIssueTitle = (reference: string, title: string) =>
  `[${reference}] ${escapeGithubText(title).replace(/\s+/g, " ").slice(0, 120)}`;

export const githubSupportTicketMarker = (reference: string) =>
  `<!-- churchcoin-support-ticket:${reference.replace(/[^A-Z0-9-]/gi, "")} -->`;

export const isGithubIssueForSupportTicket = (
  issue: { title: string; body?: string | null },
  reference: string
) =>
  issue.body?.includes(githubSupportTicketMarker(reference)) === true ||
  issue.title.startsWith(`[${reference}]`);

export const buildGithubIssueBody = (ticket: {
  reference: string;
  type: SupportTicketType;
  impact: SupportTicketImpact;
  reporterRole: string;
  title: string;
  description: string;
  expectedBehaviour?: string;
  reproductionSteps?: string;
  appPath: string;
  appRelease: string;
  browserSummary: string;
  createdAt: number;
}) => `${githubSupportTicketMarker(ticket.reference)}

## Customer report ${escapeGithubText(ticket.reference)}

| Field | Value |
| --- | --- |
| Type | ${ticketTypeLabel[ticket.type]} |
| Impact | ${ticketImpactLabel[ticket.impact]} |
| Product area | \`${escapeGithubText(ticket.appPath)}\` |
| Release | \`${escapeGithubText(ticket.appRelease)}\` |
| Reporter role | ${escapeGithubText(ticket.reporterRole)} |
| Submitted | ${new Date(ticket.createdAt).toISOString()} |

## What happened

${quoteGithubText(ticket.description)}

## Expected behaviour

${quoteGithubText(ticket.expectedBehaviour)}

## Steps to reproduce

${quoteGithubText(ticket.reproductionSteps)}

<details>
<summary>Safe diagnostics</summary>

- Browser: ${escapeGithubText(ticket.browserSummary)}
- ChurchCoin reference: \`${escapeGithubText(ticket.reference)}\`

</details>

---
Created automatically from ChurchCoin's private in-app support channel. Customer-entered content has been isolated and mentions neutralised. Do not copy personal, donor, transaction, or banking data into this issue.
`;

export const statusFromGithubIssue = (input: {
  state: string;
  labels: string[];
}): SupportTicketStatus => {
  if (input.state === "closed") return "resolved";

  const labels = new Set(input.labels.map((label) => label.toLowerCase()));
  if (labels.has("status:waiting") || labels.has("status:waiting-for-customer")) {
    return "waiting_for_reporter";
  }
  if (labels.has("status:in-progress")) return "in_progress";
  if (labels.has("status:resolved")) return "resolved";
  if (labels.has("status:closed")) return "closed";
  if (labels.has("status:triage") || labels.has("status:under-review")) {
    return "under_review";
  }
  return "under_review";
};

export const githubLabelForTicketType = (type: SupportTicketType) => {
  if (type === "bug") return "bug";
  if (type === "feature") return "enhancement";
  return "question";
};
