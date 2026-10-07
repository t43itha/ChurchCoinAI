import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";

type TransactionDialogProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export default function TransactionDialog({ title, onClose, children }: TransactionDialogProps) {
  const titleId = useId();
  return createPortal(
    <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white rounded-lg shadow-soft-lg w-full max-w-md border border-ledger animate-enter"
      >
        <div className="p-4 border-b border-[#efeee9] flex justify-between items-center bg-paper rounded-t-lg">
          <h3 id={titleId} className="font-bold text-ink text-sm uppercase tracking-wide">
            {title}
          </h3>
          <button type="button" onClick={onClose} className="text-grey-mid hover:text-grey-dark" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

export const FORM_LABEL_CLASS = "block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1";
export const FORM_INPUT_CLASS =
  "w-full p-2.5 border border-ledger rounded-sm text-sm bg-paper focus:bg-white focus:ring-1 focus:ring-slate-900 outline-hidden transition-colors";

type DialogFooterProps = {
  submitLabel: string;
  submitDisabled: boolean;
  isSaving: boolean;
  onClose: () => void;
};

export function DialogFooter({ submitLabel, submitDisabled, isSaving, onClose }: DialogFooterProps) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button
        type="button"
        onClick={onClose}
        disabled={isSaving}
        className="px-4 py-2 text-grey-mid font-bold uppercase text-xs tracking-wide hover:bg-paper rounded-sm transition-colors"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={submitDisabled || isSaving}
        className="btn-primary px-5 py-2 font-bold uppercase text-xs tracking-wide flex items-center gap-2 disabled:opacity-60"
      >
        {isSaving && <Loader2 size={14} className="animate-spin" />}
        {submitLabel}
      </button>
    </div>
  );
}
