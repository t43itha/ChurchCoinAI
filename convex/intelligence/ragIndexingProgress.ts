export type RagIndexingTerminalStatus =
  | "running"
  | "completed"
  | "completed_with_errors";

export function getRagIndexingCompletionState(args: {
  schedulingComplete: boolean;
  totalTransactions: number;
  processedTransactions: number;
  failedTransactions: number;
}): { isFinished: boolean; status: RagIndexingTerminalStatus } {
  const isFinished =
    args.schedulingComplete &&
    args.processedTransactions >= args.totalTransactions;

  return {
    isFinished,
    status: isFinished
      ? args.failedTransactions > 0
        ? "completed_with_errors"
        : "completed"
      : "running",
  };
}
