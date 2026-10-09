import { Check } from "lucide-react";
import type { Fund } from "../../types";
import { gbp, shortDate } from "../cashEntry/format";
import { Segmented, screenHelp, screenTitle, tickBox, tickRow, txtInput } from "../wizard/ui";
import AmountBox from "./AmountBox";
import {
  MEDIUM_CHOICES,
  choiceOf,
  defaultCreditDraft,
  filterCredits,
  type BankCredit,
  type CreditDraft,
  type MediumChoice,
} from "./draft";

interface BankStepProps {
  credits: readonly BankCredit[];
  loading: boolean;
  funds: Fund[];
  search: string;
  onSearch: (value: string) => void;
  isTicked: (creditId: string) => boolean;
  drafts: Record<string, CreditDraft>;
  errors: Record<string, string>;
  onToggle: (credit: BankCredit) => void;
  onMedium: (credit: BankCredit, choice: MediumChoice) => void;
  onAmount: (credit: BankCredit, field: "cashAmount" | "chequeAmount", value: string) => void;
}

export default function BankStep({
  credits,
  loading,
  funds,
  search,
  onSearch,
  isTicked,
  drafts,
  errors,
  onToggle,
  onMedium,
  onAmount,
}: BankStepProps) {
  const visible = filterCredits(credits, search);

  return (
    <div>
      <h2 className={screenTitle}>Which bank credits are the deposit?</h2>
      <p className={screenHelp}>Tick the credits on your statement the cash and cheques went into, and say how each was banked.</p>

      {credits.length > 0 && (
        <input
          type="search"
          aria-label="Search bank credits"
          placeholder="Search by description"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          className={`${txtInput} mb-3`}
        />
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-grey-mid">Loading bank credits…</p>
      ) : credits.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-ledger p-6 text-center text-sm text-grey-mid">
          No bank credits to match yet. Bank credits come from statement imports or bank sync, so import or sync your bank
          first.
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-ledger p-6 text-center text-sm text-grey-mid">
          No bank credits match your search.
        </p>
      ) : (
        <div className="space-y-2.5">
          {visible.map((credit) => {
            const ticked = isTicked(credit._id);
            const draft = drafts[credit._id] ?? defaultCreditDraft(credit);
            const error = errors[credit._id];
            const fund = funds.find((candidate) => candidate._id === credit.fundId);
            return (
              <div key={credit._id}>
                <button
                  type="button"
                  aria-pressed={ticked}
                  onClick={() => onToggle(credit)}
                  className={`${tickRow} ${ticked ? "border-ink" : "border-ledger"}`}
                >
                  <span className={`${tickBox} ${ticked ? "border-ink bg-ink text-white" : "border-[#cfcac2]"}`}>
                    {ticked && <Check size={14} aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[14.5px] font-semibold">{credit.description}</b>
                    <span className="block truncate text-[12.5px] text-grey-mid">
                      {shortDate(credit.date)}
                      {fund ? ` · ${fund.name}` : ""}
                    </span>
                  </span>
                  <span className="whitespace-nowrap font-mono text-sm font-semibold text-sage">{gbp(credit.amount)}</span>
                </button>

                {ticked && (
                  <div className="mt-1.5 space-y-2.5 pl-[34px]">
                    <Segmented
                      label={`How ${credit.description} was banked`}
                      options={MEDIUM_CHOICES}
                      value={choiceOf(draft.medium)}
                      onChange={(choice) => onMedium(credit, choice)}
                    />
                    {draft.medium === "mixed" && (
                      <div className="space-y-2">
                        <AmountBox
                          label="Cash"
                          ariaLabel={`Cash in ${credit.description}`}
                          value={draft.cashAmount}
                          onChange={(value) => onAmount(credit, "cashAmount", value)}
                        />
                        <AmountBox
                          label="Cheques"
                          ariaLabel={`Cheques in ${credit.description}`}
                          value={draft.chequeAmount}
                          onChange={(value) => onAmount(credit, "chequeAmount", value)}
                        />
                      </div>
                    )}
                    {error && <p className="text-xs font-semibold text-error">{error}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
