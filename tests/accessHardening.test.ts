// Behaviour checks for the pre-launch security audit fixes (A2 to A9 and the
// locked-out export). Each describes what a role or a stranger can do.
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionCtx, MutationCtx } from "../convex/_generated/server";
import { ROLES, can, type Capability, type UserRole } from "../lib/permissions";
import { fixture, invoke, type Row } from "./helpers/convexFixture";
import * as ai from "../convex/actions/ai";
import { checkAndConsume, consumeBackgroundUnits } from "../convex/mutations/aiRateLimit";
import { acceptInvitation, updateProfile } from "../convex/mutations/users";
import * as invitationQueries from "../convex/queries/invitations";
import * as invitationMutations from "../convex/mutations/invitations";
import * as organizationMutations from "../convex/mutations/organizations";
import * as organizationQueries from "../convex/queries/organizations";
import { merge } from "../convex/mutations/donors";
import * as bankQueries from "../convex/queries/bankConnections";
import * as plaidQueries from "../convex/queries/plaid";
import * as cashQueries from "../convex/queries/cashCollections";
import * as subscriptionQueries from "../convex/queries/subscriptions";
import { batchIndexTransactions, indexTransaction, updateInIndex } from "../convex/intelligence/ragIndexer";
import { upsertAccepted } from "../convex/intelligence/categorizationMemory";
import { deleteOrganization } from "../convex/actions/organizations";
import { transactionRAG } from "../convex/lib/ragInstance";
import { AI_CALL_UNITS, aiUsageLimits, requestUnits } from "../convex/lib/aiValidation";
import { runCategorisation } from "../components/statementImport/reviewLogic";

const generateContent = vi.hoisted(() => vi.fn(async () => ({ text: "[]" })));
vi.mock("@google/genai", async (importOriginal) => ({
  ...await importOriginal<typeof import("@google/genai")>(),
  GoogleGenAI: class { models = { generateContent }; },
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  generateContent.mockClear();
});

const withRole = (role: UserRole, extra: Record<string, Row[]> = {}, identity?: Record<string, unknown> | null) => {
  const f = fixture(extra, identity === undefined ? { subject: "clerk-user" } : identity);
  f.records.users[0].role = role;
  return f;
};

// A1 (intelligence suggestions) lives with the other read-privacy checks in
// tests/permissionsAccess.test.ts.

// ---------------------------------------------------------------- A2 + A3
type ActionCase = { name: keyof typeof ai; capability: Capability; args: Record<string, unknown> };
const row = { description: "TITHE A SMITH", amount: 10, type: "Income" };
const actionCases: ActionCase[] = [
  { name: "categorizeTransactions", capability: "ledger.write", args: { descriptions: ["x"], fundNames: [], categories: [] } },
  { name: "categorizeWithPipelinePreview", capability: "ledger.write", args: { transactions: [{ ...row, rowId: "r1" }] } },
  { name: "categorizeWithMatching", capability: "ledger.write", args: { transactions: [row], fundNames: [], categories: [] } },
  { name: "categorizeWithRAG", capability: "ledger.write", args: { transactions: [row], fundNames: [], categories: [] } },
  { name: "reconcilePledges", capability: "ledger.write", args: {} },
  { name: "generateInsights", capability: "reports.read", args: { transactionData: "[]" } },
  { name: "generateGiftAidSchedule", capability: "giftAid.read", args: { eligibleTransactions: "[]" } },
  { name: "generateTreasurerReport", capability: "reports.read", args: { summaryData: "{}" } },
  { name: "generateProjectReport", capability: "reports.read", args: { fundName: "Roof", fundBalance: 1, periodIncome: 1, periodExpense: 1, recentTransactions: "[]" } },
  { name: "generateCampaignReport", capability: "reports.read", args: { fundName: "Roof", totalRaisedCash: 1, totalPledged: 1, donorCount: 1, avgDonation: 1 } },
  { name: "generateAnnualStatement", capability: "reports.read", args: { period: "2026", incomeByCategory: "{}", expenditureByCategory: "{}", totalIncome: 1, totalExpenditure: 1 } },
  { name: "generateMonthlyBreakdown", capability: "reports.read", args: { monthlyData: "[]" } },
  { name: "generateDonorCommunication", capability: "donors.read", args: { donorName: "Alex", totalGiven: 1, recentDonations: "[]" } },
  { name: "generatePledgeCompletionMessage", capability: "donors.read", args: { donorName: "Alex", pledgeAmount: 1, fundName: "Roof" } },
  { name: "chatWithTreasurer", capability: "ledger.read", args: { message: "How are we doing?", contextData: "{}" } },
  { name: "generateRCIMonthlyNarrative", capability: "reports.read", args: { monthlyReportData: "{}" } },
];

function actionContext(role: UserRole, charge: () => Promise<unknown> = async () => { throw new Error("CHARGED"); }) {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  const runMutation = vi.fn(charge);
  const runQuery = vi.fn(async (reference: Parameters<typeof getFunctionName>[0]) => {
    if (getFunctionName(reference) === "queries/users:currentWithAccess") {
      return { user: { _id: "user", clerkId: "clerk", organizationId: "org", role }, access: { canUseApp: true } };
    }
    if (getFunctionName(reference) === "queries/pledges:smartLinkCandidates") {
      return {
        pledges: [{ id: "p1", donorName: "Alex", amount: 10, frequency: "Monthly", startDate: "2026-01-01" }],
        gifts: [{ id: "t1", date: "2026-02-01", description: "SO ALEX", amount: 10 }],
        total: 1,
      };
    }
    return { giftAidEnabled: true };
  });
  const ctx = { auth: { getUserIdentity: async () => ({ subject: "clerk" }) }, runQuery, runMutation } as unknown as ActionCtx;
  return { ctx, runQuery, runMutation };
}
const run = (name: keyof typeof ai, ctx: ActionCtx, args: Record<string, unknown>) =>
  (ai[name] as unknown as { _handler: (ctx: ActionCtx, args: unknown) => Promise<unknown> })._handler(ctx, args);

describe("A3: AI actions require the capability for the data they produce", () => {
  describe.each(actionCases)("$name", ({ name, capability, args }) => {
    it.each(ROLES)(`is gated by ${capability} for %s before any AI budget is spent`, async (role) => {
      const { ctx, runMutation } = actionContext(role);
      if (can(role, capability)) {
        await expect(run(name, ctx, args)).rejects.toThrow("CHARGED");
      } else {
        await expect(run(name, ctx, args)).rejects.toThrow(`Forbidden: This action requires ${capability}`);
        expect(runMutation).not.toHaveBeenCalled();
      }
      expect(generateContent).not.toHaveBeenCalled();
    });
  });

  it("lets any member check the AI configuration without spending budget", async () => {
    for (const role of ROLES) {
      const { ctx, runMutation } = actionContext(role);
      await expect(run("hasApiKey", ctx, {})).resolves.toBe(true);
      expect(runMutation).not.toHaveBeenCalled();
    }
  });
});

describe("A2: AI input caps and work-based charging", () => {
  it("rejects oversized input before authenticating or calling a model", async () => {
    const oversized: Array<[keyof typeof ai, Record<string, unknown>]> = [
      ["categorizeTransactions", { descriptions: Array(501).fill("x"), fundNames: [], categories: [] }],
      ["categorizeTransactions", { descriptions: ["x".repeat(4001)], fundNames: [], categories: [] }],
      ["categorizeWithMatching", { transactions: Array(501).fill(row), fundNames: [], categories: [] }],
      ["categorizeWithRAG", { transactions: Array(501).fill(row), fundNames: [], categories: [] }],
      ["generateInsights", { transactionData: "x".repeat(100_001) }],
      ["generateDonorCommunication", { donorName: "x".repeat(4001), totalGiven: 1, recentDonations: "[]" }],
    ];
    for (const [name, args] of oversized) {
      const { ctx, runQuery, runMutation } = actionContext("Admin");
      await expect(run(name, ctx, args)).rejects.toThrow(/too many items|too long/);
      expect(runQuery).not.toHaveBeenCalled();
      expect(runMutation).not.toHaveBeenCalled();
    }
  });

  it("charges row-based actions per row and single prompts a fixed amount", async () => {
    const { ctx, runMutation } = actionContext("Finance Team", async () => null);
    await run("categorizeTransactions", ctx, { descriptions: Array(30).fill("x"), fundNames: [], categories: [] });
    await run("generateTreasurerReport", ctx, { summaryData: "{}" });
    expect(runMutation.mock.calls.map((call) => (call as unknown[])[1])).toEqual([
      { organizationId: "org", userId: "user", principal: "clerk", units: 30 },
      { organizationId: "org", userId: "user", principal: "clerk", units: 20 },
    ]);
  });

  describe("rate limit", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-11-17T12:00:05Z") });
    });
    const charge = (ctx: MutationCtx, userId: string, units: number) =>
      invoke(checkAndConsume, ctx, { organizationId: "org", userId, principal: `clerk-${userId}`, units });

    it("lets one person import a full 500-row statement but caps them per minute", async () => {
      const { ctx } = fixture({ aiRateLimits: [], aiDailyUsage: [] });
      for (let batch = 0; batch < 25; batch += 1) await charge(ctx, "u1", 20);
      await expect(charge(ctx, "u1", 101)).rejects.toThrow("AI rate limit exceeded");
      await expect(charge(ctx, "u1", 100)).resolves.toBeTruthy();
      vi.setSystemTime(new Date("2026-11-17T12:01:05Z"));
      await expect(charge(ctx, "u1", 500)).resolves.toBeTruthy();
    });

    it("caps a church across its members, without charging a refused request", async () => {
      const { ctx, records } = fixture({ aiRateLimits: [], aiDailyUsage: [] });
      await charge(ctx, "u1", 500);
      await charge(ctx, "u2", 500);
      await expect(charge(ctx, "u3", 1)).rejects.toThrow("AI rate limit exceeded");
      expect(records.aiRateLimits.find((r) => r.userId === "u3")).toBeUndefined();
      expect(records.aiDailyUsage[0].units).toBe(1000);
    });

    it("stops every church once the deployment's daily budget is spent", async () => {
      vi.stubEnv("AI_DAILY_UNITS", "700");
      const { ctx } = fixture({ aiRateLimits: [], aiDailyUsage: [], organizations: [{ _id: "org" }, { _id: "org-2" }] });
      await charge(ctx, "u1", 500);
      await expect(invoke(checkAndConsume, ctx, { organizationId: "org-2", userId: "stranger", principal: "clerk-stranger", units: 201 }))
        .rejects.toThrow("today's usage limit");
      vi.setSystemTime(new Date("2026-11-18T00:00:05Z"));
      await expect(invoke(checkAndConsume, ctx, { organizationId: "org-2", userId: "stranger", principal: "clerk-stranger", units: 201 })).resolves.toBeTruthy();
    });

    it("stops one church at its own daily cap while other churches carry on", async () => {
      const { ctx } = fixture({ aiRateLimits: [], aiDailyUsage: [], organizations: [{ _id: "org" }, { _id: "org-2" }] });
      // 20 minutes of a full import each: 10,000 units, the default church cap.
      for (let minute = 0; minute < 20; minute += 1) {
        vi.setSystemTime(new Date(Date.UTC(2026, 10, 17, 12, minute, 5)));
        await charge(ctx, "u1", 500);
      }
      vi.setSystemTime(new Date("2026-11-17T13:00:05Z"));
      await expect(charge(ctx, "u1", 20)).rejects.toThrow("Your church has reached today's AI usage limit");
      await expect(invoke(checkAndConsume, ctx, { organizationId: "org-2", userId: "u9", principal: "clerk-u9", units: 500 })).resolves.toBeTruthy();
      vi.setSystemTime(new Date("2026-11-18T00:00:05Z"));
      await expect(charge(ctx, "u1", 20)).resolves.toBeTruthy();
    });

    it("lets two people run full 500-row statement imports at once through the real import flow", async () => {
      const { ctx } = fixture({ aiRateLimits: [], aiDailyUsage: [] });
      const importStatement = async (userId: string) => {
        const statuses: string[] = [];
        await runCategorisation({
          rows: Array.from({ length: 500 }, (_, i) => ({ description: `ROW ${i}`, amount: 10, type: "Income" as const })),
          runCounter: { current: 0 },
          funds: [],
          categories: [],
          // Each batch is one categorisation request, charged as the action charges it.
          suggest: async (batch) => {
            await charge(ctx, userId, requestUnits(batch.length));
            return [];
          },
          setRows: () => {},
          setCount: () => {},
          setStatus: (status) => statuses.push(status),
          setIsCategorising: () => {},
        });
        return statuses.at(-1);
      };
      await expect(Promise.all([importStatement("u1"), importStatement("u2")])).resolves.toEqual([
        "Auto-categorisation complete. 500 entries ready to review.",
        "Auto-categorisation complete. 500 entries ready to review.",
      ]);
    });
  });

  it("charges every categorisation request at least one model call, however few rows it sends", async () => {
    // 25 requests of 20 rows (a 500-row import) cost 500 units, inside the
    // 600-unit user minute. One-row requests cost 20 each, so one person gets
    // at most 30 requests a minute and the deployment about 10,000 a day.
    const limits = aiUsageLimits({});
    expect(25 * requestUnits(20)).toBe(500);
    expect(limits.userPerMinute / requestUnits(1)).toBe(30);
    expect(limits.deploymentPerDay / requestUnits(1)).toBe(10_000);

    const categorisations: Array<[keyof typeof ai, Record<string, unknown>]> = [
      ["categorizeTransactions", { descriptions: ["x"], fundNames: [], categories: [] }],
      ["categorizeWithPipelinePreview", { transactions: [{ ...row, rowId: "r1" }] }],
      ["categorizeWithMatching", { transactions: [row], fundNames: [], categories: [] }],
      ["categorizeWithRAG", { transactions: [row], fundNames: [], categories: [] }],
    ];
    for (const [name, args] of categorisations) {
      const { ctx, runMutation } = actionContext("Admin");
      await expect(run(name, ctx, args)).rejects.toThrow("CHARGED");
      expect((runMutation.mock.calls[0] as unknown[])[1]).toMatchObject({ units: AI_CALL_UNITS });
    }
  });
});

// ---------------------------------------------------------------- A5
describe("A5: invitations need a verified email", () => {
  const invitation = (extra: Record<string, unknown> = {}): Row => ({
    _id: "invite", organizationId: "org", email: "new@example.invalid", role: "Guest", invitedBy: "user",
    status: "pending", token: "secret-token", createdAt: 0, expiresAt: Date.now() + 86_400_000, ...extra,
  });
  const newcomer = (emailVerified: boolean | undefined) =>
    fixture({ users: [], invitations: [invitation()] }, { subject: "clerk-new", email: "New@Example.invalid", emailVerified, name: "New Person" });

  it.each([false, undefined])("refuses acceptance by id when the email is not verified (%s)", async (emailVerified) => {
    const { ctx, records } = newcomer(emailVerified);
    await expect(invoke(acceptInvitation, ctx, { invitationId: "invite" })).rejects.toThrow("verify your email");
    expect(records.users).toEqual([]);
    await expect(invoke(invitationQueries.pendingForCurrentUser, ctx, {})).resolves.toEqual([]);
  });

  it("accepts by id and lists the invitation for a verified email", async () => {
    const { ctx, records } = newcomer(true);
    await expect(invoke(invitationQueries.pendingForCurrentUser, ctx, {})).resolves.toHaveLength(1);
    await invoke(acceptInvitation, ctx, { invitationId: "invite" });
    expect(records.users[0]).toMatchObject({ email: "new@example.invalid", role: "Guest", name: "New Person" });
  });

  it("still accepts the secret invite link without a verified email, recording the invited address", async () => {
    const { ctx, records } = newcomer(false);
    await invoke(acceptInvitation, ctx, { token: "secret-token" });
    expect(records.users[0]).toMatchObject({ email: "new@example.invalid", organizationId: "org" });
  });

  it("refuses to create a church for an unverified email", async () => {
    const { ctx, records } = fixture({ users: [], organizations: [] }, { subject: "clerk-new", email: "new@example.invalid", emailVerified: false });
    await expect(invoke(organizationMutations.create, ctx, { name: "St Mary's", userName: "New Person" }))
      .rejects.toThrow("verify your email");
    expect(records.organizations).toEqual([]);
  });
});

// ---------------------------------------------------------------- A6
describe("A6: invitation email abuse", () => {
  const withScheduler = (ctx: MutationCtx) => {
    (ctx.scheduler as unknown as Record<string, unknown>).runAt = vi.fn();
    return ctx;
  };

  it("refuses a resend within 10 minutes of the last email", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-17T12:00:00Z") });
    const { ctx } = fixture({
      invitations: [{ _id: "invite", organizationId: "org", email: "a@example.invalid", role: "Guest", invitedBy: "user", status: "pending", token: "t", createdAt: 0, expiresAt: 0, lastSentAt: Date.now() - 9 * 60_000 }],
    });
    await expect(invoke(invitationMutations.resend, ctx, { invitationId: "invite" })).rejects.toThrow("last 10 minutes");
    vi.setSystemTime(new Date("2026-11-17T12:01:30Z"));
    await expect(invoke(invitationMutations.resend, ctx, { invitationId: "invite" })).resolves.toMatchObject({ token: "t" });
  });

  it("caps invitations a church can send in a day", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-17T12:00:00Z") });
    const { ctx } = fixture({ invitations: [] });
    for (let i = 0; i < 25; i += 1) {
      await invoke(invitationMutations.create, ctx, { email: `person${i}@example.invalid`, role: "Guest" });
    }
    await expect(invoke(invitationMutations.create, ctx, { email: "one-more@example.invalid", role: "Guest" }))
      .rejects.toThrow("25 invitations today");
    vi.setSystemTime(new Date("2026-11-18T08:00:00Z"));
    await expect(invoke(invitationMutations.create, ctx, { email: "one-more@example.invalid", role: "Guest" })).resolves.toBeTruthy();
  });

  const verified = { subject: "clerk-new", email: "new@example.invalid", emailVerified: true };
  it.each([
    ["a link", "Claim your refund at www.example.com", "Jo"],
    ["markup", "<a href=x>Church</a>", "Jo"],
    ["an email address", "St Mary's", "jo@example.com"],
    ["an overlong name", "x".repeat(101), "Jo"],
    ["a blank name", "St Mary's", "   "],
  ])("rejects church or person names containing %s", async (_label, name, userName) => {
    const { ctx, records } = fixture({ users: [], organizations: [] }, verified);
    await expect(invoke(organizationMutations.create, withScheduler(ctx), { name, userName })).rejects.toThrow(/name/i);
    expect(records.organizations).toEqual([]);
  });

  it("accepts ordinary church and person names", async () => {
    const { ctx, records } = fixture({ users: [], organizations: [] }, verified);
    await invoke(organizationMutations.create, withScheduler(ctx), { name: "  St Mary & St John's (Leeds) – Parish  ", userName: "Anne-Marie O’Neil" });
    expect(records.organizations[0].name).toBe("St Mary & St John's (Leeds) – Parish");
    expect(records.users[0].name).toBe("Anne-Marie O’Neil");
  });

  it("validates renamed churches and people, but saves other settings for an older name", async () => {
    const { ctx, records } = fixture({ organizations: [{ _id: "org", accessMode: "legacy", name: "Old.Name" }] });
    records.users[0].name = "Recorder";
    await expect(invoke(organizationMutations.update, ctx, { name: "Visit evil.example" })).rejects.toThrow("Church name");
    await expect(invoke(updateProfile, ctx, { name: "See http://x" })).rejects.toThrow("Name");
    await invoke(organizationMutations.update, ctx, { name: "Old.Name", charityNumber: "123" });
    expect(records.organizations[0]).toMatchObject({ name: "Old.Name", charityNumber: "123" });
  });
});

// ---------------------------------------------------------------- A7
describe("A7: donor merge deletes donors, so it is Admin only", () => {
  it.each<UserRole>(["Finance Team", "Pastorate", "Guest"])("rejects %s without touching donors", async (role) => {
    const { ctx, db } = withRole(role, {
      donors: [{ _id: "keep", organizationId: "org", name: "Alex" }, { _id: "dupe", organizationId: "org", name: "Alex" }],
    });
    await expect(invoke(merge, ctx, { primaryDonorId: "keep", duplicateDonorIds: ["dupe"] })).rejects.toThrow("donors.delete");
    expect(db.delete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- A8
describe("A8: finance-only details stay with finance roles", () => {
  const connection: Row = {
    _id: "bank", organizationId: "org", provider: "yapily", providerInstitutionId: "inst", institutionName: "Test Bank",
    institutionCountry: "GB", status: "error", errorMessage: "Consent revoked", lastSyncAt: 5, createdAt: 0, updatedAt: 0,
    accounts: [{ accountId: "acc", name: "Main account", mask: "1234", type: "current", currency: "GBP", fundId: "fund" }],
  };

  it.each(ROLES)("returns bank details only with bank.manage, and sync freshness to everyone (%s)", async (role) => {
    const { ctx } = withRole(role, { bankConnections: [connection], plaidItems: [] });
    const list = await invoke(bankQueries.list, ctx, {}) as Row[];
    const mapped = await invoke(bankQueries.getActiveWithMappedAccounts, ctx, {}) as Row[];
    const attention = await invoke(bankQueries.getItemsNeedingAttention, ctx, {}) as Row[];
    await expect(invoke(bankQueries.syncStatus, ctx, {})).resolves.toEqual([{ lastSyncAt: 5, needsAttention: true }]);
    if (can(role, "bank.manage")) {
      expect(list[0]).toMatchObject({ institutionName: "Test Bank" });
      expect(attention).toHaveLength(1);
      await expect(invoke(plaidQueries.listItems, ctx, {})).resolves.toEqual([]);
    } else {
      expect([list, mapped, attention]).toEqual([[], [], []]);
      await expect(invoke(bankQueries.getAttempt, ctx, { state: "s" })).rejects.toThrow("bank.manage");
      await expect(invoke(plaidQueries.listItems, ctx, {})).rejects.toThrow("bank.manage");
      await expect(invoke(plaidQueries.getItemsNeedingAttention, ctx, {})).rejects.toThrow("bank.manage");
    }
  });

  it.each(ROLES)("keeps cash collection notes with cashCollections.read (%s)", async (role) => {
    const { ctx } = withRole(role, {
      cashCollections: [{ _id: "c1", organizationId: "org", weekEndingDate: "2026-11-15", notes: "Counted by Alex and Sam", status: "submitted" }],
    });
    const [collection] = await invoke(cashQueries.list, ctx, {}) as Row[];
    expect(collection._id).toBe("c1");
    expect(collection.notes).toBe(can(role, "cashCollections.read") ? "Counted by Alex and Sam" : undefined);
  });

  it.each(ROLES)("shows Stripe ids and the creator's Clerk id only with billing.manage (%s)", async (role) => {
    const { ctx } = withRole(role, {
      organizations: [{ _id: "org", accessMode: "legacy", name: "Church", stripeCustomerId: "cus_1", createdBy: "clerk-creator" }],
      subscriptions: [{ _id: "sub", organizationId: "org", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", stripePriceId: "price_1", plan: "starter", status: "active" }],
    });
    const organization = await invoke(organizationQueries.current, ctx, {}) as Row;
    const subscription = await invoke(subscriptionQueries.current, ctx, {}) as Row;
    expect(organization.name).toBe("Church");
    expect(subscription).toMatchObject({ plan: "starter", status: "active" });
    const text = JSON.stringify([organization, subscription]);
    if (can(role, "billing.manage")) expect(text).toContain("cus_1");
    else expect(text).not.toMatch(/cus_1|sub_1|price_1|clerk-creator/);
  });
});

// ---------------------------------------------------------------- export
describe("data export for a locked-out church", () => {
  const blocked = { _id: "org", name: "Church", accessMode: "demo", demoSeedStatus: "pending", createdBy: "clerk-user" };
  const page = { table: "organizations", paginationOpts: { numItems: 10, cursor: null } };

  it("stays available to the Admin while app access is blocked", async () => {
    const { ctx } = withRole("Admin", { organizations: [blocked] });
    await expect(invoke(cashQueries.list, ctx, {})).rejects.toThrow("Access required");
    const result = await invoke(organizationQueries.exportDataPage, ctx, page) as { page: Row[] };
    expect(result.page[0]).toMatchObject({ name: "Church" });
  });

  it.each<UserRole>(["Finance Team", "Pastorate", "Guest"])("stays Admin only (%s)", async (role) => {
    const { ctx } = withRole(role, { organizations: [blocked] });
    await expect(invoke(organizationQueries.exportDataPage, ctx, page)).rejects.toThrow("organization.export");
  });
});

// ---------------------------------------------------------------- A9
describe("A9: indexing after erasure", () => {
  const entry = {
    transactionId: "tx", searchText: "TITHE A SMITH",
    metadata: { category: "Tithes", fundId: "fund", type: "Income", donorName: "Alex Smith", amount: 10 },
  };
  const actionCtx = (organization: Row | null) =>
    // The budget charge passes, so these cases test the per-entry erasure check.
    ({ runQuery: vi.fn(async () => organization), runAction: vi.fn(), runMutation: vi.fn(async () => ({ status: "charged" })) }) as unknown as ActionCtx;
  const runAction = (fn: unknown, ctx: ActionCtx, args: Record<string, unknown>) =>
    (fn as { _handler: (ctx: ActionCtx, args: unknown) => Promise<unknown> })._handler(ctx, args);

  it("does not recreate search entries for an erased church", async () => {
    const add = vi.spyOn(transactionRAG, "add").mockResolvedValue({} as never);
    await runAction(batchIndexTransactions, actionCtx(null), { organizationId: "org", transactions: [entry] });
    await runAction(indexTransaction, actionCtx(null), { organizationId: "org", ...entry });
    expect(add).not.toHaveBeenCalled();
    await runAction(batchIndexTransactions, actionCtx({ _id: "org" }), { organizationId: "org", transactions: [entry] });
    expect(add).toHaveBeenCalledTimes(1);
  });

  it("does not recreate categorisation memory for an erased church", async () => {
    const { ctx, records } = fixture({ organizations: [], transactionCategorizationMemory: [] });
    await invoke(upsertAccepted, ctx, {
      organizationId: "org", signature: "tithe a smith", descriptionExample: "TITHE A SMITH",
      transactionType: "Income", category: "Tithes", fundId: "fund", donorName: "Alex Smith",
    });
    expect(records.transactionCategorizationMemory).toEqual([]);
  });

  it("clears the search namespace again once the organization is gone", async () => {
    vi.spyOn(transactionRAG, "getNamespace").mockResolvedValue({ namespaceId: "ns" } as never);
    const runActionMock = vi.fn();
    const ctx = {
      auth: { getUserIdentity: async () => ({ subject: "clerk-user" }) },
      runQuery: vi.fn(async (reference: Parameters<typeof getFunctionName>[0]) =>
        getFunctionName(reference) === "queries/users:current"
          ? { _id: "user", organizationId: "org", role: "Admin" }
          : { organization: { name: "Church" }, bankConnections: [], plaidItems: [] }),
      runMutation: vi.fn(async (reference: Parameters<typeof getFunctionName>[0]) =>
        getFunctionName(reference).endsWith("finalizeDeletion") ? { deleted: true } : { deleted: 0 }),
      runAction: runActionMock,
    } as unknown as ActionCtx;
    await runAction(deleteOrganization, ctx, { confirmation: "Church" });
    expect(runActionMock).toHaveBeenCalledTimes(2);
    const finalize = (ctx.runMutation as ReturnType<typeof vi.fn>).mock.invocationCallOrder.at(-1)!;
    expect(runActionMock.mock.invocationCallOrder[1]).toBeGreaterThan(finalize);
  });
});

describe("Import indexing spends the AI budget", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-11-17T12:00:05Z") });
  });
  const untilTomorrow = Date.parse("2026-11-18T00:00:00Z") - Date.parse("2026-11-17T12:00:05Z");
  const entries = (count: number) => Array.from({ length: count }, (_, i) => ({
    transactionId: `tx-${i}`, searchText: `TITHE ${i}`,
    metadata: { category: "Tithes", fundId: "fund", type: "Income", amount: 10 },
  }));
  // Runs the indexer with its budget mutation against an in-memory database.
  const indexer = (aiRateLimits: Row[] = []) => {
    const db = fixture({ aiRateLimits, aiDailyUsage: [] });
    const runAfter = vi.fn(async () => "job");
    const ctx = {
      runQuery: vi.fn(async () => ({ _id: "org" })),
      runMutation: vi.fn(async (reference: Parameters<typeof getFunctionName>[0], args: Record<string, unknown>) => {
        expect(getFunctionName(reference)).toBe("mutations/aiRateLimit:consumeBackgroundUnits");
        return invoke(consumeBackgroundUnits, db.ctx, args);
      }),
      scheduler: { runAfter },
    } as unknown as ActionCtx;
    const add = vi.spyOn(transactionRAG, "add").mockResolvedValue({} as never);
    return { ctx, add, runAfter, records: db.records };
  };
  const runAction = (fn: unknown, ctx: ActionCtx, args: Record<string, unknown>) =>
    (fn as { _handler: (ctx: ActionCtx, args: unknown) => Promise<unknown> })._handler(ctx, args);
  const churchDay = (records: Record<string, Row[]>) => records.aiRateLimits.find((r) => !r.userId)?.dayUnits;

  it("charges each indexed entry against the church's and the deployment's day", async () => {
    const { ctx, add, runAfter, records } = indexer();
    await runAction(batchIndexTransactions, ctx, { organizationId: "org", transactions: entries(3) });
    expect(add).toHaveBeenCalledTimes(3);
    expect(churchDay(records)).toBe(3);
    expect(records.aiDailyUsage[0].units).toBe(3);
    expect(runAfter).not.toHaveBeenCalled();
  });

  it("keeps the entries a spent budget refuses and retries them tomorrow, without failing any", async () => {
    // The church has 25 units left today: the first 20-entry chunk fits, the rest waits.
    const { ctx, add, runAfter, records } = indexer([
      { _id: "window", organizationId: "org", windowStart: 0, requestCount: 0, day: "2026-11-17", dayUnits: 9_975, updatedAt: 0 },
    ]);
    const result = await runAction(batchIndexTransactions, ctx, { organizationId: "org", transactions: entries(50) });
    expect(add).toHaveBeenCalledTimes(20);
    expect(churchDay(records)).toBe(9_995);
    expect(result).toMatchObject({ total: 50, successful: 20, failed: 0, deferred: 30 });
    expect(runAfter).toHaveBeenCalledTimes(1);
    const [delay, reference, args] = runAfter.mock.calls[0] as unknown as [number, Parameters<typeof getFunctionName>[0], { transactions: Array<{ transactionId: string }> }];
    expect(delay).toBe(untilTomorrow);
    expect(getFunctionName(reference)).toBe("intelligence/ragIndexer:batchIndexTransactions");
    expect(args.transactions.map((t) => t.transactionId)).toEqual(entries(50).slice(20).map((t) => t.transactionId));
  });

  it("defers a category correction's re-index the same way", async () => {
    const { ctx, add, runAfter } = indexer([
      { _id: "window", organizationId: "org", windowStart: 0, requestCount: 0, day: "2026-11-17", dayUnits: 10_000, updatedAt: 0 },
    ]);
    const args = { organizationId: "org", transactionId: "tx", newSearchText: "TITHE", metadata: { category: "Tithes", fundId: "fund", type: "Income" } };
    await expect(runAction(updateInIndex, ctx, args)).resolves.toMatchObject({ success: false, deferred: true });
    expect(add).not.toHaveBeenCalled();
    expect(runAfter).toHaveBeenCalledWith(untilTomorrow, expect.anything(), args);
  });
});
