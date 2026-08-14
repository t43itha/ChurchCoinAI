import { afterEach, describe, expect, it, vi } from "vitest";
import { findExistingSupportIssue } from "../convex/lib/githubSupport";
import { githubSupportTicketMarker } from "../lib/supportTickets";

const config = {
  owner: "churchcoin",
  repo: "support",
  repository: "churchcoin/support",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GitHub support issue recovery", () => {
  it("uses repository listing instead of eventually-consistent search", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            number: 42,
            html_url: "https://github.com/churchcoin/support/issues/42",
            title: "Title edited during triage",
            body: githubSupportTicketMarker("CC-123"),
            created_at: new Date().toISOString(),
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const issue = await findExistingSupportIssue(
      config,
      "token",
      "CC-123",
      Date.now() - 60_000
    );

    expect(issue?.number).toBe(42);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/repos/churchcoin/support/issues?"
    );
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("/search/issues");
  });
});
