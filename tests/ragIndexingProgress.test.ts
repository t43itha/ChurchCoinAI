import { describe, expect, it } from "vitest";
import {
  getRagIndexingCompletionState,
  isRagIndexingSweepCursorCurrent,
} from "../convex/intelligence/ragIndexingProgress";

describe("RAG indexing sweep continuation", () => {
  it("accepts the initial page and the currently saved continuation", () => {
    expect(isRagIndexingSweepCursorCurrent()).toBe(true);
    expect(isRagIndexingSweepCursorCurrent("next-page", "next-page")).toBe(
      true
    );
  });

  it("rejects a stale or duplicate continuation", () => {
    expect(isRagIndexingSweepCursorCurrent("new-page", "old-page")).toBe(
      false
    );
    expect(isRagIndexingSweepCursorCurrent("new-page")).toBe(false);
  });
});

describe("RAG indexing completion", () => {
  it("does not complete while transaction scheduling is unfinished", () => {
    expect(
      getRagIndexingCompletionState({
        schedulingComplete: false,
        totalTransactions: 100,
        processedTransactions: 100,
        failedTransactions: 0,
      })
    ).toEqual({ isFinished: false, status: "running" });
  });

  it("completes only after all scheduled transactions succeed", () => {
    expect(
      getRagIndexingCompletionState({
        schedulingComplete: true,
        totalTransactions: 100,
        processedTransactions: 100,
        failedTransactions: 0,
      })
    ).toEqual({ isFinished: true, status: "completed" });
  });

  it("surfaces completed runs containing failed embeddings", () => {
    expect(
      getRagIndexingCompletionState({
        schedulingComplete: true,
        totalTransactions: 100,
        processedTransactions: 100,
        failedTransactions: 2,
      })
    ).toEqual({ isFinished: true, status: "completed_with_errors" });
  });
});
