import WizardFrame from "../wizard/WizardFrame";
import StepFooter from "../wizard/StepFooter";
import { btnPrimary, chip, fieldLabel, linkBtn, screenHelp, screenTitle, txtInput } from "../wizard/ui";
import { STATUS_FILTER_OPTIONS, type StatusFilter } from "./transactionView";

interface TransactionFilterSheetProps {
  status: StatusFilter;
  onStatus: (status: StatusFilter) => void;
  category: string;
  onCategory: (category: string) => void;
  categoryNames: string[];
  onClear: () => void;
  onClose: () => void;
}

// The filters that don't fit on the bar: status and category.
export default function TransactionFilterSheet({
  status,
  onStatus,
  category,
  onCategory,
  categoryNames,
  onClear,
  onClose,
}: TransactionFilterSheetProps) {
  return (
    <WizardFrame
      ariaLabel="More filters"
      title="Filter"
      onClose={onClose}
      footer={
        <StepFooter>
          <button type="button" onClick={onClose} className={`${btnPrimary} h-[54px] text-base`}>
            Show transactions
          </button>
        </StepFooter>
      }
    >
      <h2 className={screenTitle}>Filter transactions</h2>
      <p className={screenHelp}>Narrow the list by status or category. Period and fund stay on the bar.</p>

      <p className={fieldLabel}>Status</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Status">
        {STATUS_FILTER_OPTIONS.map((option) => {
          const on = option.value === status;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              onClick={() => onStatus(option.value)}
              className={on ? `${chip} border-ink bg-ink text-white` : chip}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <label htmlFor="filter-category" className={fieldLabel}>
        Category
      </label>
      <select id="filter-category" value={category} onChange={(e) => onCategory(e.target.value)} className={txtInput}>
        <option value="">All categories</option>
        {categoryNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>

      <div className="mt-6">
        <button type="button" onClick={onClear} className={linkBtn}>
          Clear all filters
        </button>
      </div>
    </WizardFrame>
  );
}
