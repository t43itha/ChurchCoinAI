import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { UserRole } from "../../lib/permissions";
import WizardFrame from "../wizard/WizardFrame";
import { nextIcon, nextItem, screenHelp, screenTitle } from "../wizard/ui";
import { newChooserRows } from "./newChooserRows";

// The single "+ New" entry point. Choosing a row closes the sheet and opens the
// matching walkthrough or modal on Transactions. Only shown to roles with rows to offer.
export default function NewChooser({ role, onClose }: { role: UserRole; onClose: () => void }) {
  const navigate = useNavigate();
  const rows = newChooserRows(role);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const choose = (to: string) => {
    onClose();
    navigate(to);
  };

  return (
    <WizardFrame ariaLabel="What are you adding?" title="Add" onClose={onClose}>
      <h2 className={screenTitle}>What are you adding?</h2>
      <p className={screenHelp}>Pick one. Each opens a short walkthrough.</p>

      <div className="grid gap-2">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <button key={row.id} type="button" onClick={() => choose(row.to)} className={nextItem}>
              <span className={`${nextIcon} ${toneClass(row.tone)}`}>
                <Icon size={17} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-[14.5px] text-ink">{row.title}</b>
                <span className="block text-xs text-grey-mid">{row.detail}</span>
              </span>
            </button>
          );
        })}
      </div>
    </WizardFrame>
  );
}

function toneClass(tone: "sage" | "grey" | "amber") {
  if (tone === "sage") return "bg-sage-light text-sage";
  if (tone === "amber") return "bg-amber-light text-amber";
  return "bg-grey-light text-ink";
}
