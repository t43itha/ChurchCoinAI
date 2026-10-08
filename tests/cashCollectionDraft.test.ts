import { describe, expect, it } from "vitest";
import { sumMoney } from "../convex/lib/money";
import {
  countTotal,
  customServiceDateRange,
  draftReducer,
  draftTotals,
  editBlocker,
  emptyLine,
  fromLedger,
  hasEntries,
  missingFundLines,
  newDraft,
  parseAmount,
  parseStoredDraft,
  presetDate,
  pruneStoredDraft,
  SERVICE_PRESETS,
  toPayload,
  type CashCount,
  type CollectionDraft,
  type CollectionPayload,
  type LedgerContext,
  type ServiceDraft,
  type TitheEnvelope,
} from "../lib/cashCollectionDraft";
import type { InPersonGivingLedger, InPersonGivingLedgerRow } from "../lib/inPersonGiving";

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

const fundLine = (id: string, fundId: string, cash: string, category?: string) => ({
  id,
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
    funds: [fundLine("fri-building", "building", "60", "Building Fund")],
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
      fundLine("sun-building", "building", ""),
      fundLine("sun-keyboard", "keyboard", "45", "Donations"),
      fundLine("sun-missions", "missions", ""),
    ],
    programmes: [
      {
        id: "sun-harvest",
        programmeId: "harvest",
        cash: "75.00",
        cheque: "",
        card: "",
        count: harvestCount,
      },
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

// Builds the ledger a saved collection would read back as.
function ledgerFromPayload(payload: CollectionPayload): InPersonGivingLedger {
  return {
    collectionId: "collection-1",
    weekEndingDate: payload.weekEndingDate,
    collectionDate: payload.collectionDate,
    notes: payload.notes,
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

// Saving a loaded collection without changing anything must reproduce it.
const roundTrip = (payload: CollectionPayload) =>
  toPayload(fromLedger(ledgerFromPayload(payload), ctx), ctx);

const WEEK = "2026-10-04";
const SUNDAY = "2026-10-04";

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
      { id: "fri:fund:building", fundId: "building", cash: "", cheque: "", card: "", count: null },
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

  it("offers Saturday between Friday and Sunday", () => {
    expect(presetDate(WEEK, presetFor("sat"))).toBe("2026-10-03");
    expect(SERVICE_PRESETS.map((preset) => preset.id)).toEqual([
      "mon", "tue", "wed", "thu", "fri", "sat", "sun-am", "sun-pm",
    ]);
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
      {
        id: "fri:loaded-fund:0",
        fundId: "building",
        category: "Building Fund",
        cash: "60.00",
        cheque: "",
        card: "",
        count: null,
      },
    ]);
    expect(sunday.offering).toEqual({ cash: "412.70", cheque: "", card: "85.00", count: null });
    expect(sunday.programmes).toMatchObject([
      { programmeId: "harvest", fundId: "general", category: "Offerings", cash: "75.00", count: null },
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
    expect(hasEntries(draftReducer(empty, { type: "setAmount", serviceId: "fri", target: { kind: "offering" }, field: "cash", value: "0" }))).toBe(false);
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
      target: { kind: "programme", lineId: "p-harvest" },
      count: { notes: { 50: 1 }, coins: { "2p & 1p": "0.50" } },
    });
    expect(counted.services[1].programmes).toEqual([]);

    const withProgramme = draftReducer(base, {
      type: "addProgramme",
      serviceId: "sun-am",
      programmeId: "harvest",
      lineId: "p-harvest",
    });
    const cashed = draftReducer(withProgramme, {
      type: "applyCount",
      serviceId: "sun-am",
      target: { kind: "programme", lineId: "p-harvest" },
      count: { notes: { 50: 1 }, coins: { "2p & 1p": "0.50" } },
    });
    expect(cashed.services[1].programmes[0].cash).toBe("50.50");

    const emptied = draftReducer(cashed, {
      type: "applyCount",
      serviceId: "sun-am",
      target: { kind: "programme", lineId: "p-harvest" },
      count: { notes: {}, coins: {} },
    });
    expect(emptied.services[1].programmes[0]).toMatchObject({ cash: "", count: null });
  });

  it("adds and removes fund, programme and tithe lines without duplicating them", () => {
    const base = newDraft("2026-10-04", ["building"]);
    const withFund = draftReducer(base, { type: "addFund", serviceId: "fri", fundId: "building", lineId: "f-dup" });
    expect(withFund.services[0].funds).toHaveLength(1);

    const withKeyboard = draftReducer(withFund, {
      type: "addFund",
      serviceId: "fri",
      fundId: "keyboard",
      lineId: "f-keyboard",
    });
    expect(withKeyboard.services[0].funds.map((line) => line.fundId)).toEqual(["building", "keyboard"]);
    expect(
      draftReducer(withKeyboard, { type: "removeFund", serviceId: "fri", lineId: "fri:fund:building" }).services[0].funds.map(
        (line) => line.fundId
      )
    ).toEqual(["keyboard"]);

    const withProgramme = draftReducer(base, {
      type: "addProgramme",
      serviceId: "sun-am",
      programmeId: "harvest",
      lineId: "p-harvest",
    });
    const twice = draftReducer(withProgramme, {
      type: "addProgramme",
      serviceId: "sun-am",
      programmeId: "harvest",
      lineId: "p-again",
    });
    expect(twice.services[1].programmes).toHaveLength(1);
    expect(
      draftReducer(twice, { type: "removeProgramme", serviceId: "sun-am", lineId: "p-harvest" }).services[1].programmes
    ).toEqual([]);
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

  it("moves every service when the week changes, custom ones included", () => {
    const base = newDraft("2026-10-04", ["building"]);
    const withWedding = draftReducer(base, {
      type: "addCustomService",
      id: "wedding",
      label: "Wedding",
      date: "2026-10-03",
    });

    const moved = draftReducer(withWedding, { type: "setWeek", weekEndingDate: "2026-10-11" });

    expect(moved.weekEndingDate).toBe("2026-10-11");
    expect(moved.services.map((service) => [service.id, service.date])).toEqual([
      ["fri", "2026-10-09"],
      ["wedding", "2026-10-10"],
      ["sun-am", "2026-10-11"],
    ]);
  });

  it("adds a custom service within the week, sorted by date and then label", () => {
    const base = newDraft("2026-10-04", []);
    expect(customServiceDateRange(WEEK)).toEqual({ min: "2026-09-28", max: "2026-10-04" });

    const outside = draftReducer(base, {
      type: "addCustomService",
      id: "old",
      label: "Funeral",
      date: "2026-09-27",
    });
    expect(outside).toBe(base);

    const blank = draftReducer(base, { type: "addCustomService", id: "blank", label: "  ", date: WEEK });
    expect(blank).toBe(base);

    const added = draftReducer(
      draftReducer(base, { type: "addCustomService", id: "w", label: "Wedding", date: SUNDAY }),
      { type: "addCustomService", id: "a", label: "Anniversary", date: SUNDAY }
    );
    expect(added.services.map((service) => service.id)).toEqual(["fri", "sun-am", "a", "w"]);
    expect(added.services[2]).toMatchObject({ label: "Anniversary", date: SUNDAY, tithes: [] });
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

  describe("round trips a loaded collection exactly", () => {
    it("keeps a named donation in its restricted fund", () => {
      const payload: CollectionPayload = {
        weekEndingDate: WEEK,
        collectionDate: SUNDAY,
        notes: undefined,
        serviceRows: [
          {
            serviceDate: SUNDAY,
            serviceNote: "Sunday morning",
            fundId: "general",
            category: "Offerings",
            cash: 50,
            pdq: 0,
            cheque: 0,
          },
        ],
        namedDonations: [
          {
            donorName: "Grace Hall",
            category: "Tithes & First Fruits",
            fundId: "building",
            paymentMethod: "Cash",
            amount: 100,
            isGiftAidEligible: false,
            serviceDate: SUNDAY,
            serviceNote: "Sunday morning",
          },
        ],
      };

      expect(roundTrip(payload)).toEqual(payload);
    });

    it("keeps two rows of one programme on different funds and categories", () => {
      const payload: CollectionPayload = {
        weekEndingDate: WEEK,
        collectionDate: SUNDAY,
        notes: undefined,
        serviceRows: [
          {
            serviceDate: SUNDAY,
            serviceNote: "Sunday morning",
            fundId: "general",
            category: "Offerings",
            programmeId: "harvest",
            cash: 10,
            pdq: 0,
            cheque: 0,
          },
          {
            serviceDate: SUNDAY,
            serviceNote: "Sunday morning",
            fundId: "building",
            category: "Building Fund",
            programmeId: "harvest",
            cash: 0,
            pdq: 0,
            cheque: 20,
          },
        ],
        namedDonations: [],
      };

      expect(roundTrip(payload)).toEqual(payload);

      const totals = draftTotals(fromLedger(ledgerFromPayload(payload), ctx), ctx);
      expect(totals.byFund).toEqual([
        { fundId: "general", total: 10 },
        { fundId: "building", total: 20 },
      ]);
      expect(totals.byProgramme).toEqual([{ programmeId: "harvest", total: 30 }]);
    });

    it("keeps a donation on a date with no service row, under its own service", () => {
      const payload: CollectionPayload = {
        weekEndingDate: WEEK,
        collectionDate: "2026-10-02",
        notes: undefined,
        serviceRows: [
          {
            serviceDate: "2026-10-02",
            serviceNote: "Friday",
            fundId: "general",
            category: "Offerings",
            cash: 100,
            pdq: 0,
            cheque: 0,
          },
        ],
        namedDonations: [
          {
            donorName: "Grace Hall",
            category: "Tithes & First Fruits",
            fundId: "general",
            paymentMethod: "Cash",
            amount: 25,
            isGiftAidEligible: false,
            serviceDate: "2026-10-03",
            serviceNote: "Wedding",
          },
        ],
      };

      expect(roundTrip(payload)).toEqual(payload);
    });

    it("keeps a donation-only collection over two dates", () => {
      const payload: CollectionPayload = {
        weekEndingDate: WEEK,
        collectionDate: "2026-10-02",
        notes: undefined,
        serviceRows: [],
        namedDonations: [
          {
            donorName: "Grace Hall",
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
            serviceDate: SUNDAY,
            serviceNote: "Sunday morning",
          },
        ],
      };

      expect(roundTrip(payload)).toEqual(payload);
    });

    it("keeps a donation with no service note without giving it one", () => {
      const payload: CollectionPayload = {
        weekEndingDate: WEEK,
        collectionDate: "2026-10-02",
        notes: undefined,
        serviceRows: [
          {
            serviceDate: "2026-10-02",
            serviceNote: "Friday",
            fundId: "general",
            category: "Offerings",
            cash: 100,
            pdq: 0,
            cheque: 0,
          },
        ],
        namedDonations: [
          {
            donorName: "Grace Hall",
            category: "Tithes & First Fruits",
            fundId: "general",
            paymentMethod: "Cash",
            amount: 25,
            isGiftAidEligible: false,
            serviceDate: "2026-10-02",
          },
        ],
      };

      expect(roundTrip(payload)).toEqual(payload);
      const draft = fromLedger(ledgerFromPayload(payload), ctx);
      expect(draft.services.map((service) => service.label)).toEqual(["Friday", "Service"]);
    });

    it("edits one of two fund lines on the same fund and leaves its sibling alone", () => {
      const payload: CollectionPayload = {
        weekEndingDate: WEEK,
        collectionDate: SUNDAY,
        notes: undefined,
        serviceRows: [
          {
            serviceDate: SUNDAY,
            serviceNote: "Sunday morning",
            fundId: "general",
            category: "Offerings",
            cash: 30,
            pdq: 0,
            cheque: 0,
          },
          {
            serviceDate: SUNDAY,
            serviceNote: "Sunday morning",
            fundId: "building",
            category: "Donations",
            cash: 10,
            pdq: 0,
            cheque: 0,
          },
          {
            serviceDate: SUNDAY,
            serviceNote: "Sunday morning",
            fundId: "building",
            category: "Building Fund",
            cash: 20,
            pdq: 0,
            cheque: 0,
          },
        ],
        namedDonations: [],
      };
      expect(roundTrip(payload)).toEqual(payload);

      const draft = fromLedger(ledgerFromPayload(payload), ctx);
      const [donations, buildingFund] = draft.services[0].funds;
      expect(donations.category).toBe("Donations");
      expect(buildingFund.category).toBe("Building Fund");

      const edited = draftReducer(draft, {
        type: "setAmount",
        serviceId: "sun-am",
        target: { kind: "fund", lineId: donations.id },
        field: "cash",
        value: "15",
      });

      expect(toPayload(edited, ctx).serviceRows.filter((row) => row.fundId === "building")).toEqual([
        { serviceDate: SUNDAY, serviceNote: "Sunday morning", fundId: "building", category: "Donations", cash: 15, pdq: 0, cheque: 0 },
        { serviceDate: SUNDAY, serviceNote: "Sunday morning", fundId: "building", category: "Building Fund", cash: 20, pdq: 0, cheque: 0 },
      ]);
    });
  });

  it("keeps the notes and counters a collection was saved with, without duplicating them", () => {
    const ledger: InPersonGivingLedger = {
      ...ledgerFromPayload(samplePayload),
      notes: "Safe counted twice\nCounted by Ruth and Sam",
    };

    const draft = fromLedger(ledger, ctx);
    expect(draft.notes).toBe("Safe counted twice");
    expect(draft.counters).toEqual(["Ruth", "Sam"]);

    const payload = toPayload(draft, ctx);
    expect(payload.notes).toBe("Safe counted twice\nCounted by Ruth and Sam");

    const again = toPayload(fromLedger({ ...ledger, notes: payload.notes }, ctx), ctx);
    expect(again.notes).toBe("Safe counted twice\nCounted by Ruth and Sam");
  });

  it("keeps a counter whose name contains ' and ' intact", () => {
    const ledger: InPersonGivingLedger = {
      ...ledgerFromPayload(samplePayload),
      notes: "Counted by Ruth and Ann and Sam",
    };
    const draft = fromLedger(ledger, ctx);
    expect(draft.counters).toEqual(["Ruth and Ann", "Sam"]);
    expect(toPayload(draft, ctx).notes).toBe("Counted by Ruth and Ann and Sam");
  });

  it("keeps the collection date a saved collection was recorded with", () => {
    const ledger: InPersonGivingLedger = { ...ledgerFromPayload(samplePayload), collectionDate: "2026-10-03" };

    expect(toPayload(fromLedger(ledger, ctx), ctx).collectionDate).toBe("2026-10-03");
    expect(toPayload(newDraft(WEEK, []), ctx).collectionDate).toBe("2026-10-02");
  });

  it("flags a bank row and an online donation as not editable, and passes a clean collection", () => {
    const base = ledgerFromPayload({
      weekEndingDate: WEEK,
      collectionDate: "2026-10-02",
      notes: undefined,
      serviceRows: [
        {
          serviceDate: "2026-10-02",
          serviceNote: "Friday",
          fundId: "general",
          category: "Offerings",
          cash: 100,
          pdq: 0,
          cheque: 0,
        },
      ],
      namedDonations: [],
    });
    expect(editBlocker(base, ctx)).toBeNull();

    const bankRow: InPersonGivingLedgerRow = {
      id: "bank",
      day: "Fri",
      serviceDate: "2026-10-02",
      serviceNote: "Friday",
      fundId: "general",
      fundName: "General Fund",
      category: "Offerings",
      cash: 0,
      pdq: 0,
      cheque: 0,
      total: 20,
    };
    expect(editBlocker({ ...base, rows: [...base.rows, bankRow] }, ctx)).toMatch(/bank transfer/);

    const onlineGift = {
      id: "online",
      donorName: "Amy Ross",
      category: "Tithes & First Fruits",
      fundId: "general",
      fundName: "General Fund",
      paymentMethod: "Online" as const,
      isGiftAidEligible: false,
      amount: 15,
      serviceDate: "2026-10-02",
      serviceNote: "Friday",
    };
    expect(editBlocker({ ...base, namedDonations: [onlineGift] }, ctx)).toMatch(/Amy Ross/);

    const taggedGift = { ...onlineGift, id: "tagged", paymentMethod: "Cash" as const, programmeId: "harvest" };
    expect(editBlocker({ ...base, namedDonations: [taggedGift] }, ctx)).toMatch(/tagged to a programme/);
  });

  it("returns null for a stored draft that is malformed, and keeps a valid one", () => {
    expect(parseStoredDraft(undefined)).toBeNull();
    expect(parseStoredDraft("not a draft")).toBeNull();
    expect(parseStoredDraft({ savedAt: "2026-10-01T10:00:00Z", draftId: "draft-1", draft: { services: [{}] } })).toBeNull();

    const sample = JSON.parse(JSON.stringify(sampleDraft())) as Record<string, unknown>;
    const services = sample.services as Array<Record<string, unknown>>;
    const broken = { ...sample, services: [{ ...services[0], offering: { cash: 5, cheque: "", card: "", count: null } }] };
    expect(parseStoredDraft({ savedAt: "x", draftId: "draft-1", draft: broken })).toBeNull();

    const badCount = {
      ...sample,
      services: [{ ...services[0], offering: { cash: "1", cheque: "", card: "", count: { notes: { 7: 1 }, coins: {} } } }],
    };
    expect(parseStoredDraft({ savedAt: "x", draftId: "draft-1", draft: badCount })).toBeNull();

    const valid = { savedAt: "2026-10-01T10:00:00Z", draftId: "draft-1", draft: sampleDraft() };
    expect(parseStoredDraft(JSON.parse(JSON.stringify(valid)))).toEqual(valid);
  });

  it("keeps the write id that tells tabs whose copy is stored", () => {
    const stored = { savedAt: "2026-10-01T10:00:00Z", draftId: "draft-1", writeId: "write-7", draft: sampleDraft() };
    expect(parseStoredDraft(stored)?.writeId).toBe("write-7");
  });

  it("rejects a stored draft without a draftId, or with an empty one", () => {
    const draft = sampleDraft();
    expect(parseStoredDraft({ savedAt: "2026-10-01T10:00:00Z", draft })).toBeNull();
    expect(parseStoredDraft({ savedAt: "2026-10-01T10:00:00Z", draftId: "", draft })).toBeNull();
    expect(parseStoredDraft({ savedAt: "2026-10-01T10:00:00Z", draftId: 7, draft })).toBeNull();
  });

  it("keeps a fund line whose fund is gone, with its amount, and drops missing programmes and donor links", () => {
    const pruned = pruneStoredDraft(sampleDraft(), {
      fundIds: new Set(["general", "building"]),
      programmeIds: new Set(),
      donorIds: new Set(),
    });

    expect(pruned.services[1].funds.map((line) => line.fundId)).toEqual(["building", "keyboard", "missions"]);
    expect(pruned.services[1].funds[1]).toMatchObject({ fundId: "keyboard", cash: "45" });
    expect(pruned.services[1].programmes).toEqual([]);
    expect(pruned.services[1].tithes.filter((envelope) => !envelope.anonymous)[0]).toMatchObject({
      donorName: "Ruth Adams",
    });
    expect(pruned.services[1].tithes.filter((envelope) => !envelope.anonymous)[0].donorId).toBeUndefined();
  });

  it("lists fund lines whose fund is gone with their service, and none once every fund exists", () => {
    const missing = missingFundLines(sampleDraft(), new Set(["general", "building"]));
    expect(missing.map((entry) => [entry.serviceId, entry.serviceLabel, entry.line.id])).toEqual([
      ["sun-am", "Sunday morning", "sun-keyboard"],
      ["sun-am", "Sunday morning", "sun-missions"],
    ]);
    expect(missing[0].line.cash).toBe("45");
    expect(missingFundLines(sampleDraft(), new Set(["general", "building", "keyboard", "missions"]))).toEqual([]);
  });

  it("moves a fund line to another fund and keeps its id, amount and category", () => {
    const moved = draftReducer(sampleDraft(), {
      type: "reassignFundLine",
      serviceId: "sun-am",
      lineId: "sun-keyboard",
      fundId: "missions",
    });
    expect(moved.services[1].funds.find((line) => line.id === "sun-keyboard")).toEqual(
      fundLine("sun-keyboard", "missions", "45", "Donations")
    );
  });

  it("updates only the patched fields of an envelope, keeping its fund, category, donor and service note", () => {
    const envelope: TitheEnvelope = {
      id: "t-loaded",
      donorId: "donor-ruth",
      donorName: "Ruth Adams",
      anonymous: false,
      amount: "40",
      method: "Cash",
      giftAid: true,
      category: "Donations",
      fundId: "building",
      noServiceNote: true,
    };
    const added = draftReducer(sampleDraft(), { type: "addTithe", serviceId: "fri", envelope });

    const edited = draftReducer(added, {
      type: "updateEnvelope",
      serviceId: "fri",
      envelopeId: "t-loaded",
      patch: { amount: "55", method: "Cheque" },
    });
    expect(edited.services[0].tithes[0]).toEqual({ ...envelope, amount: "55", method: "Cheque" });

    const unGiftAided = draftReducer(edited, {
      type: "updateEnvelope",
      serviceId: "fri",
      envelopeId: "t-loaded",
      patch: { giftAid: false },
    });
    expect(unGiftAided.services[0].tithes[0]).toEqual({ ...envelope, amount: "55", method: "Cheque", giftAid: false });
  });
});
