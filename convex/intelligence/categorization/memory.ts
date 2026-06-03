export type MemoryConfidenceInput = {
  acceptedCount: number;
  confidence: number;
};

export const confidenceFromCounts = (
  acceptedCount: number,
  correctedCount: number
): number => {
  const base = acceptedCount >= 5 ? 0.95 : acceptedCount >= 3 ? 0.93 : 0.86;
  const penalty = Math.min(correctedCount * 0.08, 0.32);
  return Math.max(0.5, Number((base - penalty).toFixed(2)));
};

export const shouldUseMemorySuggestion = (
  memory: MemoryConfidenceInput
): boolean => memory.acceptedCount >= 3 && memory.confidence >= 0.9;
