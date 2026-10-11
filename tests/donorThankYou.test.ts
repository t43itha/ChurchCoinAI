import { describe, expect, it } from "vitest";
import {
  MESSAGE_TEMPLATES,
  TEMPLATE_TYPES,
  defaultThankYouSelection,
  noPledgeNote,
  pledgesForTemplate,
  thankYouMessage,
  type ThankYouContext,
} from "../components/donors/thankYou";
import type { Fund, Pledge } from "../types";

const funds: Fund[] = [
  { _id: "fund-general", name: "General Fund", type: "Unrestricted", balance: 0 },
  { _id: "fund-roof", name: "Roof Appeal", type: "Restricted", balance: 0 },
];

const pledge = (fields: Partial<Pledge>): Pledge => ({
  _id: "p-active",
  donorName: "Ruth Lee",
  amount: 40,
  fundId: "fund-roof",
  frequency: "Monthly",
  startDate: "2026-01-01",
  status: "Active",
  ...fields,
});

const active = pledge({ _id: "p-active" });
const completed = pledge({ _id: "p-done", amount: 120, frequency: "Annual", status: "Completed" });

const context = (donorPledges: Pledge[]): ThankYouContext => ({
  donorName: "Ruth Lee",
  churchName: "St Barnabas",
  yearTotal: 1240.5,
  donorPledges,
  funds,
});

describe("thank-you message steps", () => {
  it("offers only completed pledges to the fulfilment message", () => {
    expect(pledgesForTemplate("pledgeFulfillment", [active, completed])).toEqual([completed]);
    expect(pledgesForTemplate("newPledge", [active, completed])).toEqual([active, completed]);
  });

  it("starts a pledge message on the first pledge that fits it", () => {
    expect(defaultThankYouSelection("pledgeFulfillment", [active, completed], funds)).toEqual({
      type: "pledgeFulfillment",
      pledgeId: "p-done",
      fundId: null,
    });
    expect(defaultThankYouSelection("pledgeFulfillment", [active], funds).pledgeId).toBeNull();
  });

  it("starts a fund message on the first fund", () => {
    expect(defaultThankYouSelection("generalUpdate", [active], funds)).toEqual({
      type: "generalUpdate",
      pledgeId: null,
      fundId: "fund-general",
    });
  });

  it("fills a pledge message with the donor, the schedule and the pledge's fund", () => {
    const message = thankYouMessage(
      { type: "newPledge", pledgeId: "p-active", fundId: null },
      context([active])
    );
    expect(message).toContain("Hi Ruth Lee");
    expect(message).toContain("£40 (Monthly)");
    expect(message).toContain("towards Roof Appeal");
    expect(message).toContain("— St Barnabas Finance Team");
  });

  it("quotes the year's total and the chosen fund in the End of Year message", () => {
    const message = thankYouMessage(
      { type: "endOfYear", pledgeId: null, fundId: "fund-general" },
      context([])
    );
    expect(message).toContain(`£${(1240.5).toLocaleString()}`);
    expect(message).toContain("towards General Fund");
  });

  it("shows the reason in place of a message when a pledge template has no pledge", () => {
    expect(thankYouMessage({ type: "pledgeFulfillment", pledgeId: null, fundId: null }, context([active]))).toBe(
      noPledgeNote("pledgeFulfillment")
    );
    expect(thankYouMessage({ type: "pledgeChaser", pledgeId: null, fundId: null }, context([]))).toBe(
      "No pledges found for this donor. Please add a pledge first."
    );
  });

  it("falls back to the General Fund when no fund is chosen", () => {
    const message = thankYouMessage({ type: "generalUpdate", pledgeId: null, fundId: null }, context([]));
    expect(message).toContain("towards General Fund");
  });

  it("leaves no template placeholders in any message with a full selection", () => {
    for (const type of TEMPLATE_TYPES) {
      const selection = defaultThankYouSelection(type, [active, completed], funds);
      const message = thankYouMessage(selection, context([active, completed]));
      expect(message, MESSAGE_TEMPLATES[type].name).not.toMatch(/\{[a-zA-Z]+\}/);
    }
  });
});
