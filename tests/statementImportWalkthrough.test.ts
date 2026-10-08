import { describe, expect, it } from "vitest";
import { buildImportSteps } from "../components/statementImport/steps";
import {
  bucketOf,
  categoryChoicesFor,
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
    expect(bucketOf(row("a"), prediction({ predictionSource: "rule" }), false, namesFor)).toBe("sure");
    expect(bucketOf(row("a"), prediction({ predictionSource: "memory" }), false, namesFor)).toBe("sure");
  });

  it("puts a high-confidence AI match in Likely, by label or by score", () => {
    expect(bucketOf(row("a"), prediction({ confidence: "High" }), false, namesFor)).toBe("likely");
    expect(bucketOf(row("a"), prediction({ confidence: "Low", confidenceScore: 0.85 }), false, namesFor)).toBe("likely");
  });

  it("leaves a low-confidence AI match in Needs you", () => {
    expect(bucketOf(row("a"), prediction({ confidence: "Low", confidenceScore: 0.5 }), false, namesFor)).toBe("needs");
  });

  it("puts a row with no valid category in Needs you, whatever the prediction says", () => {
    expect(bucketOf(row("a", { category: "" }), prediction({ predictionSource: "rule" }), false, namesFor)).toBe("needs");
    // An income category is not valid on an expenditure row.
    expect(bucketOf(row("a", { type: "Expenditure" }), prediction({ predictionSource: "rule" }), false, namesFor)).toBe("needs");
  });

  it("treats a row with no prediction as Needs you, even with a category", () => {
    expect(bucketOf(row("a"), undefined, false, namesFor)).toBe("needs");
  });

  it("moves an answered row to Sure", () => {
    expect(bucketOf(row("a"), prediction({ confidence: "Low" }), true, namesFor)).toBe("sure");
  });
});

describe("groupBuckets", () => {
  it("groups reviewRowIds in batch order", () => {
    const rows = [row("a", { category: "" }), row("b"), row("c")];
    const predictions = new Map([
      ["b", prediction({ predictionSource: "rule" })],
      ["c", prediction({ confidence: "High" })],
    ]);
    expect(groupBuckets(rows, predictions, new Set(), namesFor)).toEqual({
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
