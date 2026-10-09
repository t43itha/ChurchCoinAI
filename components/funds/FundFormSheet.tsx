import { useState } from "react";
import { Check } from "lucide-react";
import { isMovementCategory } from "../../lib/movementCategories";
import { categoryNamesForTransactionTypes } from "../../lib/transactionCategories";
import { FundType, TransactionType, type Category, type Fund, type FundCreateInput } from "../../types";
import DateInput from "../cashEntry/DateInput";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import { btnLg, btnPrimary, fieldLabel, tickBox, tickRow, txtArea, txtInput } from "../wizard/ui";
import { PLAIN_TYPE_NAME } from "./fundFacts";

// Only these types can be chosen when a fund is created or edited.
const TYPE_OPTIONS: { type: FundType; label: string }[] = [
  { type: FundType.UNRESTRICTED, label: "Unrestricted (General)" },
  { type: FundType.RESTRICTED, label: "Restricted (Campaign)" },
  { type: FundType.DESIGNATED, label: "Designated" },
];

// Income categories a fund's cash collections can use. A saved value stays in the list even if it has since been retired.
function incomeCategoryNames(categories: Category[], saved: string): string[] {
  const valid = new Set(categoryNamesForTransactionTypes(categories, [TransactionType.INCOME]));
  const names = categories
    .filter((category) => valid.has(category.name) && !isMovementCategory(category))
    .map((category) => category.name);
  return saved && !names.includes(saved) ? [...names, saved] : names;
}

interface FundFormSheetProps {
  // Omitted to create a fund.
  fund?: Fund;
  categories: Category[];
  onCreate: (input: FundCreateInput) => void;
  onUpdate: (fund: Fund) => void;
  onClose: () => void;
}

export default function FundFormSheet({ fund, categories, onCreate, onUpdate, onClose }: FundFormSheetProps) {
  const [name, setName] = useState(fund?.name ?? "");
  const [type, setType] = useState<FundType>(fund?.type ?? FundType.UNRESTRICTED);
  const [category, setCategory] = useState(fund?.defaultIncomeCategory ?? "");
  const [target, setTarget] = useState(fund?.targetAmount ? String(fund.targetAmount) : "");
  const [deadline, setDeadline] = useState(fund?.deadline ?? "");
  const [description, setDescription] = useState(fund?.description ?? "");

  const trimmedName = name.trim();
  const categoryNames = incomeCategoryNames(categories, category);

  const save = () => {
    if (trimmedName === "") return;
    // A target of zero means no target, as it always has.
    const targetAmount = Number(target) || undefined;
    if (fund) {
      onUpdate({ ...fund, name: trimmedName, type, defaultIncomeCategory: category, targetAmount, deadline, description });
    } else {
      onCreate({
        name: trimmedName,
        type,
        description: description || undefined,
        targetAmount,
        deadline: deadline || undefined,
        defaultIncomeCategory: category || undefined,
      });
    }
    onClose();
  };

  return (
    <WizardFrame
      ariaLabel={fund ? "Edit fund" : "New fund"}
      title={fund ? "Edit fund" : "New fund"}
      onClose={onClose}
      footer={
        <StepFooter>
          <button type="button" disabled={trimmedName === ""} onClick={save} className={`${btnPrimary} ${btnLg}`}>
            {fund ? "Save fund" : "Create fund"}
          </button>
        </StepFooter>
      }
    >
      <div>
        <label htmlFor="fund-name" className={fieldLabel}>
          Fund name
        </label>
        <input id="fund-name" type="text" value={name} onChange={(event) => setName(event.target.value)} className={txtInput} />
      </div>

      <span className={fieldLabel}>Type</span>
      <div className="space-y-2.5">
        {TYPE_OPTIONS.map((option) => {
          const on = option.type === type;
          return (
            <button
              key={option.type}
              type="button"
              aria-pressed={on}
              onClick={() => setType(option.type)}
              className={`${tickRow} ${on ? "border-ink" : "border-ledger"}`}
            >
              <span className={`${tickBox} ${on ? "border-ink bg-ink text-white" : "border-[#cfcac2]"}`}>
                {on && <Check size={14} aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[14.5px]">{option.label}</b>
                <span className="block truncate text-xs text-grey-mid">{PLAIN_TYPE_NAME[option.type]}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div>
        <label htmlFor="fund-category" className={fieldLabel}>
          Cash collections use category
        </label>
        <select id="fund-category" value={category} onChange={(event) => setCategory(event.target.value)} className={txtInput}>
          <option value="">Offerings (default)</option>
          {categoryNames.map((categoryName) => (
            <option key={categoryName} value={categoryName}>
              {categoryName}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="fund-target" className={fieldLabel}>
          Target (£)
        </label>
        <input
          id="fund-target"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          placeholder="Optional"
          className={`${txtInput} font-mono`}
        />
      </div>

      <div>
        <label htmlFor="fund-deadline" className={fieldLabel}>
          Deadline
        </label>
        <DateInput id="fund-deadline" value={deadline} onChange={(event) => setDeadline(event.target.value)} className={txtInput} />
      </div>

      <div>
        <label htmlFor="fund-description" className={fieldLabel}>
          Description
        </label>
        <textarea
          id="fund-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Purpose of this fund…"
          className={txtArea}
        />
      </div>
    </WizardFrame>
  );
}
