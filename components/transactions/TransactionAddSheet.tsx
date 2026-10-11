import { useState, type FormEvent } from "react";
import type { Fund, Pledge, Transaction, TransactionType } from "../../types";
import { formatLocalDateInputValue } from "../../lib/dateUtils";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import { Segmented, amtBox, amtInput, amtSymbol, btnPrimary, fieldLabel, screenHelp, screenTitle, txtInput } from "../wizard/ui";

type Direction = "Money in" | "Money out";
const DIRECTIONS: readonly Direction[] = ["Money in", "Money out"];

export interface TransactionAddSheetProps {
  funds: Fund[];
  pledges: Pledge[];
  categoryNamesFor: (type?: TransactionType, current?: string) => string[];
  giftAidEnabled: boolean;
  onSubmit: (draft: Partial<Transaction>) => Promise<void>;
  onClose: () => void;
}

const emptyEntry = (fundId?: string): Partial<Transaction> => ({
  type: "Income",
  date: formatLocalDateInputValue(new Date()),
  isGiftAidEligible: false,
  category: "",
  fundId,
});

// One payment or receipt. Money in or out is a segmented control; the type decides which categories are offered.
export default function TransactionAddSheet({
  funds,
  pledges,
  categoryNamesFor,
  giftAidEnabled,
  onSubmit,
  onClose,
}: TransactionAddSheetProps) {
  const [draft, setDraft] = useState<Partial<Transaction>>(() => emptyEntry(funds[0]?._id));
  const [saving, setSaving] = useState(false);
  const isIncome = draft.type === "Income";
  const categories = categoryNamesFor(draft.type);
  const donorPledges = draft.donorName
    ? pledges.filter((p) => p.donorName?.toLowerCase().includes(draft.donorName!.toLowerCase()))
    : [];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.amount || !draft.description || !draft.fundId || !draft.category) return;
    setSaving(true);
    try {
      await onSubmit(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <WizardFrame
      ariaLabel="Add a payment or receipt"
      title="New entry"
      onClose={onClose}
      locked={saving}
      footer={
        <StepFooter>
          <button type="submit" form="add-entry" className={`${btnPrimary} h-[54px] text-base`}>
            Save entry
          </button>
        </StepFooter>
      }
    >
      <form id="add-entry" onSubmit={submit}>
        <h2 className={screenTitle}>One payment or receipt</h2>
        <p className={screenHelp}>A bill, a refund, a one-off gift.</p>

        <p className={fieldLabel}>Direction</p>
        <Segmented
          label="Money in or out"
          options={DIRECTIONS}
          value={isIncome ? "Money in" : "Money out"}
          onChange={(direction) => {
            const type: TransactionType = direction === "Money in" ? "Income" : "Expenditure";
            const stillValid = categoryNamesFor(type).includes(draft.category ?? "");
            setDraft({ ...draft, type, category: stillValid ? draft.category : "", pledgeId: undefined });
          }}
        />

        <label htmlFor="entry-amount" className={fieldLabel}>
          How much
        </label>
        <div className={amtBox}>
          <span className={amtSymbol} aria-hidden="true">£</span>
          <input
            id="entry-amount"
            type="number"
            step="0.01"
            required
            value={draft.amount ?? ""}
            onChange={(e) => setDraft({ ...draft, amount: parseFloat(e.target.value) })}
            placeholder="0.00"
            className={amtInput}
          />
        </div>

        <label htmlFor="entry-description" className={fieldLabel}>
          What was it for
        </label>
        <input
          id="entry-description"
          type="text"
          required
          value={draft.description ?? ""}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="e.g. Sunday collection cash"
          className={txtInput}
        />

        <label htmlFor="entry-category" className={fieldLabel}>
          Category
        </label>
        <select
          id="entry-category"
          value={draft.category ?? ""}
          onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          className={txtInput}
        >
          {!draft.category && <option value="">Pick a category</option>}
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <label htmlFor="entry-fund" className={fieldLabel}>
          Fund
        </label>
        <select
          id="entry-fund"
          value={draft.fundId ?? ""}
          onChange={(e) => setDraft({ ...draft, fundId: e.target.value })}
          className={txtInput}
        >
          {funds.map((f) => (
            <option key={f._id} value={f._id}>
              {f.name}
            </option>
          ))}
        </select>

        <label htmlFor="entry-date" className={fieldLabel}>
          Date
        </label>
        <input
          id="entry-date"
          type="date"
          required
          value={draft.date ?? ""}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          className={txtInput}
        />

        <label htmlFor="entry-donor" className={fieldLabel}>
          Donor name (optional)
        </label>
        <input
          id="entry-donor"
          type="text"
          value={draft.donorName ?? ""}
          onChange={(e) => setDraft({ ...draft, donorName: e.target.value })}
          placeholder="Name or ref"
          className={txtInput}
        />

        {isIncome && (
          <>
            <label htmlFor="entry-pledge" className={fieldLabel}>
              Pledge or schedule
            </label>
            <select
              id="entry-pledge"
              value={draft.pledgeId ?? ""}
              onChange={(e) => setDraft({ ...draft, pledgeId: e.target.value || undefined })}
              className={txtInput}
            >
              <option value="">No linked pledge</option>
              {donorPledges.map((p) => (
                <option key={p._id} value={p._id}>
                  {funds.find((f) => f._id === p.fundId)?.name || "Unknown fund"}: £{p.amount} ({p.frequency}) - {p.status}
                </option>
              ))}
            </select>
            {donorPledges.length === 0 && draft.donorName && (
              <p className="mt-1.5 text-xs text-grey-mid">No pledges found for donor &quot;{draft.donorName}&quot;</p>
            )}
          </>
        )}

        {giftAidEnabled && (
          <label className="mt-5 flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-semibold text-grey-dark">
            <input
              type="checkbox"
              checked={draft.isGiftAidEligible || false}
              onChange={(e) => setDraft({ ...draft, isGiftAidEligible: e.target.checked })}
              className="h-[18px] w-[18px] rounded-md accent-ink"
            />
            Gift Aid eligible
          </label>
        )}
      </form>
    </WizardFrame>
  );
}
