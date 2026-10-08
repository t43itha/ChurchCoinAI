import { useState } from "react";
import { X } from "lucide-react";
import {
  type AmountField,
  type LineTarget,
  type ServiceDraft,
} from "../../lib/cashCollectionDraft";
import { FundType } from "../../types";
import PaymentCard from "./PaymentCard";
import {
  btnDashed,
  btnMd,
  btnSage,
  card,
  chip,
  chipDashed,
  screenHelp,
  screenTitle,
  tagAmber,
  tagGrey,
  tagSage,
  txtInput,
  Segmented,
} from "../wizard/ui";
import type { FundTypeChoice, WizardModel } from "./useCollectionDraft";

interface GivingStepProps {
  model: WizardModel;
  serviceIndex: number;
  onCount: (target: LineTarget, label: string) => void;
}

const FUND_TYPE_CHOICES: readonly FundTypeChoice[] = ["Designated", "Restricted"];

export function givingActions(model: WizardModel, serviceIndex: number) {
  const service = model.draft.services[serviceIndex];
  const setAmount = (target: LineTarget, field: AmountField, value: string) =>
    model.dispatch({ type: "setAmount", serviceId: service.id, target, field, value });
  return { service, setAmount };
}

// Funds that can still be added to a service: not the general fund, not already on it.
function spareFundsFor(model: WizardModel, service: ServiceDraft) {
  const onCard = service.funds.map((line) => line.fundId);
  return model.funds.filter((fund) => fund._id !== model.ctx.generalFundId && !onCard.includes(fund._id));
}

function FundPicker({
  model,
  serviceIndex,
}: {
  model: WizardModel;
  serviceIndex: number;
}) {
  const { service } = givingActions(model, serviceIndex);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<FundTypeChoice>("Designated");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spare = spareFundsFor(model, service);

  const close = () => {
    setOpen(false);
    setCreating(false);
    setName("");
    setError(null);
  };

  const add = (fundId: string) => {
    model.dispatch({ type: "addFund", serviceId: service.id, fundId, lineId: crypto.randomUUID() });
    close();
  };

  const createAndAdd = async () => {
    setBusy(true);
    setError(null);
    try {
      const fundId = await model.createFund(name, type);
      add(fundId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the fund");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={btnDashed}>
        + Other funds
      </button>
    );
  }

  return (
    <div className={`${card} space-y-3`}>
      <div className="flex items-center justify-between">
        <b className="text-[15px]">Which fund?</b>
        <button type="button" onClick={close} aria-label="Close fund picker" className="flex h-11 w-11 items-center justify-center rounded-[9px] text-grey-mid hover:bg-grey-light">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {spare.map((fund) => (
          <button key={fund._id} type="button" onClick={() => add(fund._id)} className={chip}>
            {fund.name}
          </button>
        ))}
        {!creating && (
          <button type="button" onClick={() => setCreating(true)} className={chipDashed}>
            + New fund
          </button>
        )}
      </div>
      {creating && (
        <div className="space-y-2.5 border-t border-dashed border-ledger pt-3">
          <input
            aria-label="New fund name"
            className={txtInput}
            placeholder="Fund name, e.g. New Keyboard"
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5">
            <Segmented label="Fund type" options={FUND_TYPE_CHOICES} value={type} onChange={setType} />
            <button
              type="button"
              disabled={name.trim().length < 2 || busy}
              onClick={createAndAdd}
              className={`${btnSage} ${btnMd} px-4`}
            >
              Create &amp; add
            </button>
          </div>
          <p className="text-xs text-grey-mid">
            Creates the fund for everyone (Admin and Finance Team). Designated: set aside by the church, e.g. equipment.
            Restricted: the donor's purpose is binding.
          </p>
          {error && <p className="text-xs text-error">{error}</p>}
        </div>
      )}
    </div>
  );
}

function ProgrammePicker({
  model,
  serviceIndex,
}: {
  model: WizardModel;
  serviceIndex: number;
}) {
  const { service } = givingActions(model, serviceIndex);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const used = service.programmes.map((line) => line.programmeId);
  const spare = model.programmes.filter((programme) => !programme.isArchived && !used.includes(programme._id));

  const close = () => {
    setOpen(false);
    setCreating(false);
    setName("");
    setError(null);
  };

  const add = (programmeId: string) => {
    model.dispatch({ type: "addProgramme", serviceId: service.id, programmeId, lineId: crypto.randomUUID() });
    close();
  };

  const createAndAdd = async () => {
    setBusy(true);
    setError(null);
    try {
      add(await model.createProgramme(name));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the programme");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={btnDashed}>
        + Special programme collection
      </button>
    );
  }

  return (
    <div className={`${card} space-y-3`}>
      <div className="flex items-center justify-between">
        <b className="text-[15px]">Which programme?</b>
        <button type="button" onClick={close} aria-label="Close programme picker" className="flex h-11 w-11 items-center justify-center rounded-[9px] text-grey-mid hover:bg-grey-light">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {spare.map((programme) => (
          <button key={programme._id} type="button" onClick={() => add(programme._id)} className={chip}>
            {programme.name}
          </button>
        ))}
        {!creating && (
          <button type="button" onClick={() => setCreating(true)} className={chipDashed}>
            + New programme
          </button>
        )}
      </div>
      {creating && (
        <div className="space-y-2.5 border-t border-dashed border-ledger pt-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5">
            <input
              aria-label="New programme name"
              className={txtInput}
              placeholder="Programme name, e.g. Harvest Thanksgiving"
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <button
              type="button"
              disabled={name.trim().length < 2 || busy}
              onClick={createAndAdd}
              className={`${btnSage} ${btnMd} px-4`}
            >
              Add
            </button>
          </div>
        </div>
      )}
      <p className="text-xs text-grey-mid">Saved as Offering · General Fund, tagged with the programme.</p>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}

export default function GivingStep({ model, serviceIndex, onCount }: GivingStepProps) {
  const { service, setAmount } = givingActions(model, serviceIndex);
  const removeFund = (lineId: string) => model.dispatch({ type: "removeFund", serviceId: service.id, lineId });
  const removeProgramme = (lineId: string) =>
    model.dispatch({ type: "removeProgramme", serviceId: service.id, lineId });

  return (
    <div>
      <h2 className={screenTitle}>What came in on {service.label}?</h2>
      <p className={screenHelp}>Loose giving only. Tithe envelopes come next, one by one.</p>

      <div className="space-y-2.5">
        <PaymentCard
          title="Offering"
          tag={<span className={tagGrey}>General</span>}
          line={service.offering}
          onAmount={(field, value) => setAmount({ kind: "offering" }, field, value)}
          onCount={() => onCount({ kind: "offering" }, "Offering")}
        />

        {service.funds.map((line) => {
          const fund = model.fundById(line.fundId);
          const target: LineTarget = { kind: "fund", lineId: line.id };
          // A missing fund stays on the card so its amount isn't lost; saving waits until another fund is chosen.
          return (
            <PaymentCard
              key={line.id}
              title={model.fundLineLabel(line)}
              tag={
                fund ? (
                  <span className={fund.type === FundType.RESTRICTED ? tagAmber : tagGrey}>{fund.type}</span>
                ) : (
                  <span className={tagAmber}>Fund no longer exists</span>
                )
              }
              line={line}
              removable
              notice={
                fund ? undefined : (
                  <select
                    aria-label="Choose fund"
                    value=""
                    onChange={(event) =>
                      model.dispatch({
                        type: "reassignFundLine",
                        serviceId: service.id,
                        lineId: line.id,
                        fundId: event.target.value,
                      })
                    }
                    className={`${txtInput} mb-2`}
                  >
                    <option value="" disabled>
                      Choose fund
                    </option>
                    {spareFundsFor(model, service).map((choice) => (
                      <option key={choice._id} value={choice._id}>
                        {choice.name}
                      </option>
                    ))}
                  </select>
                )
              }
              onRemove={() => removeFund(line.id)}
              onAmount={(field, value) => setAmount(target, field, value)}
              onCount={() => onCount(target, model.fundLineLabel(line))}
            />
          );
        })}

        <FundPicker model={model} serviceIndex={serviceIndex} />

        {service.programmes.map((line) => {
          const target: LineTarget = { kind: "programme", lineId: line.id };
          return (
            <PaymentCard
              key={line.id}
              title={model.programmeLineLabel(line)}
              tag={<span className={tagSage}>Programme</span>}
              line={line}
              removable
              onRemove={() => removeProgramme(line.id)}
              onAmount={(field, value) => setAmount(target, field, value)}
              onCount={() => onCount(target, model.programmeLineLabel(line))}
            />
          );
        })}

        <ProgrammePicker model={model} serviceIndex={serviceIndex} />
      </div>
    </div>
  );
}
