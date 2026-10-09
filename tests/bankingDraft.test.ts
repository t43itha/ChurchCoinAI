import { describe, expect, it } from "vitest";
import {
  EMPTY_SEED,
  buildBankingView,
  choiceOf,
  creditDraftForMedium,
  defaultCollectionAmounts,
  defaultCreditDraft,
  filterCredits,
  hasEnoughNote,
  mediumOf,
  parseAmountInput,
  seedFromBanking,
  settleSelection,
  type BankCredit,
  type OpenCollection,
  type SavedBanking,
} from "../components/banking/draft";
import { countLabel, differenceText, historyDate, historyDetail } from "../components/banking/format";
import { gbp } from "../components/cashEntry/format";
import { signedGbp } from "../components/statementImport/format";

const collection: OpenCollection = {
  _id: "col-1",
  weekEndingDate: "2026-03-08",
  openCashAmount: 100,
  openChequeAmount: 50,
  openTotal: 150,
};

const credit: BankCredit = {
  _id: "tx-1",
  date: "2026-03-09",
  amount: 150,
  description: "BACS deposit",
  fundId: "fund-general",
  category: "Offerings",
};

describe("parseAmountInput", () => {
  it("treats blank input as not entered", () => {
    expect(parseAmountInput("")).toBeUndefined();
    expect(parseAmountInput("   ")).toBeUndefined();
  });

  it("reads a finite number, ignoring surrounding spaces", () => {
    expect(parseAmountInput(" 12.5 ")).toBe(12.5);
    expect(parseAmountInput("-3")).toBe(-3);
  });

  it("rejects text that is not wholly a number", () => {
    expect(parseAmountInput("12abc")).toBeUndefined();
    expect(parseAmountInput("NaN")).toBeUndefined();
    expect(parseAmountInput("Infinity")).toBeUndefined();
  });
});

describe("amount defaults and medium switching", () => {
  it("starts each collection with its full open cash and cheque amounts", () => {
    expect(defaultCollectionAmounts(collection)).toEqual({ cashAmount: "100.00", chequeAmount: "50.00" });
  });

  it("banks a new credit as cash for its full amount", () => {
    expect(defaultCreditDraft(credit)).toEqual({ medium: "cash", cashAmount: "150.00", chequeAmount: "" });
  });

  it("fills the whole amount into cheques when switching a credit to cheques", () => {
    const draft = creditDraftForMedium(credit, "cheque", defaultCreditDraft(credit));
    expect(draft).toEqual({ medium: "cheque", cashAmount: "", chequeAmount: "150.00" });
  });

  it("puts the whole amount into cash when switching from cheques to both", () => {
    const current = { medium: "cheque" as const, cashAmount: "", chequeAmount: "150.00" };
    expect(creditDraftForMedium(credit, "mixed", current)).toEqual({
      medium: "mixed",
      cashAmount: "150.00",
      chequeAmount: "",
    });
  });

  it("keeps what was typed when a credit is already in both and stays in both", () => {
    const current = { medium: "mixed" as const, cashAmount: "100", chequeAmount: "50" };
    expect(creditDraftForMedium(credit, "mixed", current)).toEqual({
      medium: "mixed",
      cashAmount: "100",
      chequeAmount: "50",
    });
  });

  it("maps the medium choices to the stored medium and back", () => {
    expect(mediumOf("Both")).toBe("mixed");
    expect(mediumOf("Cheques")).toBe("cheque");
    expect(choiceOf("cash")).toBe("Cash");
    expect(choiceOf("mixed")).toBe("Both");
  });
});

describe("buildBankingView", () => {
  it("matches the count when the bank credit equals the collections", () => {
    const view = buildBankingView({
      collections: [collection],
      overrides: {},
      credits: [credit],
      creditDrafts: {},
    });
    expect(view.collectionErrors).toEqual({});
    expect(view.creditErrors).toEqual({});
    expect(view.counted).toBe(150);
    expect(view.banked).toBe(150);
    expect(view.variance).toBe(0);
    expect(view.collectionTotals).toEqual({ "col-1": 150 });
  });

  it("counts only the part of a collection that was typed in", () => {
    const view = buildBankingView({
      collections: [collection],
      overrides: { "col-1": { cashAmount: "40", chequeAmount: "0" } },
      credits: [credit],
      creditDrafts: {},
    });
    expect(view.counted).toBe(40);
    expect(view.collectionTotals["col-1"]).toBe(40);
    // The bank shows 150 for 40 counted, so 110 more.
    expect(view.variance).toBe(110);
  });

  it("counts nothing for a collection that is not picked", () => {
    const view = buildBankingView({ collections: [], overrides: {}, credits: [], creditDrafts: {} });
    expect(view.counted).toBe(0);
    expect(view.banked).toBe(0);
    expect(view.variance).toBe(0);
  });

  it("reports a cash amount above what is open on the collection", () => {
    const view = buildBankingView({
      collections: [collection],
      overrides: { "col-1": { cashAmount: "150", chequeAmount: "0" } },
      credits: [],
      creditDrafts: {},
    });
    expect(view.collectionErrors["col-1"]).toContain("cannot exceed the open cash amount");
    expect(view.variance).toBeNull();
  });

  it("reports a cheque amount above what is open on the collection", () => {
    const view = buildBankingView({
      collections: [collection],
      overrides: { "col-1": { cashAmount: "0", chequeAmount: "51" } },
      credits: [],
      creditDrafts: {},
    });
    expect(view.collectionErrors["col-1"]).toContain("cannot exceed the open cheque amount");
  });

  it("reports a negative collection amount", () => {
    const view = buildBankingView({
      collections: [collection],
      overrides: { "col-1": { cashAmount: "-1", chequeAmount: "0" } },
      credits: [],
      creditDrafts: {},
    });
    expect(view.collectionErrors["col-1"]).toContain("cannot be negative");
  });

  it("reports a collection with both amounts at zero", () => {
    const view = buildBankingView({
      collections: [collection],
      overrides: { "col-1": { cashAmount: "0", chequeAmount: "0" } },
      credits: [],
      creditDrafts: {},
    });
    expect(view.collectionErrors["col-1"]).toContain("greater than zero");
  });

  it("reports text that is not an amount", () => {
    const view = buildBankingView({
      collections: [collection],
      overrides: { "col-1": { cashAmount: "abc", chequeAmount: "0" } },
      credits: [],
      creditDrafts: {},
    });
    expect(view.collectionErrors["col-1"]).toContain("Enter valid cash and cheque amounts");
  });

  it("asks for both amounts when a credit is in both but one is blank", () => {
    const view = buildBankingView({
      collections: [collection],
      overrides: {},
      credits: [credit],
      creditDrafts: { "tx-1": { medium: "mixed", cashAmount: "", chequeAmount: "150.00" } },
    });
    expect(view.creditErrors["tx-1"]).toBe("Enter both the cash and cheque amounts.");
    expect(view.variance).toBeNull();
  });

  it("accepts a credit in both when its parts add up to the amount", () => {
    const view = buildBankingView({
      collections: [collection],
      overrides: {},
      credits: [credit],
      creditDrafts: { "tx-1": { medium: "mixed", cashAmount: "100", chequeAmount: "50" } },
    });
    expect(view.creditErrors).toEqual({});
    expect(view.bankSplits).toEqual([{ transactionId: "tx-1", medium: "mixed", cashAmount: 100, chequeAmount: 50 }]);
    expect(view.variance).toBe(0);
  });

  it("reports a credit in both whose parts do not add up to its amount", () => {
    const view = buildBankingView({
      collections: [collection],
      overrides: {},
      credits: [credit],
      creditDrafts: { "tx-1": { medium: "mixed", cashAmount: "100", chequeAmount: "40" } },
    });
    expect(view.creditErrors["tx-1"]).toBe("Mixed bank split must equal the transaction amount");
  });

  it("reports a credit with no amount", () => {
    const zero: BankCredit = { ...credit, amount: 0 };
    const view = buildBankingView({ collections: [], overrides: {}, credits: [zero], creditDrafts: {} });
    expect(view.creditErrors["tx-1"]).toBe("Bank transaction amount must be greater than zero");
  });

  it("keeps the counted total for valid collections while another row is invalid, but hides the difference", () => {
    const other: OpenCollection = { ...collection, _id: "col-2", weekEndingDate: "2026-03-15" };
    const view = buildBankingView({
      collections: [collection, other],
      overrides: { "col-2": { cashAmount: "999", chequeAmount: "0" } },
      credits: [],
      creditDrafts: {},
    });
    expect(view.counted).toBe(150);
    expect(view.collectionErrors["col-2"]).toBeDefined();
    expect(view.variance).toBeNull();
  });
});

describe("seedFromBanking", () => {
  const saved: SavedBanking = {
    _id: "rec-1",
    cashCollectionIds: ["col-1"],
    cashCollectionSplits: [{ cashCollectionId: "col-1", cashAmount: 40, chequeAmount: 0 }],
    bankTransactionIds: ["tx-1", "tx-2", "tx-3"],
    bankTransactionSplits: [
      { transactionId: "tx-1", medium: "cash", cashAmount: 150, chequeAmount: 0 },
      { transactionId: "tx-2", medium: "mixed", cashAmount: 10, chequeAmount: 20 },
      { transactionId: "tx-3", medium: "cheque", cashAmount: 0, chequeAmount: 90 },
    ],
    varianceType: "partial_banking",
    varianceNote: "Part kept back",
  };

  it("loads exactly what the banking saved", () => {
    const seed = seedFromBanking(saved);
    expect(seed.collectionSelection).toEqual(["col-1"]);
    expect(seed.collectionOverrides).toEqual({ "col-1": { cashAmount: "40.00", chequeAmount: "0.00" } });
    expect(seed.creditSelection).toEqual(["tx-1", "tx-2", "tx-3"]);
    expect(seed.varianceType).toBe("partial_banking");
    expect(seed.varianceNote).toBe("Part kept back");
  });

  it("shows each saved credit in its own medium, leaving the unused box empty", () => {
    const seed = seedFromBanking(saved);
    expect(seed.creditDrafts["tx-1"]).toEqual({ medium: "cash", cashAmount: "150.00", chequeAmount: "" });
    expect(seed.creditDrafts["tx-2"]).toEqual({ medium: "mixed", cashAmount: "10.00", chequeAmount: "20.00" });
    expect(seed.creditDrafts["tx-3"]).toEqual({ medium: "cheque", cashAmount: "", chequeAmount: "90.00" });
  });

  it("has no variance to load when none was saved", () => {
    const seed = seedFromBanking({ ...saved, varianceType: undefined, varianceNote: undefined });
    expect(seed.varianceType).toBe("");
    expect(seed.varianceNote).toBe("");
  });

  it("starts a new banking with nothing touched", () => {
    expect(EMPTY_SEED.collectionSelection).toBeNull();
    expect(EMPTY_SEED.creditSelection).toEqual([]);
  });
});

describe("filterCredits", () => {
  const credits: BankCredit[] = [
    credit,
    { _id: "tx-2", date: "2026-03-10", amount: 20, description: "Standing order", notes: "Gift aid form" },
  ];

  it("returns every credit for an empty search", () => {
    expect(filterCredits(credits, "  ")).toHaveLength(2);
  });

  it("matches the description, ignoring case", () => {
    expect(filterCredits(credits, "bacs").map((item) => item._id)).toEqual(["tx-1"]);
  });

  it("matches the category and the notes too", () => {
    expect(filterCredits(credits, "offerings").map((item) => item._id)).toEqual(["tx-1"]);
    expect(filterCredits(credits, "gift aid").map((item) => item._id)).toEqual(["tx-2"]);
  });

  it("returns nothing when no credit matches", () => {
    expect(filterCredits(credits, "cheque 101")).toEqual([]);
  });
});

describe("hasEnoughNote", () => {
  it("needs three characters once spaces are trimmed", () => {
    expect(hasEnoughNote("ab")).toBe(false);
    expect(hasEnoughNote("  ab  ")).toBe(false);
    expect(hasEnoughNote("abc")).toBe(true);
  });
});

describe("difference and count wording", () => {
  it("shows a dash while the difference is unknown", () => {
    expect(differenceText(null)).toBe("—");
  });

  it("shows no sign when the two agree", () => {
    expect(differenceText(0)).toBe(gbp(0));
  });

  it("signs a non-zero difference", () => {
    expect(differenceText(10)).toBe(signedGbp(10));
    expect(differenceText(-10)).toBe(signedGbp(-10));
  });

  it("pluralises a count", () => {
    expect(countLabel(1, "collection")).toBe("1 collection");
    expect(countLabel(2, "collection")).toBe("2 collections");
  });

  it("shows what was counted in a history row, and any shortfall or excess", () => {
    expect(historyDetail({ cashCollectionIds: ["a"], expectedTotal: 150, varianceAmount: 0 })).toBe("1 collection · counted £150.00");
    expect(historyDetail({ cashCollectionIds: ["a", "b"], expectedTotal: 150, varianceAmount: -30 })).toBe(
      "2 collections · counted £150.00 · £30.00 short"
    );
    expect(historyDetail({ cashCollectionIds: ["a"], expectedTotal: 150, varianceAmount: 5 })).toBe("1 collection · counted £150.00 · £5.00 over");
  });

  it("writes a history date short, with September as Sep", () => {
    expect(historyDate("2026-09-14")).toBe("Mon 14 Sep 2026");
  });
});

describe("collections that arrive after the first load", () => {
  // What the walkthrough sends to updateDraft: the picked collections' splits, built the same way the component does.
  const splitsFor = (selection: Set<string>, available: OpenCollection[]) =>
    buildBankingView({
      collections: available.filter((collection) => selection.has(collection._id)),
      overrides: {},
      credits: [],
      creditDrafts: {},
    }).collectionSplits.map((split) => split.cashCollectionId);

  const late: OpenCollection = { ...collection, _id: "col-2", weekEndingDate: "2026-03-15" };

  it("ticks every open collection the first time they load", () => {
    const selection = settleSelection(null, [collection]);
    expect([...selection]).toEqual(["col-1"]);
  });

  it("leaves a collection that arrives later unticked, so it is not sent to updateDraft", () => {
    let selection = settleSelection(null, [collection]);
    // The live query now also returns a collection that was recorded after the walkthrough opened.
    selection = settleSelection(selection, [collection, late]);
    expect(splitsFor(selection, [collection, late])).toEqual(["col-1"]);
  });

  it("keeps the user's own ticks when the query changes again", () => {
    let selection = settleSelection(null, [collection, late]);
    selection = new Set([...selection].filter((id) => id !== "col-2"));
    selection = settleSelection(selection, [collection, late]);
    expect(splitsFor(selection, [collection, late])).toEqual(["col-1"]);
  });
});
