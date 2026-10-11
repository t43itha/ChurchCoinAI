import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Onboarding from "../components/Onboarding";

// Each query is answered by its function reference, the same way the reconciliation tests do it.
const fixtures = vi.hoisted(() => ({ emailInvites: [] as unknown[] }));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  const { api } = await import("../convex/_generated/api");
  const nameOf = (ref: unknown) => getFunctionName(ref as Parameters<typeof getFunctionName>[0]);
  return {
    useQuery: (ref: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      const name = nameOf(ref);
      if (name === nameOf(api.queries.invitations.pendingForCurrentUser)) return fixtures.emailInvites;
      if (name === nameOf(api.queries.invitations.getByToken)) return undefined;
      throw new Error(`Unexpected query: ${name}`);
    },
    useMutation: () => () => Promise.resolve(undefined),
  };
});

const clerkUser = {
  firstName: "Sarah",
  lastName: "Jones",
  fullName: "Sarah Jones",
  emailAddresses: [{ emailAddress: "sarah@example.invalid" }],
};

const render = () =>
  renderToStaticMarkup(createElement(Onboarding, { clerkUser, onComplete: vi.fn() }));

beforeEach(() => {
  // Invite tokens live in localStorage, which the node test environment doesn't provide.
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  fixtures.emailInvites = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("onboarding start", () => {
  it("offers joining by link or creating a church when no invitation matches", () => {
    const html = render();
    expect(html).toContain("Welcome to ChurchCoin");
    expect(html).toContain("I have an invite link");
    expect(html).toContain("Create a new organisation");
    expect(html).toContain("sarah@example.invalid");
  });

  it("does not start the create-church walkthrough on its own", () => {
    expect(render()).not.toContain("Set up your church");
  });

  it("lists an invitation waiting for the signed-in email as one sheet", () => {
    fixtures.emailInvites = [
      { invitationId: "invite-1", organizationName: "St Barnabas", role: "Finance Team" },
    ];
    const html = render();
    expect(html).toContain("You&#x27;re invited");
    expect(html).toContain("St Barnabas");
    expect(html).toContain("as Finance Team");
    expect(html).toContain("None of these? Create a new organisation instead");
    expect(html).not.toContain("Welcome to ChurchCoin");
  });
});
