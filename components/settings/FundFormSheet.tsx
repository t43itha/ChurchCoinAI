import { useEffect, useMemo, useRef, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { Image as ImageIcon } from "lucide-react";
import { isMovementCategory } from "../../lib/movementCategories";
import { categoryNamesForTransactionTypes } from "../../lib/transactionCategories";
import { FundType, TransactionType, type Category, type Fund, type FundCreateInput } from "../../types";
import WizardFrame from "../wizard/WizardFrame";
import StepFooter from "../wizard/StepFooter";
import {
  Segmented,
  amtBox,
  amtInput,
  amtSymbol,
  btnLg,
  btnPrimary,
  fieldLabel,
  screenHelp,
  screenTitle,
  txtArea,
  txtInput,
} from "../wizard/ui";
import { createLogoDraftReader } from "./fundLogo";

const FORM_ID = "fund-form";
const FUND_TYPES: FundType[] = [FundType.UNRESTRICTED, FundType.RESTRICTED, FundType.DESIGNATED];

interface FundFormSheetProps {
  // A fund with an _id is edited; without one a new fund is created.
  fund: Partial<Fund>;
  categories: Category[];
  onChange: Dispatch<SetStateAction<Partial<Fund>>>;
  onAddFund: (fund: FundCreateInput) => void;
  onUpdateFund: (fund: Fund) => void;
  onClose: () => void;
}

export default function FundFormSheet({ fund, categories, onChange, onAddFund, onUpdateFund, onClose }: FundFormSheetProps) {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const isEditing = Boolean(fund._id);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const readLogo = useMemo(() => createLogoDraftReader(onChange, () => mounted.current), [onChange]);

  // Cash collections can only use income categories that aren't movement legs.
  const incomeCategoryNames = (() => {
    const valid = new Set(categoryNamesForTransactionTypes(categories, [TransactionType.INCOME]));
    const names = categories
      .filter((category) => valid.has(category.name) && !isMovementCategory(category))
      .map((category) => category.name);
    const saved = fund.defaultIncomeCategory;
    return saved && !names.includes(saved) ? [...names, saved] : names;
  })();

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!fund.name || !fund.type) return;
    if (fund._id) {
      onUpdateFund(fund as Fund);
    } else {
      onAddFund({
        name: fund.name,
        type: fund.type as FundType,
        description: fund.description,
        targetAmount: fund.targetAmount ? Number(fund.targetAmount) : undefined,
        deadline: fund.deadline,
        logoUrl: fund.logoUrl,
        defaultIncomeCategory: fund.defaultIncomeCategory || undefined,
      });
    }
    onClose();
  };

  return (
    <WizardFrame
      ariaLabel={isEditing ? "Edit fund" : "New fund"}
      title={isEditing ? "Edit fund" : "New fund"}
      onClose={onClose}
      footer={
        <StepFooter>
          <button type="submit" form={FORM_ID} className={`${btnPrimary} ${btnLg}`}>
            {isEditing ? "Save changes" : "Create fund"}
          </button>
        </StepFooter>
      }
    >
      <h2 className={screenTitle}>{isEditing ? "Edit fund or campaign" : "New fund or campaign"}</h2>
      <p className={screenHelp}>Funds hold money for a purpose. Campaigns are restricted funds with a target.</p>

      <form id={FORM_ID} onSubmit={save}>
        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-label="Upload campaign logo"
            onClick={() => logoInputRef.current?.click()}
            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-ledger bg-white"
          >
            {fund.logoUrl ? (
              <img src={fund.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon size={20} className="text-grey-mid" aria-hidden="true" />
            )}
          </button>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) readLogo(file, fund._id);
            }}
          />
          <p className="text-xs text-grey-mid">Optional. Shown on campaign reports.</p>
        </div>

        <label htmlFor="fund-name" className={fieldLabel}>
          Name
        </label>
        <input
          id="fund-name"
          type="text"
          required
          value={fund.name || ""}
          onChange={(event) => onChange({ ...fund, name: event.target.value })}
          className={txtInput}
        />

        <span className={fieldLabel}>Type</span>
        <Segmented<FundType>
          label="Fund type"
          options={FUND_TYPES}
          value={fund.type || FundType.UNRESTRICTED}
          onChange={(type) => onChange({ ...fund, type })}
        />

        <label htmlFor="fund-category" className={fieldLabel}>
          Cash collections use category
        </label>
        <select
          id="fund-category"
          value={fund.defaultIncomeCategory || ""}
          onChange={(event) => onChange({ ...fund, defaultIncomeCategory: event.target.value })}
          className={txtInput}
        >
          <option value="">Offerings (default)</option>
          {incomeCategoryNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <label htmlFor="fund-target" className={fieldLabel}>
          Target (optional)
        </label>
        <div className={amtBox}>
          <span className={amtSymbol} aria-hidden="true">
            £
          </span>
          <input
            id="fund-target"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={fund.targetAmount ?? ""}
            onChange={(event) =>
              onChange({ ...fund, targetAmount: event.target.value === "" ? undefined : parseFloat(event.target.value) })
            }
            placeholder="0.00"
            className={amtInput}
          />
        </div>

        <label htmlFor="fund-deadline" className={fieldLabel}>
          Deadline (optional)
        </label>
        <input
          id="fund-deadline"
          type="date"
          value={fund.deadline || ""}
          onChange={(event) => onChange({ ...fund, deadline: event.target.value })}
          className={txtInput}
        />

        <label htmlFor="fund-description" className={fieldLabel}>
          Description
        </label>
        <textarea
          id="fund-description"
          value={fund.description || ""}
          onChange={(event) => onChange({ ...fund, description: event.target.value })}
          placeholder="What this fund is for"
          className={txtArea}
        />
      </form>
    </WizardFrame>
  );
}
