import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Building2, CalendarClock, Hash, Image as ImageIcon, Mail, MapPin } from "lucide-react";
import type { ChurchDetails } from "../../types";
import WizardFrame from "../wizard/WizardFrame";
import StepFooter from "../wizard/StepFooter";
import { btnGhost, btnLg, btnPrimary, fieldLabel, screenHelp, screenTitle, txtArea, txtInput } from "../wizard/ui";
import { readLogoFile } from "./readLogoFile";

interface ChurchDetailsSheetProps {
  churchDetails: ChurchDetails;
  canEdit: boolean;
  onSave: (details: ChurchDetails) => void;
  onClose: () => void;
}

const FORM_ID = "church-details-form";

function DetailRow({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: ReactNode }) {
  return (
    <div className="border-b border-ledger py-3">
      <p className="flex items-center gap-1.5 text-xs text-grey-mid">
        <Icon size={13} aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-[15px] text-ink">{value}</p>
    </div>
  );
}

export default function ChurchDetailsSheet({ churchDetails, canEdit, onSave, onClose }: ChurchDetailsSheetProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ChurchDetails>(churchDetails);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    setDraft(churchDetails);
    setEditing(true);
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    onSave(draft);
    setEditing(false);
  };

  const logo = editing ? draft.logoUrl : churchDetails.logoUrl;

  return (
    <WizardFrame
      ariaLabel="Church details"
      title="Church details"
      onClose={onClose}
      footer={
        canEdit ? (
          <StepFooter>
            {editing ? (
              <div className="space-y-1.5">
                <button type="submit" form={FORM_ID} className={`${btnPrimary} ${btnLg}`}>
                  Save changes
                </button>
                <button type="button" onClick={() => setEditing(false)} className={btnGhost}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" onClick={startEditing} className={`${btnPrimary} ${btnLg}`}>
                Edit details
              </button>
            )}
          </StepFooter>
        ) : undefined
      }
    >
      <h2 className={screenTitle}>Church details</h2>
      <p className={screenHelp}>Used on PDF schedules and reports.</p>

      <div className="flex items-center gap-4">
        <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-ledger bg-white">
          {logo ? (
            <img src={logo} alt="Church logo" className="h-full w-full object-contain p-1.5" />
          ) : (
            <ImageIcon size={24} className="text-grey-mid" aria-hidden="true" />
          )}
        </div>
        {editing && canEdit && (
          <div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label="Upload church logo"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) readLogoFile(file, (dataUrl) => setDraft((current) => ({ ...current, logoUrl: dataUrl })));
              }}
            />
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="inline-flex min-h-11 items-center text-sm font-bold text-sage"
            >
              {draft.logoUrl ? "Change logo" : "Upload logo"}
            </button>
            <p className="text-xs text-grey-mid">200 × 200px works best. Under 500KB.</p>
          </div>
        )}
      </div>

      {editing && canEdit ? (
        <form id={FORM_ID} onSubmit={save}>
          <label htmlFor="church-name" className={fieldLabel}>
            Organisation name
          </label>
          <input
            id="church-name"
            type="text"
            required
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            className={txtInput}
          />

          <label htmlFor="church-charity" className={fieldLabel}>
            Charity number
          </label>
          <input
            id="church-charity"
            type="text"
            value={draft.charityNumber || ""}
            onChange={(event) => setDraft({ ...draft, charityNumber: event.target.value })}
            className={`${txtInput} font-mono`}
          />

          <label htmlFor="church-email" className={fieldLabel}>
            Contact email
          </label>
          <input
            id="church-email"
            type="email"
            value={draft.email || ""}
            onChange={(event) => setDraft({ ...draft, email: event.target.value })}
            className={txtInput}
          />

          <label htmlFor="church-period" className={fieldLabel}>
            Reporting period
          </label>
          <select
            id="church-period"
            value={draft.reportingPeriod || "tax_year"}
            onChange={(event) =>
              setDraft({ ...draft, reportingPeriod: event.target.value as "tax_year" | "calendar_year" })
            }
            className={txtInput}
          >
            <option value="tax_year">UK tax year (April to April)</option>
            <option value="calendar_year">Calendar year (January to December)</option>
          </select>

          <label htmlFor="church-address" className={fieldLabel}>
            Registered address
          </label>
          <textarea
            id="church-address"
            value={draft.address || ""}
            onChange={(event) => setDraft({ ...draft, address: event.target.value })}
            className={txtArea}
          />
        </form>
      ) : (
        <div className="mt-2">
          <DetailRow icon={Building2} label="Registered name" value={churchDetails.name} />
          <DetailRow icon={Hash} label="Charity number" value={churchDetails.charityNumber || "Not set"} />
          <DetailRow icon={Mail} label="Email" value={churchDetails.email || "Not set"} />
          <DetailRow
            icon={CalendarClock}
            label="Reporting period"
            value={churchDetails.reportingPeriod === "calendar_year" ? "Calendar year (January to December)" : "UK tax year (April to April)"}
          />
          <DetailRow icon={MapPin} label="Address" value={churchDetails.address || "Not set"} />
        </div>
      )}
    </WizardFrame>
  );
}
