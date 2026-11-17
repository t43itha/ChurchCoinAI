import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MutationCtx } from "../convex/_generated/server";
import { resolveOrganizationAccess } from "../convex/lib/access";
import { create, expireProductTrial, startTrialsAfterEarlyAccess } from "../convex/mutations/organizations";
import { PRODUCT_TRIAL_DURATION_MS } from "../lib/trial";
import { fixture, invoke, type Row } from "./helpers/convexFixture";

const NOW = Date.UTC(2026, 10, 17, 9);
const DAY = 86_400_000;

const church = (id: string, extra: Record<string, unknown> = {}): Row => ({
  _id: id,
  name: id,
  accessMode: "subscription",
  dataMode: "live",
  createdAt: NOW - 30 * DAY,
  createdBy: "someone",
  ...extra,
});

const userOf = (organizationId: string) => ({ _id: `user-${organizationId}`, organizationId, role: "Admin" }) as any;

const access = (ctx: MutationCtx, organizationId: string, at = NOW) =>
  resolveOrganizationAccess(ctx, userOf(organizationId), at, { billing: true, bankFeeds: false });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("signing up during early access", () => {
  it("creates a church with no trial clock and schedules no expiry", async () => {
    vi.stubEnv("BILLING_ENABLED", "");
    const { ctx, records } = fixture({ users: [], organizations: [] });
    (ctx as any).auth = { getUserIdentity: async () => ({ subject: "new-admin", email: "admin@example.invalid" }) };

    await invoke(create, ctx, { name: "St Anne's", userName: "Sam Admin" });

    const [organization] = records.organizations;
    expect(organization.accessMode).toBe("subscription");
    expect(organization.trialStatus).toBeUndefined();
    expect(organization.trialEndsAt).toBeUndefined();
    expect(ctx.scheduler.runAt).not.toHaveBeenCalled();
  });

  it("still starts a 14-day trial for a church that signs up once billing is on", async () => {
    vi.stubEnv("BILLING_ENABLED", "true");
    const { ctx, records } = fixture({ users: [], organizations: [] });
    (ctx as any).auth = { getUserIdentity: async () => ({ subject: "new-admin", email: "admin@example.invalid" }) };

    await invoke(create, ctx, { name: "St Anne's", userName: "Sam Admin" });

    const [organization] = records.organizations;
    expect(organization.trialStatus).toBe("active");
    expect(organization.trialEndsAt).toBe(NOW + PRODUCT_TRIAL_DURATION_MS);
    expect((await access(ctx, organization._id)).state).toBe("active_trial");
  });

  it("clears a trial that runs out during early access, so the church is not locked out at switch-on", async () => {
    vi.stubEnv("BILLING_ENABLED", "");
    const { ctx, get } = fixture({
      organizations: [church("old-trial", { trialStatus: "active", trialStartedAt: NOW - 15 * DAY, trialEndsAt: NOW - DAY })],
    });

    await invoke(expireProductTrial, ctx, { organizationId: "old-trial" });

    expect(get("old-trial")?.trialStatus).toBeUndefined();
    vi.stubEnv("BILLING_ENABLED", "true");
    await invoke(startTrialsAfterEarlyAccess, ctx, {});
    expect(get("old-trial")?.trialEndsAt).toBe(NOW + PRODUCT_TRIAL_DURATION_MS);
  });
});

describe("startTrialsAfterEarlyAccess", () => {
  const churches = () => [
    church("early-a"),
    church("early-b"),
    church("paying"),
    church("cancelled"),
    church("checkout-lapsed"),
    church("on-trial", { trialStatus: "active", trialStartedAt: NOW - DAY, trialEndsAt: NOW + 13 * DAY }),
    church("trial-over", { trialStatus: "expired", trialStartedAt: NOW - 20 * DAY, trialEndsAt: NOW - 6 * DAY }),
    church("legacy", { accessMode: "legacy" }),
    church("demo", { accessMode: "demo", dataMode: "synthetic" }),
  ];
  // "cancelled" mirrors the live church whose Stripe test subscription was cancelled before early access.
  const subscriptions = [
    { _id: "sub", organizationId: "paying", status: "active", plan: "growing" },
    { _id: "sub-cancelled", organizationId: "cancelled", status: "canceled", plan: "starter" },
    { _id: "sub-lapsed", organizationId: "checkout-lapsed", status: "incomplete_expired", plan: "starter" },
  ];

  it("refuses to run while billing is still off", async () => {
    vi.stubEnv("BILLING_ENABLED", "");
    const { ctx } = fixture({ organizations: churches(), subscriptions });

    await expect(invoke(startTrialsAfterEarlyAccess, ctx, {})).rejects.toThrow(/BILLING_ENABLED/);
  });

  it("gives every early-access church a full trial from when it runs, and touches no one else", async () => {
    vi.stubEnv("BILLING_ENABLED", "true");
    const { ctx, get } = fixture({ organizations: churches(), subscriptions });
    const before = Object.fromEntries(churches().map((row) => [row._id, { ...get(row._id) }]));

    // Before the run, early-access churches are still open rather than paywalled,
    // including one whose old subscription has ended.
    for (const id of ["early-a", "cancelled", "checkout-lapsed"]) {
      expect((await access(ctx, id)).canUseApp).toBe(true);
    }

    const result = await invoke(startTrialsAfterEarlyAccess, ctx, {});

    expect(result).toMatchObject({ started: 4, isDone: true });
    for (const id of ["early-a", "early-b", "cancelled", "checkout-lapsed"]) {
      expect(get(id)).toMatchObject({ trialStatus: "active", trialStartedAt: NOW, trialEndsAt: NOW + PRODUCT_TRIAL_DURATION_MS });
      const after = await access(ctx, id);
      expect(after.state).toBe("active_trial");
      expect(after.expiresAt).toBe(NOW + PRODUCT_TRIAL_DURATION_MS);
    }
    // A paying church keeps its subscription; only the hand-off is recorded.
    expect(get("paying")).toEqual({ ...before.paying, billingStartedAt: NOW });
    for (const id of ["on-trial", "trial-over", "legacy", "demo"]) {
      expect(get(id)).toEqual(before[id]);
    }
    expect(ctx.scheduler.runAt).toHaveBeenCalledTimes(4);
    expect(ctx.scheduler.runAt).toHaveBeenCalledWith(NOW + PRODUCT_TRIAL_DURATION_MS, expect.anything(), { organizationId: "early-a" });
  });

  it("paywalls a church that was paying at switch-on and cancels afterwards", async () => {
    vi.stubEnv("BILLING_ENABLED", "true");
    const lapsing = subscriptions.map((row) => ({ ...row }));
    const { ctx } = fixture({ organizations: churches(), subscriptions: lapsing });
    await invoke(startTrialsAfterEarlyAccess, ctx, {});

    lapsing[0].status = "canceled";
    const { ctx: later } = fixture({ organizations: churches().map((row) => (row._id === "paying" ? { ...row, billingStartedAt: NOW } : row)), subscriptions: lapsing });

    expect((await access(later, "paying")).state).toBe("payment_required");
  });

  it("is idempotent: a second run, even days later, starts nothing and moves no dates", async () => {
    vi.stubEnv("BILLING_ENABLED", "true");
    const { ctx, get } = fixture({ organizations: churches(), subscriptions });
    await invoke(startTrialsAfterEarlyAccess, ctx, {});

    vi.setSystemTime(NOW + 3 * DAY);
    const second = await invoke(startTrialsAfterEarlyAccess, ctx, {});

    expect(second).toMatchObject({ started: 0 });
    expect(get("early-a")?.trialEndsAt).toBe(NOW + PRODUCT_TRIAL_DURATION_MS);
    expect(ctx.scheduler.runAt).toHaveBeenCalledTimes(4);
  });

  it("works through every church a page at a time", async () => {
    vi.stubEnv("BILLING_ENABLED", "true");
    const many = Array.from({ length: 205 }, (_, index) => church(`early-${index}`));
    const { ctx, records } = fixture({ organizations: many });

    let cursor: string | null = null;
    let started = 0;
    let runs = 0;
    for (;;) {
      const page = (await invoke(startTrialsAfterEarlyAccess, ctx, { cursor })) as {
        started: number;
        isDone: boolean;
        continueCursor: string;
      };
      started += page.started;
      runs += 1;
      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    expect(runs).toBe(3);
    expect(started).toBe(205);
    expect(records.organizations.every((row) => row.trialStatus === "active")).toBe(true);
  });
});
