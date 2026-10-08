import { describe, expect, it } from "vitest";
import {
  acceptPairOnRows,
  bankSyncCheckpoint,
  getPipelineConfidenceLabel,
  getPipelineSourceLabel,
  importProblemNotice,
  pairPartnerLabel,
  predictionFromSuggestion,
  reindexSetAfterRemoval,
  undoPairOnRows,
} from "../components/statementImport/reviewLogic";
import type { PendingReviewTransaction } from "../components/statementImport/types";
import { getRCICategorySeedData } from "../constants/rciCategories";

const categories = getRCICategorySeedData();
// Only _id and name are read by the review logic under test.
const funds = [{ _id: "general", name: "General Fund" }] as any;

describe("categorisation labels", () => {
  it("labels each prediction source, with the RAG score when there is one", () => {
    expect(getPipelineSourceLabel("memory")).toBe("Memory Match");
    expect(getPipelineSourceLabel("rule")).toBe("Rule Match");
    expect(getPipelineSourceLabel("rag", 0.82)).toBe("RAG Match (82%)");
    expect(getPipelineSourceLabel("rag")).toBe("RAG Match");
    expect(getPipelineSourceLabel("gemini")).toBe("Gemini AI");
    expect(getPipelineSourceLabel("openai")).toBe("Luna AI (OpenAI)");
    expect(getPipelineSourceLabel("openrouter")).toBe("Luna AI");
    expect(getPipelineSourceLabel("none")).toBe("No AI suggestion");
  });

  it("prefers the confidence label, then a numeric confidence, then Low", () => {
    expect(getPipelineConfidenceLabel({ confidenceLabel: "High", confidence: 0.9 })).toBe("High");
    expect(getPipelineConfidenceLabel({ confidence: 0.4 })).toBe("0.4");
    expect(getPipelineConfidenceLabel({ confidence: "Medium" })).toBe("Medium");
    expect(getPipelineConfidenceLabel({})).toBe("Low");
  });

  it("keeps the source, confidence label and numeric score on the prediction for later corrections", () => {
    const prediction = predictionFromSuggestion({
      rowId: "a", category: "Offerings", fundId: "general", isGiftAidEligible: false, donorName: "J Smith",
      confidence: 0.91, confidenceLabel: "High", predictionSource: "rag", ragScore: 0.8,
    } as any);
    expect(prediction).toEqual({
      category: "Offerings", fundId: "general", isGiftAidEligible: false, donorName: "J Smith",
      confidence: "High", confidenceScore: 0.91, predictionSource: "rag", ragScore: 0.8,
    });
  });
});

describe("review batch helpers", () => {
  it("shifts indexes above a removed row down and drops the removed one", () => {
    expect([...reindexSetAfterRemoval(new Set([0, 2, 3]), 2)]).toEqual([0, 2]);
    expect([...reindexSetAfterRemoval(new Set([1]), 1)]).toEqual([]);
  });

  it("returns no notice when every row is importable", () => {
    const rows: PendingReviewTransaction[] = [
      { reviewRowId: "a", description: "Gift", date: "2026-09-21", amount: 10, type: "Income", category: "Offerings", fundId: "general" },
    ];
    expect(importProblemNotice(rows, categories, funds)).toBeNull();
  });

  it("names each problem and caps the labels listed per reason", () => {
    const rows: PendingReviewTransaction[] = Array.from({ length: 7 }, (_, i) => ({
      reviewRowId: `r${i}`, description: `Row ${i}`, date: "2026-09-21", amount: 10, type: "Income", category: "", fundId: "general",
    }));
    expect(importProblemNotice(rows, categories, funds)).toBe(
      'Every row needs a real date, a valid category and a valid fund before import. Choose a category for: "Row 0" (2026-09-21), "Row 1" (2026-09-21), "Row 2" (2026-09-21), "Row 3" (2026-09-21), "Row 4" (2026-09-21) and 2 more.'
    );
  });

  it("finds the latest bank date for one connection only", () => {
    const rows = [
      { source: "bank", bankConnectionId: "c1", date: "2026-09-02" },
      { source: "bank", bankConnectionId: "c1", date: "2026-09-10" },
      { source: "bank", bankConnectionId: "c2", date: "2026-09-30" },
      { date: "2026-09-29" },
    ] as unknown as PendingReviewTransaction[];
    expect(bankSyncCheckpoint(rows, "c1" as any)).toBe("2026-09-10");
    expect(bankSyncCheckpoint(rows, "c3" as any)).toBeNull();
  });
});

describe("pairing transforms", () => {
  const transferOut: PendingReviewTransaction = { reviewRowId: "a", date: "2026-08-03", amount: 300, type: "Expenditure", fundId: "general", category: "Transfer between funds" };
  const transferIn: PendingReviewTransaction = { reviewRowId: "b", date: "2026-08-05", amount: 300, type: "Income", fundId: "general", category: "Transfer between funds" };

  it("links both sides of an accepted import pair and undoes both", () => {
    const accepted = acceptPairOnRows([transferOut, transferIn], "a", { source: "import", id: "b" });
    expect(accepted[0].pairWith).toEqual({ source: "import", id: "b" });
    expect(accepted[1].pairWith).toEqual({ source: "import", id: "a" });
    const undone = undoPairOnRows(accepted, "a", { source: "import", id: "b" });
    expect(undone[0].pairWith).toBeUndefined();
    expect(undone[1].pairWith).toBeUndefined();
  });

  it("labels a partner from the batch or the ledger, with a fallback", () => {
    const pendingById = new Map([["b", { ...transferIn, description: "Building transfer" }]]);
    const ledgerById = new Map([["L1", { description: "", date: "2026-08-09" }]]);
    expect(pairPartnerLabel({ source: "import", id: "b" }, pendingById, ledgerById)).toBe("Building transfer, 05/08/2026");
    expect(pairPartnerLabel({ source: "ledger", id: "L1" }, pendingById, ledgerById)).toBe("No description, 09/08/2026");
    expect(pairPartnerLabel({ source: "ledger", id: "missing" }, pendingById, ledgerById)).toBe("another transaction");
  });
});
