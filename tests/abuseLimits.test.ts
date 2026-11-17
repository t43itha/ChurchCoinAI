// Behaviour checks for the cross-review of the access and abuse hardening:
// per-person limits that survive erasing a church, a deployment-wide
// invitation cap, the search-index erasure race, and Smart Link's bounded,
// paged matching.
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionCtx, MutationCtx } from "../convex/_generated/server";
import { fixture, invoke, type Row } from "./helpers/convexFixture";
import { ORGANIZATION_DATA_TABLES } from "../lib/organizationData";
import * as invitationMutations from "../convex/mutations/invitations";
import * as invitationActions from "../convex/actions/invitations";
import * as organizationMutations from "../convex/mutations/organizations";
import * as organizationQueries from "../convex/queries/organizations";
import * as pledgeMutations from "../convex/mutations/pledges";
import * as donorMutations from "../convex/mutations/donors";
import * as pledgeQueries from "../convex/queries/pledges";
import * as userQueries from "../convex/queries/users";
import * as aiRateLimit from "../convex/mutations/aiRateLimit";
import * as maintenance from "../convex/mutations/scheduledMaintenance";
import * as ai from "../convex/actions/ai";
import { batchIndexTransactions, indexTransaction } from "../convex/intelligence/ragIndexer";
import { deleteOrganization } from "../convex/actions/organizations";
import { transactionRAG } from "../convex/lib/ragInstance";

const generateContent = vi.hoisted(() => vi.fn(async (_request: { contents: string }) => ({ text: "[]" })));
vi.mock("@google/genai", async (importOriginal) => ({
  ...await importOriginal<typeof import("@google/genai")>(),
  GoogleGenAI: class { models = { generateContent }; },
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  generateContent.mockClear();
});

type Handler = (ctx: unknown, args: unknown) => Promise<unknown>;
const handlerOf = (fn: unknown) => (fn as { _handler: Handler })._handler;

// An action context whose runQuery / runMutation reach the real handlers over
// one in-memory database, so an action and the functions it calls share state.
function actionContext(db: MutationCtx, extra: Record<string, unknown> = {}) {
  const modules: Record<string, Record<string, unknown>> = {
    "queries/users": userQueries,
    "queries/organizations": organizationQueries,
    "queries/pledges": pledgeQueries,
    "mutations/organizations": organizationMutations,
    "mutations/invitations": invitationMutations,
    "mutations/aiRateLimit": aiRateLimit,
  };
  const route = async (reference: Parameters<typeof getFunctionName>[0], args?: unknown) => {
    const [path, name] = getFunctionName(reference).split(":");
    const fn = modules[path]?.[name];
    if (!fn) throw new Error(`Unrouted function ${path}:${name}`);
    return handlerOf(fn)(db, args ?? {});
  };
  return {
    auth: db.auth,
    runQuery: vi.fn(route),
    runMutation: vi.fn(route),
    runAction: vi.fn(),
    scheduler: { runAfter: vi.fn() },
    ...extra,
  } as unknown as ActionCtx;
}

const withScheduler = (ctx: MutationCtx) => {
  (ctx.scheduler as unknown as Record<string, unknown>).runAt = vi.fn();
  return ctx;
};
const verified = { subject: "clerk-user", email: "pat@example.invalid", emailVerified: true, name: "Pat Jones" };
const createChurch = (ctx: MutationCtx) =>
  invoke(organizationMutations.create, withScheduler(ctx), { name: "St Mary's", userName: "Pat Jones" });
const invite = (ctx: MutationCtx, email: string) => invoke(invitationMutations.create, ctx, { email, role: "Guest" });
// What erasing a church removes: every organization-scoped table.
const eraseChurch = (records: Record<string, Row[]>) => {
  for (const table of ORGANIZATION_DATA_TABLES) records[table] = [];
};

// ---------------------------------------------------------------- R73-1
describe("limits follow the person, not the church", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-11-17T09:00:00Z") });
  });

  it("does not give a person a fresh invitation allowance after erasing and recreating their church", async () => {
    const { ctx, records } = fixture({ users: [], organizations: [], invitations: [] }, verified);
    await createChurch(ctx);
    for (let i = 0; i < 25; i += 1) await invite(ctx, `person${i}@example.invalid`);
    await expect(invite(ctx, "one-more@example.invalid")).rejects.toThrow(/invitations today/);

    eraseChurch(records);
    await createChurch(ctx);
    await expect(invite(ctx, "stranger@example.invalid")).rejects.toThrow("You have sent 25 invitations today");
    expect(records.invitations).toEqual([]);

    vi.setSystemTime(new Date("2026-11-18T00:00:05Z"));
    await expect(invite(ctx, "stranger@example.invalid")).resolves.toBeTruthy();
  });

  it("lets a person create two churches a day, so a real church can start over once", async () => {
    const { ctx, records } = fixture({ users: [], organizations: [] }, verified);
    await createChurch(ctx);
    eraseChurch(records);
    await createChurch(ctx);
    eraseChurch(records);
    await expect(createChurch(ctx)).rejects.toThrow("You have created 2 churches today");
    expect(records.organizations).toEqual([]);

    vi.setSystemTime(new Date("2026-11-18T00:00:05Z"));
    await expect(createChurch(ctx)).resolves.toBeTruthy();
  });

  it("does not refill a person's daily AI allowance when they recreate their church", async () => {
    const { ctx, records } = fixture({ aiRateLimits: [], aiDailyUsage: [], organizations: [{ _id: "org" }, { _id: "org-2" }] });
    const charge = (organizationId: string, principal: string, units: number) =>
      invoke(aiRateLimit.checkAndConsume, ctx, { organizationId, userId: `${principal}-user`, principal, units });
    // A full day of use: 20 minutes of 500 units is 10,000 units.
    for (let minute = 0; minute < 20; minute += 1) {
      vi.setSystemTime(new Date(Date.UTC(2026, 10, 17, 9, minute, 5)));
      await charge("org", "clerk-user", 500);
    }
    records.aiRateLimits = [];
    vi.setSystemTime(new Date("2026-11-17T10:00:05Z"));
    await expect(charge("org-2", "clerk-user", 20)).rejects.toThrow("You have reached your AI usage limit for today");
    await expect(charge("org-2", "clerk-other", 20)).resolves.toBeTruthy();

    vi.setSystemTime(new Date("2026-11-18T00:00:05Z"));
    await expect(charge("org-2", "clerk-user", 20)).resolves.toBeTruthy();
  });

  it("caps invitation emails across every church in the deployment", async () => {
    vi.stubEnv("INVITE_EMAILS_DAILY", "3");
    const { ctx, records } = fixture({
      users: [
        { _id: "user", clerkId: "clerk-user", organizationId: "org", role: "Admin", name: "Pat" },
        { _id: "user-2", clerkId: "clerk-2", organizationId: "org-2", role: "Admin", name: "Sam" },
      ],
      organizations: [{ _id: "org", accessMode: "legacy", name: "A" }, { _id: "org-2", accessMode: "legacy", name: "B" }],
      invitations: [],
    });
    const other = { ...ctx, auth: { getUserIdentity: async () => ({ subject: "clerk-2" }) } } as unknown as MutationCtx;
    await invite(ctx, "a@example.invalid");
    await invite(ctx, "b@example.invalid");
    await invite(other, "c@example.invalid");
    await expect(invite(other, "d@example.invalid")).rejects.toThrow("Invitation emails are paused for today");
    expect(records.invitations).toHaveLength(3);
  });

  it("keeps the person counters out of erasure and the church's export, and purges them once their day is over", async () => {
    expect(ORGANIZATION_DATA_TABLES).not.toContain("usageCounters");
    const { ctx, records } = fixture({
      usageCounters: [
        { _id: "old", scope: "person:clerk-user", day: "2026-11-15", invitationEmails: 3, updatedAt: 0 },
        { _id: "yesterday", scope: "person:clerk-user", day: "2026-11-16", invitationEmails: 3, updatedAt: 0 },
        { _id: "today", scope: "deployment", day: "2026-11-17", invitationEmails: 9, updatedAt: 0 },
      ],
    });
    await invoke(maintenance.purgeUsageCounters, ctx, {});
    expect(records.usageCounters.map((row) => row._id)).toEqual(["today"]);
  });
});

// ---------------------------------------------------------------- R73-5
describe("invitation resends reserve the email before sending it", () => {
  const pending = (extra: Record<string, unknown> = {}): Row => ({
    _id: "invite", organizationId: "org", email: "a@example.invalid", role: "Guest", invitedBy: "user",
    status: "pending", token: "t", createdAt: 0, expiresAt: 0, ...extra,
  });
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-11-17T12:00:00Z") });
  });

  it("refuses a second resend within ten minutes, saying when the next one is allowed", async () => {
    const { ctx } = fixture({ invitations: [pending()] });
    await invoke(invitationMutations.resend, ctx, { invitationId: "invite" });
    vi.setSystemTime(new Date("2026-11-17T12:01:00Z"));
    await expect(invoke(invitationMutations.resend, ctx, { invitationId: "invite" })).rejects.toThrow("You can resend it in 9 minutes");
    vi.setSystemTime(new Date("2026-11-17T12:10:00Z"));
    await expect(invoke(invitationMutations.resend, ctx, { invitationId: "invite" })).resolves.toMatchObject({ token: "t" });
  });

  it("counts a new invitation's email as a send, so it cannot be resent straight away", async () => {
    const { ctx } = fixture({ invitations: [] });
    const created = await invite(ctx, "new@example.invalid") as { invitationId: string };
    await expect(invoke(invitationMutations.resend, ctx, { invitationId: created.invitationId })).rejects.toThrow("last 10 minutes");
  });

  it("keeps the reservation when delivery fails, so retrying cannot get round the cooldown", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM_EMAIL", "ChurchCoin <hello@example.invalid>");
    const fetch = vi.fn(async () => { throw new Error("network down"); });
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { ctx: db, records } = fixture({ invitations: [pending()] });
    records.users[0].name = "Pat";
    records.organizations[0].name = "St Mary's";
    const ctx = actionContext(db);
    await expect(handlerOf(invitationActions.resend)(ctx, { invitationId: "invite" })).resolves.toMatchObject({ emailSent: false });
    await expect(handlerOf(invitationActions.resend)(ctx, { invitationId: "invite" })).rejects.toThrow("last 10 minutes");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------- R73-2
describe("search indexing after erasure", () => {
  const entry = {
    transactionId: "tx", searchText: "TITHE A SMITH",
    metadata: { category: "Tithes", fundId: "fund", type: "Income", donorName: "Alex Smith", amount: 10 },
  };
  // An in-memory search index: namespace name -> entry keys.
  const fakeIndex = () => {
    const namespaces = new Map<string, Set<string>>();
    vi.spyOn(transactionRAG, "getNamespace").mockImplementation(async (_ctx, { namespace }) =>
      (namespaces.has(namespace) ? { namespaceId: namespace } : null) as never);
    const runAction = vi.fn(async (_reference: unknown, args: { namespaceId: string }) => {
      namespaces.delete(args.namespaceId);
    });
    const write = (namespace: string, key: string) => {
      if (!namespaces.has(namespace)) namespaces.set(namespace, new Set());
      namespaces.get(namespace)!.add(key);
    };
    return { namespaces, runAction, write };
  };

  it("leaves nothing behind when erasure finishes while an indexer's add is in flight", async () => {
    const { ctx: db, records } = fixture({ aiRateLimits: [], aiDailyUsage: [] });
    records.organizations[0].name = "Church";
    const index = fakeIndex();
    const ctx = actionContext(db, { runAction: index.runAction });
    let erasure: Promise<unknown> | undefined;
    vi.spyOn(transactionRAG, "add").mockImplementation(async (_ctx, args) => {
      // The indexer has already seen the church. Erasure runs to the end,
      // final clear included, before this write lands.
      erasure ??= handlerOf(deleteOrganization)(ctx, { confirmation: "Church" });
      await erasure;
      const { namespace, key } = args as { namespace: string; key: string };
      index.write(namespace, key);
      return { entryId: "entry" } as never;
    });

    await handlerOf(batchIndexTransactions)(ctx, { organizationId: "org", transactions: [entry] });

    await expect(erasure).resolves.toMatchObject({ success: true });
    expect(records.organizations).toEqual([]);
    expect([...index.namespaces.keys()]).toEqual([]);
  });

  it("records an erasure marker that holds only the church id and a time, and outlives the church", async () => {
    const { ctx: db, records } = fixture({ aiRateLimits: [], aiDailyUsage: [] });
    records.organizations[0].name = "Church";
    const ctx = actionContext(db, { runAction: fakeIndex().runAction });
    await handlerOf(deleteOrganization)(ctx, { confirmation: "Church" });
    expect(records.organizations).toEqual([]);
    expect(records.erasedOrganizations).toHaveLength(1);
    expect(Object.keys(records.erasedOrganizations[0]).sort()).toEqual(["_id", "erasedAt", "organizationId"]);
    expect(records.erasedOrganizations[0].organizationId).toBe("org");
  });

  it("adds nothing once erasure has started, while the church row still exists", async () => {
    const { ctx: db } = fixture({ aiRateLimits: [], aiDailyUsage: [], erasedOrganizations: [{ _id: "mark", organizationId: "org", erasedAt: 1 }] });
    const ctx = actionContext(db, { runAction: fakeIndex().runAction });
    const add = vi.spyOn(transactionRAG, "add").mockResolvedValue({} as never);
    await handlerOf(batchIndexTransactions)(ctx, { organizationId: "org", transactions: [entry] });
    await handlerOf(indexTransaction)(ctx, { organizationId: "org", ...entry });
    expect(add).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- R73-3 + R73-4
const pledge = (id: string, extra: Record<string, unknown> = {}): Row => ({
  _id: id, organizationId: "org", donorName: "Grace Okafor", amount: 50, fundId: "fund",
  frequency: "Monthly", startDate: "2026-01-01", status: "Active", createdAt: 0, ...extra,
});
const income = (id: string, date: string, extra: Record<string, unknown> = {}): Row => ({
  _id: id, organizationId: "org", fundId: "fund", type: "Income", amount: 50, date,
  description: `SO ${id}`, category: "Donations", isReconciled: false, ...extra,
});
const smartLink = (ctx: ActionCtx, args: Record<string, unknown> = {}) =>
  handlerOf(ai.reconcilePledges)(ctx, args) as Promise<{
    matches: Array<{ transactionId: string; pledgeId: string; donorName?: string; reason: string }>;
    remaining: number;
    nextCursor?: { date: string; transactionId: string } | null;
  }>;
const prompts = () => generateContent.mock.calls.map(([request]) => request.contents);
const chargedUnits = (ctx: ActionCtx) =>
  (ctx.runMutation as ReturnType<typeof vi.fn>).mock.calls
    .filter(([reference]) => getFunctionName(reference as never) === "mutations/aiRateLimit:checkAndConsume")
    .map(([, args]) => (args as { units: number }).units);

describe("pledge text is checked where it is written", () => {
  const fields = { amount: 50, fundId: "fund", frequency: "Monthly", startDate: "2026-01-01" };

  it.each([
    ["an overlong name", "x".repeat(121)],
    ["a blank name", "   "],
    ["a control character", "Grace\u0000Okafor"],
  ])("rejects a donor name with %s in create, update and import", async (_label, donorName) => {
    const { ctx, records } = fixture({ pledges: [pledge("p1")] });
    await expect(invoke(pledgeMutations.create, ctx, { ...fields, donorName })).rejects.toThrow("Donor name");
    await expect(invoke(pledgeMutations.update, ctx, { pledgeId: "p1", donorName })).rejects.toThrow("Donor name");
    await expect(invoke(pledgeMutations.bulkCreate, ctx, { pledges: [{ ...fields, donorName }] })).rejects.toThrow("Donor name");
    expect(records.pledges).toEqual([pledge("p1")]);
  });

  it("applies the rule to a donor rename, which is copied onto the donor's pledges", async () => {
    const { ctx, records } = fixture({
      donors: [{ _id: "d1", organizationId: "org", name: "Grace Okafor" }],
      pledges: [pledge("p1", { donorId: "d1" })],
    });
    await expect(invoke(donorMutations.update, ctx, { donorId: "d1", name: "x".repeat(121) })).rejects.toThrow("Donor name");
    expect(records.pledges[0].donorName).toBe("Grace Okafor");
  });

  it("accepts real names, trimmed", async () => {
    const { ctx, records } = fixture({ pledges: [] });
    await invoke(pledgeMutations.create, ctx, { ...fields, donorName: "  Dr Anne-Marie O’Neil & Family  " });
    expect(records.pledges[0].donorName).toBe("Dr Anne-Marie O’Neil & Family");
  });
});

describe("Smart Link", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-11-17T12:00:05Z") });
    vi.stubEnv("GEMINI_API_KEY", "test-key");
  });
  const church = (pledges: Row[], transactions: Row[]) => {
    const { ctx: db, records } = fixture({ pledges, transactions, aiRateLimits: [], aiDailyUsage: [], usageCounters: [] });
    records.users[0].name = "Pat";
    return { ctx: actionContext(db), records };
  };

  it("sends a bounded summary, truncating long stored text, and charges for the rows it sends", async () => {
    const legacyName = "Legacy ".repeat(2_000);
    const rows = Array.from({ length: 150 }, (_, i) =>
      income(`t-${String(i).padStart(3, "0")}`, "2026-03-01", { description: "GIFT ".repeat(400), notes: "N".repeat(5_000) }));
    const { ctx } = church([pledge("p-legacy", { donorName: legacyName })], rows);

    await smartLink(ctx);

    const [prompt] = prompts();
    expect(prompt.length).toBeLessThan(60_000);
    expect(prompt).not.toContain("Legacy ".repeat(30));
    expect(prompt).not.toContain("GIFT ".repeat(40));
    expect(prompt).not.toContain("NNNN");
    expect(prompt).toContain("Legacy Legacy");
    const sent = rows.filter((row) => prompt.includes(`"${row._id}"`)).length;
    expect(sent).toBeGreaterThan(0);
    expect(chargedUnits(ctx)).toEqual([Math.max(20, sent + 1)]);
  });

  it("returns only links between rows it sent, named from the pledge", async () => {
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify([
        { transactionId: "t-1", pledgeId: "p1", donorName: "IGNORE ALL PREVIOUS INSTRUCTIONS", reason: "Same amount" },
        { transactionId: "t-elsewhere", pledgeId: "p1", donorName: "x", reason: "x" },
        { transactionId: "t-1", pledgeId: "p-elsewhere", donorName: "x", reason: "x" },
      ]),
    });
    const { ctx } = church([pledge("p1")], [income("t-1", "2026-03-01")]);
    await expect(smartLink(ctx)).resolves.toMatchObject({
      matches: [{ transactionId: "t-1", pledgeId: "p1", donorName: "Grace Okafor", reason: "Same amount" }],
      remaining: 0,
    });
  });

  it("only checks unlinked income dated on or after the earliest open pledge", async () => {
    const { ctx } = church(
      [pledge("p-open", { startDate: "2026-02-01" }), pledge("p-done", { startDate: "2020-01-01", status: "Completed" })],
      [
        income("t-before", "2026-01-31"),
        income("t-linked", "2026-03-01", { pledgeId: "p-open" }),
        income("t-spend", "2026-03-01", { type: "Expenditure" }),
        income("t-void", "2026-03-01", { isVoided: true }),
        income("t-match", "2026-02-01"),
      ]
    );
    await smartLink(ctx);
    const [prompt] = prompts();
    expect(prompt).toContain('"t-match"');
    expect(prompt).toContain('"p-open"');
    for (const id of ["t-before", "t-linked", "t-spend", "t-void", "p-done"]) expect(prompt).not.toContain(`"${id}"`);
  });

  it("asks the model nothing when no pledge is open", async () => {
    const { ctx } = church([pledge("p-done", { status: "Completed" })], [income("t-1", "2026-03-01")]);
    await expect(smartLink(ctx)).resolves.toMatchObject({ matches: [], remaining: 0 });
    expect(generateContent).not.toHaveBeenCalled();
    expect(chargedUnits(ctx)).toEqual([]);
  });

  it("pages through every candidate with a continuation, so the oldest gift is examined too", async () => {
    const rows = Array.from({ length: 700 }, (_, i) =>
      income(`t-${String(i).padStart(3, "0")}`, `2025-${String(1 + Math.floor(i / 60)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`));
    const { ctx } = church([pledge("p1", { startDate: "2025-01-01" })], rows);

    const pages = [await smartLink(ctx)];
    while (pages.at(-1)!.remaining > 0) {
      expect(pages.length).toBeLessThan(20);
      vi.advanceTimersByTime(61_000);
      pages.push(await smartLink(ctx, { after: pages.at(-1)!.nextCursor }));
    }

    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0].remaining).toBeGreaterThan(0);
    const examined = rows.filter((row) => prompts().some((prompt) => prompt.includes(`"${row._id}"`)));
    expect(examined).toHaveLength(700);
  });
});
