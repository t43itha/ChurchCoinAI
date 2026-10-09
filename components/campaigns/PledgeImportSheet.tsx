import { useState, type ChangeEvent, type ReactNode } from "react";
import { Check } from "lucide-react";
import { notify } from "../../lib/notifications";
import type { Donor, DonorCreateInput, Pledge, PledgeCreateInput } from "../../types";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import { btnDashed, btnLg, btnPrimary, fieldLabel, screenTitle, txtInput } from "../wizard/ui";
import {
  IMPORT_FIELDS,
  buildPledgeImport,
  emptyMapping,
  guessColumnMapping,
  linkImportedDonors,
  parseCsv,
  type ColumnMapping,
} from "./pledgeImport";

type CsvFile = { headers: string[]; rows: string[][] };

type ImportResult = {
  totalRows: number;
  importedPledges: number;
  importedDonors: number;
  newDonors: number;
  skippedRows: { row: number; reason: string }[];
};

export interface PledgeImportSheetProps {
  fundId: string;
  fundName: string;
  donors: Donor[];
  pledges: Pledge[];
  onBulkAddDonors: (donors: DonorCreateInput[]) => Promise<{ id: string; name: string; isNew: boolean }[]>;
  onBulkAddPledges: (pledges: PledgeCreateInput[]) => void;
  onClose: () => void;
}

// Picks a CSV, maps its columns to pledge fields, then imports and reports what was skipped.
export default function PledgeImportSheet({
  fundId,
  fundName,
  donors,
  pledges,
  onBulkAddDonors,
  onBulkAddPledges,
  onClose,
}: PledgeImportSheetProps) {
  const [csv, setCsv] = useState<CsvFile | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>(emptyMapping);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const readFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const parsed = parseCsv(evt.target?.result as string);
      if (!parsed) {
        notify("Error", "Invalid CSV.");
        return;
      }
      setCsv(parsed);
      setMapping(guessColumnMapping(parsed.headers));
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const runImport = async () => {
    if (!csv) return;
    if (!mapping.donor) {
      notify("Error", "Donor Name column is required.");
      return;
    }
    setImporting(true);
    try {
      const plan = buildPledgeImport({ headers: csv.headers, rows: csv.rows, mapping, donors, pledges, fundId });
      const saved = plan.donors.length > 0 ? await onBulkAddDonors(plan.donors) : [];
      if (plan.pledges.length > 0) onBulkAddPledges(linkImportedDonors(plan, saved));
      setResult({
        totalRows: csv.rows.length,
        importedPledges: plan.pledges.length,
        importedDonors: plan.donors.length,
        newDonors: saved.filter((donor) => donor.isNew).length,
        skippedRows: plan.skippedRows,
      });
    } finally {
      setImporting(false);
    }
  };

  let body: ReactNode;
  let footer = null;

  if (result) {
    body = (
      <>
        <h2 className={screenTitle}>Import complete</h2>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Tile value={result.importedPledges} label="Pledges imported" />
          <Tile value={result.importedDonors} label="Unique donors" />
          <Tile value={result.newDonors} label="New donors" tone="sage" />
          <Tile value={result.importedDonors - result.newDonors} label="Existing updated" />
        </div>
        {result.skippedRows.length > 0 && (
          <div className="mt-4 rounded-2xl bg-amber-light p-3.5">
            <p className="text-xs font-bold uppercase tracking-wide text-amber">{result.skippedRows.length} rows skipped</p>
            <ul className="mt-2 grid max-h-40 gap-1 overflow-y-auto text-xs text-amber">
              {result.skippedRows.slice(0, 10).map((skip) => (
                <li key={`${skip.row}-${skip.reason}`}>
                  Row {skip.row}: {skip.reason}
                </li>
              ))}
              {result.skippedRows.length > 10 && <li className="italic">…and {result.skippedRows.length - 10} more</li>}
            </ul>
          </div>
        )}
        <p className="mt-4 text-center text-xs text-grey-mid">Processed {result.totalRows} rows from the CSV.</p>
      </>
    );
    footer = (
      <StepFooter>
        <button type="button" onClick={onClose} className={`${btnPrimary} ${btnLg}`}>
          <Check size={16} aria-hidden="true" />
          Done
        </button>
      </StepFooter>
    );
  } else if (csv) {
    body = (
      <>
        <h2 className={screenTitle}>Match the columns</h2>
        <p className="mt-1.5 text-[13.5px] text-grey-mid">
          {csv.rows.length} rows found, importing into {fundName}. Donors with the same name are merged.
        </p>
        <div className="mt-2 grid gap-x-4 sm:grid-cols-2">
          {IMPORT_FIELDS.map((field) => (
            <div key={field.key}>
              <label htmlFor={`import-${field.key}`} className={fieldLabel}>
                {field.label}
                {field.key === "donor" ? " *" : ""}
              </label>
              <select
                id={`import-${field.key}`}
                value={mapping[field.key]}
                onChange={(event) => setMapping({ ...mapping, [field.key]: event.target.value })}
                className={txtInput}
              >
                <option value="">Select column…</option>
                {csv.headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <span className={fieldLabel}>Preview (first 3 rows)</span>
        <div className="overflow-x-auto rounded-2xl border border-ledger bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-paper">
              <tr>
                {csv.headers.map((header) => (
                  <th key={header} className="whitespace-nowrap px-3 py-2 font-bold text-grey-mid">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {csv.rows.slice(0, 3).map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-grey-light">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="whitespace-nowrap px-3 py-2 font-mono text-grey-dark">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
    footer = (
      <StepFooter>
        <button type="button" disabled={importing} onClick={() => void runImport()} className={`${btnPrimary} ${btnLg}`}>
          Import data
        </button>
      </StepFooter>
    );
  } else {
    body = (
      <>
        <h2 className={screenTitle}>Import pledges from a CSV</h2>
        <p className="mt-1.5 text-[13.5px] text-grey-mid">
          Each row becomes a pledge to {fundName}. Rows with a duplicate pledge are skipped.
        </p>
        <input id="pledge-csv" type="file" accept=".csv" onChange={readFile} className="sr-only" />
        <label htmlFor="pledge-csv" className={`${btnDashed} mt-6 cursor-pointer`}>
          Choose a CSV file
        </label>
      </>
    );
  }

  return (
    <WizardFrame
      ariaLabel="Import pledges"
      title="Import pledges"
      onClose={onClose}
      locked={importing}
      footer={footer}
    >
      {body}
    </WizardFrame>
  );
}

function Tile({ value, label, tone }: { value: number; label: string; tone?: "sage" }) {
  return (
    <div className={`rounded-2xl border p-3 text-center ${tone === "sage" ? "border-sage/30 bg-sage-light" : "border-ledger bg-white"}`}>
      <p className={`font-mono text-2xl font-bold ${tone === "sage" ? "text-sage" : "text-ink"}`}>{value}</p>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-grey-mid">{label}</p>
    </div>
  );
}
