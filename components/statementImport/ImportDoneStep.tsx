import { Check, Plus, Scale } from "lucide-react";
import { fieldLabel, nextIcon, nextItem, screenTitle } from "../wizard/ui";

interface ImportDoneStepProps {
  added: number;
  fileName: string;
  // Omitted when the user cannot reconcile, so no dead button is shown.
  onReconcile?: () => void;
  onImportAnother: () => void;
}

export default function ImportDoneStep({ added, fileName, onReconcile, onImportAnother }: ImportDoneStepProps) {
  return (
    <div className="mx-auto max-w-lg pt-4 text-center">
      <div className="mx-auto mb-4 flex h-[76px] w-[76px] items-center justify-center rounded-full bg-sage text-white ring-[10px] ring-sage-light">
        <Check size={36} aria-hidden="true" />
      </div>
      <h2 className={`${screenTitle} text-center`}>
        {added} transaction{added === 1 ? "" : "s"} added
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-grey-mid">
        {fileName ? `From ${fileName}. ` : ""}Nothing else in the ledger was changed.
      </p>

      <div className="mt-6 text-left">
        <span className={fieldLabel}>What's next</span>
        {onReconcile && (
          <button type="button" onClick={onReconcile} className={`${nextItem} mb-2`}>
            <span className={`${nextIcon} bg-sage-light text-sage`}>
              <Scale size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <b className="block text-[14.5px] text-ink">Reconcile this statement</b>
              <span className="text-xs text-grey-mid">Tick the statement off against the ledger.</span>
            </span>
          </button>
        )}
        <button type="button" onClick={onImportAnother} className={nextItem}>
          <span className={`${nextIcon} bg-grey-light text-ink`}>
            <Plus size={17} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <b className="block text-[14.5px] text-ink">Import another statement</b>
            <span className="text-xs text-grey-mid">Start again with another CSV file.</span>
          </span>
        </button>
      </div>
    </div>
  );
}
