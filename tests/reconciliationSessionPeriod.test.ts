import { describe, expect, it } from "vitest";
import * as reconciliationSessions from "../convex/mutations/reconciliationSessions";
import { fixture, invoke, row } from "./helpers/convexFixture";

const session = (overrides: Record<string, unknown> = {}) => ({
  _id: "session",
  organizationId: "org",
  fundId: "fund",
  status: "draft",
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
  statementOpeningBalance: 1000,
  statementClosingBalance: 1100,
  createdBy: "user",
  createdAt: 0,
  ...overrides,
});

// A ticked income line in the session. Its date decides which period rules it falls under.
const tickedIncome = (date: string, amount = 100) =>
  row("line", { reconciliationSessionId: "session", date, amount, type: "Income" });

describe("shortening the period of a reconciliation", () => {
  it("rejects a period end that is earlier than a ticked line and leaves the session alone", async () => {
    const { ctx, db, get } = fixture({
      reconciliationSessions: [session({ periodStart: "2026-08-01" })],
      transactions: [tickedIncome("2026-09-15")],
    });

    await expect(
      invoke(reconciliationSessions.updateBalances, ctx, { sessionId: "session", periodEnd: "2026-08-31" })
    ).rejects.toThrow("Untick the lines dated after 2026-08-31 before shortening the period.");

    expect(db.patch).not.toHaveBeenCalled();
    expect(get("session")?.periodEnd).toBe("2026-09-30");
  });

  it("rejects the shortened end even when the same call also moves the start", async () => {
    const { ctx, get } = fixture({
      reconciliationSessions: [session({ periodStart: "2026-08-01" })],
      transactions: [tickedIncome("2026-09-15")],
    });

    await expect(
      invoke(reconciliationSessions.updateBalances, ctx, {
        sessionId: "session",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
      })
    ).rejects.toThrow("Untick the lines dated after 2026-08-31");
    expect(get("session")?.periodEnd).toBe("2026-09-30");
  });

  it("allows a period end on the date of the latest ticked line", async () => {
    const { ctx, get } = fixture({
      reconciliationSessions: [session()],
      transactions: [tickedIncome("2026-09-15")],
    });

    await invoke(reconciliationSessions.updateBalances, ctx, { sessionId: "session", periodEnd: "2026-09-15" });

    expect(get("session")?.periodEnd).toBe("2026-09-15");
  });

  it("allows moving the period start later past a ticked line, since earlier lines are stragglers", async () => {
    const { ctx, get } = fixture({
      reconciliationSessions: [session({ periodStart: "2026-08-01" })],
      transactions: [tickedIncome("2026-08-20")],
    });

    await invoke(reconciliationSessions.updateBalances, ctx, { sessionId: "session", periodStart: "2026-09-01" });

    expect(get("session")?.periodStart).toBe("2026-09-01");
  });
});

describe("completing a reconciliation with lines outside its period", () => {
  it("rejects completion when a ticked line is dated after the period end, even if the balances agree", async () => {
    // 1000 + 100 cleared = 1100, so the difference is zero and only the date rule can stop it.
    const { ctx, get, db } = fixture({
      reconciliationSessions: [session({ periodStart: "2026-08-01", periodEnd: "2026-08-31" })],
      transactions: [tickedIncome("2026-09-15")],
    });

    await expect(invoke(reconciliationSessions.complete, ctx, { sessionId: "session" })).rejects.toThrow(
      "dated after the period end (2026-08-31)"
    );

    expect(get("session")?.status).toBe("draft");
    expect(get("line")?.isReconciled).toBe(false);
    expect(db.patch).not.toHaveBeenCalled();
  });

  it("still completes when a ticked line is dated before the period start", async () => {
    // A deposit from an earlier month that cleared on this statement is allowed.
    const { ctx, get } = fixture({
      reconciliationSessions: [session()],
      transactions: [tickedIncome("2026-08-20")],
    });

    await expect(invoke(reconciliationSessions.complete, ctx, { sessionId: "session" })).resolves.toEqual({
      clearedCount: 1,
    });

    expect(get("session")?.status).toBe("completed");
    expect(get("line")?.isReconciled).toBe(true);
  });

  it("completes when a ticked line is dated on the period end", async () => {
    const { ctx, get } = fixture({
      reconciliationSessions: [session()],
      transactions: [tickedIncome("2026-09-30")],
    });

    await expect(invoke(reconciliationSessions.complete, ctx, { sessionId: "session" })).resolves.toEqual({
      clearedCount: 1,
    });

    expect(get("session")?.status).toBe("completed");
  });
});
