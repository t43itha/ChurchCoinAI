import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Sparkles } from "lucide-react";
import type { Fund, TransactionType } from "../../types";
import ImportCategorizationProgress from "../ImportCategorizationProgress";
import ReviewTable from "../statementImport/ReviewTable";
import type { ImportReview } from "../statementImport/useImportReview";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import { btnMd, btnOutline, btnPrimary, btnSage, chip, linkBtn, screenHelp, screenTitle } from "../wizard/ui";

interface BankReviewSheetProps {
  review: ImportReview;
  funds: Fund[];
  categoryNamesFor: (type?: TransactionType, current?: string) => string[];
}

// Rows pulled in by a bank sync, checked before they are added to the ledger.
export default function BankReviewSheet({ review, funds, categoryNamesFor }: BankReviewSheetProps) {
  const {
    rows,
    duplicateWarnings,
    alreadyImportedRows,
    isCategorising,
    categorisingCount,
    hasMoreBankRows,
    isFetchingMoreBank,
    updateRow,
    removeRow,
    pairing,
    assignFundToAll,
    includeAlreadyImported,
    categorise,
    confirm,
    fetchNextBankBatch,
    clear,
  } = review;

  return (
    <WizardFrame
      ariaLabel="Review bank import"
      title="Review import"
      onClose={() => {
        // Closing drops the batch, so it asks first, as Discard does not.
        if (window.confirm("Discard these bank lines? They will not be added to the ledger.")) clear();
      }}
      footer={
        <StepFooter>
          <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
            {hasMoreBankRows ? (
              <button type="button" onClick={() => void fetchNextBankBatch()} disabled={isFetchingMoreBank} className={`${btnOutline} ${btnMd} sm:w-auto sm:px-4`}>
                {isFetchingMoreBank ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
                Fetch next batch
              </button>
            ) : (
              <span className="hidden sm:block" />
            )}
            <button type="button" onClick={clear} className={`${btnMd} rounded-2xl font-semibold text-grey-dark`}>
              Discard
            </button>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={isCategorising}
              aria-busy={isCategorising}
              className={`${btnPrimary} h-[54px] text-base sm:w-auto sm:px-6`}
            >
              {isCategorising ? "Categorising…" : "Confirm import"}
            </button>
          </div>
        </StepFooter>
      }
    >
      <h2 className={screenTitle}>{rows.length} bank lines to check</h2>
      <p className={screenHelp}>Fix the category or fund on any line, then confirm the import.</p>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <label className="sr-only" htmlFor="bank-review-fund">Assign a campaign to all lines</label>
        <select
          id="bank-review-fund"
          disabled={isCategorising}
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) assignFundToAll(e.target.value);
          }}
          className={`${chip} cursor-pointer appearance-none pr-4 disabled:cursor-wait disabled:opacity-60`}
        >
          <option value="">Assign to campaign…</option>
          {funds
            .filter((f) => f.type === "Restricted")
            .map((f) => (
              <option key={f._id} value={f._id}>
                {f.name}
              </option>
            ))}
        </select>
        <button type="button" onClick={() => void categorise()} disabled={isCategorising} className={`${btnSage} h-11 w-auto gap-2 px-4 disabled:cursor-wait`}>
          {isCategorising ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />}
          Auto-categorise
        </button>
      </div>

      {isCategorising && <ImportCategorizationProgress transactionCount={categorisingCount} />}

      {alreadyImportedRows.length > 0 && (
        <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-ledger bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-grey-dark">
            <CheckCircle2 size={16} className="shrink-0 text-sage" aria-hidden="true" />
            <span>
              <strong>
                {alreadyImportedRows.length} row{alreadyImportedRows.length > 1 ? "s were" : " was"} already imported
              </strong>{" "}
              and {alreadyImportedRows.length > 1 ? "have" : "has"} been left out.
            </span>
          </p>
          {alreadyImportedRows.some((row) => row.importKey) && (
            <button type="button" onClick={includeAlreadyImported} className={`${linkBtn} self-start underline sm:self-auto`}>
              Import anyway
            </button>
          )}
        </div>
      )}

      {duplicateWarnings.size > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl bg-amber-light p-3.5 text-sm text-amber">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            <strong>
              {duplicateWarnings.size} potential duplicate{duplicateWarnings.size > 1 ? "s" : ""} found
            </strong>{" "}
            · the ledger already has a transaction with the same date and amount. Review and remove if needed.
          </p>
        </div>
      )}

      <ReviewTable
        rows={rows}
        duplicateWarnings={duplicateWarnings}
        funds={funds}
        categoryNamesFor={categoryNamesFor}
        pairing={pairing}
        onUpdate={updateRow}
        onRemove={removeRow}
      />
    </WizardFrame>
  );
}
