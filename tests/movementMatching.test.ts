import { describe, expect, it } from "vitest";
import {
  LINK_WINDOW_DAYS,
  isLoanOverdue,
  linkCandidates,
  linkState,
  movementProblem,
  suggestImportPairs,
  summarizeLoan,
  type MovementLeg,
} from "../lib/movementMatching";

const leg = (extra: Partial<MovementLeg> & { _id: string }): MovementLeg => ({
  amount: 100,
  type: "Income",
  date: "2026-08-03",
  fundId: "general",
  movementKind: "transfer",
  ...extra,
});

const out = (extra: Partial<MovementLeg> & { _id: string }) =>
  leg({ type: "Expenditure", fundId: "building", ...extra });

describe("linkCandidates", () => {
  it("picks the opposite-direction, same-amount, same-kind leg in another fund", () => {
    const source = leg({ _id: "in" });
    const match = out({ _id: "out" });
    expect(linkCandidates(source, [match]).map((c) => c._id)).toEqual(["out"]);
  });

  it.each([
    ["already linked", out({ _id: "c", movementId: "m1" })],
    ["voided", out({ _id: "c", isVoided: true })],
    ["a journal leg", out({ _id: "c", isJournal: true })],
    ["the same direction", leg({ _id: "c", fundId: "building" })],
    ["another kind", out({ _id: "c", movementKind: "reversal" })],
    ["15 days away", out({ _id: "c", date: "2026-08-18" })],
    ["a penny different", out({ _id: "c", amount: 100.01 })],
    ["the same leg", leg({ _id: "in" })],
  ])("ignores a leg that is %s", (_label, candidate) => {
    expect(linkCandidates(leg({ _id: "in" }), [candidate])).toEqual([]);
  });

  it("accepts a candidate exactly LINK_WINDOW_DAYS away", () => {
    expect(LINK_WINDOW_DAYS).toBe(14);
    const candidate = out({ _id: "c", date: "2026-08-17" });
    expect(linkCandidates(leg({ _id: "in" }), [candidate]).map((c) => c._id)).toEqual(["c"]);
  });

  it("ignores a transfer leg in the same fund", () => {
    expect(linkCandidates(leg({ _id: "in" }), [out({ _id: "c", fundId: "general" })])).toEqual([]);
  });

  it("accepts a returned payment in the same fund", () => {
    const source = leg({ _id: "in", movementKind: "reversal" });
    const candidate = out({ _id: "c", movementKind: "reversal", fundId: "general" });
    expect(linkCandidates(source, [candidate]).map((c) => c._id)).toEqual(["c"]);
  });

  it("returns nothing for a loan leg", () => {
    const source = leg({ _id: "in", movementKind: "loan" });
    const candidate = out({ _id: "c", movementKind: "loan" });
    expect(linkCandidates(source, [candidate])).toEqual([]);
  });

  it("orders by closeness, then earlier date, then _id", () => {
    const source = leg({ _id: "in", date: "2026-08-10" });
    const pool = [
      out({ _id: "far", date: "2026-08-20" }),
      out({ _id: "later-tie", date: "2026-08-12" }),
      out({ _id: "earlier-tie", date: "2026-08-08" }),
      out({ _id: "b-same", date: "2026-08-10" }),
      out({ _id: "a-same", date: "2026-08-10" }),
    ];
    expect(linkCandidates(source, pool).map((c) => c._id)).toEqual([
      "a-same",
      "b-same",
      "earlier-tie",
      "later-tie",
      "far",
    ]);
  });

  it("counts days across a month end without local time", () => {
    const source = leg({ _id: "in", date: "2026-03-01" });
    const candidate = out({ _id: "c", date: "2026-02-15" });
    expect(linkCandidates(source, [candidate]).map((c) => c._id)).toEqual(["c"]);
    expect(
      linkCandidates(source, [out({ _id: "d", date: "2026-02-14" })])
    ).toEqual([]);
  });
});

describe("movementProblem", () => {
  const transferPair = [leg({ _id: "in" }), out({ _id: "out" })];

  it("accepts a transfer between two funds", () => {
    expect(movementProblem("transfer", transferPair)).toBeNull();
  });

  it("refuses a transfer within one fund", () => {
    const sameFund = [leg({ _id: "in" }), out({ _id: "out", fundId: "general" })];
    expect(movementProblem("transfer", sameFund)).toBe(
      "The two sides of a transfer must be in different funds."
    );
  });

  it("names both amounts when money in and money out differ", () => {
    const legs = [leg({ _id: "in", amount: 100 }), out({ _id: "out", amount: 99.99 })];
    const message = movementProblem("transfer", legs);
    expect(message).toContain("£100.00");
    expect(message).toContain("£99.99");
  });

  it("asks for the other side when only one leg is chosen", () => {
    expect(movementProblem("transfer", [leg({ _id: "in" })])).toBe("Choose the other side.");
  });

  it("refuses an empty selection", () => {
    expect(movementProblem("transfer", [])).toEqual(expect.any(String));
  });

  it("refuses a voided leg", () => {
    const legs = [leg({ _id: "in" }), out({ _id: "out", isVoided: true })];
    expect(movementProblem("transfer", legs)).toBe("Voided transactions can't be linked.");
  });

  it("names the kind when a leg belongs to another kind", () => {
    const legs = [leg({ _id: "in" }), out({ _id: "out", movementKind: "reversal" })];
    expect(movementProblem("transfer", legs)).toContain("transfer between funds");
  });

  it("accepts a returned payment that matches its bounce", () => {
    const legs = [
      out({ _id: "bounce", movementKind: "reversal", fundId: "general", amount: 40 }),
      leg({ _id: "fee", movementKind: "reversal", fundId: "general", amount: 40 }),
    ];
    expect(movementProblem("reversal", legs)).toBeNull();
  });

  it("refuses a loan with only a repayment", () => {
    const legs = [out({ _id: "repay", movementKind: "loan", amount: 500 })];
    expect(movementProblem("loan", legs)).toBe("A loan needs the amount received.");
  });

  it("accepts a loan whose repayments add up to the amount received", () => {
    const received = leg({ _id: "received", movementKind: "loan", amount: 1852 });
    const legs = [
      received,
      out({ _id: "r1", movementKind: "loan", amount: 1000 }),
      out({ _id: "r2", movementKind: "loan", amount: 852 }),
    ];
    expect(movementProblem("loan", legs)).toBeNull();
  });

  it("refuses repayments over the amount received, to the penny", () => {
    const legs = [
      leg({ _id: "received", movementKind: "loan", amount: 1852 }),
      out({ _id: "r1", movementKind: "loan", amount: 1000 }),
      out({ _id: "r2", movementKind: "loan", amount: 852.01 }),
    ];
    expect(movementProblem("loan", legs)).toContain("£1,852.00");
  });
});

describe("summarizeLoan", () => {
  it("totals borrowed, repaid and outstanding, ignoring voided legs", () => {
    const legs = [
      leg({ _id: "received", movementKind: "loan", amount: 1852 }),
      out({ _id: "r1", movementKind: "loan", amount: 1000 }),
      out({ _id: "voided", movementKind: "loan", amount: 300, isVoided: true }),
    ];
    expect(summarizeLoan(legs)).toEqual({
      borrowed: 1852,
      repaid: 1000,
      outstanding: 852,
      isRepaid: false,
    });
  });

  it("marks a loan repaid when repayments reach the amount received", () => {
    const legs = [
      leg({ _id: "received", movementKind: "loan", amount: 100.1 }),
      out({ _id: "r1", movementKind: "loan", amount: 100.1 }),
    ];
    expect(summarizeLoan(legs)).toEqual({
      borrowed: 100.1,
      repaid: 100.1,
      outstanding: 0,
      isRepaid: true,
    });
  });

  it("is not repaid before anything is received", () => {
    expect(summarizeLoan([]).isRepaid).toBe(false);
  });
});

describe("isLoanOverdue", () => {
  it("is false without a due date", () => {
    expect(isLoanOverdue({ outstanding: 500 }, "2026-10-07")).toBe(false);
  });

  it("is false once repaid", () => {
    expect(isLoanOverdue({ dueDate: "2026-09-01", outstanding: 0 }, "2026-10-07")).toBe(false);
  });

  it("is true when the due date has passed with money outstanding", () => {
    expect(isLoanOverdue({ dueDate: "2026-09-30", outstanding: 1 }, "2026-10-07")).toBe(true);
  });

  it("is false on the due date itself", () => {
    expect(isLoanOverdue({ dueDate: "2026-10-07", outstanding: 1 }, "2026-10-07")).toBe(false);
  });
});

describe("suggestImportPairs", () => {
  it("pairs two import rows that are the two sides of one transfer", () => {
    const importLegs = [
      leg({ _id: "row-1", type: "Expenditure", fundId: "general", date: "2026-08-03" }),
      leg({ _id: "row-2", type: "Income", fundId: "building", date: "2026-08-04" }),
    ];
    const pairs = suggestImportPairs(importLegs, []);
    expect(pairs.get("row-1")).toEqual({ source: "import", id: "row-2" });
    expect(pairs.get("row-2")).toEqual({ source: "import", id: "row-1" });
  });

  it("pairs an import row with an unlinked ledger leg", () => {
    const importLegs = [leg({ _id: "row-1", type: "Income" })];
    const ledgerLegs = [out({ _id: "ledger-1" })];
    const pairs = suggestImportPairs(importLegs, ledgerLegs);
    expect(pairs.get("row-1")).toEqual({ source: "ledger", id: "ledger-1" });
    expect(pairs.has("ledger-1")).toBe(false);
  });

  it("never uses a leg twice", () => {
    const importLegs = [
      leg({ _id: "row-1", type: "Income", date: "2026-08-03" }),
      leg({ _id: "row-2", type: "Income", date: "2026-08-03" }),
    ];
    const ledgerLegs = [out({ _id: "ledger-1" })];
    const pairs = suggestImportPairs(importLegs, ledgerLegs);
    expect(pairs.get("row-1")).toEqual({ source: "ledger", id: "ledger-1" });
    expect(pairs.has("row-2")).toBe(false);
  });

  it("ignores rows that are not transfers or returned payments", () => {
    const importLegs = [
      leg({ _id: "row-1", type: "Income", movementKind: undefined }),
      leg({ _id: "row-2", type: "Income", movementKind: "loan" }),
    ];
    const ledgerLegs = [out({ _id: "ledger-1", movementKind: undefined })];
    expect(suggestImportPairs(importLegs, ledgerLegs).size).toBe(0);
  });
});

describe("linkState", () => {
  it("offers linking for an unlinked marked leg", () => {
    expect(linkState(leg({ _id: "a", movementKind: "loan" }))).toEqual({ status: "waiting", kind: "loan" });
  });

  it("separates bank legs from journal legs once linked", () => {
    expect(linkState(leg({ _id: "a", movementId: "m1" }))).toEqual({ status: "linked", kind: "transfer" });
    expect(linkState(leg({ _id: "a", movementId: "m1", isJournal: true }))).toEqual({ status: "journal" });
  });

  it("offers nothing for plain or voided rows", () => {
    expect(linkState(leg({ _id: "a", movementKind: undefined }))).toEqual({ status: "none" });
    expect(linkState(leg({ _id: "a", isVoided: true }))).toEqual({ status: "none" });
  });
});
