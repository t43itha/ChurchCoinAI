import { useState } from "react";
import { Check, Plus } from "lucide-react";
import type { Fund } from "../../types";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import { btnDashed, btnLg, btnPrimary, fieldLabel, screenTitle, tickBox, tickRow } from "../wizard/ui";
import { daysUntil, longDay } from "./logic";

export interface SwitchCampaignSheetProps {
  campaigns: Fund[];
  selectedId: string;
  today: string;
  onPick: (fundId: string) => void;
  onNew: () => void;
  onClose: () => void;
}

// One campaign is shown at a time, so choosing one is a single tick from the list.
export default function SwitchCampaignSheet({ campaigns, selectedId, today, onPick, onNew, onClose }: SwitchCampaignSheetProps) {
  const [picked, setPicked] = useState(selectedId);

  return (
    <WizardFrame
      ariaLabel="Switch campaign"
      title="Campaigns"
      onClose={onClose}
      footer={
        <StepFooter>
          <button type="button" onClick={() => onPick(picked)} className={`${btnPrimary} ${btnLg}`}>
            Show this campaign
          </button>
        </StepFooter>
      }
    >
      <h2 className={screenTitle}>Which campaign?</h2>
      <span className={fieldLabel}>Campaigns</span>
      <div className="grid gap-2">
        {campaigns.map((fund) => {
          const on = fund._id === picked;
          const days = fund.deadline ? daysUntil(fund.deadline, today) : null;
          return (
            <button
              key={fund._id}
              type="button"
              aria-pressed={on}
              onClick={() => setPicked(fund._id)}
              className={`${tickRow} ${on ? "border-ink" : "border-ledger"}`}
            >
              <span className={`${tickBox} ${on ? "border-ink bg-ink text-white" : "border-ledger"}`} aria-hidden="true">
                {on && <Check size={14} />}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold">{fund.name}</span>
              <span className="shrink-0 text-xs text-grey-mid">
                {fund.deadline === undefined
                  ? "No end date"
                  : days !== null && days < 0
                    ? `Ended ${longDay(fund.deadline)}`
                    : `Ends ${longDay(fund.deadline)}`}
              </span>
            </button>
          );
        })}
      </div>
      <button type="button" onClick={onNew} className={`${btnDashed} mt-3`}>
        <Plus size={16} aria-hidden="true" />
        New campaign
      </button>
    </WizardFrame>
  );
}
