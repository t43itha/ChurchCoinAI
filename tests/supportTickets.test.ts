import { describe, expect, it } from "vitest";
import {
  buildGithubIssueBody,
  buildGithubIssueTitle,
  createSupportReference,
  statusFromGithubIssue,
  validateSupportTicketInput,
} from "../lib/supportTickets";

describe("support ticket helpers", () => {
  it("creates a stable customer-facing reference from the Convex id", () => {
    expect(createSupportReference("jd7abc123xyz8901")).toBe("CC-3XYZ8901");
  });

  it("rejects reports that cannot be triaged", () => {
    expect(() =>
      validateSupportTicketInput({ title: "Bug", description: "It broke" })
    ).toThrow("at least 5 characters");
  });

  it("neutralises GitHub mentions in customer content", () => {
    const title = buildGithubIssueTitle("CC-123", "Problem for @maintainer");
    const body = buildGithubIssueBody({
      reference: "CC-123",
      type: "bug",
      impact: "blocking",
      reporterRole: "Finance Team",
      title: "Problem",
      description: "Please ask @maintainer to inspect <script>bad()</script>.",
      appPath: "/transactions",
      appRelease: "test",
      browserSummary: "Test Browser",
      createdAt: 0,
    });

    expect(title).not.toContain("@maintainer");
    expect(body).not.toContain("@maintainer");
    expect(body).toContain("＠maintainer");
    expect(body).toContain("&lt;script&gt;");
  });

  it("maps private GitHub workflow labels to customer-safe statuses", () => {
    expect(
      statusFromGithubIssue({ state: "open", labels: ["status:in-progress"] })
    ).toBe("in_progress");
    expect(statusFromGithubIssue({ state: "closed", labels: [] })).toBe(
      "resolved"
    );
  });
});
