import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import LinkMovementModal, { type LinkMovementModalProps } from "../components/transactions/LinkMovementModal";
import { linkedSummary, railStateFor, type Loan } from "../components/movements/linkSteps";
import type { Fund, Transaction } from "../types";

// Query results are chosen by which function reference the component asks for.
const fixtures = vi.hoisted(() => ({ loans: undefined as unknown }));

vi.mock("convex/react", async () => {
  const { getFunctionName: nameOf } = await import("convex/server");
  const { api } = await import("../convex/_generated/api");
  return {
    useQuery: (ref: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      if (nameOf(ref as Parameters<typeof nameOf>[0]) === nameOf(api.queries.movements.listLoans)) return fixtures.loans;
      throw new Error(`Unexpected query: ${nameOf(ref as Parameters<typeof nameOf>[0])}`);
    },
    useMutation: () => vi.fn(),
  };
});

const noop = () => {};
const today = "2026-10-05";

const funds: Fund[] = [
  { _id: "general", name: "General", type: "Unrestricted", balance: 0 },
  { _id: "building", name: "Building", type: "Restricted", balance: 0 },
];

const transaction = (overrides: Partial<Transaction>): Transaction => ({
  _id: "tx",
  date: today,
  description: "Transfer to Building",
  amount: 300,
  type: "Expenditure",
  category: "Transfer between funds",
  fundId: "general",
  isReconciled: false,
  movementKind: "transfer",
  ...overrides,
});

const loan = (overrides: Partial<Loan>): Loan => ({
  _id: "loan" as Id<"movements">,
  lender: "Lender",
  note: undefined,
  dueDate: undefined,
  createdAt: 1,
  borrowed: 0,
  repaid: 0,
  outstanding: 0,
  isRepaid: false,
  legs: [],
  ...overrides,
});

const loans: Loan[] = [
  loan({ _id: "alex" as Id<"movements">, lender: "Alex Sackey", borrowed: 1852, repaid: 1000, outstanding: 852 }),
  loan({ _id: "bank" as Id<"movements">, lender: "Church Bank", borrowed: 5000, repaid: 1000, outstanding: 4000 }),
  loan({ _id: "diocese" as Id<"movements">, lender: "Diocese Fund", borrowed: 500, repaid: 500, outstanding: 0, isRepaid: true }),
];

const render = (props: Partial<LinkMovementModalProps> & { transaction: Transaction }) =>
  renderToStaticMarkup(
    createElement(LinkMovementModal, { transactions: [], funds, onClose: noop, ...props })
  );

// Every button in the markup whose text includes `text`, so attributes can be checked on each.
const buttonsWith = (markup: string, text: string) =>
  (markup.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<\/button>/g) ?? []).filter((button) => button.includes(text));

describe("linkSteps", () => {
  it("marks the match step as now and the done step as to do, then done once linked", () => {
    expect(railStateFor("match", "match")).toBe("now");
    expect(railStateFor("done", "match")).toBe("todo");
    expect(railStateFor("match", "done")).toBe("done");
  });

  it("describes the other side of a transfer by its description and amount", () => {
    expect(linkedSummary({ kind: "transaction", description: "Transfer from General", amount: 300 })).toBe(
      "Linked to Transfer from General, £300.00."
    );
  });

  it("describes a new loan, an addition to a loan, and a repayment", () => {
    expect(linkedSummary({ kind: "new-loan", lender: "Alex Sackey" })).toBe("Recorded as a new loan from Alex Sackey.");
    expect(linkedSummary({ kind: "loan", lender: "Church Bank", received: true })).toBe(
      "Added to the loan from Church Bank."
    );
    expect(linkedSummary({ kind: "loan", lender: "Church Bank", received: false })).toBe(
      "Recorded as a repayment of the loan from Church Bank."
    );
  });
});

describe("LinkMovementModal match step for a transfer", () => {
  const leg = transaction({ _id: "leg" });
  const other = transaction({
    _id: "other",
    type: "Income",
    fundId: "building",
    description: "Transfer from General",
  });

  it("summarises the waiting transaction in a dark card above the candidates", () => {
    const markup = render({ transaction: leg, transactions: [leg, other] });
    expect(markup).toContain("Waiting for the other side");
    expect(markup).toContain("Transfer to Building");
    expect(markup).toContain("Which is the other side?");
  });

  it("lists the matching candidate as a single-select tick row, selected by default", () => {
    const markup = render({ transaction: leg, transactions: [leg, other] });
    const row = buttonsWith(markup, "Transfer from General");
    expect(row).toHaveLength(1);
    expect(row[0]).toContain('aria-pressed="true"');
    expect(row[0]).toContain("£300.00");
  });

  it("holds Link until a candidate is chosen, and explains when there is none", () => {
    const markup = render({ transaction: leg, transactions: [leg] });
    expect(markup).toContain("No unlinked transfer between funds of £300.00 going the other way within 14 days.");
    expect(buttonsWith(markup, "Link")[0]).toContain('disabled=""');
    expect(buttonsWith(render({ transaction: leg, transactions: [leg, other] }), "Link")[0]).not.toContain('disabled=""');
  });

  it("lists the rail's two steps", () => {
    const markup = render({ transaction: leg, transactions: [leg, other] });
    expect(markup).toContain("Movement");
    expect(markup).toContain('aria-current="step"');
  });
});

describe("LinkMovementModal loan paths", () => {
  it("offers a new loan with its lender, due date and note when money is received", () => {
    fixtures.loans = loans;
    const received = transaction({ type: "Income", movementKind: "loan", description: "ALEX SACKEY PAYE LOAN", amount: 1852 });
    const markup = render({ transaction: received });
    expect(markup).toContain("New loan");
    expect(markup).toContain("Lender");
    expect(markup).toContain('aria-label="Due date"');
    expect(markup).toContain("Note (optional)");
  });

  it("lists only open loans that can take a repayment, and asks which one it repays", () => {
    fixtures.loans = loans;
    const repayment = transaction({ type: "Expenditure", movementKind: "loan", description: "Loan repayment", amount: 300 });
    const markup = render({ transaction: repayment });
    expect(markup).toContain("Choose the loan that £300.00 repays.");
    expect(markup).toContain("Alex Sackey");
    expect(markup).toContain("Church Bank");
    expect(markup).not.toContain("Diocese Fund");
    expect(buttonsWith(markup, "Link")[0]).toContain('disabled=""');
  });

  it("explains a repayment with no open loan", () => {
    fixtures.loans = [];
    const repayment = transaction({ type: "Expenditure", movementKind: "loan", description: "Loan repayment", amount: 300 });
    const markup = render({ transaction: repayment });
    expect(markup).toContain("No open loan has £300.00 outstanding. Record the money received as a loan first.");
  });

  it("says the loans are loading while they are fetched", () => {
    fixtures.loans = undefined;
    const repayment = transaction({ type: "Expenditure", movementKind: "loan", description: "Loan repayment", amount: 300 });
    expect(render({ transaction: repayment })).toContain("Loading loans…");
  });
});

describe("LinkMovementModal done step", () => {
  it("confirms the link with a Done button", () => {
    const markup = render({ transaction: transaction({}), initialStep: "done" });
    expect(markup).toContain("Linked.");
    expect(markup).toMatch(/<button[^>]*>Done<\/button>/);
    expect(markup).not.toContain("Waiting for the other side");
  });
});