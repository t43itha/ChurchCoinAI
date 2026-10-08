import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { notify } from "../../lib/notifications";
import { mapStatementRows, type MappingResult } from "../../lib/statementImport";
import { sumMoney } from "../../convex/lib/money";
import type { Fund } from "../../types";
import RailStep, { type RailStepState } from "../wizard/RailStep";
import { ReceiptRow } from "../wizard/Receipt";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import { btnLg, btnMd, btnOutline, btnPrimary, eyebrow, linkBtn } from "../wizard/ui";
import { buildImportSteps, type ImportStepKind } from "./steps";
import { isMappingComplete, parseStatementText, type ParsedStatement, type StatementSummary } from "./statementFile";
import { attemptFix, type Corrections, type FixableError } from "./fixRows";
import { applicableGroupIds, focusedRowId, groupBuckets, nextNeedsId, type CategoryNamesFor } from "./buckets";
import type { ImportReview } from "./useImportReview";
import type { PendingReviewTransaction } from "./types";
import UploadStep from "./UploadStep";
import ColumnsStep from "./ColumnsStep";
import FixRowsStep, { type FixOutcome, type FixStatus } from "./FixRowsStep";
import CategoriseStep, { type CategoriseView } from "./CategoriseStep";
import CheckStep, { importBlockers } from "./CheckStep";
import ImportDoneStep from "./ImportDoneStep";
import StatementReceipt from "./StatementReceipt";

const RAIL: Array<{ kind: ImportStepKind; label: string }> = [
  { kind: "upload", label: "Add statement" },
  { kind: "columns", label: "Check columns" },
  { kind: "fix", label: "Fix rows" },
  { kind: "categorise", label: "Categorise" },
  { kind: "check", label: "Check & import" },
];

const START_AGAIN_PROMPT = "Start this statement again? The rows you've reviewed will be dropped.";
const DISCARD_PROMPT = "Discard this import?";

export interface StatementImportWizardProps {
  funds: Fund[];
  categoryNamesFor: CategoryNamesFor;
  review: ImportReview;
  onClose: () => void;
  // Omitted when the user cannot reconcile, so no dead button is shown.
  onReconcile?: () => void;
  // Opens at a later step. The product always opens at upload; tests use it to render Check.
  initialStep?: ImportStepKind;
}

// Walkthrough for importing a bank CSV: add the file, check its columns, fix or
// leave out unreadable rows, categorise, then check and import.
export default function StatementImportWizard({
  funds,
  categoryNamesFor,
  review,
  onClose,
  onReconcile,
  initialStep,
}: StatementImportWizardProps) {
  const [step, setStep] = useState<ImportStepKind>(initialStep ?? "upload");
  const [fileName, setFileName] = useState("");
  const [statement, setStatement] = useState<ParsedStatement | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // The mapping result for the statement, set once "Looks right" has screened it into the review.
  const [mapped, setMapped] = useState<MappingResult | null>(null);
  // Keyed by the error's source line, which is stable for the whole import.
  const [fixStatuses, setFixStatuses] = useState<Map<number, FixStatus>>(() => new Map());
  // Partial fixes per source line: the problem it has now and the corrections kept so far.
  const [fixDrafts, setFixDrafts] = useState<Map<number, { error: FixableError; corrections: Corrections }>>(() => new Map());
  const [removedCount, setRemovedCount] = useState(0);
  // reviewRowIds the user has answered. These count as "Sure" in the buckets.
  const [approved, setApproved] = useState<Set<string>>(() => new Set());
  const [view, setView] = useState<CategoriseView>("needs");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState(0);
  // Categorisation runs once per import; coming back to this step must not wipe answers.
  const categoriseStarted = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const steps = buildImportSteps({ errorCount: mapped?.errors.length ?? 0 });
  const stepIndex = Math.max(0, steps.indexOf(step));
  // What each unresolved line says now: its original problem, or the next one after corrections.
  const errors: FixableError[] = (mapped?.errors ?? []).map((error) => fixDrafts.get(error.line)?.error ?? error);
  const draftCorrections = new Map([...fixDrafts].map(([line, draft]) => [line, draft.corrections] as const));
  const unresolved = errors.filter((error) => !fixStatuses.has(error.line));
  const leftOutErrors = [...fixStatuses.values()].filter((status) => status === "left-out").length;
  const buckets = groupBuckets(review.rows, review.predictions, approved, categoryNamesFor);
  const blockers = importBlockers(review.rows, funds, categoryNamesFor);
  const blocked = saving || review.rows.length === 0 || blockers.noCategory + blockers.noFund + blockers.badDate > 0;
  const pairedCount =
    Math.floor(review.rows.filter((row) => row.pairWith?.source === "import").length / 2) +
    review.rows.filter((row) => row.pairWith?.source === "ledger").length;
  // Rows held in the review that have not been confirmed.
  const pending = review.rows.length > 0 && step !== "done";

  const summary: StatementSummary = {
    rowsRead: statement ? statement.records.length : null,
    added: mapped ? review.rows.length : null,
    alreadyImported: review.alreadyImportedRows.length,
    skipped: mapped ? mapped.skipped.length : 0,
    needFix: unresolved.length,
    leftOut: leftOutErrors + removedCount,
    moneyIn: sumMoney(review.rows.filter((row) => row.type === "Income"), (row) => row.amount ?? 0),
    moneyOut: sumMoney(review.rows.filter((row) => row.type !== "Income"), (row) => row.amount ?? 0),
  };

  // Clears the held batch and everything the walkthrough learned from it.
  const resetReview = () => {
    review.clear();
    setMapped(null);
    setFixStatuses(new Map());
    setFixDrafts(new Map());
    setRemovedCount(0);
    setApproved(new Set());
    setView("needs");
    setFocusId(null);
    categoriseStarted.current = false;
  };

  const goTo = (target: ImportStepKind) => {
    if (saving) return;
    // Going back to the columns re-screens the file, so rows already reviewed would be dropped.
    if (mapped && (target === "upload" || target === "columns")) {
      if (!window.confirm(START_AGAIN_PROMPT)) return;
      resetReview();
    }
    setStep(target);
    bodyRef.current?.scrollTo({ top: 0 });
  };

  const goBack = () => {
    const previous = steps[stepIndex - 1];
    if (previous) goTo(previous);
  };

  // Categorisation starts by itself when the step opens. It runs from an effect so
  // it sees the rows that "Looks right" has just put in the review.
  useEffect(() => {
    if (step !== "categorise" || categoriseStarted.current) return;
    categoriseStarted.current = true;
    void review.categorise();
  }, [step, review]);

  const requestClose = useCallback(() => {
    if (saving) return;
    if (pending && !window.confirm(DISCARD_PROMPT)) return;
    review.clear();
    onClose();
  }, [saving, pending, review, onClose]);

  // Escape closes, through the same confirmation as the close button.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  const readFile = (file: File) => {
    if (saving) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setUploadError("Only .csv files for now. Choose the CSV export from your bank.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const outcome = parseStatementText(String(event.target?.result ?? ""));
      if (!outcome.ok) {
        setUploadError(outcome.message);
        return;
      }
      setUploadError(null);
      setFileName(file.name);
      setStatement(outcome.statement);
      setStep("columns");
    };
    reader.readAsText(file);
  };

  const changeLayout = (mapping: ParsedStatement["mapping"], split: boolean) => {
    setStatement((current) => (current ? { ...current, mapping, split } : current));
  };

  const lookRight = () => {
    if (!statement || saving) return;
    if (!isMappingComplete(statement.mapping, statement.split, statement.headers)) return;
    if (funds.length === 0) {
      notify("Error", "Add a fund before importing transactions.");
      return;
    }
    const result = mapStatementRows(statement.records, statement.headers, statement.mapping, statement.split);
    if (!review.startStatementReview(result)) return;
    setMapped(result);
    setFixStatuses(new Map());
    setFixDrafts(new Map());
    setRemovedCount(0);
    setApproved(new Set());
    setView("needs");
    setFocusId(null);
    categoriseStarted.current = false;
    setStep(result.errors.length > 0 ? "fix" : "categorise");
    bodyRef.current?.scrollTo({ top: 0 });
  };

  // Corrections for a line are kept until it is fixed or left out, so each problem
  // on the line is fixed in turn. The row joins the review only when every one passes.
  const fixRow = (error: FixableError, value: string): FixOutcome => {
    if (!statement) return { status: "rejected", message: "Read the file again to fix this row." };
    const attempt = attemptFix(statement, error, fixDrafts.get(error.line)?.corrections ?? {}, value);
    if (attempt.status === "rejected") return attempt;
    if (attempt.status === "next") {
      setFixDrafts((current) =>
        new Map(current).set(error.line, { error: attempt.error, corrections: attempt.corrections })
      );
      return { status: "next" };
    }
    if (!review.addStatementRows([attempt.row])) {
      return { status: "rejected", message: "Adding this would go over 500 transactions. Leave some out first." };
    }
    setFixDrafts((current) => {
      const next = new Map(current);
      next.delete(error.line);
      return next;
    });
    setFixStatuses((current) => new Map(current).set(error.line, "fixed"));
    return { status: "fixed" };
  };

  const leaveOut = (line: number) => {
    setFixDrafts((current) => {
      const next = new Map(current);
      next.delete(line);
      return next;
    });
    setFixStatuses((current) => new Map(current).set(line, "left-out"));
  };

  const leaveRestOut = () => {
    setFixStatuses((current) => {
      const next = new Map(current);
      unresolved.forEach((error) => next.set(error.line, "left-out"));
      return next;
    });
  };

  const rowIndexOf = (rowId: string) => review.rows.findIndex((row) => row.reviewRowId === rowId);

  const markApproved = (ids: string[]) => {
    setApproved((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const updateRowById = (rowId: string, updates: Partial<PendingReviewTransaction>) => {
    const index = rowIndexOf(rowId);
    if (index >= 0) review.updateRow(index, updates);
  };

  // The answered row stays on the card, with its group and fund/Gift Aid controls, until Next.
  const answerRow = (rowId: string, category: string) => {
    setFocusId(rowId);
    updateRowById(rowId, { category });
    markApproved([rowId]);
  };

  // Applies the answer to the similar rows that still need one, checking the category
  // against each row's own type at the moment of applying.
  const applyToGroup = (rowId: string, category: string) => {
    const groupIds = applicableGroupIds(review.rows, rowId, category, new Set(buckets.needs), categoryNamesFor);
    [rowId, ...groupIds].forEach((id) => updateRowById(id, { category }));
    markApproved([rowId, ...groupIds]);
  };

  // The full table edits by index; a category change there counts as an answer too.
  const updateByIndex = (index: number, updates: Partial<PendingReviewTransaction>) => {
    const rowId = review.rows[index]?.reviewRowId;
    review.updateRow(index, updates);
    if (rowId && updates.category !== undefined) markApproved([rowId]);
  };

  const removeByIndex = (index: number) => {
    review.removeRow(index);
    setRemovedCount((count) => count + 1);
  };

  const addRows = async () => {
    if (blocked) return;
    setSaving(true);
    try {
      const outcome = await review.confirm();
      if (outcome.ok) {
        setAdded(outcome.created);
        setStep("done");
      }
    } finally {
      setSaving(false);
    }
  };

  const importAnother = () => {
    resetReview();
    setFileName("");
    setStatement(null);
    setUploadError(null);
    setAdded(0);
    setStep("upload");
    bodyRef.current?.scrollTo({ top: 0 });
  };

  const railState = (kind: ImportStepKind): RailStepState => {
    if (kind === "fix" && !steps.includes("fix")) return "skipped";
    const at = steps.indexOf(kind);
    return at < stepIndex ? "done" : at === stepIndex ? "now" : "todo";
  };

  const rail = (
    <aside className="hidden min-h-0 flex-col overflow-y-auto border-r border-ledger bg-white p-4 lg:flex">
      <div className={`${eyebrow} mx-2.5 mb-1`}>Import statement</div>
      {RAIL.map((item, index) => {
        const state = railState(item.kind);
        return (
          <RailStep
            key={item.kind}
            marker={String(index + 1)}
            label={item.label}
            state={state}
            disabled={state === "todo"}
            onClick={() => goTo(item.kind)}
          />
        );
      })}
    </aside>
  );

  const receipt =
    step === "done" ? undefined : (
      <StatementReceipt fileName={fileName} summary={summary}>
        {step === "categorise" && (
          <>
            <ReceiptRow label="Sorted" value={`${review.rows.length - buckets.needs.length} / ${review.rows.length}`} />
            <ReceiptRow label="Needs you" value={String(buckets.needs.length)} />
          </>
        )}
      </StatementReceipt>
    );

  const categorising = review.isCategorising;
  // Next moves on from the row the card is showing, which is not always the focus id.
  const goToNextNeed = () =>
    setFocusId(nextNeedsId(review.rows, buckets.needs, focusedRowId(review.rows, buckets.needs, focusId)));
  let body: ReactNode = null;
  let footer: ReactNode = null;

  if (step === "upload") {
    body = <UploadStep error={uploadError} onFile={readFile} />;
  } else if (step === "columns" && statement) {
    body = <ColumnsStep statement={statement} onChange={changeLayout} />;
    const complete = isMappingComplete(statement.mapping, statement.split, statement.headers);
    footer = (
      <StepFooter label={`Rows found under the header on line ${statement.headerLine}`} value={String(statement.records.length)}>
        <button type="button" disabled={!complete || saving} onClick={lookRight} className={`${btnPrimary} ${btnLg}`}>
          Looks right →
        </button>
      </StepFooter>
    );
  } else if (step === "fix") {
    body = (
      <FixRowsStep
        errors={errors}
        corrections={draftCorrections}
        statuses={fixStatuses}
        summary={{
          added: review.rows.length,
          alreadyImported: review.alreadyImportedRows.length,
          skipped: mapped?.skipped.length ?? 0,
          needFix: unresolved.length,
        }}
        onFix={fixRow}
        onLeaveOut={(error) => leaveOut(error.line)}
      />
    );
    const sorted = errors.length - unresolved.length;
    footer = (
      <StepFooter label="Sorted" value={`${sorted} of ${errors.length}`}>
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" disabled={unresolved.length === 0} onClick={leaveRestOut} className={`${btnOutline} ${btnMd}`}>
            Leave the rest out
          </button>
          <button type="button" disabled={unresolved.length > 0} onClick={() => goTo("categorise")} className={`${btnPrimary} ${btnLg}`}>
            Next →
          </button>
        </div>
      </StepFooter>
    );
  } else if (step === "categorise") {
    body = (
      <CategoriseStep
        review={review}
        buckets={buckets}
        namesFor={categoryNamesFor}
        funds={funds}
        view={view}
        onView={setView}
        focusId={focusId}
        onNext={goToNextNeed}
        onAnswer={answerRow}
        onUpdateRow={updateRowById}
        onApplyToGroup={applyToGroup}
        onApprove={markApproved}
        onUpdateIndex={updateByIndex}
        onRemoveIndex={removeByIndex}
        onImportAnyway={() => review.includeAlreadyImported()}
      />
    );
    const needsCount = buckets.needs.length;
    const nextButton =
      needsCount > 0 && view === "needs" ? (
        <button type="button" disabled={categorising} onClick={goToNextNeed} className={`${btnPrimary} ${btnLg}`}>
          Next →
        </button>
      ) : (
        <button type="button" disabled={categorising} onClick={() => goTo("check")} className={`${btnPrimary} ${btnLg}`}>
          Check & import →
        </button>
      );
    footer = (
      <StepFooter label="Needs you" value={String(needsCount)}>
        {view === "all" ? (
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={() => setView("needs")} className={`${btnOutline} ${btnMd}`}>
              Back to buckets
            </button>
            {nextButton}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={() => setView("all")} className={`${btnOutline} ${btnMd}`}>
              See all {review.rows.length}
            </button>
            {nextButton}
          </div>
        )}
      </StepFooter>
    );
  } else if (step === "check") {
    const blockerLine = [
      blockers.noCategory > 0 && `${blockers.noCategory} still need a category`,
      blockers.noFund > 0 && `${blockers.noFund} need a fund`,
      blockers.badDate > 0 && `${blockers.badDate} need a date`,
    ].filter(Boolean).join(" · ");
    const count = review.rows.length;
    body = (
      <CheckStep
        rows={review.rows}
        funds={funds}
        duplicateCount={review.duplicateWarnings.size}
        pairedCount={pairedCount}
        alreadyImported={review.alreadyImportedRows.length}
        onLookDuplicates={() => {
          setView("all");
          goTo("categorise");
        }}
      />
    );
    footer = (
      <StepFooter label="Transactions" value={String(count)}>
        {blockerLine && (
          <p className="mb-2.5 text-sm font-semibold text-amber">
            {blockerLine}.{" "}
            <button type="button" onClick={() => goTo("categorise")} className={linkBtn}>
              Back to Categorise
            </button>
          </p>
        )}
        <button type="button" disabled={blocked} onClick={() => void addRows()} className={`${btnPrimary} ${btnLg}`}>
          {saving ? (
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          ) : count > 0 ? (
            `Add ${count} transaction${count === 1 ? "" : "s"}`
          ) : (
            "Nothing new to add"
          )}
        </button>
      </StepFooter>
    );
  } else if (step === "done") {
    body = (
      <ImportDoneStep
        added={added}
        fileName={fileName}
        onReconcile={onReconcile}
        onImportAnother={importAnother}
      />
    );
    footer = (
      <StepFooter>
        <button type="button" onClick={requestClose} className={`${btnOutline} ${btnLg}`}>
          View transactions
        </button>
      </StepFooter>
    );
  }

  return (
    <WizardFrame
      ariaLabel="Import statement"
      title="Import statement"
      locked={saving}
      onClose={requestClose}
      onBack={stepIndex > 0 && step !== "done" ? goBack : undefined}
      progress={{ total: steps.length - 1, current: stepIndex }}
      rail={rail}
      receipt={receipt}
      bodyRef={bodyRef}
      footer={footer}
    >
      {body}
    </WizardFrame>
  );
}
