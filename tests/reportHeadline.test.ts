import { describe, expect, it } from "vitest";
import { buildHeadline, pickMover, type HeadlineInput } from "../lib/reportHeadline";
import { rankCategoryGroups } from "../lib/reportSummary";

const month: HeadlineInput = {
  kind: "month",
  isComplete: true,
  net: 0,
  incomeChange: null,
  expenditureChange: null,
  comparisonLabel: "August",
};

describe("buildHeadline", () => {
  it("leads with a surplus and describes both sides against the comparison", () => {
    const headline = buildHeadline({
      ...month,
      net: 1860,
      incomeChange: 10.4,
      expenditureChange: 9,
      missionTitheDue: 1213,
      giftAidClaimable: 1320,
    });
    expect(headline).toEqual({
      tone: "surplus",
      status: "Surplus",
      lead: "A £1,860 surplus",
      rest: ". Income was up 10% on August; spending rose 9%. £1,213 mission tithe is due and £1,320 of Gift Aid can be claimed.",
    });
  });

  it("uses the absolute value for a deficit and says so while the period is in progress", () => {
    const headline = buildHeadline({
      ...month,
      isComplete: false,
      net: -420,
      incomeChange: -4.2,
      expenditureChange: 0.4,
    });
    expect(headline).toEqual({
      tone: "deficit",
      status: "Deficit",
      lead: "A £420 deficit",
      rest: " so far. Income was down 4% on August; spending held steady.",
    });
  });

  it("reports break-even when the net is within 50p of zero", () => {
    const headline = buildHeadline({ ...month, net: 0.2, incomeChange: 0.5, expenditureChange: null });
    expect(headline).toEqual({
      tone: "breakeven",
      status: "Break-even",
      lead: "Income and spending broke even",
      rest: ". Income was level with August.",
    });
  });

  it("uses 'is' for an unfinished year and adds the reserve cover, singular for one month", () => {
    const headline = buildHeadline({
      kind: "year",
      isComplete: false,
      net: 100,
      incomeChange: 3,
      expenditureChange: null,
      comparisonLabel: "the same months last year",
      reserveCoverMonths: 1,
    });
    expect(headline.rest).toBe(
      " so far. Income is up 3% on the same months last year. General fund reserves would cover 1 month of running costs."
    );
  });

  it("pluralises the reserve cover for fractional months", () => {
    const headline = buildHeadline({
      kind: "year",
      isComplete: true,
      net: 100,
      incomeChange: null,
      expenditureChange: null,
      comparisonLabel: "last year",
      reserveCoverMonths: 1.6,
    });
    expect(headline.rest).toBe(". General fund reserves would cover 1.6 months of running costs.");
  });

  it("names the movers and joins the income and spending sentences with a semicolon", () => {
    const headline = buildHeadline({
      ...month,
      net: 50,
      incomeChange: 12,
      expenditureChange: -15,
      incomeMover: { name: "Giving", change: 20 },
      expenditureMover: { name: "Utilities", change: -15 },
    });
    expect(headline.rest).toBe(". Income was up 12% on August, mostly Giving; spending fell 15%, mostly Utilities.");
  });

  it("starts with the spending sentence when income has no comparison", () => {
    const headline = buildHeadline({ ...month, net: -10, expenditureChange: 9 });
    expect(headline.rest).toBe(". Spending rose 9%.");
  });

  it("states one obligation on its own", () => {
    expect(buildHeadline({ ...month, net: 1, missionTitheDue: 1213 }).rest).toBe(
      ". £1,213 mission tithe is due."
    );
    expect(buildHeadline({ ...month, net: 1, giftAidClaimable: 1320 }).rest).toBe(
      ". £1,320 of Gift Aid can be claimed."
    );
  });

  it("adds no obligation or reserve sentences when there is no data", () => {
    expect(buildHeadline({ ...month, net: 0 }).rest).toBe(".");
    expect(buildHeadline({ ...month, net: 0, isComplete: false }).rest).toBe(" so far.");
  });
});

describe("mover wording", () => {
  it("only names a mover that moved the same way as the total", () => {
    const base = { ...month, net: 100, expenditureChange: null };
    expect(
      buildHeadline({ ...base, incomeChange: 10, incomeMover: { name: "Offerings", change: 31 } }).rest
    ).toBe(". Income was up 10% on August, mostly Offerings.");
    expect(
      buildHeadline({ ...base, incomeChange: 10, incomeMover: { name: "Events", change: -40 } }).rest
    ).toBe(". Income was up 10% on August.");
    expect(
      buildHeadline({ ...base, incomeChange: 0.4, incomeMover: { name: "Building Fund", change: -20 } }).rest
    ).toBe(". Income was level with August.");
  });
});

describe("pickMover", () => {
  it("picks the largest move in pounds among categories moving 10% or more", () => {
    expect(
      pickMover([
        { mainCategory: "Giving", total: 1200, previous: 1000 },
        { mainCategory: "Utilities", total: 105, previous: 100 },
        { mainCategory: "Rent", total: 50, previous: 0 },
        { mainCategory: "Travel", total: 400, previous: 100 },
        { mainCategory: "Misc", total: 1.5, previous: 1 },
      ])
    ).toEqual({ name: "Travel", change: 300 });
  });

  it("names a category that only existed in the comparison period", () => {
    const current = [{ mainCategory: "Offerings", total: 900, subcategories: [] }];
    const prior = [
      { mainCategory: "Offerings", total: 1000, subcategories: [] },
      { mainCategory: "Grants", total: 10000, subcategories: [] },
    ];
    expect(pickMover(rankCategoryGroups(current, prior))).toEqual({ name: "Grants", change: -100 });
  });

  it("is undefined when nothing moved enough", () => {
    expect(pickMover([{ mainCategory: "Utilities", total: 105, previous: 100 }])).toBeUndefined();
    expect(pickMover([])).toBeUndefined();
  });
});
