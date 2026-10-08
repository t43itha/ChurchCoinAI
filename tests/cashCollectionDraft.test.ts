import { describe, expect, it } from "vitest";
import { sumMoney } from "../convex/lib/money";
import {
  countTotal,
  draftReducer,
  draftTotals,
  emptyLine,
  fromLedger,
  hasEntries,
  newDraft,
  parseAmount,
  presetDate,
  SERVICE_PRESETS,
  toPayload,
  type CashCount,
  type CollectionDraft,
  type CollectionPayload,
  type LedgerContext,
  type ServiceDraft,
  type TitheEnvelope,
} from "../lib/cashCollectionDraft";
import type { InPersonGivingLedger } from "../lib/inPersonGiving";

const ctx: LedgerContext = {
  generalFundId: "general",
  offeringCategory: "Offerings",
  titheCategory: "Tithes & First Fruits",
};

const presetFor = (id: string) => {
  const preset = SERVICE_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown preset ${id}`);
  return preset;
};

const named = (
  id: string,
  donorName: string,
  amount: string,
  method: TitheEnvelope["method"],
  giftAid: boolean,
  donorId?: string
): TitheEnvelope => ({
  id,
  ...(donorId ? { donorId } : {}),
  donorName,
  anonymous: false,
  amount,
  method,
  giftAid,
});

const anonymous = (id: string, amount: string, method: TitheEnvelope["method"]): TitheEnvelope => ({
  id,
  donorName: "",
  anonymous: true,
  amount,
  method,
  giftAid: false,
});

const fundLine = (fundId: string, cash: string, category?: string) => ({
  fundId,
  ...(category ? { category } : {}),
  cash,
  cheque: "",
  card: "",
  count: null,
});

const fridayCount: CashCount = {
  notes: { 50: 2, 20: 3 },
  coins: { "£1": "20", "2p & 1p": "6.40" },
};

const harvestCount: CashCount = {
  notes: { 20: 2, 10: 2 },
  coins: { "£1": "15" },
};

function sampleDraft(): CollectionDraft {
  const friday: ServiceDraft = {
    id: "fri",
    label: "Friday",
    date: "2026-10-02",
    offering: { cash: "186.40", cheque: "", card: "", count: fridayCount },
    funds: [fundLine("building", "60", "Building Fund")],
    programmes: [],
    tithes: [
      named("t-ruth-fri", "Ruth Adams", "40", "Cash", true, "donor-ruth"),
      named("t-sam-fri", "Sam Lee", "30", "Cheque", false),
    ],
  };
  const sunday: ServiceDraft = {
    id: "sun-am",
    label: "Sunday morning",
    date: "2026-10-04",
    offering: { cash: "412.70", cheque: "", card: "85", count: null },
    funds: [
      fundLine("building", ""),
      fundLine("keyboard", "45", "Donations"),
      fundLine("missions", ""),
    ],
    programmes: [
      { programmeId: "harvest", cash: "75.00", cheque: "", card: "", count: harvestCount },
    ],
    tithes: [
      named("t-ruth-sun", "Ruth Adams", "50", "Card", true, "donor-ruth"),
      named("t-sam-sun", "sam lee", "15", "Cash", false),
      named("t-blank", "Blank", "", "Cash", false),
      anonymous("t-anon-cash", "120", "Cash"),
      anonymous("t-anon-cheque", "35", "Cheque"),
    ],
  };
  return {
    weekEndingDate: "2026-10-04",
    services: [friday, sunday],
    notes: "",
    counters: ["", ""],
  };
}

const samplePayload: CollectionPayload = {
  weekEndingDate: "2026-10-04",
  collectionDate: "2026-10-02",
  notes: undefined,
  serviceRows: [
    {
      serviceDate: "2026-10-02",
      serviceNote: "Friday",
      fundId: "general",
      category: "Offerings",
      cash: 186.4,
      pdq: 0,
      cheque: 0,
    },
    {
      serviceDate: "2026-10-02",
      serviceNote: "Friday",
      fundId: "building",
      category: "Building Fund",
      cash: 60,
      pdq: 0,
      cheque: 0,
    },
    {
      serviceDate: "2026-10-04",
      serviceNote: "Sunday morning",
      fundId: "general",
      category: "Offerings",
      cash: 412.7,
      pdq: 85,
      cheque: 0,
    },
    {
      serviceDate: "2026-10-04",
      serviceNote: "Sunday morning",
      fundId: "keyboard",
      category: "Donations",
      cash: 45,
      pdq: 0,
      cheque: 0,
    },
    {
      serviceDate: "2026-10-04",
      serviceNote: "Sunday morning",
      fundId: "general",
      category: "Offerings",
      programmeId: "harvest",
      cash: 75,
      pdq: 0,
      cheque: 0,
    },
    {
      serviceDate: "2026-10-04",
      serviceNote: "Sunday morning",
      fundId: "general",
      category: "Tithes & First Fruits",
      cash: 120,
      pdq: 0,
      cheque: 35,
    },
  ],
  namedDonations: [
    {
      donorId: "donor-ruth",
      donorName: "Ruth Adams",
      category: "Tithes & First Fruits",
      fundId: "general",
      paymentMethod: "Cash",
      amount: 40,
      isGiftAidEligible: true,
      serviceDate: "2026-10-02",
      serviceNote: "Friday",
    },
    {
      donorName: "Sam Lee",
      category: "Tithes & First Fruits",
      fundId: "general",
      paymentMethod: "Cheque",
      amount: 30,
      isGiftAidEligible: false,
      serviceDate: "2026-10-02",
      serviceNote: "Friday",
    },
    {
      donorId: "donor-ruth",
      donorName: "Ruth Adams",
      category: "Tithes & First Fruits",
      fundId: "general",
      paymentMethod: "Card",
      amount: 50,
      isGiftAidEligible: true,
      serviceDate: "2026-10-04",
      serviceNote: "Sunday morning",
    },
    {
      donorName: "sam lee",
      category: "Tithes & First Fruits",
      fundId: "general",
      paymentMethod: "Cash",
      amount: 15,
      isGiftAidEligible: false,
      serviceDate: "2026-10-04",
      serviceNote: "Sunday morning",
    },
  ],
};

function ledgerFromPayload(payload: CollectionPayload): InPersonGivingLedger {
  return {
    collectionId: "collection-1",
    weekEndingDate: payload.weekEndingDate,
    status: "submitted",
    fundNames: [],
    fundTotals: [],
    total: 0,
    rows: payload.serviceRows.map((row, index) => ({
      id: `row-${index}`,
      day: "",
      serviceDate: row.serviceDate,
      serviceNote: row.serviceNote,
      fundId: row.fundId,
      fundName: row.fundId,
      category: row.category ?? ctx.offeringCategory,
      programmeId: row.programmeId,
      cash: row.cash,
      pdq: row.pdq,
      cheque: row.cheque,
      total: sumMoney([row.cash, row.pdq, row.cheque], (amount) => amount),
    })),
    namedDonations: payload.namedDonations.map((donation, index) => ({
      id: `donation-${index}`,
      donorId: donation.donorId,
      donorName: donation.donorName,
      category: donation.category,
      fundId: donation.fundId,
      fundName: donation.fundId,
      paymentMethod: donation.paymentMethod,
      isGiftAidEligible: donation.isGiftAidEligible,
      amount: donation.amount,
      serviceDate: donation.serviceDate,
      serviceNote: donation.serviceNote,
    })),
  };
}

describe("cash collection draft", () => {
  it("parses typed amounts to pence and treats anything else as zero", () => {
    expect(parseAmount("12.")).toBe(12);
    expect(parseAmount("12.3")).toBe(12.3);
    expect(parseAmount("")).toBe(0);
    expect(parseAmount("abc")).toBe(0);
    expect(parseAmount("-3")).toBe(0);
    expect(parseAmount("Infinity")).toBe(0);
    expect(parseAmount("£12")).toBe(12);
    expect(parseAmount("1,000.50")).toBe(1000.5);
    expect(parseAmount(" £ 2,500 ")).toBe(2500);
    expect(emptyLine()).toEqual({ cash: "", cheque: "", card: "", count: null });
  });

  it("counts notes and coins into a cash total", () => {
    expect(
      countTotal({
        notes: { 50: 2, 10: 1 },
        coins: { "£2": "4", "50p": "1.50", "2p & 1p": "0.36" },
      })
    ).toBe(115.86);
  });

  it("dates usual services from the Sunday week ending", () => {
    const draft = newDraft("2026-10-04", ["building"]);

    expect(draft.services.map((service) => [service.id, service.label, service.date])).toEqual([
      ["fri", "Friday", "2026-10-02"],
      ["sun-am", "Sunday morning", "2026-10-04"],
    ]);
    expect(draft.services[0].funds).toEqual([
      { fundId: "building", cash: "", cheque: "", card: "", count: null },
    ]);
    expect(draft.services[0].tithes).toEqual([]);
    expect(draft.services[0].programmes).toEqual([]);
    expect(draft.notes).toBe("");
    expect(draft.counters).toEqual(["", ""]);
  });

  it("computes preset dates in UTC across the spring clock change", () => {
    const weekEnding = "2026-03-29";
    expect(presetDate(weekEnding, presetFor("fri"))).toBe("2026-03-27");
    expect(presetDate(weekEnding, presetFor("mon"))).toBe("2026-03-23");
    expect(presetDate(weekEnding, presetFor("sun-pm"))).toBe("2026-03-29");
  });

  it("totals a sample week by fund, programme, method, Gift Aid and slip", () => {
    const totals = draftTotals(sampleDraft(), ctx);

    expect(totals.grand).toBe(1154.1);
    expect(totals.byFund.map((fund) => fund.fundId)).toEqual(["general", "building", "keyboard"]);
    expect(totals.byFund).toEqual([
      { fundId: "general", total: 1049.1 },
      { fundId: "building", total: 60 },
      { fundId: "keyboard", total: 45 },
    ]);
    expect(totals.byProgramme).toEqual([{ programmeId: "harvest", total: 75 }]);
    expect(totals.byMethod).toEqual({ cash: 954.1, cheque: 65, card: 135 });
    expect(totals.giftAidEligible).toBe(90);
    expect(totals.slip).toEqual({
      notes: { 50: 2, 20: 5, 10: 2 },
      coins: 41.4,
      counted: 261.4,
    });
    expect(totals.namedCount).toBe(4);
    expect(totals.anonymousCount).toBe(2);
    expect(totals.noDeclaration).toEqual([{ donorName: "Sam Lee", total: 45 }]);
  });

  it("builds the payload with one anonymous tithe row and named donations", () => {
    expect(toPayload(sampleDraft(), ctx)).toEqual(samplePayload);
  });

  it("writes counters and notes into the payload notes", () => {
    const payload = toPayload(
      { ...sampleDraft(), notes: "  Harvest weekend ", counters: ["Ruth", " Sam "] },
      ctx
    );
    expect(payload.notes).toBe("Harvest weekend\nCounted by Ruth and Sam");

    const solo = toPayload({ ...sampleDraft(), notes: "", counters: ["Ruth", ""] }, ctx);
    expect(solo.notes).toBe("Counted by Ruth");
  });

  it("restores a saved collection through fromLedger and saves it back unchanged", () => {
    const restored = fromLedger(ledgerFromPayload(samplePayload), ctx);

    expect(restored.weekEndingDate).toBe("2026-10-04");
    expect(restored.services.map((service) => [service.id, service.date])).toEqual([
      ["fri", "2026-10-02"],
      ["sun-am", "2026-10-04"],
    ]);

    const [friday, sunday] = restored.services;
    expect(friday.offering).toEqual({ cash: "186.40", cheque: "", card: "", count: null });
    expect(friday.funds).toEqual([
      { fundId: "building", category: "Building Fund", cash: "60.00", cheque: "", card: "", count: null },
    ]);
    expect(sunday.offering).toEqual({ cash: "412.70", cheque: "", card: "85.00", count: null });
    expect(sunday.programmes).toEqual([
      { programmeId: "harvest", cash: "75.00", cheque: "", card: "", count: null },
    ]);
    expect(sunday.tithes.filter((envelope) => envelope.anonymous)).toEqual([
      { id: "sun-am-anon-0", donorName: "", anonymous: true, amount: "120.00", method: "Cash", giftAid: false },
      { id: "sun-am-anon-1", donorName: "", anonymous: true, amount: "35.00", method: "Cheque", giftAid: false },
    ]);
    expect(sunday.tithes.filter((envelope) => !envelope.anonymous)).toMatchObject([
      { donorId: "donor-ruth", donorName: "Ruth Adams", amount: "50.00", method: "Card", giftAid: true },
      { donorName: "sam lee", amount: "15.00", method: "Cash", giftAid: false },
    ]);
    expect(friday.tithes).toMatchObject([
      { donorId: "donor-ruth", donorName: "Ruth Adams", amount: "40.00", method: "Cash", giftAid: true },
      { donorName: "Sam Lee", amount: "30.00", method: "Cheque", giftAid: false },
    ]);

    expect(toPayload(restored, ctx)).toEqual(samplePayload);
  });

  it("creates a custom service for named gifts when the ledger has no service rows", () => {
    const ledger: InPersonGivingLedger = {
      ...ledgerFromPayload(samplePayload),
      rows: [],
      namedDonations: [
        {
          id: "wedding-gift",
          donorName: "Grace Hall",
          category: "Tithes & First Fruits",
          fundId: "general",
          fundName: "General Fund",
          isGiftAidEligible: false,
          amount: 25,
          serviceDate: "2026-10-04",
          serviceNote: "Wedding",
        },
      ],
    };

    const restored = fromLedger(ledger, ctx);

    expect(restored.services).toHaveLength(1);
    expect(restored.services[0]).toMatchObject({
      id: "custom-2026-10-04-Wedding",
      label: "Wedding",
      date: "2026-10-04",
      offering: { cash: "", cheque: "", card: "" },
    });
    expect(restored.services[0].tithes).toMatchObject([
      { id: "wedding-gift", donorName: "Grace Hall", amount: "25.00", method: "Cash" },
    ]);
  });

  it("reports whether a draft holds any non-zero amount", () => {
    const empty = newDraft("2026-10-04", ["building"]);
    expect(hasEntries(empty)).toBe(false);
    expect(hasEntries(draftReducer(empty, { type: "setAmount", serviceId: "fri", target: { kind: "fund", fundId: "building" }, field: "cash", value: "0" }))).toBe(false);
    expect(hasEntries(draftReducer(empty, { type: "setAmount", serviceId: "fri", target: { kind: "offering" }, field: "cash", value: "1" }))).toBe(true);
    expect(
      hasEntries(
        draftReducer(empty, {
          type: "addTithe",
          serviceId: "sun-am",
          envelope: anonymous("a", "5", "Cash"),
        })
      )
    ).toBe(true);
  });

  it("clears a line's count when its cash is typed, and keeps it for other fields", () => {
    const counted = draftReducer(newDraft("2026-10-04", []), {
      type: "applyCount",
      serviceId: "fri",
      target: { kind: "offering" },
      count: { notes: { 20: 2 }, coins: {} },
    });
    expect(counted.services[0].offering.cash).toBe("40.00");
    expect(counted.services[0].offering.count).toEqual({ notes: { 20: 2 }, coins: {} });

    const typed = draftReducer(counted, {
      type: "setAmount",
      serviceId: "fri",
      target: { kind: "offering" },
      field: "cash",
      value: "55",
    });
    expect(typed.services[0].offering).toEqual({ cash: "55", cheque: "", card: "", count: null });

    const card = draftReducer(counted, {
      type: "setAmount",
      serviceId: "fri",
      target: { kind: "offering" },
      field: "card",
      value: "5",
    });
    expect(card.services[0].offering).toEqual({
      cash: "40.00",
      cheque: "",
      card: "5",
      count: { notes: { 20: 2 }, coins: {} },
    });
  });

  it("sets cash from a count and clears it when the count is empty", () => {
    const base = newDraft("2026-10-04", []);

    const counted = draftReducer(base, {
      type: "applyCount",
      serviceId: "sun-am",
      target: { kind: "programme", programmeId: "harvest" },
      count: { notes: { 50: 1 }, coins: { "2p & 1p": "0.50" } },
    });
    expect(counted.services[1].programmes).toEqual([]);

    const withProgramme = draftReducer(base, {
      type: "addProgramme",
      serviceId: "sun-am",
      programmeId: "harvest",
    });
    const cashed = draftReducer(withProgramme, {
      type: "applyCount",
      serviceId: "sun-am",
      target: { kind: "programme", programmeId: "harvest" },
      count: { notes: { 50: 1 }, coins: { "2p & 1p": "0.50" } },
    });
    expect(cashed.services[1].programmes[0].cash).toBe("50.50");

    const emptied = draftReducer(cashed, {
      type: "applyCount",
      serviceId: "sun-am",
      target: { kind: "programme", programmeId: "harvest" },
      count: { notes: {}, coins: {} },
    });
    expect(emptied.services[1].programmes[0]).toMatchObject({ cash: "", count: null });
  });

  it("adds and removes fund, programme and tithe lines without duplicating them", () => {
    const base = newDraft("2026-10-04", ["building"]);
    const withFund = draftReducer(base, { type: "addFund", serviceId: "fri", fundId: "building" });
    expect(withFund.services[0].funds).toHaveLength(1);

    const withKeyboard = draftReducer(withFund, { type: "addFund", serviceId: "fri", fundId: "keyboard" });
    expect(withKeyboard.services[0].funds.map((line) => line.fundId)).toEqual(["building", "keyboard"]);
    expect(draftReducer(withKeyboard, { type: "removeFund", serviceId: "fri", fundId: "building" }).services[0].funds.map((line) => line.fundId)).toEqual(["keyboard"]);

    const withProgramme = draftReducer(base, { type: "addProgramme", serviceId: "sun-am", programmeId: "harvest" });
    const twice = draftReducer(withProgramme, { type: "addProgramme", serviceId: "sun-am", programmeId: "harvest" });
    expect(twice.services[1].programmes).toHaveLength(1);
    expect(draftReducer(twice, { type: "removeProgramme", serviceId: "sun-am", programmeId: "harvest" }).services[1].programmes).toEqual([]);
  });

  it("keeps services in date order when one is added", () => {
    const base = newDraft("2026-10-04", []);
    expect(base.services.map((service) => service.id)).toEqual(["fri", "sun-am"]);

    const withThursday = draftReducer(base, {
      type: "toggleService",
      presetId: "thu",
      usualFundIds: ["building"],
    });
    expect(withThursday.services.map((service) => service.id)).toEqual(["thu", "fri", "sun-am"]);
    expect(withThursday.services[0]).toMatchObject({
      label: "Thursday",
      date: "2026-10-01",
      funds: [{ fundId: "building", cash: "", cheque: "", card: "", count: null }],
    });

    const withEvening = draftReducer(withThursday, {
      type: "toggleService",
      presetId: "sun-pm",
      usualFundIds: [],
    });
    expect(withEvening.services.map((service) => service.id)).toEqual(["thu", "fri", "sun-am", "sun-pm"]);

    const withoutFriday = draftReducer(withEvening, {
      type: "toggleService",
      presetId: "fri",
      usualFundIds: [],
    });
    expect(withoutFriday.services.map((service) => service.id)).toEqual(["thu", "sun-am", "sun-pm"]);
  });

  it("moves preset service dates when the week changes and leaves custom services alone", () => {
    const base = newDraft("2026-10-04", ["building"]);
    const withCustom: CollectionDraft = {
      ...base,
      services: [
        ...base.services,
        {
          id: "custom-2026-10-07-Wedding",
          label: "Wedding",
          date: "2026-10-07",
          offering: emptyLine(),
          funds: [],
          programmes: [],
          tithes: [],
        },
      ],
    };

    const moved = draftReducer(withCustom, { type: "setWeek", weekEndingDate: "2026-10-11" });

    expect(moved.weekEndingDate).toBe("2026-10-11");
    expect(moved.services.map((service) => [service.id, service.date])).toEqual([
      ["fri", "2026-10-09"],
      ["sun-am", "2026-10-11"],
      ["custom-2026-10-07-Wedding", "2026-10-07"],
    ]);
  });

  it("prepends new envelopes so the newest is first", () => {
    const base = newDraft("2026-10-04", []);
    const once = draftReducer(base, {
      type: "addTithe",
      serviceId: "sun-am",
      envelope: named("t1", "First", "10", "Cash", false),
    });
    const twice = draftReducer(once, {
      type: "addTithe",
      serviceId: "sun-am",
      envelope: named("t2", "Second", "20", "Cash", false),
    });

    expect(twice.services[1].tithes.map((envelope) => envelope.id)).toEqual(["t2", "t1"]);
    expect(draftReducer(twice, { type: "removeTithe", serviceId: "sun-am", envelopeId: "t2" }).services[1].tithes.map((envelope) => envelope.id)).toEqual(["t1"]);
  });

  it("sets notes and counters on the draft", () => {
    const base = newDraft("2026-10-04", []);
    const noted = draftReducer(base, { type: "setNotes", notes: "Rain" });
    const countedOnce = draftReducer(noted, { type: "setCounter", index: 0, value: "Ruth" });
    const countedTwice = draftReducer(countedOnce, { type: "setCounter", index: 1, value: "Sam" });

    expect(countedTwice.notes).toBe("Rain");
    expect(countedTwice.counters).toEqual(["Ruth", "Sam"]);
  });

  it("never mutates the draft it is given", () => {
    const draft = sampleDraft();
    const snapshot = structuredClone(draft);

    draftReducer(draft, { type: "setAmount", serviceId: "fri", target: { kind: "offering" }, field: "cash", value: "1" });
    draftReducer(draft, { type: "applyCount", serviceId: "fri", target: { kind: "offering" }, count: { notes: { 5: 1 }, coins: {} } });
    draftReducer(draft, { type: "toggleService", presetId: "thu", usualFundIds: ["building"] });
    draftReducer(draft, { type: "setWeek", weekEndingDate: "2026-10-11" });
    draftReducer(draft, { type: "addTithe", serviceId: "sun-am", envelope: anonymous("x", "9", "Cash") });
    draftReducer(draft, { type: "removeTithe", serviceId: "sun-am", envelopeId: "t-blank" });
    draftReducer(draft, { type: "setNotes", notes: "changed" });
    draftReducer(draft, { type: "setCounter", index: 1, value: "Sam" });

    expect(draft).toEqual(snapshot);
  });
});
