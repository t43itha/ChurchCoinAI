import { describe, expect, it } from "vitest";
import {
  buildPledgeImport,
  emptyMapping,
  guessColumnMapping,
  linkImportedDonors,
  parseCsv,
} from "../components/campaigns/pledgeImport";
import type { Donor, Pledge } from "../types";

const TODAY = "2026-10-09";
const FUND = "fund-roof";

const donor = (overrides: Partial<Donor> = {}): Donor =>
  ({ _id: "donor-grace", name: "Grace Okafor", type: "Individual", email: "grace@example.invalid", ...overrides }) as Donor;

const pledge = (overrides: Partial<Pledge> = {}): Pledge => ({
  _id: "pledge-existing",
  donorName: "Grace Okafor",
  donorId: "donor-grace",
  amount: 150,
  fundId: FUND,
  frequency: "Monthly",
  startDate: "2026-01-01",
  status: "Active",
  ...overrides,
});

const mapping = { ...emptyMapping(), donor: "Name", amount: "Amount", frequency: "Frequency", phone: "Phone", commPref: "Contact" };
const headers = ["Name", "Amount", "Frequency", "Phone", "Contact"];

describe("parseCsv", () => {
  it("returns null when there is no data row", () => {
    expect(parseCsv("Name,Amount")).toBeNull();
  });

  it("keeps commas inside quoted cells and drops the quotes", () => {
    const parsed = parseCsv('Name,Amount\r\n"Okafor, Grace",150\n');
    expect(parsed).toEqual({ headers: ["Name", "Amount"], rows: [["Okafor, Grace", "150"]] });
  });
});

describe("guessColumnMapping", () => {
  it("maps each column to the first field it suits", () => {
    const guessed = guessColumnMapping(["Full Name", "Gift Amount", "Email Address", "Mobile", "Postcode", "Comm Pref"]);
    expect(guessed).toEqual({
      donor: "Full Name",
      amount: "Gift Amount",
      frequency: "",
      email: "Email Address",
      phone: "Mobile",
      address: "",
      postcode: "Postcode",
      commPref: "Comm Pref",
    });
  });
});

describe("buildPledgeImport", () => {
  it("skips rows with no donor name and reports them by sheet row", () => {
    const plan = buildPledgeImport({
      headers,
      rows: [["", "10", "Monthly", "", ""], ["Ruth Bailey", "20", "Monthly", "", ""]],
      mapping,
      donors: [],
      pledges: [],
      fundId: FUND,
      today: TODAY,
    });
    expect(plan.skippedRows).toEqual([{ row: 2, reason: "Empty donor name" }]);
    expect(plan.pledges.map((p) => p.donorName)).toEqual(["Ruth Bailey"]);
  });

  it("defaults the amount to 0 and reads the frequency words", () => {
    const plan = buildPledgeImport({
      headers,
      rows: [
        ["A", "£1,200.50", "Monthly", "", ""],
        ["B", "", "Yearly", "", ""],
        ["C", "abc", "weekly", "", ""],
      ],
      mapping,
      donors: [],
      pledges: [],
      fundId: FUND,
      today: TODAY,
    });
    expect(plan.pledges.map((p) => [p.amount, p.frequency])).toEqual([
      [1200.5, "Monthly"],
      [0, "Annual"],
      [0, "Weekly"],
    ]);
    expect(plan.pledges[0].startDate).toBe(TODAY);
    expect(plan.pledges[0].status).toBe("Active");
  });

  it("skips a pledge already on the fund for the same donor and amount", () => {
    const plan = buildPledgeImport({
      headers,
      rows: [["grace okafor", "150", "Monthly", "", ""], ["Grace Okafor", "75", "Monthly", "", ""]],
      mapping,
      donors: [donor()],
      pledges: [pledge()],
      fundId: FUND,
      today: TODAY,
    });
    expect(plan.skippedRows).toEqual([{ row: 2, reason: "Duplicate pledge exists (grace okafor, £150)" }]);
    expect(plan.pledges).toHaveLength(1);
    expect(plan.pledges[0].amount).toBe(75);
  });

  it("skips a repeat of the same donor and amount within the CSV", () => {
    const plan = buildPledgeImport({
      headers,
      rows: [["Ruth Bailey", "20", "", "", ""], ["ruth bailey", "20", "", "", ""]],
      mapping,
      donors: [],
      pledges: [],
      fundId: FUND,
      today: TODAY,
    });
    expect(plan.skippedRows).toEqual([{ row: 3, reason: "Duplicate in CSV batch (ruth bailey, £20)" }]);
  });

  it("keeps an existing donor's details unless the CSV gives new ones, and links existing donors by id", () => {
    const plan = buildPledgeImport({
      headers,
      rows: [["Grace Okafor", "40", "", "07700 900123", ""]],
      mapping,
      donors: [donor()],
      pledges: [],
      fundId: FUND,
      today: TODAY,
    });
    expect(plan.pledges[0].donorId).toBe("donor-grace");
    expect(plan.donors).toEqual([
      {
        name: "Grace Okafor",
        type: "Individual",
        email: "grace@example.invalid",
        phone: "07700 900123",
        address: undefined,
        postcode: undefined,
        communicationPreference: undefined,
      },
    ]);
  });

  it("merges repeated new donors so the last non-empty detail wins", () => {
    const plan = buildPledgeImport({
      headers,
      rows: [
        ["Ruth Bailey", "20", "", "", "Email"],
        ["Ruth Bailey", "30", "", "07700 900123", "Post"],
      ],
      mapping,
      donors: [],
      pledges: [],
      fundId: FUND,
      today: TODAY,
    });
    expect(plan.donors).toHaveLength(1);
    expect(plan.donors[0]).toMatchObject({
      name: "Ruth Bailey",
      type: "Individual",
      isGiftAidActive: false,
      phone: "07700 900123",
      communicationPreference: "Post",
    });
    expect(plan.pledges.map((p) => p.donorId)).toEqual([undefined, undefined]);
  });
});

describe("linkImportedDonors", () => {
  it("fills each pledge's donor id from the saved donor with the same name", () => {
    const plan = buildPledgeImport({
      headers,
      rows: [["Ruth Bailey", "20", "", "", ""]],
      mapping,
      donors: [],
      pledges: [],
      fundId: FUND,
      today: TODAY,
    });
    const linked = linkImportedDonors(plan, [{ id: "donor-ruth", name: "Ruth Bailey" }]);
    expect(linked[0].donorId).toBe("donor-ruth");
  });
});
