import { describe, expect, it, vi } from "vitest";
import { getRCICategorySeedData } from "../constants/rciCategories";
import { runCategorisation } from "../components/statementImport/reviewLogic";
import type { PendingReviewTransaction } from "../components/statementImport/types";

// A £20 income row that the small-income defaults filled with "Offerings".
const smallIncome = (): PendingReviewTransaction => ({
  reviewRowId: "smith",
  date: "2026-03-05",
  description: "SMITH TITHE",
  amount: 20,
  type: "Income",
  category: "Offerings",
  fundId: "general",
});

const suggestion = {
  rowId: "smith",
  category: "Tithes & First Fruits",
  fundId: "general",
  isGiftAidEligible: false,
  donorName: null,
  confidence: 0.9,
  confidenceLabel: "High",
  predictionSource: "rule",
  requiresReview: false,
};

// A small store standing in for React state, so the test can edit rows while a suggestion is pending.
function store(initial: PendingReviewTransaction[]) {
  let rows = initial;
  return {
    get rows() {
      return rows;
    },
    setRows: (update: any) => {
      rows = typeof update === "function" ? update(rows) : update;
    },
  };
}

const run = (state: ReturnType<typeof store>, suggest: () => Promise<any>) =>
  runCategorisation({
    rows: state.rows,
    runCounter: { current: 0 },
    funds: [{ _id: "general", name: "General Fund" }, { _id: "missions", name: "Missions" }] as any,
    categories: getRCICategorySeedData(),
    suggest: vi.fn(suggest) as any,
    setRows: state.setRows,
    setCount: vi.fn(),
    setStatus: vi.fn(),
    setIsCategorising: vi.fn(),
  });

describe("runCategorisation predictions", () => {
  it("records no prediction for a row the user changed while the suggestion was pending", async () => {
    const state = store([smallIncome()]);
    let finish!: (value: any) => void;
    const response = new Promise((resolve) => { finish = resolve; });
    const running = run(state, () => {
      // The user moves the row to another fund while the request is in flight.
      state.setRows((rows: PendingReviewTransaction[]) => rows.map((row) => ({ ...row, fundId: "missions" })));
      return response;
    });
    finish([suggestion]);
    await running;

    expect(state.rows[0]).toMatchObject({ category: "Offerings", fundId: "missions" });
    expect(state.rows[0].originalPrediction).toBeUndefined();
  });

  it("records the prediction on the row for a suggestion that was applied", async () => {
    const state = store([smallIncome()]);
    await run(state, async () => [suggestion]);

    expect(state.rows[0].category).toBe("Tithes & First Fruits");
    expect(state.rows[0].originalPrediction).toMatchObject({
      category: "Tithes & First Fruits",
      predictionSource: "rule",
    });
  });
});
