export type RagIndexingTerminalStatus =
  | "running"
  | "completed"
  | "completed_with_errors";

export type RagIndexingSweepStatus =
  | "scheduled"
  | "running"
  | "failed"
  | "completed"
  | "completed_with_errors";

export function getRagIndexingSweepState(args: {
  organizationSchedulingComplete: boolean;
  childStatuses: Array<
    "scheduled" | "running" | "failed" | "completed" | "completed_with_errors"
  >;
}): { isFinished: boolean; status: RagIndexingSweepStatus } {
  if (args.childStatuses.includes("failed")) {
    return { isFinished: false, status: "failed" };
  }
  if (!args.organizationSchedulingComplete) {
    return { isFinished: false, status: "running" };
  }
  if (
    args.childStatuses.some(
      (status) => status === "scheduled" || status === "running"
    )
  ) {
    return { isFinished: false, status: "running" };
  }

  const completedWithErrors = args.childStatuses.includes(
    "completed_with_errors"
  );
  return {
    isFinished: true,
    status: completedWithErrors ? "completed_with_errors" : "completed",
  };
}

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
