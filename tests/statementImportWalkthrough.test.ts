import { describe, expect, it } from "vitest";
import { buildImportSteps, railStateFor } from "../components/statementImport/steps";
import {
  bucketOf,
  batchFundFor,
  hasValidFund,
  rowsMissingFund,
  categoryChoicesFor,
  applicableGroupIds,
  describeGroupKey,
  focusedRowId,
  groupBuckets,
  nextNeedsId,
  sameDescriptionRowIds,
  type CategoryNamesFor,
} from "../components/statementImport/buckets";
import type { OriginalPrediction, PendingReviewTransaction } from "../components/statementImport/types";

describe("buildImportSteps", () => {
  it("skips the fix step when every row read cleanly", () => {
    expect(buildImportSteps({ errorCount: 0 })).toEqual(["upload", "columns", "categorise", "check", "done"]);
  });

  it("puts the fix step between columns and categorise when rows were left behind", () => {
    expect(buildImportSteps({ errorCount: 3 })).toEqual(["upload", "columns", "fix", "categorise", "check", "done"]);
  });
});

const namesFor: CategoryNamesFor = (type) =>
  type === "Income" ? ["Offerings", "Gift Aid claim"] : type === "Expenditure" ? ["Insurance", "Hospitality"] : [];


// Every fund the rows below may be put in. Rows default to "general".
const FUNDS = new Set(["general", "missions"]);
const bucket = (
  row: PendingReviewTransaction,
  prediction: OriginalPrediction | undefined,
  approved: boolean
) => bucketOf(row, prediction, approved, namesFor, FUNDS);
const row = (id: string, overrides: Partial<PendingReviewTransaction> = {}): PendingReviewTransaction => ({
  reviewRowId: id,
  date: "2026-03-02",
  description: `Payee ${id}`,
  amount: 20,
  type: "Income",
  category: "Offerings",
  fundId: "general",
  ...overrides,
});

const prediction = (overrides: Partial<OriginalPrediction> = {}): OriginalPrediction => ({
  category: "Offerings",
  confidence: "Low",
  predictionSource: "gemini",
  ...overrides,
});

describe("bucketOf", () => {
  it("puts a valid rule or memory match in Sure", () => {
    expect(bucket(row("a"), prediction({ predictionSource: "rule" }), false)).toBe("sure");
    expect(bucket(row("a"), prediction({ predictionSource: "memory" }), false)).toBe("sure");
  });

  it("puts a high-confidence AI match in Likely, by label or by score", () => {
    expect(bucket(row("a"), prediction({ confidence: "High" }), false)).toBe("likely");
    expect(bucket(row("a"), prediction({ confidence: "Low", confidenceScore: 0.85 }), false)).toBe("likely");
  });

  it("leaves a low-confidence AI match in Needs you", () => {
    expect(bucket(row("a"), prediction({ confidence: "Low", confidenceScore: 0.5 }), false)).toBe("needs");
  });

  it("puts a row with no valid category in Needs you, whatever the prediction says", () => {
    expect(bucket(row("a", { category: "" }), prediction({ predictionSource: "rule" }), false)).toBe("needs");
    // An income category is not valid on an expenditure row.
    expect(bucket(row("a", { type: "Expenditure" }), prediction({ predictionSource: "rule" }), false)).toBe("needs");
  });

  it("treats a row with no prediction as Needs you, even with a category", () => {
    expect(bucket(row("a"), undefined, false)).toBe("needs");
  });

  it("moves an answered row to Sure", () => {
    expect(bucket(row("a"), prediction({ confidence: "Low" }), true)).toBe("sure");
  });

  it("does not trust a prediction whose category is not the row's current category", () => {
    // A suggestion for "Tithes & First Fruits" arrived after the row was kept as "Offerings".
    const kept = row("a", { category: "Offerings" });
    expect(bucket(kept, prediction({ category: "Tithes & First Fruits", predictionSource: "rule" }), false)).toBe("needs");
    expect(bucket(kept, prediction({ category: "Tithes & First Fruits", confidence: "High" }), false)).toBe("needs");
  });
});

describe("groupBuckets", () => {
  it("groups reviewRowIds in batch order", () => {
    const rows = [row("a", { category: "" }), row("b"), row("c")];
    const predictions = new Map([
      ["b", prediction({ predictionSource: "rule" })],
      ["c", prediction({ confidence: "High" })],
    ]);
    expect(groupBuckets(rows, predictions, new Set(), namesFor, FUNDS)).toEqual({
      sure: ["b"],
      likely: ["c"],
      needs: ["a"],
    });
  });
});

describe("describeGroupKey", () => {
  it("groups by lower-case text with digits and extra spaces removed", () => {
    expect(describeGroupKey("SUMUP *GRACE CAFE 0412")).toBe(describeGroupKey("sumup  *grace cafe"));
  });

  it("groups nothing when the description is only digits or missing", () => {
    expect(describeGroupKey("1234")).toBe("");
    expect(describeGroupKey(undefined)).toBe("");
  });
});

describe("sameDescriptionRowIds", () => {
  it("returns the other rows with the same description key", () => {
    const rows = [
      row("a", { description: "SUMUP *GRACE CAFE 01" }),
      row("b", { description: "sumup *grace cafe 02" }),
      row("c", { description: "BACS HMRC" }),
    ];
    expect(sameDescriptionRowIds(rows, "a")).toEqual(["b"]);
  });

  it("can be limited to rows still needing an answer", () => {
    const rows = [row("a", { description: "TESCO" }), row("b", { description: "TESCO" }), row("c", { description: "TESCO" })];
    expect(sameDescriptionRowIds(rows, "a", new Set(["c"]))).toEqual(["c"]);
  });

  it("returns nothing for a row with no description", () => {
    const rows = [row("a", { description: "" }), row("b", { description: "" })];
    expect(sameDescriptionRowIds(rows, "a")).toEqual([]);
  });

  it("never groups a row with one of the opposite transaction type", () => {
    const rows = [
      row("a", { description: "TESCO 123", type: "Income" }),
      row("b", { description: "TESCO 456", type: "Expenditure" }),
    ];
    expect(sameDescriptionRowIds(rows, "a")).toEqual([]);
  });
});

describe("applicableGroupIds", () => {
  const rows = [
    row("a", { description: "TESCO 123", type: "Income", category: "Offerings" }),
    row("b", { description: "TESCO 456", type: "Expenditure", category: "" }),
    row("c", { description: "TESCO 789", type: "Income", category: "" }),
    row("d", { description: "TESCO 999", type: "Expenditure", category: "" }),
  ];

  it("applies to the same-type rows only, and only where the category is valid for that type", () => {
    // Offerings is income-only, so the expenditure rows are never offered it.
    expect(applicableGroupIds(rows, "a", "Offerings", new Set(["b", "c", "d"]), namesFor)).toEqual(["c"]);
  });

  it("offers nothing when the category is not valid for the row's own type", () => {
    expect(applicableGroupIds(rows, "b", "Offerings", new Set(["a", "c"]), namesFor)).toEqual([]);
  });
});

describe("nextNeedsId", () => {
  const rows = [row("a"), row("b"), row("c"), row("d")];

  it("moves to the next row that needs an answer after the focused one", () => {
    expect(nextNeedsId(rows, ["a", "c"], "a")).toBe("c");
  });

  it("wraps to the first row that needs an answer when none follow", () => {
    expect(nextNeedsId(rows, ["a", "c"], "d")).toBe("a");
  });

  it("starts at the first row that needs an answer when nothing is focused", () => {
    expect(nextNeedsId(rows, ["b"], null)).toBe("b");
  });

  it("returns null when nothing needs an answer", () => {
    expect(nextNeedsId(rows, [], "a")).toBeNull();
  });

  it("moves on from the card shown when nothing is focused, not back onto it", () => {
    // The card shows the first row needing an answer, so Next must not return that same row.
    const shown = focusedRowId(rows, ["a", "c"], null);
    expect(shown).toBe("a");
    expect(nextNeedsId(rows, ["a", "c"], shown)).toBe("c");
  });
});

describe("focusedRowId", () => {
  const rows = [row("a"), row("b")];

  it("keeps the row just answered on the card, although it no longer needs an answer", () => {
    // After answering "a", only "b" needs one; the card must still show "a" until Next.
    expect(focusedRowId(rows, ["b"], "a")).toBe("a");
  });

  it("keeps the focused row while it is in the batch", () => {
    expect(focusedRowId(rows, ["a"], "b")).toBe("b");
  });

  it("falls back to the first row needing an answer when the focus is gone or unset", () => {
    expect(focusedRowId(rows, ["b"], "gone")).toBe("b");
    expect(focusedRowId(rows, ["b"], null)).toBe("b");
    expect(focusedRowId(rows, [], null)).toBeNull();
  });
});

describe("categoryChoicesFor", () => {
  const batch = [
    row("a", { category: "" }),
    row("b", { category: "Hospitality", type: "Expenditure" }),
    row("c", { category: "Insurance", type: "Expenditure" }),
    row("d", { category: "Insurance", type: "Expenditure" }),
    row("e", { category: "Hospitality", type: "Expenditure" }),
    row("f", { category: "Offerings", type: "Income" }),
  ];
  const target = row("x", { type: "Expenditure", category: "" });

  it("offers the valid suggestion first, then the most used categories for the type", () => {
    expect(categoryChoicesFor(target, batch, "Insurance", namesFor)).toEqual(["Insurance", "Hospitality"]);
  });

  it("ignores a suggestion that is not valid for the type", () => {
    expect(categoryChoicesFor(target, batch, "Offerings", namesFor)).toEqual(["Hospitality", "Insurance"]);
  });

  it("never offers more than three choices", () => {
    const wide: CategoryNamesFor = (type) =>
      type === "Expenditure" ? ["Insurance", "Hospitality", "Travel", "Printing"] : [];
    const busy = ["Travel", "Printing", "Insurance", "Hospitality"].map((category, index) =>
      row(`n${index}`, { type: "Expenditure", category })
    );
    expect(categoryChoicesFor(target, busy, "Printing", wide)).toHaveLength(3);
  });

  it("does not count the row being answered", () => {
    const only = [row("c", { type: "Expenditure", category: "Insurance" }), row("b", { type: "Expenditure", category: "Hospitality" })];
    const answering = only[0];
    // Insurance is used only by the row itself, so only Hospitality is a choice.
    expect(categoryChoicesFor(answering, only, undefined, namesFor)).toEqual(["Hospitality"]);
  });
});

describe("a row needs a valid fund as well as a category", () => {
  it("keeps a row with a category but no fund in Needs you, even when a rule matched", () => {
    const noFund = row("a", { fundId: undefined });
    expect(bucket(noFund, prediction({ predictionSource: "rule" }), false)).toBe("needs");
  });

  it("keeps an answered row without a fund in Needs you", () => {
    expect(bucket(row("a", { fundId: undefined }), undefined, true)).toBe("needs");
  });

  it("treats a fund that no longer exists as missing", () => {
    expect(bucket(row("a", { fundId: "deleted" }), prediction({ predictionSource: "rule" }), false)).toBe("needs");
  });

  it("sorts a row with a category and a fund as before", () => {
    expect(bucket(row("a"), prediction({ predictionSource: "rule" }), false)).toBe("sure");
  });

  it("reports which rows lack a valid fund, by index", () => {
    const rows = [row("a"), row("b", { fundId: undefined }), row("c", { fundId: "deleted" })];
    expect(rowsMissingFund(rows, FUNDS)).toEqual([1, 2]);
    expect(hasValidFund(rows[0], FUNDS)).toBe(true);
    expect(hasValidFund(rows[1], FUNDS)).toBe(false);
  });
});

describe("batchFundFor", () => {
  it("offers the batch fund for a row that has none", () => {
    expect(batchFundFor(row("a", { fundId: undefined }), "missions", FUNDS)).toBe("missions");
  });

  it("never overrides a fund the row already has", () => {
    expect(batchFundFor(row("a", { fundId: "general" }), "missions", FUNDS)).toBeUndefined();
  });

  it("offers nothing before the user has chosen a fund in this import", () => {
    expect(batchFundFor(row("a", { fundId: undefined }), null, FUNDS)).toBeUndefined();
  });

  it("offers nothing when the batch fund is no longer valid", () => {
    expect(batchFundFor(row("a", { fundId: undefined }), "deleted", FUNDS)).toBeUndefined();
  });
});

describe("railStateFor", () => {
  it("shows fix rows as a to-do before the file is mapped", () => {
    expect(railStateFor("fix", "upload", null)).toBe("todo");
    expect(railStateFor("fix", "columns", null)).toBe("todo");
  });

  it("shows fix rows as skipped only once the mapping has produced no errors", () => {
    expect(railStateFor("fix", "categorise", 0)).toBe("skipped");
    expect(railStateFor("fix", "check", 0)).toBe("skipped");
  });

  it("shows fix rows as now or done once there are errors to fix", () => {
    expect(railStateFor("fix", "fix", 2)).toBe("now");
    expect(railStateFor("fix", "categorise", 2)).toBe("done");
  });

  it("marks the steps before the current one done and the rest to do", () => {
    expect(railStateFor("upload", "columns", null)).toBe("done");
    expect(railStateFor("categorise", "columns", 0)).toBe("todo");
    expect(railStateFor("check", "check", 0)).toBe("now");
  });
});
