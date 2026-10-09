import { describe, expect, it } from "vitest";
import {
  buildCampaignFund,
  buildPledgeInput,
  campaignNameReady,
  campaignSplit,
  campaignTargetReady,
  endsLabel,
  initials,
  pledgeAmountReady,
  pledgeFormReady,
  pledgeOutstandingPence,
  pledgeTag,
  railState,
  whatsAppUrl,
} from "../components/campaigns/logic";
import type { Fund, Pledge, Transaction } from "../types";

const TODAY = "2026-10-09";

const pledge = (overrides: Partial<Pledge> = {}): Pledge => ({
  _id: "pledge-1",
  donorName: "Grace Okafor",
  amount: 1000,
  fundId: "fund-roof",
  frequency: "Monthly",
  startDate: "2026-01-01",
  status: "Active",
  ...overrides,
});

const income = (overrides: Partial<Transaction> = {}): Transaction =>
  ({
    _id: "tx-1",
    date: "2026-10-01",
    description: "Gift",
    amount: 100,
    type: "Income",
    category: "Donations",
    fundId: "fund-roof",
    isReconciled: false,
    ...overrides,
  }) as Transaction;

const fund = (overrides: Partial<Fund> = {}): Fund => ({
  _id: "fund-roof",
  name: "Roof appeal",
  type: "Restricted",
  balance: 0,
  ...overrides,
});

describe("campaignSplit", () => {
  it("splits the target into received, pledged still to come and to find", () => {
    // £38,200 received, £8,400 still owed on pledges, against a £60,000 target.
    expect(campaignSplit(60_000, 38_200, 840_000)).toEqual({ received: 38_200, pledged: 8_400, toFind: 13_400 });
  });

  it("caps received at the target and leaves nothing to find or pledge", () => {
    expect(campaignSplit(60_000, 70_000, 500_000)).toEqual({ received: 60_000, pledged: 0, toFind: 0 });
  });

  it("caps pledges still to come at what is left of the target", () => {
    expect(campaignSplit(60_000, 50_000, 9_000_000)).toEqual({ received: 50_000, pledged: 10_000, toFind: 0 });
  });

  it("adds back to the target in pence", () => {
    const split = campaignSplit(1_000.1, 333.33, 12_345);
    expect(Math.round((split.received + split.pledged + split.toFind) * 100)).toBe(100_010);
  });
});

describe("pledgeOutstandingPence", () => {
  it("is what an active pledge still owes", () => {
    expect(pledgeOutstandingPence({ amount: 100, status: "Active" }, 30)).toBe(7_000);
  });

  it("is nothing once a pledge is completed or cancelled, or overpaid", () => {
    expect(pledgeOutstandingPence({ amount: 100, status: "Completed" }, 0)).toBe(0);
    expect(pledgeOutstandingPence({ amount: 100, status: "Cancelled" }, 0)).toBe(0);
    expect(pledgeOutstandingPence({ amount: 100, status: "Active" }, 150)).toBe(0);
  });
});

describe("pledgeTag", () => {
  it("marks completed pledges as paid and cancelled ones as cancelled", () => {
    expect(pledgeTag(pledge({ status: "Completed" }), [], TODAY)).toBe("paid");
    expect(pledgeTag(pledge({ status: "Cancelled" }), [], TODAY)).toBe("cancelled");
  });

  it("marks a recurring pledge behind when nothing has come in within its window", () => {
    expect(pledgeTag(pledge(), [], TODAY)).toBe("behind");
  });

  it("keeps a recurring pledge on track when a payment falls inside its window", () => {
    const payment = income({ date: "2026-10-01", pledgeId: "pledge-1" });
    expect(pledgeTag(pledge(), [payment], TODAY)).toBe("onTrack");
  });

  it("never marks a one-off pledge behind", () => {
    expect(pledgeTag(pledge({ frequency: "One-off", startDate: "2025-01-01" }), [], TODAY)).toBe("onTrack");
  });
});

describe("endsLabel", () => {
  it("reads the days left to a deadline", () => {
    expect(endsLabel(fund({ deadline: "2027-01-31" }), TODAY)).toBe("Ends 31 January · 114 days left");
  });

  it("handles a deadline that is today, tomorrow, or past", () => {
    expect(endsLabel(fund({ deadline: TODAY }), TODAY)).toBe("Ends today");
    expect(endsLabel(fund({ deadline: "2026-10-10" }), TODAY)).toBe("Ends 10 October · 1 day left");
    expect(endsLabel(fund({ deadline: "2026-10-01" }), TODAY)).toBe("Ended 1 October");
  });

  it("says so when there is no end date", () => {
    expect(endsLabel(fund(), TODAY)).toBe("No end date set");
  });
});

describe("pledge form steps", () => {
  const form = { donorName: "", amount: "", frequency: "Monthly" as const, startDate: TODAY, endDate: "" };

  it("needs a donor name before the amount step", () => {
    expect(pledgeFormReady({ ...form, donorName: "   " })).toBe(false);
    expect(pledgeFormReady({ ...form, donorName: "Grace Okafor" })).toBe(true);
  });

  it("needs an amount above zero to add the pledge", () => {
    expect(pledgeAmountReady({ ...form, amount: "" })).toBe(false);
    expect(pledgeAmountReady({ ...form, amount: "0" })).toBe(false);
    expect(pledgeAmountReady({ ...form, amount: "abc" })).toBe(false);
    expect(pledgeAmountReady({ ...form, amount: "12.5" })).toBe(true);
  });

  it("builds the pledge, linking the donor the walkthrough picked or matches by name", () => {
    const donors = [{ _id: "donor-9", name: "Grace Okafor" }];
    const base = { ...form, donorName: "  grace okafor ", amount: "150", endDate: "" };

    expect(buildPledgeInput(base, { fundId: "fund-roof", donors, today: TODAY })).toEqual({
      donorName: "grace okafor",
      donorId: "donor-9",
      amount: 150,
      fundId: "fund-roof",
      frequency: "Monthly",
      startDate: TODAY,
      endDate: undefined,
      status: "Active",
    });

    const picked = buildPledgeInput({ ...base, donorId: "donor-2" }, { fundId: "fund-roof", donors, today: TODAY });
    expect(picked.donorId).toBe("donor-2");
  });

  it("leaves the donor unlinked when the name is new", () => {
    const input = buildPledgeInput({ ...form, donorName: "New Giver", amount: "20", startDate: "2026-02-01", endDate: "2026-12-31" }, { fundId: "fund-roof", donors: [], today: TODAY });
    expect(input.donorId).toBeUndefined();
    expect(input.startDate).toBe("2026-02-01");
    expect(input.endDate).toBe("2026-12-31");
  });
});

describe("new campaign steps", () => {
  const form = { name: "", target: "", endDate: "", description: "" };

  it("needs a name, and a target only when one is typed", () => {
    expect(campaignNameReady({ ...form, name: "  " })).toBe(false);
    expect(campaignNameReady({ ...form, name: "Roof appeal" })).toBe(true);
    expect(campaignTargetReady(form)).toBe(true);
    expect(campaignTargetReady({ ...form, target: "0" })).toBe(false);
    expect(campaignTargetReady({ ...form, target: "lots" })).toBe(false);
    expect(campaignTargetReady({ ...form, target: "60000" })).toBe(true);
  });

  it("creates a Restricted fund with the target and end date", () => {
    expect(buildCampaignFund({ name: " Roof appeal ", target: "60000", endDate: "2027-01-31", description: "" })).toEqual({
      name: "Roof appeal",
      type: "Restricted",
      description: undefined,
      targetAmount: 60_000,
      deadline: "2027-01-31",
    });
  });

  it("leaves the target and end date off when blank", () => {
    const created = buildCampaignFund({ ...form, name: "Hall" });
    expect(created.targetAmount).toBeUndefined();
    expect(created.deadline).toBeUndefined();
  });
});

describe("whatsAppUrl", () => {
  it("swaps a leading 0 for the UK country code and encodes the message", () => {
    expect(whatsAppUrl("07700 900123", "Thank you!")).toBe("https://wa.me/447700900123?text=Thank%20you!");
  });

  it("leaves an international number as it is", () => {
    expect(whatsAppUrl("+44 7700 900123", "Hi")).toBe("https://wa.me/447700900123?text=Hi");
  });
});

describe("railState", () => {
  it("marks steps before the current one done, the current one now, and the rest to do", () => {
    expect(railState(0, 1)).toBe("done");
    expect(railState(1, 1)).toBe("now");
    expect(railState(2, 1)).toBe("todo");
  });

  it("marks every step done on the Done screen", () => {
    expect(railState(0, 2)).toBe("done");
    expect(railState(1, 2)).toBe("done");
  });
});

describe("initials", () => {
  it("uses the first letter of the first two name words, skipping symbols", () => {
    expect(initials("James & Ruth Bailey")).toBe("JR");
    expect(initials("Grace Okafor")).toBe("GO");
    expect(initials("Harrison")).toBe("H");
  });
});
