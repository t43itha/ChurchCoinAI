import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import JournalTransferModal, { type JournalTransferModalProps } from "../components/transactions/JournalTransferModal";
import {
  amountPence,
  balanceAfterPence,
  previousStepFor,
  railStateFor,
} from "../components/movements/transferSteps";
import type { Fund } from "../types";

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
  useQuery: () => undefined,
}));

const noop = () => {};

const funds: Fund[] = [
  { _id: "general", name: "General Fund", type: "Unrestricted", balance: 500 },
  { _id: "building", name: "Building Fund", type: "Restricted", balance: 1200 },
  { _id: "youth", name: "Youth", type: "Designated", balance: -214.6 },
];

const render = (props: Partial<JournalTransferModalProps> = {}) =>
  renderToStaticMarkup(createElement(JournalTransferModal, { funds, onClose: noop, ...props }));

// Every button in the markup whose text includes `text`, so attributes can be checked on each.
const buttonsWith = (markup: string, text: string) =>
  (markup.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<\/button>/g) ?? []).filter((button) => button.includes(text));

describe("amountPence", () => {
  it("reads a positive amount in pounds as whole pence", () => {
    expect(amountPence("300")).toBe(30000);
    expect(amountPence("214.6")).toBe(21460);
    expect(amountPence("1,250.40")).toBe(125040);
    expect(amountPence("0.01")).toBe(1);
  });

  it("rejects zero, negatives, blanks, and more than two decimals", () => {
    expect(amountPence("0")).toBeNull();
    expect(amountPence("0.00")).toBeNull();
    expect(amountPence("-5")).toBeNull();
    expect(amountPence("")).toBeNull();
    expect(amountPence("   ")).toBeNull();
    expect(amountPence("1.234")).toBeNull();
    expect(amountPence("12abc")).toBeNull();
  });
});

describe("balanceAfterPence", () => {
  it("adds a signed change to the balance in pence, so money out can overdraw a fund", () => {
    expect(balanceAfterPence(500, -30000)).toBe(20000);
    expect(balanceAfterPence(-214.6, -10000)).toBe(-31460);
    expect(balanceAfterPence(100, 5000)).toBe(15000);
  });
});

describe("transfer rail and back", () => {
  it("marks the steps before the current one as done and the rest as to do", () => {
    expect(railStateFor("funds", "amount")).toBe("done");
    expect(railStateFor("amount", "amount")).toBe("now");
    expect(railStateFor("done", "amount")).toBe("todo");
  });

  it("marks every step before done as finished once the transfer is recorded", () => {
    expect(railStateFor("funds", "done")).toBe("done");
    expect(railStateFor("amount", "done")).toBe("done");
    expect(railStateFor("done", "done")).toBe("now");
  });

  it("goes back from the amount step to the funds only", () => {
    expect(previousStepFor("amount")).toBe("funds");
    expect(previousStepFor("funds")).toBeUndefined();
    expect(previousStepFor("done")).toBeUndefined();
  });
});

describe("JournalTransferModal funds step", () => {
  it("lists both groups of funds with balances, and shows an overdrawn balance in red", () => {
    const markup = render({ initialStep: "funds" });
    expect(markup).toContain("Which funds?");
    expect(markup).toContain("Take from");
    expect(markup).toContain("Put into");
    expect(markup).toContain("-£214.60");
    expect(markup).toMatch(/<span class="[^"]*text-error[^"]*">-£214\.60<\/span>/);
  });

  it("disables a fund on one side once it is picked on the other", () => {
    const markup = render({ initialStep: "funds", initialFromFundId: "general" });
    const general = buttonsWith(markup, "General Fund");
    expect(general).toHaveLength(2);
    expect(general.filter((button) => button.includes('aria-pressed="true"'))).toHaveLength(1);
    expect(general.filter((button) => button.includes('disabled=""'))).toHaveLength(1);
  });

  it("holds Next until both funds are picked", () => {
    expect(buttonsWith(render({ initialStep: "funds" }), "Next: amount")[0]).toContain('disabled=""');
    const ready = render({ initialStep: "funds", initialFromFundId: "general", initialToFundId: "building" });
    expect(buttonsWith(ready, "Next: amount")[0]).not.toContain('disabled=""');
  });

  it("shows the receipt with the funds' balances before the move", () => {
    const markup = render({ initialStep: "funds", initialFromFundId: "general" });
    expect(markup).toContain("The move");
    expect(markup).toContain("£500.00");
  });
});

describe("JournalTransferModal amount step", () => {
  const prefilled = { initialStep: "amount" as const, initialFromFundId: "general", initialToFundId: "building" };

  it("opens with the destination, source and amount prefilled from the Funds page", () => {
    const markup = render({ ...prefilled, initialAmount: 300 });
    expect(markup).toContain("How much, and when?");
    expect(markup).toContain("Moving money from General Fund to Building Fund.");
    expect(markup).toContain('value="300.00"');
    expect(buttonsWith(markup, "Move money")[0]).not.toContain('disabled=""');
  });

  it("warns, but still allows the move, when it would overdraw the source fund", () => {
    const markup = render({ ...prefilled, initialAmount: 600 });
    expect(markup).toContain("General Fund would be £100.00 overdrawn after this. You can still record it.");
    expect(buttonsWith(markup, "Move money")[0]).not.toContain('disabled=""');
  });

  it("does not warn when the source fund stays in credit", () => {
    expect(render({ ...prefilled, initialAmount: 300 })).not.toContain("overdrawn after this");
  });

  it("holds Move money until both funds and an amount are in place", () => {
    const noAmount = render(prefilled);
    expect(buttonsWith(noAmount, "Move money")[0]).toContain('disabled=""');
    const noSource = render({ initialStep: "amount", initialToFundId: "building", initialAmount: 300 });
    expect(buttonsWith(noSource, "Move money")[0]).toContain('disabled=""');
  });

  it("offers the funds step as the way back", () => {
    expect(render({ ...prefilled, initialAmount: 300 })).toContain('aria-label="Back"');
  });
});

describe("JournalTransferModal done step", () => {
  it("falls back to the funds step when no transfer has been saved yet", () => {
    const markup = render({ initialStep: "done" });
    expect(markup).toContain("Which funds?");
    expect(markup).not.toContain("Move more money");
  });
});
