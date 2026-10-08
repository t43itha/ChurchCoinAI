import { useEffect, type ReactNode } from "react";
import ImportCategorizationProgress from "../ImportCategorizationProgress";
import { dayMonth } from "../cashEntry/format";
import type { Fund } from "../../types";
import {
  applicableGroupIds,
  batchFundFor,
  categoryChoicesFor,
  focusedRowId,
  hasValidFund,
  isValidCategory,
  type CategoryNamesFor,
  type ReviewBucket,
} from "./buckets";
import ReviewTable, { CategorySelect, FundSelect, reviewSelectClass } from "./ReviewTable";
import type { ImportReview } from "./useImportReview";
import type { OriginalPrediction, PendingReviewTransaction } from "./types";
import { fullDate, signedGbp } from "./format";
import {
  btnMd,
  btnOutline,
  chip,
  eyebrow,
  fieldLabel,
  giftAidOff,
  giftAidOn,
  linkBtnSm,
  screenHelp,
  screenTitle,
  tagAmber,
  tagSage,
  txtInput,
} from "../wizard/ui";

export type CategoriseView = "needs" | "likely" | "sure" | "all";

export interface CategoriseStepProps {
  review: ImportReview;
  buckets: Record<ReviewBucket, string[]>;
  namesFor: CategoryNamesFor;
  funds: Fund[];
  view: CategoriseView;
  onView: (view: CategoriseView) => void;
  focusId: string | null;
  // applyDefault: Next and Enter make the pre-selected batch fund a real choice; S does not.
  onNext: (applyDefault: boolean) => void;
  batchFundId: string | null;
  fundIds: ReadonlySet<string>;
  onPickFund: (rowId: string, fundId: string) => void;
  onAnswer: (rowId: string, category: string) => void;
  onUpdateRow: (rowId: string, updates: Partial<PendingReviewTransaction>) => void;
  onApplyToGroup: (rowId: string, category: string) => void;
  onApprove: (rowIds: string[]) => void;
  onUpdateIndex: (index: number, updates: Partial<PendingReviewTransaction>) => void;
  onRemoveIndex: (index: number) => void;
  onImportAnyway: () => void;
}

const Kbd = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-ledger bg-white px-1 font-mono text-[11px] text-grey-dark">
    {children}
  </span>
);

const tileClass = (on: boolean) =>
  `flex flex-1 flex-col items-start rounded-2xl border-[1.5px] bg-white px-3.5 py-3 text-left transition-colors ${
    on ? "border-ink" : "border-ledger hover:border-[#c9c5be]"
  }`;

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

// Categorisation of the batch: three buckets, with the one that needs answers
// shown one card at a time. Categorisation itself runs in the hook.
export default function CategoriseStep(props: CategoriseStepProps) {
  const { review, buckets, namesFor, funds, view, onView } = props;
  const rows = review.rows;
  const byId = new Map(rows.map((row) => [row.reviewRowId ?? "", row] as const));
  const needsCount = buckets.needs.length;
  const duplicateCount = review.duplicateWarnings.size;
  const importAnyway = review.alreadyImportedRows.some((row) => row.importKey);

  const title = review.isCategorising
    ? "Sorting your transactions"
    : needsCount > 0
      ? `${needsCount} ${plural(needsCount, "transaction needs", "transactions need")} you`
      : "Nothing needs you";
  const help = review.isCategorising
    ? "Suggestions appear as they're ready. Nothing is imported until you check and confirm."
    : needsCount > 0
      ? `We've sorted the other ${buckets.sure.length + buckets.likely.length}. Answer these and you're nearly done.`
      : "Give the likely matches a quick look, then move on to check and import.";

  return (
    <div>
      {review.isCategorising && <ImportCategorizationProgress transactionCount={review.categorisingCount} />}

      {review.alreadyImportedRows.length > 0 && (
        <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-ledger bg-white px-4 py-3 text-sm text-grey-dark sm:flex-row sm:items-center sm:justify-between">
          <span>
            <b>{review.alreadyImportedRows.length}</b> {plural(review.alreadyImportedRows.length, "row was", "rows were")} already imported and left out.
          </span>
          {importAnyway && (
            <button type="button" onClick={props.onImportAnyway} className={linkBtnSm}>
              Import anyway
            </button>
          )}
        </div>
      )}

      {duplicateCount > 0 && (
        <div className="mb-3 flex flex-col gap-2 rounded-2xl bg-amber-light px-4 py-3 text-sm text-amber sm:flex-row sm:items-center sm:justify-between">
          <span>
            <b>{duplicateCount} possible {plural(duplicateCount, "duplicate", "duplicates")}.</b> The ledger already has a row with the same date and amount.
          </span>
          <button type="button" onClick={() => onView("all")} className={linkBtnSm}>
            Look at {plural(duplicateCount, "it", "them")}
          </button>
        </div>
      )}

      <h2 className={screenTitle}>{title}</h2>
      <p className={screenHelp}>{help}</p>

      <div className="mb-4 grid grid-cols-3 gap-2.5">
        <button type="button" aria-pressed={view === "sure"} onClick={() => onView("sure")} className={tileClass(view === "sure")}>
          <b className="font-mono text-xl text-sage">{buckets.sure.length}</b>
          <span className="text-xs text-grey-mid">Sure · rules &amp; memory</span>
        </button>
        <button type="button" aria-pressed={view === "likely"} onClick={() => onView("likely")} className={tileClass(view === "likely")}>
          <b className="font-mono text-xl text-ink">{buckets.likely.length}</b>
          <span className="text-xs text-grey-mid">Likely · quick glance</span>
        </button>
        <button type="button" aria-pressed={view === "needs"} onClick={() => onView("needs")} className={tileClass(view === "needs")}>
          <b className="font-mono text-xl text-amber">{needsCount}</b>
          <span className="text-xs text-grey-mid">Needs you</span>
        </button>
      </div>

      {view === "needs" && (
        <NeedsView {...props} byId={byId} needsIds={buckets.needs} />
      )}

      {view === "likely" && (
        <LikelyList
          rows={buckets.likely.map((id) => byId.get(id)).filter((row): row is PendingReviewTransaction => Boolean(row))}
          review={review}
          namesFor={namesFor}
          funds={funds}
          onApprove={() => props.onApprove(buckets.likely)}
          onUpdateRow={props.onUpdateRow}
        />
      )}

      {view === "sure" && (
        <div className="rounded-2xl border border-ledger bg-white p-3">
          {buckets.sure.map((id) => byId.get(id)).filter((row): row is PendingReviewTransaction => Boolean(row)).map((row) => (
            <div key={row.reviewRowId} className="flex items-center gap-3 border-b border-ledger py-2.5 last:border-b-0">
              <span className="w-14 shrink-0 font-mono text-xs text-grey-mid">{dayMonth(row.date ?? "")}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{row.description}</span>
              <span className={tagSage}>{row.category}</span>
              <span className="w-24 shrink-0 text-right font-mono text-sm font-bold text-ink">
                {signedGbp(row.type === "Income" ? (row.amount ?? 0) : -(row.amount ?? 0))}
              </span>
            </div>
          ))}
          <p className="mt-3 text-xs text-grey-mid">Matched by your rules and memory, or answered by you. Use See all to change one.</p>
        </div>
      )}

      {view === "all" && (
        <ReviewTable
          rows={rows}
          duplicateWarnings={review.duplicateWarnings}
          funds={funds}
          categoryNamesFor={namesFor}
          pairing={review.pairing}
          onUpdate={props.onUpdateIndex}
          onRemove={props.onRemoveIndex}
        />
      )}
    </div>
  );
}

// The "needs you" view: one card, the focused row. Keys 1 to 3 pick a category,
// Enter or S moves on.
function NeedsView(props: CategoriseStepProps & { byId: Map<string, PendingReviewTransaction>; needsIds: string[] }) {
  const { review, byId, needsIds, namesFor, funds, focusId } = props;
  const needsSet = new Set(needsIds);
  const focusedId = focusedRowId(review.rows, needsIds, focusId);
  const row = focusedId ? byId.get(focusedId) : undefined;

  if (!row || !focusedId) {
    return (
      <div className="rounded-2xl border border-ledger bg-white p-5 text-center">
        <p className="text-[15px] font-semibold text-ink">Every transaction has an answer.</p>
        <p className="mt-1 text-sm text-grey-mid">Give the likely matches a glance, or see the full table.</p>
        <div className="mt-4 flex justify-center gap-2.5">
          <button type="button" onClick={() => props.onView("likely")} className={`${btnOutline} ${btnMd} px-4`}>
            Likely matches
          </button>
          <button type="button" onClick={() => props.onView("all")} className={`${btnOutline} ${btnMd} px-4`}>
            See all
          </button>
        </div>
      </div>
    );
  }

  const prediction: OriginalPrediction | undefined = review.predictions.get(focusedId);
  const hasFund = hasValidFund(row, props.fundIds);
  const suggestedFundId = batchFundFor(row, props.batchFundId, props.fundIds);
  // Only rows the current category would be valid for, of the same type.
  const groupIds = applicableGroupIds(review.rows, focusedId, row.category ?? "", needsSet, namesFor);
  const canApply = isValidCategory(row, namesFor);

  return (
    <NeedsCard
      row={row}
      batch={review.rows}
      suggestion={prediction?.category}
      answered={!needsSet.has(focusedId)}
      namesFor={namesFor}
      funds={funds}
      hasFund={hasFund}
      suggestedFundId={suggestedFundId}
      groupIds={groupIds}
      canApply={canApply}
      onAnswer={(category) => props.onAnswer(focusedId, category)}
      onPickFund={(fundId) => props.onPickFund(focusedId, fundId)}
      onUpdate={(updates) => props.onUpdateRow(focusedId, updates)}
      onApplyToGroup={() => props.onApplyToGroup(focusedId, row.category ?? "")}
      onNext={props.onNext}
    />
  );
}

function NeedsCard({
  row,
  batch,
  suggestion,
  answered,
  namesFor,
  funds,
  hasFund,
  suggestedFundId,
  groupIds,
  canApply,
  onAnswer,
  onPickFund,
  onUpdate,
  onApplyToGroup,
  onNext,
}: {
  row: PendingReviewTransaction;
  batch: PendingReviewTransaction[];
  suggestion: string | undefined;
  answered: boolean;
  namesFor: CategoryNamesFor;
  funds: Fund[];
  hasFund: boolean;
  // The batch fund shown as a pre-selection, not yet a choice on this row.
  suggestedFundId: string | undefined;
  groupIds: string[];
  canApply: boolean;
  onAnswer: (category: string) => void;
  onPickFund: (fundId: string) => void;
  onUpdate: (updates: Partial<PendingReviewTransaction>) => void;
  onApplyToGroup: () => void;
  onNext: (applyDefault: boolean) => void;
}) {
  // Nothing is chosen and nothing is pre-selected: the card asks for one in amber.
  const needsFund = !hasFund && !suggestedFundId;
  const choices = categoryChoicesFor(row, batch, suggestion, namesFor);
  const isIncome = row.type === "Income";
  const amount = row.amount ?? 0;

  // Keys 1 to 3 pick a choice and Enter or S moves on. Typing in a field is left alone.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (event.key === "Enter") {
        event.preventDefault();
        onNext(true);
      } else if (event.key === "s" || event.key === "S") {
        onNext(false);
      } else if (/^[1-3]$/.test(event.key)) {
        const choice = choices[Number(event.key) - 1];
        if (choice) {
          event.preventDefault();
          onAnswer(choice);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [choices, onAnswer, onNext]);

  return (
    <div className="rounded-[20px] border border-ledger bg-white p-5 shadow-soft">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-grey-mid">
        <span>{fullDate(row.date ?? "")}</span>
        {answered ? <span className={tagSage}>Answered</span> : <span>{isIncome ? "Money in" : "Money out"}</span>}
      </div>
      <p className="break-words text-[19px] font-bold leading-snug text-ink">{row.description || "No description"}</p>
      <p className={`mt-1 font-mono text-[26px] font-bold ${isIncome ? "text-sage" : "text-ink"}`}>
        {signedGbp(isIncome ? amount : -amount)}
      </p>

      <span className={fieldLabel}>What was this?</span>
      <div className="flex flex-wrap gap-2">
        {choices.map((name, index) => {
          const on = row.category === name;
          return (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              onClick={() => onAnswer(name)}
              className={`${chip} ${on ? "border-ink text-ink" : ""}`}
            >
              <Kbd>{index + 1}</Kbd>
              {name}
            </button>
          );
        })}
      </div>
      <div className="mt-2.5">
        <CategorySelect
          label="Other category"
          value={row.category || ""}
          options={namesFor(row.type, row.category)}
          onChange={(category) => {
            if (category) onAnswer(category);
          }}
          className={`${txtInput} font-semibold`}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <label className="min-w-0">
          <span className={`${eyebrow} mb-1.5 block ${needsFund ? "text-amber" : ""}`}>
            {needsFund ? "Choose a fund" : "Fund"}
          </span>
          <FundSelect
            label="Fund for this row"
            value={hasFund ? row.fundId || "" : suggestedFundId || ""}
            funds={funds}
            onChange={(fundId) => {
              if (fundId) onPickFund(fundId);
            }}
            className={`${txtInput} font-semibold ${needsFund ? "border-amber bg-amber-light" : ""}`}
          />
          {!hasFund && suggestedFundId && (
            <span className="mt-1 block text-xs text-grey-mid">Pre-selected from your last pick. Next keeps it.</span>
          )}
        </label>
        {isIncome && (
          <div className="flex flex-col justify-end">
            <button
              type="button"
              aria-pressed={Boolean(row.isGiftAidEligible)}
              onClick={() => onUpdate({ isGiftAidEligible: !row.isGiftAidEligible })}
              className={`${row.isGiftAidEligible ? giftAidOn : giftAidOff} min-h-11 justify-center py-2.5 text-[13px]`}
            >
              Gift Aid: {row.isGiftAidEligible ? "yes" : "no"}
            </button>
          </div>
        )}
      </div>

      {groupIds.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 rounded-xl bg-grey-light px-3.5 py-3 text-[13px] text-grey-dark sm:flex-row sm:items-center sm:justify-between">
          <span>
            <b>{groupIds.length} more</b> “{row.description}” {plural(groupIds.length, "row", "rows")} to answer
          </span>
          <button
            type="button"
            disabled={!canApply}
            onClick={onApplyToGroup}
            className="min-h-11 shrink-0 rounded-xl bg-sage px-4 text-sm font-bold text-white disabled:opacity-35"
          >
            Apply to all {groupIds.length + 1}
          </button>
        </div>
      )}

      <p className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-grey-mid">
        <Kbd>1</Kbd>–<Kbd>3</Kbd> pick · <Kbd>Enter</Kbd> next · <Kbd>S</Kbd> skip
      </p>
    </div>
  );
}

// Likely matches, one line each. Category and fund can be changed here; one button approves the lot.
function LikelyList({
  rows,
  review,
  namesFor,
  funds,
  onApprove,
  onUpdateRow,
}: {
  rows: PendingReviewTransaction[];
  review: ImportReview;
  namesFor: CategoryNamesFor;
  funds: Fund[];
  onApprove: () => void;
  onUpdateRow: (rowId: string, updates: Partial<PendingReviewTransaction>) => void;
}) {
  if (rows.length === 0) {
    return <p className="rounded-2xl border border-ledger bg-white p-4 text-sm text-grey-mid">No likely matches to check.</p>;
  }
  return (
    <div className="rounded-2xl border border-ledger bg-white p-3">
      {rows.map((row) => {
        const id = row.reviewRowId ?? "";
        const pair = review.pairing.activeFor(id);
        return (
          <div key={id} className="flex flex-col gap-2 border-b border-ledger py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="w-14 shrink-0 font-mono text-xs text-grey-mid">{dayMonth(row.date ?? "")}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{row.description}</span>
              <span className={`shrink-0 font-mono text-sm font-bold ${row.type === "Income" ? "text-sage" : "text-ink"}`}>
                {signedGbp(row.type === "Income" ? (row.amount ?? 0) : -(row.amount ?? 0))}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:w-[340px]">
              <CategorySelect
                label={`Category for ${row.description || "row"}`}
                value={row.category || ""}
                options={namesFor(row.type, row.category)}
                onChange={(category) => onUpdateRow(id, { category })}
                className={reviewSelectClass}
              />
              <FundSelect
                label={`Fund for ${row.description || "row"}`}
                value={row.fundId || ""}
                funds={funds}
                onChange={(fundId) => onUpdateRow(id, { fundId })}
                className={reviewSelectClass}
              />
            </div>
            {pair && <span className={tagAmber}>Transfer paired</span>}
          </div>
        );
      })}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-grey-mid">
          {rows.length} likely {plural(rows.length, "match", "matches")}. Change any that look wrong.
        </span>
        <button type="button" onClick={onApprove} className="min-h-11 rounded-xl bg-sage px-4 text-sm font-bold text-white">
          These look right ✓
        </button>
      </div>
    </div>
  );
}
