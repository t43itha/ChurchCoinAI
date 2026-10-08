import type { ReactNode } from "react";
import {
  lineTotal,
  serviceTitheTotal,
  type ServiceDraft,
} from "../../lib/cashCollectionDraft";
import { dayMonth, gbp } from "./format";
import { ReceiptCard, ReceiptRow } from "../wizard/Receipt";
import { eyebrow, linkBtnSm } from "../wizard/ui";
import type { WizardModel } from "./useCollectionDraft";

// A money line: zero shows a dash and greys out.
export function MoneyRow({ label, value, sub, muted }: { label: string; value: number; sub?: boolean; muted?: boolean }) {
  return <ReceiptRow label={label} value={value ? gbp(value) : "—"} sub={sub} muted={muted} dim={!value} />;
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
      <MoneyRow label="Offering" value={lineTotal(service.offering)} />
      {service.funds
        .filter((line) => lineTotal(line) > 0)
        .map((line) => (
          <MoneyRow key={line.id} label={model.fundLineLabel(line)} value={lineTotal(line)} />
        ))}
      {service.programmes.map((line) => (
        <MoneyRow key={line.id} label={model.programmeLineLabel(line)} value={lineTotal(line)} />
      ))}
      <MoneyRow label={tithesLabel} value={serviceTitheTotal(service)} />
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
    <ReceiptCard className={className}>
      {model.draft.services.map((service, index) => (
        <ServiceSection
          key={service.id}
          model={model}
          service={service}
          onEdit={onEdit ? () => onEdit(index) : undefined}
        />
      ))}
      {children}
    </ReceiptCard>
  );
}
