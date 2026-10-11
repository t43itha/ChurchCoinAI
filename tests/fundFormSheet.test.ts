import { describe, expect, it } from "vitest";
import { fundUpdateFromDraft, type FundDraft } from "../components/funds/FundFormSheet";
import { FundType, type Fund } from "../types";

const fund: Fund = {
  _id: "roof",
  name: "Roof appeal",
  type: FundType.RESTRICTED,
  balance: 4200,
  targetAmount: 10000,
  deadline: "2027-06-01",
  description: "Slates and gutters",
  defaultIncomeCategory: "Offerings",
};

const draft = (overrides: Partial<FundDraft>): FundDraft => ({
  name: "Roof appeal",
  type: FundType.RESTRICTED,
  category: "Offerings",
  target: "10000",
  deadline: "2027-06-01",
  description: "Slates and gutters",
  ...overrides,
});

describe("fund edit arguments", () => {
  it("sends an explicit zero target so changing £10,000 to 0 clears it", () => {
    expect(fundUpdateFromDraft(fund, draft({ target: "0" })).targetAmount).toBe(0);
  });

  it("leaves the target alone when the field is blank", () => {
    expect(fundUpdateFromDraft(fund, draft({ target: "" })).targetAmount).toBeUndefined();
  });

  it("keeps a typed target as a number and trims the name", () => {
    expect(fundUpdateFromDraft(fund, draft({ name: "  Roof  ", target: "12500.5" }))).toEqual({
      ...fund,
      name: "Roof",
      targetAmount: 12500.5,
    });
  });
});
