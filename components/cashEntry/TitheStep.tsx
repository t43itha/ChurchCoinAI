import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { sumMoney } from "../../convex/lib/money";
import DonorSearchInput from "../DonorSearchInput";
import {
  parseAmount,
  serviceTitheTotal,
  type TitheEnvelope,
  type TitheMethod,
} from "../../lib/cashCollectionDraft";
import { gbp, initialsOf } from "./format";
import {
  amtBox,
  amtInput,
  amtSymbol,
  btnOutline,
  btnSage,
  btnMd,
  card,
  giftAidOn,
  screenHelp,
  screenTitle,
  Segmented,
} from "./ui";
import type { WizardModel } from "./useCollectionDraft";

interface TitheStepProps {
  model: WizardModel;
  serviceIndex: number;
}

type EntryMethod = Extract<TitheMethod, "Cash" | "Cheque">;
const METHODS: readonly EntryMethod[] = ["Cash", "Cheque"];

interface PickedDonor {
  donorId?: string;
  name: string;
  giftAid: boolean;
}

function EnvelopeBadge({ envelope }: { envelope: TitheEnvelope }) {
  if (envelope.anonymous) return <span>no Gift Aid</span>;
  if (envelope.giftAid) return <span className={giftAidOn}>Gift Aid ✓</span>;
  return <span>{envelope.donorId ? "no declaration" : "new donor · no declaration"}</span>;
}

export default function TitheStep({ model, serviceIndex }: TitheStepProps) {
  const service = model.draft.services[serviceIndex];
  const [name, setName] = useState("");
  const [donor, setDonor] = useState<PickedDonor | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<EntryMethod>("Cash");
  // Remounting the name field after each add clears its dropdown and refocuses it.
  const [nameKey, setNameKey] = useState(0);
  const [freshId, setFreshId] = useState<string | null>(null);

  useEffect(() => {
    if (!freshId) return;
    const timer = setTimeout(() => setFreshId(null), 600);
    return () => clearTimeout(timer);
  }, [freshId]);

  const amountValue = parseAmount(amount);
  const canAddNamed = amountValue > 0 && (donor !== null || name.trim().length >= 2);
  const canAddAnonymous = amountValue > 0;

  const addEnvelope = (anonymous: boolean) => {
    if (anonymous ? !canAddAnonymous : !canAddNamed) return;
    const id = crypto.randomUUID();
    const envelope: TitheEnvelope = anonymous
      ? { id, donorName: "", anonymous: true, amount, method, giftAid: false }
      : {
          id,
          donorId: donor?.donorId,
          donorName: donor?.name ?? name.trim(),
          anonymous: false,
          amount,
          method,
          giftAid: donor?.giftAid ?? false,
        };
    model.dispatch({ type: "addTithe", serviceId: service.id, envelope });
    setName("");
    setDonor(null);
    setAmount("");
    setNameKey((key) => key + 1);
    setFreshId(id);
  };

  const named = service.tithes.filter((tithe) => !tithe.anonymous).length;
  const anonymous = service.tithes.length - named;
  const giftAidEnvelopes = service.tithes.filter((tithe) => tithe.giftAid);
  const giftAidTotal = sumMoney(giftAidEnvelopes, (tithe) => parseAmount(tithe.amount));

  return (
    <div>
      <h2 className={screenTitle}>Tithe envelopes</h2>
      <p className={screenHelp}>
        Type the name, pick it, enter the amount and press Add. You'll go straight back to the name for the next one.
      </p>

      <div className={`${card} grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_120px_150px_auto_auto] lg:items-start`}>
        <div className="min-w-0">
          <DonorSearchInput
            key={nameKey}
            value={name}
            autoFocus
            placeholder="Name on the envelope"
            onChange={(value) => {
              setName(value);
              setDonor(null);
            }}
            onDonorSelect={(picked) => {
              setDonor({ donorId: picked.donorId ?? undefined, name: picked.donorName, giftAid: picked.isGiftAidActive });
              setName(picked.donorName);
            }}
          />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_128px] gap-2 lg:contents">
          <label className={amtBox}>
            <span className={amtSymbol}>£</span>
            <input
              aria-label="Envelope amount"
              inputMode="decimal"
              placeholder="0.00"
              autoComplete="off"
              enterKeyHint="done"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addEnvelope(false);
                }
              }}
              className={amtInput}
            />
          </label>
          <Segmented label="Paid by" options={METHODS} value={method} onChange={setMethod} />
        </div>

        <div className="grid grid-cols-2 gap-2 lg:contents">
          <button
            type="button"
            onClick={() => addEnvelope(true)}
            disabled={!canAddAnonymous}
            className={`${btnOutline} ${btnMd} lg:w-auto lg:px-4`}
          >
            No name on it
          </button>
          <button
            type="button"
            onClick={() => addEnvelope(false)}
            disabled={!canAddNamed}
            className={`${btnSage} ${btnMd} lg:w-auto lg:px-4`}
          >
            Add envelope
          </button>
        </div>
      </div>

      {service.tithes.length > 0 ? (
        <>
          <div className="mb-2 mt-4 flex items-center justify-between gap-3 px-0.5 text-xs text-grey-mid">
            <span>
              {named} named{anonymous ? ` · ${anonymous} anonymous` : ""} · {giftAidEnvelopes.length} Gift Aid{" "}
              {gbp(giftAidTotal)}
            </span>
            <b className="font-mono text-sm text-ink">{gbp(serviceTitheTotal(service))}</b>
          </div>
          <ul className="space-y-1.5">
            {service.tithes.map((tithe) => (
              <li
                key={tithe.id}
                className={`flex items-center gap-2.5 rounded-2xl border border-ledger px-3 py-2.5 transition-colors duration-500 ${
                  freshId === tithe.id ? "bg-sage-light" : "bg-white"
                }`}
              >
                <div
                  className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    tithe.anonymous ? "bg-grey-light text-grey-mid" : "bg-sage-light text-sage"
                  }`}
                >
                  {tithe.anonymous ? "?" : initialsOf(tithe.donorName)}
                </div>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{tithe.anonymous ? "Anonymous envelope" : tithe.donorName}</b>
                  <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-grey-mid">
                    {tithe.method} · <EnvelopeBadge envelope={tithe} />
                  </span>
                </div>
                <span className="whitespace-nowrap font-mono text-sm font-bold">{gbp(parseAmount(tithe.amount))}</span>
                <button
                  type="button"
                  aria-label={tithe.anonymous ? "Remove anonymous envelope" : `Remove ${tithe.donorName}`}
                  onClick={() => model.dispatch({ type: "removeTithe", serviceId: service.id, envelopeId: tithe.id })}
                  className="flex h-11 w-11 shrink-0 items-center justify-center -mr-2 rounded-[9px] text-grey-mid hover:bg-error-light hover:text-error"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-6 text-center text-sm text-grey-mid">No envelopes yet.</p>
      )}
    </div>
  );
}
