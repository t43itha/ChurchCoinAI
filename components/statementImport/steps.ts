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
