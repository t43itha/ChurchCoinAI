import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import Reconciliation from "../components/Reconciliation";
import ReconcileWizard, { type ReconcileWizardProps } from "../components/reconcile/ReconcileWizard";
import type { Fund } from "../types";

// Query results are chosen by which function reference the component asks for.
const fixtures = vi.hoisted(() => ({
  sessions: [] as unknown[],
  workspace: undefined as unknown,
  funds: [] as unknown[],
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  const { api } = await import("../convex/_generated/api");
  const nameOf = (ref: unknown) => getFunctionName(ref as Parameters<typeof getFunctionName>[0]);
  return {
    useQuery: (ref: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      const name = nameOf(ref);
      if (name === nameOf(api.queries.reconciliationSessions.list)) return fixtures.sessions;
      if (name === nameOf(api.queries.reconciliationSessions.workspace)) return fixtures.workspace;
      if (name === nameOf(api.queries.funds.list)) return fixtures.funds;
      throw new Error(`Unexpected query: ${name}`);
    },
    useMutation: () => () => Promise.resolve(undefined),
  };
});

const noop = () => {};

const funds: Fund[] = [
  { _id: "fund-general", name: "General Fund", type: "Unrestricted", balance: 0 },
  { _id: "fund-building", name: "Building Fund", type: "Unrestricted", balance: 0 },
];

const sessionId = (id: string) => id as Id<"reconciliationSessions">;

const session = (overrides: Record<string, unknown>) => ({
  _id: "rs-draft",
  organizationId: "org-1",
  fundId: "fund-general",
  periodStart: "2026-03-01",
  periodEnd: "2026-03-31",
  statementOpeningBalance: 1000,
  statementClosingBalance: 1300,
  status: "draft",
  createdBy: "user-1",
  createdAt: 0,
  ...overrides,
});

const line = (id: string, description: string, amount: number, type: "Income" | "Expenditure") => ({
  _id: id,
  date: "2026-03-05",
  description,
  amount,
  type,
  fundId: "fund-general",
});

const workspaceFor = (
  sessionOverrides: Record<string, unknown>,
  cleared: ReturnType<typeof line>[],
  candidates: ReturnType<typeof line>[] = []
) => ({ session: session(sessionOverrides), cleared, candidates });

const render = (props: Partial<ReconcileWizardProps> = {}) =>
  renderToStaticMarkup(createElement(ReconcileWizard, { funds, onClose: noop, ...props }));

describe("reconcile wizard", () => {
  it("opens a new reconciliation on the account step with the funds to pick from", () => {
    fixtures.sessions = [];
    fixtures.workspace = undefined;
    const markup = render();
    expect(markup).toContain("Which account and month?");
    expect(markup).toContain("General Fund");
    expect(markup).toContain("Building Fund");
    // No fund is picked yet, so the way forward is not offered.
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Next: statement balances/);
  });

  it("opens a draft on the tick step, listing the candidate lines and the gap in pounds", () => {
    // Opening 1000 + ticked 500 - statement closing 1300 leaves a £200.00 gap.
    fixtures.sessions = [session({})];
    fixtures.workspace = workspaceFor({}, [line("t1", "Grant", 500, "Income")], [
      line("t2", "Cheque 101", 200, "Expenditure"),
    ]);
    const markup = render({ sessionId: sessionId("rs-draft") });
    expect(markup).not.toContain("Which account and month?");
    expect(markup).toContain("Cheque 101");
    expect(markup).toContain("1 to tick, 1 ticked.");
    expect(markup).toContain("£200.00");
  });

  it("shows the finish copy with Complete enabled when the ticked lines balance the statement", () => {
    // Opening 1000 + ticked (500 - 200) = 1300, which is the statement closing balance.
    fixtures.sessions = [session({})];
    fixtures.workspace = workspaceFor({}, [
      line("t1", "Grant", 500, "Income"),
      line("t2", "Rent", 200, "Expenditure"),
    ]);
    const markup = render({ sessionId: sessionId("rs-draft"), initialStep: "finish" });
    expect(markup).toContain("It balances");
    expect(markup).toContain("Complete reconciliation");
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Complete reconciliation/);
  });

  it("keeps Complete disabled at finish while the gap is not zero", () => {
    fixtures.sessions = [session({})];
    fixtures.workspace = workspaceFor({}, [line("t1", "Grant", 500, "Income")]);
    const markup = render({ sessionId: sessionId("rs-draft"), initialStep: "finish" });
    expect(markup).toContain("There&#x27;s a £200.00 gap");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Complete reconciliation/);
  });

  it("opens a completed reconciliation on the done step, not for editing", () => {
    fixtures.sessions = [session({ status: "completed" })];
    fixtures.workspace = workspaceFor({ status: "completed" }, [
      line("t1", "Grant", 500, "Income"),
      line("t2", "Rent", 200, "Expenditure"),
    ]);
    const markup = render({ sessionId: sessionId("rs-draft") });
    expect(markup).toContain("March reconciled");
    expect(markup).toContain("Reopen");
    expect(markup).not.toContain("Complete reconciliation");
    expect(markup).not.toContain("Tick what");
  });
});

// The markup of the first button whose text contains `text`, so attributes can be checked on it.
const buttonWith = (markup: string, text: string) =>
  markup.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<\/button>/g)?.find((button) => button.includes(text));

describe("completed and reopened reconciliations", () => {
  const completed = () => {
    fixtures.sessions = [session({ status: "completed" })];
    fixtures.workspace = workspaceFor(
      { status: "completed" },
      [line("t1", "Grant", 500, "Income"), line("t2", "Rent", 200, "Expenditure")],
      [line("t3", "Cheque 101", 75, "Expenditure")]
    );
  };

  it("browses a completed reconciliation's ticks read-only, listing only the cleared lines", () => {
    completed();
    const markup = render({ sessionId: sessionId("rs-draft"), initialStep: "tick" });
    expect(markup).toContain("Completed — reopen to change ticks");
    expect(markup).toContain("Grant");
    expect(markup).toContain("Rent");
    expect(markup).not.toContain("Cheque 101");
    expect(markup).not.toContain('aria-label="Show lines"');
    // Every tick control is disabled.
    const rows = markup.match(/<button[^>]*aria-pressed="true"[^>]*>/g) ?? [];
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).toContain('disabled=""');
    // The receipt still shows the balance check, and Back is offered.
    expect(markup).toContain("Balance check");
    expect(markup).toContain('aria-label="Back"');
  });

  it("offers the ticked lines from the summary as an enabled, read-only next step", () => {
    completed();
    const markup = render({ sessionId: sessionId("rs-draft") });
    const row = buttonWith(markup, "View the ticked lines");
    expect(row).toBeDefined();
    expect(row).not.toContain('disabled=""');
    expect(markup).toContain("Read-only. Reopen to change anything.");
  });

  it("keeps the balances and tick rail items open, but not the locked account step", () => {
    completed();
    const markup = render({ sessionId: sessionId("rs-draft"), initialStep: "tick" });
    expect(buttonWith(markup, "Statement balances")).not.toContain('disabled=""');
    expect(buttonWith(markup, "Tick off lines")).not.toContain('disabled=""');
    expect(buttonWith(markup, "Finish")).not.toContain('disabled=""');
    expect(buttonWith(markup, "Account")).toContain('disabled=""');
  });

  it("shows a completed reconciliation's balances with the inputs disabled", () => {
    completed();
    const markup = render({ sessionId: sessionId("rs-draft"), initialStep: "balances" });
    for (const id of ["reconcile-opening", "reconcile-closing"]) {
      expect(markup.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0]).toContain('disabled=""');
    }
    // Moves along to the ticks without saving anything.
    expect(buttonWith(markup, "Next: tick off lines")).not.toContain('disabled=""');
  });

  it("offers a way back to the summary rather than completing again at the finish step", () => {
    completed();
    const markup = render({ sessionId: sessionId("rs-draft"), initialStep: "finish" });
    expect(markup).toContain("Completed — these lines are locked.");
    expect(markup).toContain("Back to summary");
    expect(markup).not.toContain("Complete reconciliation");
  });

  it("shows the reopened reason once above the balances, tick and finish steps", () => {
    fixtures.sessions = [session({ status: "reopened", reopenedReason: "Wrong date" })];
    fixtures.workspace = workspaceFor({ status: "reopened", reopenedReason: "Wrong date" }, [
      line("t1", "Grant", 500, "Income"),
    ]);
    for (const initialStep of ["balances", "tick", "finish"] as const) {
      const markup = render({ sessionId: sessionId("rs-draft"), initialStep });
      expect(markup.split("Reopened: Wrong date").length - 1).toBe(1);
      expect(markup).toMatch(/<p class="[^"]*bg-amber-light[^"]*">Reopened: Wrong date<\/p>/);
    }
  });

  it("does not show a reopened note on an open draft", () => {
    fixtures.sessions = [session({})];
    fixtures.workspace = workspaceFor({}, [line("t1", "Grant", 500, "Income")]);
    const markup = render({ sessionId: sessionId("rs-draft"), initialStep: "tick" });
    expect(markup).not.toContain("Reopened:");
  });
});

describe("reconciliation list", () => {
  it("renders each session row with its status tag", () => {
    fixtures.funds = funds;
    fixtures.sessions = [
      session({ _id: "rs-1", status: "draft", fundName: "General Fund" }),
      session({ _id: "rs-2", status: "reopened", fundId: "fund-building", fundName: "Building Fund" }),
      session({ _id: "rs-3", status: "completed", periodStart: "2026-02-01", periodEnd: "2026-02-28", fundName: "General Fund" }),
    ];
    const markup = renderToStaticMarkup(createElement(Reconciliation, { onBack: noop }));
    expect(markup).toContain("Draft");
    expect(markup).toContain("Reopened");
    expect(markup).toContain("Completed");
    expect(markup).toContain("Reconcile a month");
    // Only the open reconciliations can be deleted; the completed one has no delete button.
    expect(markup.split('aria-label="Delete reconciliation"').length - 1).toBe(2);
  });
});
