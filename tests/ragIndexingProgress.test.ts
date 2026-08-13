import { describe, expect, it } from "vitest";
import {
  getPendingIndexingRecoveryAction,
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

describe("pending indexing recovery", () => {
  const now = 1_000_000;
  const staleAfterMs = 60_000;

  it("waits for an in-flight action that is not stale", () => {
    expect(
      getPendingIndexingRecoveryAction({
        attempts: 1,
        updatedAt: now - 10_000,
        now,
        staleAfterMs,
        maxAttempts: 3,
      })
    ).toBe("wait");
  });

  it("retries a stale pending item with attempts remaining", () => {
    expect(
      getPendingIndexingRecoveryAction({
        attempts: 2,
        updatedAt: now - staleAfterMs,
        now,
        staleAfterMs,
        maxAttempts: 3,
      })
    ).toBe("retry");
  });

  it("turns an exhausted stale item into an explicit failure", () => {
    expect(
      getPendingIndexingRecoveryAction({
        attempts: 3,
        updatedAt: now - staleAfterMs,
        now,
        staleAfterMs,
        maxAttempts: 3,
      })
    ).toBe("fail");
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
