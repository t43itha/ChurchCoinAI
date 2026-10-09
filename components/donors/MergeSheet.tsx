import type { Donor } from "../../types";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import { btnLg, btnPrimary, card, tagAmber, tagSage, tickRow } from "../wizard/ui";

export type DuplicateDonor = Pick<Donor, "_id" | "name" | "email" | "phone" | "isGiftAidActive">;

export interface DuplicateGroup {
  donors: DuplicateDonor[];
  suggestedPrimary?: string;
}

export interface MergeSheetProps {
  groups: DuplicateGroup[];
  giftAidEnabled: boolean;
  selectedGroup: number | null;
  selectedPrimaryId: string | null;
  busy: boolean;
  onPick: (groupIndex: number, donorId: string) => void;
  onMerge: (groupIndex: number) => void;
  onClose: () => void;
}

// Auto-detected duplicates. Pick the donor to keep in one group; the others merge into it.
export default function MergeSheet({
  groups,
  giftAidEnabled,
  selectedGroup,
  selectedPrimaryId,
  busy,
  onPick,
  onMerge,
  onClose,
}: MergeSheetProps) {
  const chosen = selectedGroup !== null ? groups[selectedGroup] : undefined;
  const keep = chosen?.donors.find((donor) => donor._id === selectedPrimaryId);

  return (
    <WizardFrame
      ariaLabel="Merge duplicate donors"
      title="Merge duplicates"
      onClose={onClose}
      footer={
        <StepFooter>
          <button
            type="button"
            disabled={!chosen || !keep || busy}
            onClick={() => selectedGroup !== null && onMerge(selectedGroup)}
            className={`${btnPrimary} ${btnLg}`}
          >
            {busy ? "Merging…" : keep && chosen ? `Merge ${chosen.donors.length - 1} into ${keep.name}` : "Pick the donor to keep"}
          </button>
        </StepFooter>
      }
    >
      <p className="text-sm text-grey-mid">
        Found {groups.length} group{groups.length === 1 ? "" : "s"} of possible duplicates. Pick the donor to keep, and
        the others merge into it.
      </p>

      <div className="mt-4 grid gap-5">
        {groups.map((group, groupIndex) => (
          <section key={groupIndex} className={`${card} grid gap-2`} aria-label={`Group ${groupIndex + 1}`}>
            <p className="text-xs font-bold uppercase tracking-wide text-grey-mid">
              Group {groupIndex + 1} · {group.donors.length} donors
            </p>
            {group.donors.map((donor) => {
              const on = selectedGroup === groupIndex && selectedPrimaryId === donor._id;
              const suggested = group.suggestedPrimary === donor._id;
              return (
                <button
                  key={donor._id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onPick(groupIndex, donor._id)}
                  className={`${tickRow} ${on ? "border-ink" : "border-ledger"}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                      {donor.name}
                      {suggested && <span className={tagSage}>Suggested</span>}
                      {on && <span className={tagAmber}>Keep</span>}
                    </span>
                    <span className="block truncate text-xs text-grey-mid">
                      {[donor.email, donor.phone].filter(Boolean).join(" · ") || "No contact info"}
                      {giftAidEnabled && donor.isGiftAidActive ? " · Gift Aid" : ""}
                    </span>
                  </span>
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </WizardFrame>
  );
}
