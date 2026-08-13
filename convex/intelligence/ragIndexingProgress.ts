export type RagIndexingTerminalStatus =
  | "running"
  | "completed"
  | "completed_with_errors";

export function isRagIndexingSweepCursorCurrent(
  savedCursor?: string,
  expectedCursor?: string
): boolean {
  return (savedCursor ?? null) === (expectedCursor ?? null);
}

export type PendingIndexingRecoveryAction = "wait" | "retry" | "fail";

export function getPendingIndexingRecoveryAction(args: {
  attempts: number;
  updatedAt: number;
  now: number;
  staleAfterMs: number;
  maxAttempts: number;
}): PendingIndexingRecoveryAction {
  if (args.updatedAt > args.now - args.staleAfterMs) return "wait";
  return args.attempts >= args.maxAttempts ? "fail" : "retry";
}

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
