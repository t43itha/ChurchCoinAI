export type ImportStepKind = "upload" | "columns" | "fix" | "categorise" | "check" | "done";

export interface ImportStepsInput {
  // Rows the column mapping could not read in this import. Kept after they are
  // fixed or left out, so the fix step stays on the rail for the rest of the import.
  errorCount: number;
}

// The walkthrough's steps in order. "fix" only appears when the mapping left
// rows behind; "done" is the finish and is never shown on the rail.
export function buildImportSteps({ errorCount }: ImportStepsInput): ImportStepKind[] {
  return [
    "upload",
    "columns",
    ...(errorCount > 0 ? (["fix"] as const) : []),
    "categorise",
    "check",
    "done",
  ];
}

// The order the steps are always shown in, including fix, which may be left out of
// the walk when the mapping produced no errors.
const RAIL_ORDER: ImportStepKind[] = ["upload", "columns", "fix", "categorise", "check", "done"];

export type RailState = "done" | "now" | "todo" | "skipped";

// The rail's state for one step. Fix rows are "skipped" only once the mapping has
// run and produced no errors (mappedErrors === 0). Before that they are a to-do.
export function railStateFor(kind: ImportStepKind, current: ImportStepKind, mappedErrors: number | null): RailState {
  if (kind === "fix" && mappedErrors === 0) return "skipped";
  const at = RAIL_ORDER.indexOf(kind);
  const now = RAIL_ORDER.indexOf(current);
  return at < now ? "done" : at === now ? "now" : "todo";
}
