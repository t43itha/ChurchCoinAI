import { CategorizationSource, ConfidenceLabel } from "./types";

export const confidenceLabel = (confidence: number): ConfidenceLabel => {
  if (confidence >= 0.85) return "High";
  if (confidence >= 0.65) return "Medium";
  return "Low";
};

export const isHighConfidence = (confidence: number): boolean =>
  confidence >= 0.85;

export const confidenceNeedsReview = (confidence: number): boolean =>
  confidence < 0.95;

export const defaultConfidenceForSource = (
  source: CategorizationSource
): number => {
  switch (source) {
    case "memory":
      return 0.95;
    case "rule":
      return 0.9;
    case "rag":
      return 0.86;
    case "gemini":
    case "openrouter":
    case "openai":
      return 0.72;
    case "none":
      return 0;
  }
};
