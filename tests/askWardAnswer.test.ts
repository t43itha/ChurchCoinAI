import { describe, expect, it } from "vitest";
import { answerBlocks } from "../components/AICoPilot";

describe("answerBlocks", () => {
  it("splits blank-line separated text into paragraphs", () => {
    expect(answerBlocks("First point.\n\nSecond point.")).toEqual([
      { kind: "paragraph", text: "First point." },
      { kind: "paragraph", text: "Second point." },
    ]);
  });

  it("turns a run of dash or numbered lines into one list", () => {
    expect(answerBlocks("Top three:\n- Repairs £3,402.00\n- Utilities £2,186.40\n* Cleaning £730.00")).toEqual([
      { kind: "paragraph", text: "Top three:" },
      { kind: "list", items: ["Repairs £3,402.00", "Utilities £2,186.40", "Cleaning £730.00"] },
    ]);
    expect(answerBlocks("1. Gift Aid claims\n2) Pledges due")).toEqual([
      { kind: "list", items: ["Gift Aid claims", "Pledges due"] },
    ]);
  });

  it("keeps a plain line break inside a paragraph", () => {
    expect(answerBlocks("Income was up\nin September.")).toEqual([
      { kind: "paragraph", text: "Income was up in September." },
    ]);
  });

  it("ignores empty or whitespace-only answers", () => {
    expect(answerBlocks("")).toEqual([]);
    expect(answerBlocks("  \n\n  ")).toEqual([]);
  });
});
