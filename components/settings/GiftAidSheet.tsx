import { useState } from "react";
import { isGiftAidEnabled } from "../../lib/giftAid";
import type { ChurchDetails } from "../../types";
import WizardFrame from "../wizard/WizardFrame";
import StepFooter from "../wizard/StepFooter";
import { Segmented, btnLg, btnPrimary, card, screenHelp, screenTitle } from "../wizard/ui";

type GiftAidChoice = "On" | "Off";

interface GiftAidSheetProps {
  churchDetails: ChurchDetails;
  canEdit: boolean;
  onSave: (details: ChurchDetails) => void;
  onClose: () => void;
}

// Switches Gift Aid across the app. Saves through the same church-details mutation as the profile sheet.
export default function GiftAidSheet({ churchDetails, canEdit, onSave, onClose }: GiftAidSheetProps) {
  const [choice, setChoice] = useState<GiftAidChoice>(isGiftAidEnabled(churchDetails) ? "On" : "Off");
  const changed = (choice === "On") !== isGiftAidEnabled(churchDetails);

  return (
    <WizardFrame
      ariaLabel="Gift Aid"
      title="Gift Aid"
      onClose={onClose}
      footer={
        canEdit ? (
          <StepFooter>
            <button
              type="button"
              disabled={!changed}
              onClick={() => onSave({ ...churchDetails, giftAidEnabled: choice === "On" })}
              className={`${btnPrimary} ${btnLg}`}
            >
              Save Gift Aid setting
            </button>
          </StepFooter>
        ) : undefined
      }
    >
      <h2 className={screenTitle}>Gift Aid</h2>
      <p className={screenHelp}>Claim tax back on eligible donations, where your church is registered.</p>

      <div className={card}>
        {canEdit ? (
          <Segmented<GiftAidChoice> label="Gift Aid" options={["On", "Off"]} value={choice} onChange={setChoice} />
        ) : (
          <p className="text-[15px] font-semibold text-ink">{choice}</p>
        )}
        <p className="mt-3 text-[13px] leading-relaxed text-grey-mid">
          When off, Gift Aid is hidden across the app. Donor declarations are kept and return if you turn it on again.
        </p>
      </div>
    </WizardFrame>
  );
}
