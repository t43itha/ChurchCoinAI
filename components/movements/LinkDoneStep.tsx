import { Check } from "lucide-react";
import { btnLg, btnPrimary, screenTitle } from "../wizard/ui";

interface LinkDoneStepProps {
  // Null when the link was made before the walkthrough could describe it.
  summary: string | null;
  onDone: () => void;
}

export default function LinkDoneStep({ summary, onDone }: LinkDoneStepProps) {
  return (
    <div className="pt-4 text-center">
      <div className="mx-auto mb-4 flex h-[76px] w-[76px] items-center justify-center rounded-full bg-sage text-white ring-[10px] ring-sage-light">
        <Check size={36} aria-hidden="true" />
      </div>
      <h2 className={`${screenTitle} text-center`}>Linked.</h2>
      {summary && <p className="mx-auto mt-2 max-w-sm text-sm text-grey-mid">{summary}</p>}
      <button type="button" onClick={onDone} className={`${btnPrimary} ${btnLg} mt-6`}>
        Done
      </button>
    </div>
  );
}
