import { describe, expect, it } from "vitest";
import { lastRepaymentDate, loanStatus } from "../components/loans/loanFacts";
import {
  confirmRepaymentSelection,
  loanProblem,
  newLoanArgs,
  receivedCandidates,
  repaymentCandidates,
  staleRepaymentIds,
  whoIsReady,
} from "../components/loans/loanWalkthrough";
import type { Id } from "../convex/_generated/dataModel";
import type { MovementLeg } from "../lib/movementMatching";

type Leg = MovementLeg & { description: string };

const leg = (overrides: Partial<Leg>): Leg => ({
  _id: "tx",
  date: "2026-03-05",
  description: "Loan received",
  amount: 1000,
  type: "Income",
  fundId: "general",
  movementKind: "loan",
  ...overrides,
});

const received = leg({ _id: "in-1", amount: 1000 });
const repayment = (id: string, amount: number) => leg({ _id: id, type: "Expenditure", amount, description: "Repayment" });

describe("loan walkthrough candidates", () => {
  const legs = [
    received,
    leg({ _id: "linked-in", movementId: "loan-x" }),
    leg({ _id: "voided-in", isVoided: true }),
    leg({ _id: "plain-in", movementKind: undefined }),
    repayment("out-1", 200),
    leg({ _id: "transfer-out", movementKind: "transfer", type: "Expenditure" }),
  ];

  it("offers only unlinked, active money received as a loan", () => {
    expect(receivedCandidates(legs).map((item) => item._id)).toEqual(["in-1"]);
  });

  it("offers only unlinked, active repayments made on a loan", () => {
    expect(repaymentCandidates(legs).map((item) => item._id)).toEqual(["out-1"]);
  });
});

describe("loan walkthrough validation", () => {
  it("needs a lender before the amount step", () => {
    expect(whoIsReady({ lender: "   ", dueDate: "", note: "" })).toBe(false);
    expect(whoIsReady({ lender: " Diocese ", dueDate: "", note: "" })).toBe(true);
  });

  it("needs money received before repayments can be checked", () => {
    expect(loanProblem(undefined, [])).toBe("Choose the money received.");
  });

  it("accepts repayments up to the amount received, and none at all", () => {
    expect(loanProblem(received, [])).toBeNull();
    expect(loanProblem(received, [repayment("a", 400), repayment("b", 600)])).toBeNull();
  });

  it("refuses repayments above the amount received, with the same message as the server", () => {
    expect(loanProblem(received, [repayment("a", 600), repayment("b", 500)])).toBe(
      "Repayments (£1,100.00) can't be more than the amount received (£1,000.00)."
    );
  });

  it("refuses a repayment that is not on a loan", () => {
    const plainOut = leg({ _id: "plain-out", type: "Expenditure", movementKind: undefined });
    expect(loanProblem(received, [plainOut])).toBe("Every transaction must be marked as a loan to link them.");
  });
});

describe("repayments that change after they are picked", () => {
  const picked = ["out-1", "out-2"];
  const repaymentsAtPick = [repayment("out-1", 200), repayment("out-2", 100)];

  it("reports nothing when every picked repayment is still waiting", () => {
    expect(staleRepaymentIds(picked, repaymentCandidates(repaymentsAtPick))).toEqual([]);
  });

  it("reports a repayment another user linked since it was picked", () => {
    const linkedElsewhere = repaymentsAtPick.filter((item) => item._id !== "out-2");
    expect(staleRepaymentIds(picked, repaymentCandidates(linkedElsewhere))).toEqual(["out-2"]);
  });

  it("reports a repayment voided or reclassified since it was picked", () => {
    const changed = [repayment("out-1", 200), { ...repayment("out-2", 100), isVoided: true }];
    expect(staleRepaymentIds(picked, repaymentCandidates(changed))).toEqual(["out-2"]);

    const reclassified = [repayment("out-1", 200), { ...repayment("out-2", 100), movementKind: "transfer" as const }];
    expect(staleRepaymentIds(picked, repaymentCandidates(reclassified))).toEqual(["out-2"]);
  });

  it("keeps only the still-waiting picks once the user confirms, so the loan is built from what they reviewed", () => {
    const linkedElsewhere = repaymentsAtPick.filter((item) => item._id !== "out-2");
    const options = repaymentCandidates(linkedElsewhere);
    const kept = confirmRepaymentSelection(picked, options);

    expect(kept).toEqual(["out-1"]);
    expect(staleRepaymentIds(kept, options)).toEqual([]);
    const live = options.filter((item) => kept.includes(item._id));
    expect(newLoanArgs({ lender: "Diocese", dueDate: "", note: "" }, received, live).transactionIds).toEqual([
      "in-1",
      "out-1",
    ]);
  });
});

describe("new loan arguments", () => {
  it("trims the lender and sends the received money first, then the repayments", () => {
    const args = newLoanArgs(
      { lender: "  Diocese  ", dueDate: "2027-06-01", note: "  Roof  " },
      received,
      [repayment("out-1", 200), repayment("out-2", 100)]
    );
    expect(args).toEqual({
      transactionIds: ["in-1", "out-1", "out-2"] as Id<"transactions">[],
      lender: "Diocese",
      dueDate: "2027-06-01",
      note: "Roof",
    });
  });

  it("leaves blank optional fields out", () => {
    const args = newLoanArgs({ lender: "Diocese", dueDate: "", note: "   " }, received, []);
    expect(args.dueDate).toBeUndefined();
    expect(args.note).toBeUndefined();
    expect(args.transactionIds).toEqual(["in-1"]);
  });
});

describe("loan facts", () => {
  it("finds the latest repayment that still counts", () => {
    expect(
      lastRepaymentDate([
        { date: "2026-02-01", type: "Expenditure" },
        { date: "2026-05-01", type: "Expenditure", isVoided: true },
        { date: "2026-04-01", type: "Expenditure" },
        { date: "2026-06-01", type: "Income" },
      ])
    ).toBe("2026-04-01");
    expect(lastRepaymentDate([{ date: "2026-06-01", type: "Income" }])).toBeUndefined();
  });

  it("marks an unpaid loan past its due date as overdue, and a repaid loan as repaid", () => {
    expect(loanStatus({ isRepaid: false, dueDate: "2020-01-01", outstanding: 10 }, "2026-10-09")).toBe("Overdue");
    expect(loanStatus({ isRepaid: false, dueDate: "2030-01-01", outstanding: 10 }, "2026-10-09")).toBe("Open");
    expect(loanStatus({ isRepaid: true, dueDate: "2020-01-01", outstanding: 0 }, "2026-10-09")).toBe("Repaid");
  });
});
