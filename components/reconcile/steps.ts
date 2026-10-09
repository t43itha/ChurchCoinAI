import type { RailStepState } from "../wizard/RailStep";

// The rail order. "done" is the finish screen and is never shown on the rail.
export const RAIL_ORDER = ["account", "balances", "tick", "finish"] as const;

export type RailKind = (typeof RAIL_ORDER)[number];
export type ReconcileStepKind = RailKind | "done";

export type SessionStatus = "draft" | "reopened" | "completed";

// Once the walkthrough reaches done, every step on the rail counts as finished.
export function railStateFor(kind: RailKind, current: ReconcileStepKind): RailStepState {
  if (current === "done") return "done";
  const at = RAIL_ORDER.indexOf(kind);
  const now = RAIL_ORDER.indexOf(current);
  return at < now ? "done" : at === now ? "now" : "todo";
}

// Where the walkthrough opens: a new reconciliation starts on the account, an open one
// picks up at the ticks, and a completed one shows its finished state.
export function startStepFor(status: SessionStatus | null): ReconcileStepKind {
  if (status === null) return "account";
  return status === "completed" ? "done" : "tick";
}

// The step on screen. The summary only exists for a completed session, so a stale "done"
// position for a session that is open again falls back to where that session opens.
export function resolveStep(position: ReconcileStepKind | null, status: SessionStatus | null): ReconcileStepKind {
  if (position === null) return startStepFor(status);
  if (position === "done") return status === "completed" ? "done" : startStepFor(status);
  return position;
}

// Back goes one step up the rail. A completed session is browsed read-only, so Back from
// balances returns to its summary rather than to the account step, which is locked.
export function previousStepFor(step: ReconcileStepKind, completed: boolean): ReconcileStepKind | undefined {
  if (step === "done") return undefined;
  const index = RAIL_ORDER.indexOf(step);
  if (index === 0) return undefined;
  if (completed && index === 1) return "done";
  return RAIL_ORDER[index - 1];
}

// The account and balances steps hold edits that only their Next button saves.
export function holdsUnsavedEdits(step: ReconcileStepKind): boolean {
  return step === "account" || step === "balances";
}

// True when an edit differs from the saved value. Typing a value back to the saved one is not pending.
export function hasPendingEdits<T extends object>(edits: Partial<T>, saved: T): boolean {
  return (Object.keys(edits) as Array<keyof T>).some((key) => edits[key] !== undefined && edits[key] !== saved[key]);
}

const pad = (value: number) => String(value).padStart(2, "0");

// The calendar month before `today` (YYYY-MM-DD), as the statement period.
// Works on the date parts alone, so no timezone can shift it.
export function previousMonthRange(today: string): { periodStart: string; periodEnd: string } {
  const [year, month] = today.split("-").map(Number);
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  // Day 0 of the following month is the last day of this one.
  const lastDay = new Date(Date.UTC(previousYear, previousMonth, 0)).getUTCDate();
  return {
    periodStart: `${previousYear}-${pad(previousMonth)}-01`,
    periodEnd: `${previousYear}-${pad(previousMonth)}-${pad(lastDay)}`,
  };
}
