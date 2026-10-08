import { useState, type DragEvent } from "react";
import { Upload } from "lucide-react";
import { screenTitle, screenHelp } from "../wizard/ui";

interface UploadStepProps {
  error: string | null;
  onFile: (file: File) => void;
}

const BANK_TIPS = [
  "Log in to online banking and open the account the statement is for.",
  "Look for “Export”, “Download transactions” or “CSV”, then choose CSV as the format.",
  "PDF statements won't work. If you only see PDF, look for an export option instead.",
];

// The first step: pick a CSV file, by dropping it or choosing it. Reading happens
// as soon as the file arrives.
export default function UploadStep({ error, onFile }: UploadStepProps) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div>
      <h2 className={screenTitle}>Add your bank statement</h2>
      <p className={screenHelp}>
        Download a CSV file from online banking. We'll read it, sort it and show you everything before anything is saved.
      </p>

      <label
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed bg-white p-6 text-center transition-colors focus-within:border-ink ${
          dragging ? "border-sage bg-sage-light" : "border-[#d6d3cd] hover:bg-grey-light"
        }`}
      >
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Clear the value so choosing the same file again still fires a change.
            event.target.value = "";
            if (file) onFile(file);
          }}
        />
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-grey-light text-grey-dark">
          <Upload size={20} aria-hidden="true" />
        </span>
        <span className="text-base font-bold text-ink">
          Drop the file here, or <span className="text-sage">choose a file</span>
        </span>
        <span className="text-[13px] text-grey-mid">.csv only · up to 500 transactions at a time · nothing is saved yet</span>
      </label>

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-error-light px-3.5 py-3 text-sm text-error">
          {error}
        </p>
      )}

      <details className="mt-4 rounded-2xl border border-ledger bg-white px-4 py-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold text-ink">
          How do I download this from my bank?
        </summary>
        <ol className="mb-1 mt-2 list-decimal space-y-2 pl-5 text-[13.5px] text-grey-dark">
          {BANK_TIPS.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}
