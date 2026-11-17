// Every public Convex function must name the capability it enforces, so a
// new query or action can't ship with only "signed in and a member" as its
// gate. The security audit before launch found AI actions and insight queries
// that any Guest (or any free sign-up) could call that way.
import { describe, expect, it } from "vitest";
import { functionsInSource, publicFunctions } from "./helpers/publicFunctions";

// Functions with no capability gate, each with why that is honest. Keep this
// short: if a function reads or writes church data, gate it with a capability
// from lib/permissions.ts instead of adding it here.
const ALLOWLIST: Record<string, string> = {
  // Before membership: the caller has no organization or role yet.
  "queries/organizations:hasOrganization": "onboarding check for the signed-in identity",
  "mutations/organizations:create": "onboarding creates the caller's organization (verified email, validated names)",
  "queries/invitations:getByToken": "the secret invite token is the credential",
  "queries/invitations:pendingForCurrentUser": "invitations addressed to the caller's verified email",
  "mutations/users:acceptInvitation": "joins via token or a verified-email invitation",
  "queries/users:identity": "the caller's own Clerk identity",
  // The caller's own records, for every member.
  "queries/users:current": "the caller's own user record",
  "queries/users:currentWithAccess": "the caller's own record and access decision (used by action helpers)",
  "mutations/users:updateProfile": "edits only the caller's own profile",
  "queries/users:getById": "a colleague's name only, unless the caller has users.list",
  "queries/supportTickets:listMine": "the caller's own support tickets",
  "mutations/supportTickets:submit": "any member, even a locked-out one, can ask for help",
  // Access and billing state, readable while access is blocked so Admins can recover.
  "queries/organizations:current": "own organization for every member; Stripe ids only with billing.manage",
  "queries/subscriptions:access": "the access decision every screen needs",
  "queries/subscriptions:current": "plan and status for every member; Stripe ids only with billing.manage",
  "queries/subscriptions:hasActive": "a boolean about the caller's own organization",
  // Actions whose first step is a mutation that enforces the capability.
  "actions/invitations:createAndSend": "runs mutations.invitations.create (invitations.manage) before emailing",
  "actions/invitations:resend": "runs mutations.invitations.resend (invitations.manage) before emailing",
};

const functions = publicFunctions();

describe("public Convex functions", () => {
  it("finds the public functions under queries, mutations, actions and intelligence", () => {
    // A sanity floor so a parser change can't silently check nothing.
    expect(functions.length).toBeGreaterThan(190);
  });

  it("each enforce a named capability or are allowlisted with a reason", () => {
    const ungated = functions
      .filter(({ name, capabilities }) => capabilities.length === 0 && !(name in ALLOWLIST))
      .map(({ name }) => name);
    expect(
      ungated,
      "Gate these with requireCapability / assertCapability (or the action helper with a capability). Add to ALLOWLIST only for pre-membership or own-record functions, with a reason."
    ).toEqual([]);
  });

  it("keeps the allowlist to functions that exist and have no gate", () => {
    const byName = new Map(functions.map((fn) => [fn.name, fn]));
    const stale = Object.keys(ALLOWLIST).filter((name) => (byName.get(name)?.capabilities.length ?? 1) > 0);
    expect(stale, "Remove these allowlist entries: the function is gone or now names a capability.").toEqual([]);
  });
});

describe("capability detection", () => {
  const detect = (body: string, helpers = "") =>
    functionsInSource("queries/example", `${helpers}\nexport const fn = query({ args: {}, handler: async (ctx) => { ${body} } });`)[0]
      .capabilities;

  it("does not accept a bare requireAuth", () => {
    expect(detect("const user = await requireAuth(ctx); return user;")).toEqual([]);
  });

  it("accepts requireCapability, assertCapability and capability helpers", () => {
    expect(detect('await requireCapability(ctx, "ledger.read");')).toEqual(["ledger.read"]);
    expect(detect('const user = await requireMembership(ctx); assertCapability(user, "organization.export");')).toEqual(["organization.export"]);
    expect(detect('await requireUser(ctx, "reports.read", 20);')).toEqual(["reports.read"]);
    expect(detect("await readRows(ctx);", 'async function readRows(ctx) { return requireCapability(ctx, "ledger.read"); }')).toEqual(["ledger.read"]);
  });

  it("rejects capability names that are not in lib/permissions.ts", () => {
    expect(detect('await requireCapability(ctx, "ledger.everything");')).toEqual([]);
  });

  it("ignores internal functions", () => {
    expect(functionsInSource("queries/example", "export const fn = internalQuery({ handler: async () => null });")).toEqual([]);
  });
});
