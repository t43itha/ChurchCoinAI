import type { ReactNode } from "react";
import {
  lineTotal,
  serviceTitheTotal,
  type ServiceDraft,
} from "../../lib/cashCollectionDraft";
import { dayMonth, gbp } from "./format";
import { eyebrow, linkBtnSm, receipt } from "./ui";
import type { WizardModel } from "./useCollectionDraft";

export function ReceiptRow({ label, value, sub, muted }: { label: string; value: number; sub?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between gap-2.5 py-1 text-sm ${value ? "" : "text-[#b8b3ab]"}`}>
      <span className={`min-w-0 ${sub ? "pl-3 text-grey-dark" : ""} ${muted ? "text-grey-mid" : ""}`}>{label}</span>
      <span className="whitespace-nowrap font-mono font-semibold">{value ? gbp(value) : "—"}</span>
    </div>
  );
}

function ServiceSection({
  model,
  service,
  onEdit,
}: {
  model: WizardModel;
  service: ServiceDraft;
  onEdit?: () => void;
}) {
  const named = service.tithes.filter((tithe) => !tithe.anonymous).length;
  const anonymous = service.tithes.length - named;
  const tithesLabel = service.tithes.length
    ? `Tithes · ${named} named${anonymous ? ` + ${anonymous} anon` : ""}`
    : "Tithes";

  return (
    <div>
      <div className="mb-1 mt-1.5 flex items-center justify-between gap-2">
        <span className={eyebrow}>
          {service.label} · {dayMonth(service.date)}
        </span>
        {onEdit && (
          <button type="button" onClick={onEdit} className={linkBtnSm}>
            Edit
          </button>
        )}
      </div>
      <ReceiptRow label="Offering" value={lineTotal(service.offering)} />
      {service.funds
        .filter((line) => lineTotal(line) > 0)
        .map((line) => (
          <ReceiptRow key={line.fundId} label={model.fundName(line.fundId)} value={lineTotal(line)} />
        ))}
      {service.programmes.map((line) => (
        <ReceiptRow key={line.programmeId} label={model.programmeName(line.programmeId)} value={lineTotal(line)} />
      ))}
      <ReceiptRow label={tithesLabel} value={serviceTitheTotal(service)} />
      <div className="my-2 border-t border-dashed border-ledger" />
    </div>
  );
}

// Per-service receipt. The review step passes onEdit; the live side panel does not.
export default function Receipt({
  model,
  onEdit,
  className = "",
  children,
}: {
  model: WizardModel;
  onEdit?: (serviceIndex: number) => void;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`${receipt} ${className}`}>
      {model.draft.services.map((service, index) => (
        <ServiceSection
          key={service.id}
          model={model}
          service={service}
          onEdit={onEdit ? () => onEdit(index) : undefined}
        />
      ))}
      {children}
    </div>
  );
}
