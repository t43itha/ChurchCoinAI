// An inventory of public Convex functions and the capability each one names.
// It parses the source, so it proves a function asks for a capability, not
// that the check runs on every path or blocks the right roles: the behaviour
// tests (tests/permissionsAccess.test.ts, tests/accessHardening.test.ts) are
// the guarantee. Its job is to stop a new query or action shipping with only
// "signed in and a member" as its gate, as the pre-launch audit found AI
// actions and insight queries that any Guest (or any free sign-up) could call.
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
  // Before sign-in.
  "queries/launchFeatures:get": "two public launch-flag booleans the signed-out landing page reads",
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

// Allowlisted functions another open branch adds. The stale check tolerates
// their absence, so either branch can merge first. Delete a name from here
// once its branch has merged.
const AWAITING_MERGE = new Set([
  // PR #72 (feat/launch-mode) adds convex/queries/launchFeatures.ts.
  "queries/launchFeatures:get",
]);

const functions = publicFunctions();

describe("public Convex function gate inventory", () => {
  it("finds the public functions under queries, mutations, actions and intelligence", () => {
    // A sanity floor so a parser change can't silently check nothing.
    expect(functions.length).toBeGreaterThan(190);
  });

  it("lists a capability check for each function, or an allowlist reason", () => {
    const ungated = functions
      .filter(({ name, capabilities }) => capabilities.length === 0 && !(name in ALLOWLIST))
      .map(({ name }) => name);
    expect(
      ungated,
      "These functions name no capability check this inventory can see. Gate them with an awaited requireCapability / assertCapability (or the action helper with a capability), and cover the roles in tests/permissionsAccess.test.ts. Add to ALLOWLIST only for pre-membership or own-record functions, with a reason."
    ).toEqual([]);
  });

  it("keeps the allowlist to functions that exist and have no gate", () => {
    const byName = new Map(functions.map((fn) => [fn.name, fn]));
    const stale = Object.keys(ALLOWLIST).filter((name) => {
      const fn = byName.get(name);
      if (!fn) return !AWAITING_MERGE.has(name);
      return fn.capabilities.length > 0;
    });
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
    expect(detect("return requireCapability(ctx, \"ledger.read\");")).toEqual(["ledger.read"]);
  });

  it("rejects capability names that are not in lib/permissions.ts", () => {
    expect(detect('await requireCapability(ctx, "ledger.everything");')).toEqual([]);
  });

  it("rejects a gate that can never run", () => {
    expect(detect('if (false) await requireCapability(ctx, "ledger.read");')).toEqual([]);
    expect(detect('if (false) { assertCapability(user, "ledger.read"); }')).toEqual([]);
    expect(detect("if (false) await readRows(ctx);", 'async function readRows(ctx) { return requireCapability(ctx, "ledger.read"); }')).toEqual([]);
  });

  it("rejects an async gate whose result is not awaited", () => {
    expect(detect('requireCapability(ctx, "ledger.read"); return null;')).toEqual([]);
    expect(detect('void requireUser(ctx, "reports.read", 20);')).toEqual([]);
    expect(detect("readRows(ctx); return null;", 'async function readRows(ctx) { return requireCapability(ctx, "ledger.read"); }')).toEqual([]);
  });

  it("ignores internal functions", () => {
    expect(functionsInSource("queries/example", "export const fn = internalQuery({ handler: async () => null });")).toEqual([]);
  });
});
