import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup as renderStatic } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Doc } from "../convex/_generated/dataModel";
import CashChequeBanking from "../components/CashChequeBanking";
import BankingDone from "../components/banking/BankingDone";
import BankingWizard from "../components/banking/BankingWizard";
import ReopenSheet from "../components/banking/ReopenSheet";
import type { AppUser, Fund } from "../types";

// Query results are chosen by which function reference the component asks for.
const fixtures = vi.hoisted(() => ({
  awaiting: undefined as unknown,
  candidates: undefined as unknown,
  history: undefined as unknown,
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  const { api } = await import("../convex/_generated/api");
  const nameOf = (ref: unknown) => getFunctionName(ref as Parameters<typeof getFunctionName>[0]);
  const banking = api.queries.cashBankingReconciliations;
  return {
    useQuery: (ref: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      const name = nameOf(ref);
      if (name === nameOf(banking.getAwaitingBanking)) return fixtures.awaiting;
      if (name === nameOf(banking.getCandidateBankCredits)) return fixtures.candidates;
      if (name === nameOf(banking.list)) return fixtures.history;
      throw new Error(`Unexpected query: ${name}`);
    },
    useMutation: () => () => Promise.resolve(undefined),
  };
});

const noop = () => {};

// Server rendering puts a comment between adjacent text pieces, e.g. "{gbp(x)} banked". Drop them so the copy reads as shown.
const renderToStaticMarkup = (element: ReactElement) => renderStatic(element).replace(/<!-- -->/g, "");

const funds: Fund[] = [{ _id: "fund-general", name: "General Fund", type: "Unrestricted", balance: 0 }];

const user = (role: AppUser["role"]): AppUser => ({
  _id: "user",
  name: "Recorder",
  email: "user@example.invalid",
  role,
});

// An open collection as getAwaitingBanking returns it: cash 100, cheques 50.
const collection = {
  _id: "col-1",
  weekEndingDate: "2026-03-08",
  openCashAmount: 100,
  openChequeAmount: 50,
  openTotal: 150,
};

// A bank credit as getCandidateBankCredits returns it.
const credit = (amount = 150) => ({
  _id: "tx-1",
  date: "2026-03-09",
  amount,
  description: "BACS deposit",
  fundId: "fund-general",
  category: "Offerings",
});

// A cash banking record. Only the fields the screens read are filled in.
const banking = (overrides: Record<string, unknown>) =>
  ({
    _id: "rec-1",
    organizationId: "org-1",
    cashCollectionIds: ["col-1"],
    cashCollectionSplits: [{ cashCollectionId: "col-1", cashAmount: 100, chequeAmount: 50 }],
    bankTransactionIds: ["tx-1"],
    bankTransactionSplits: [{ transactionId: "tx-1", medium: "cash", cashAmount: 150, chequeAmount: 0 }],
    status: "completed",
    expectedCashAmount: 100,
    expectedChequeAmount: 50,
    expectedTotal: 150,
    bankedCashAmount: 150,
    bankedChequeAmount: 0,
    bankedTotal: 150,
    varianceAmount: 0,
    completedAt: Date.UTC(2026, 2, 10),
    updatedAt: Date.UTC(2026, 2, 10),
    ...overrides,
  }) as unknown as Doc<"cashBankingReconciliations">;

// The markup of the first button whose text contains `text`, so attributes can be checked on it.
const buttonWith = (markup: string, text: string) =>
  markup.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<\/button>/g)?.find((button) => button.includes(text));

const renderHub = (role: AppUser["role"] = "Admin") =>
  renderToStaticMarkup(createElement(CashChequeBanking, { funds, currentUser: user(role) }));

const renderWizard = (props: Partial<Parameters<typeof BankingWizard>[0]> = {}) =>
  renderToStaticMarkup(createElement(BankingWizard, { funds, onClose: noop, ...props }));

beforeEach(() => {
  fixtures.awaiting = undefined;
  fixtures.candidates = undefined;
  fixtures.history = undefined;
});

describe("cash banking hub", () => {
  it("shows what is waiting and a button to bank it", () => {
    fixtures.awaiting = [collection];
    fixtures.history = [];
    const markup = renderHub();
    expect(markup).toContain("Bank cash and cheques");
    expect(markup).toContain("£150.00");
    expect(markup).toContain("1 collection with cash or cheques still to bank");
    expect(buttonWith(markup, "Bank cash and cheques")).not.toContain('disabled=""');
  });

  it("says so, and disables banking, when nothing is waiting", () => {
    fixtures.awaiting = [];
    fixtures.history = [];
    const markup = renderHub();
    expect(markup).toContain("Everything counted has been banked.");
    expect(markup).toContain("Nothing is waiting to be banked.");
    expect(buttonWith(markup, "Bank cash and cheques")).toContain('disabled=""');
  });

  it("lists reopened bankings under Needs you with their reason", () => {
    fixtures.awaiting = [];
    fixtures.history = [banking({ _id: "rec-2", status: "reopened", reopenReason: "Wrong date" })];
    const markup = renderHub();
    expect(markup).toContain("Needs you");
    expect(markup).toContain("Finish the reopened banking");
    expect(markup).toContain("Wrong date");
  });

  it("offers Reopen only on completed bankings in the history", () => {
    fixtures.awaiting = [];
    fixtures.history = [
      banking({ _id: "rec-1", status: "completed" }),
      banking({ _id: "rec-2", status: "reopened", reopenReason: "Wrong date" }),
    ];
    const markup = renderHub();
    expect(markup).toContain("Completed");
    expect(markup).toContain("Reopened");
    expect(markup.match(/>Reopen</g)).toHaveLength(1);
  });

  it("gives read-only users the summary and no banking actions", () => {
    const markup = renderHub("Pastorate");
    expect(markup).toContain("Read-only: Admin or Finance Team required");
    expect(buttonWith(markup, "Bank cash and cheques")).toBeUndefined();
    expect(markup).not.toContain(">Reopen<");
  });
});

describe("banking walkthrough", () => {
  it("opens on collections, with the part-amount option and the next step", () => {
    fixtures.awaiting = [collection];
    fixtures.candidates = [credit()];
    const markup = renderWizard({ initialStep: "collections" });
    expect(markup).toContain("Which collections went to the bank?");
    expect(markup).toContain("Week ending");
    expect(markup).toContain("Only part of it?");
    expect(markup).toContain("Counted and banked");
    expect(buttonWith(markup, "Next: find it in the bank")).not.toContain('disabled=""');
  });

  it("says nothing is waiting, and offers only Close, when there are no collections", () => {
    fixtures.awaiting = [];
    fixtures.candidates = [];
    const markup = renderWizard({ initialStep: "collections" });
    expect(markup).toContain("Nothing is waiting to be banked.");
    expect(buttonWith(markup, "Close")).toBeDefined();
    expect(markup).not.toContain("Next: find it in the bank");
  });

  it("shows the loading state and keeps Next off while collections load", () => {
    const markup = renderWizard({ initialStep: "collections" });
    expect(markup).toContain("Loading collections…");
    expect(buttonWith(markup, "Next: find it in the bank")).toContain('disabled=""');
  });

  it("lists bank credits to find, and keeps Next off until one is ticked", () => {
    fixtures.awaiting = [collection];
    fixtures.candidates = [credit()];
    const markup = renderWizard({ initialStep: "bank" });
    expect(markup).toContain("Which bank credits are the deposit?");
    expect(markup).toContain("BACS deposit");
    expect(markup).toContain("General Fund");
    expect(markup).toContain('aria-label="Search bank credits"');
    expect(buttonWith(markup, "Next: check it")).toContain('disabled=""');
  });

  it("explains where bank credits come from when there are none", () => {
    fixtures.awaiting = [collection];
    fixtures.candidates = [];
    const markup = renderWizard({ initialStep: "bank" });
    expect(markup).toContain("No bank credits to match yet.");
    expect(markup).toContain("statement imports or bank sync");
  });

  it("says the bank shows less when nothing has been found in the bank yet", () => {
    fixtures.awaiting = [collection];
    fixtures.candidates = [credit()];
    const markup = renderWizard({ initialStep: "check" });
    expect(markup).toContain("Does it add up?");
    expect(markup).toContain("The bank shows £150.00 less than was counted.");
    expect(markup).toContain("Why is it different?");
    expect(markup).toContain("Partial banking");
    expect(buttonWith(markup, "Complete banking")).toContain('disabled=""');
  });

  it("shows the two totals on Check for phones, where the receipt is hidden", () => {
    fixtures.awaiting = [collection];
    fixtures.candidates = [credit()];
    const markup = renderWizard({ initialStep: "check" });
    expect(markup).toMatch(/<dl[^>]*lg:hidden/);
    expect(markup).toContain("1 collection");
    expect(markup).toContain("0 bank credits");
  });

  it("confirms a reopened banking that already matches, and preloads its reason", () => {
    fixtures.awaiting = [collection];
    fixtures.candidates = [credit()];
    const markup = renderWizard({
      initialStep: "check",
      reconciliation: banking({ status: "reopened", reopenReason: "Wrong date" }),
    });
    expect(markup).toContain("Matches the count. £150.00 counted across 1 collection.");
    expect(markup.split("Reopened: Wrong date").length - 1).toBe(1);
    expect(buttonWith(markup, "Complete banking")).not.toContain('disabled=""');
  });

  it("shows a reopened banking's difference from what it saved", () => {
    fixtures.awaiting = [collection];
    // The bank credit now reads 120, so the banking is 30 short of the 150 counted.
    fixtures.candidates = [credit(120)];
    const markup = renderWizard({
      initialStep: "check",
      reconciliation: banking({
        status: "reopened",
        reopenReason: "Wrong date",
        bankTransactionSplits: [{ transactionId: "tx-1", medium: "cash", cashAmount: 120, chequeAmount: 0 }],
        bankedTotal: 120,
      }),
    });
    expect(markup).toContain("The bank shows £30.00 less than was counted.");
    expect(buttonWith(markup, "Complete banking")).toContain('disabled=""');
  });
});

describe("banking done screen", () => {
  const summary = { bankedTotal: 150, variance: 0, collectionCount: 1, creditCount: 1 };

  it("offers another deposit while collections are still waiting", () => {
    const markup = renderToStaticMarkup(
      createElement(BankingDone, {
        summary,
        waitingCount: 2,
        waitingTotal: 300,
        onAnother: noop,
        onBack: noop,
      })
    );
    expect(markup).toContain("£150.00 banked");
    expect(markup).toContain("Bank another deposit");
    expect(markup).toContain("still waiting in 2 collections");
    expect(markup).toContain("Back to banking");
  });

  it("only offers a way back once nothing is waiting", () => {
    const markup = renderToStaticMarkup(
      createElement(BankingDone, {
        summary: { ...summary, variance: -25 },
        waitingCount: 0,
        waitingTotal: 0,
        onAnother: noop,
        onBack: noop,
      })
    );
    expect(markup).not.toContain("Bank another deposit");
    expect(markup).toContain("Back to banking");
  });
});

describe("reopen sheet", () => {
  it("asks for a reason before the banking can be reopened", () => {
    const markup = renderToStaticMarkup(
      createElement(ReopenSheet, { reconciliation: banking({}), onCancel: noop, onReopened: noop })
    );
    expect(markup).toContain("Reopen this banking?");
    expect(markup).toContain("£150.00 banked");
    expect(markup).toContain('id="banking-reopen-reason"');
    expect(buttonWith(markup, "Reopen banking")).toContain('disabled=""');
  });
});
