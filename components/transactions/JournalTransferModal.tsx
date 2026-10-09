import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { formatLocalDateInputValue } from "../../lib/dateUtils";
import { notify } from "../../lib/notifications";
import type { Fund } from "../../types";
import { gbp } from "../cashEntry/format";
import TransferAmountStep from "../movements/TransferAmountStep";
import TransferDoneStep from "../movements/TransferDoneStep";
import TransferFundsStep from "../movements/TransferFundsStep";
import TransferReceipt from "../movements/TransferReceipt";
import {
  TRANSFER_STEPS,
  amountPence,
  balanceAfterPence,
  previousStepFor,
  railStateFor,
  type TransferStep,
} from "../movements/transferSteps";
import RailStep from "../wizard/RailStep";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import { btnLg, btnPrimary, eyebrow } from "../wizard/ui";

const LABELS: Record<TransferStep, string> = { funds: "Funds", amount: "Amount", done: "Done" };

export interface JournalTransferModalProps {
  funds: Fund[];
  // Opens with a fund and amount already picked, e.g. from an overdrawn fund's "Move money to cover it".
  // The walkthrough still opens on the funds step.
  initialFromFundId?: string;
  initialToFundId?: string;
  initialAmount?: number;
  // Test-only: opens at a later step. The product always opens on the funds step.
  initialStep?: TransferStep;
  onClose: () => void;
}

interface MovedSummary {
  fromName: string;
  toName: string;
  amountPence: number;
}

// Walkthrough for moving money between two funds: pick both funds, then how much and when.
// Nothing is saved until Move money is pressed.
export default function JournalTransferModal({
  funds,
  initialFromFundId = "",
  initialToFundId = "",
  initialAmount,
  initialStep,
  onClose,
}: JournalTransferModalProps) {
  const createJournalTransfer = useMutation(api.mutations.movements.createJournalTransfer);
  const initialAmountText = initialAmount === undefined ? "" : initialAmount.toFixed(2);

  const [position, setPosition] = useState<TransferStep>(initialStep ?? "funds");
  const [fromFundId, setFromFundId] = useState(initialFromFundId);
  const [toFundId, setToFundId] = useState(initialToFundId);
  const [amountText, setAmountText] = useState(initialAmountText);
  const [date, setDate] = useState(() => formatLocalDateInputValue(new Date()));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [moved, setMoved] = useState<MovedSummary | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // The confirmation only exists once a transfer is saved, so a stale "done" position opens on funds.
  const step: TransferStep = moved ? "done" : position === "done" ? "funds" : position;
  const fromFund = funds.find((fund) => fund._id === fromFundId);
  const toFund = funds.find((fund) => fund._id === toFundId);
  const pence = amountPence(amountText);
  const amountError =
    amountText.trim() !== "" && pence === null ? "Enter an amount above £0, with at most 2 decimals." : null;
  const ready =
    fromFund !== undefined && toFund !== undefined && fromFundId !== toFundId && pence !== null && date !== "";
  const overdraftPence =
    fromFund && pence !== null ? Math.max(0, -balanceAfterPence(fromFund.balance, -pence)) : 0;
  // Anything picked or typed since the walkthrough opened, which closing would throw away.
  const dirty =
    !moved &&
    (fromFundId !== initialFromFundId ||
      toFundId !== initialToFundId ||
      amountText !== initialAmountText ||
      note.trim() !== "");

  const requestClose = useCallback(() => {
    if (saving) return;
    if (dirty && !window.confirm("Discard this transfer?")) return;
    onClose();
  }, [saving, dirty, onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  const go = (target: TransferStep) => {
    if (saving) return;
    setPosition(target);
    bodyRef.current?.scrollTo({ top: 0 });
  };

  const moveMoney = async () => {
    if (!ready || !fromFund || !toFund || pence === null) return;
    setSaving(true);
    try {
      await createJournalTransfer({
        fromFundId: fromFund._id as Id<"funds">,
        toFundId: toFund._id as Id<"funds">,
        amount: pence / 100,
        date,
        note: note.trim() || undefined,
      });
      setMoved({ fromName: fromFund.name, toName: toFund.name, amountPence: pence });
      setPosition("done");
      notify("Transfer recorded", "The money has moved between the two funds.");
    } catch (error) {
      notify("Error", error instanceof Error ? error.message : "Failed to record the transfer.");
    } finally {
      setSaving(false);
    }
  };

  const moveMore = () => {
    setMoved(null);
    setFromFundId("");
    setToFundId("");
    setAmountText("");
    setNote("");
    go("funds");
  };

  const previous = previousStepFor(step);

  const rail = (
    <aside className="hidden min-h-0 flex-col overflow-y-auto border-r border-ledger bg-white p-4 lg:flex">
      <div className={`${eyebrow} mx-2.5 mb-1`}>Between funds</div>
      {TRANSFER_STEPS.map((kind, index) => {
        const state = railStateFor(kind, step);
        return (
          <RailStep
            key={kind}
            marker={String(index + 1)}
            label={LABELS[kind]}
            state={state}
            // Once moved, the only way on is the buttons on the done screen.
            disabled={state === "todo" || (step === "done" && kind !== "done")}
            onClick={() => go(kind)}
          />
        );
      })}
    </aside>
  );

  let footer: ReactNode = null;
  if (step === "funds") {
    footer = (
      <StepFooter>
        <button
          type="button"
          disabled={fromFund === undefined || toFund === undefined || fromFundId === toFundId}
          onClick={() => go("amount")}
          className={`${btnPrimary} ${btnLg}`}
        >
          Next: amount
        </button>
      </StepFooter>
    );
  } else if (step === "amount") {
    footer = (
      <StepFooter label="Moving" value={gbp((pence ?? 0) / 100)}>
        <button
          type="button"
          disabled={!ready || saving}
          onClick={() => void moveMoney()}
          className={`${btnPrimary} ${btnLg}`}
        >
          Move money
        </button>
      </StepFooter>
    );
  }

  let body: ReactNode = null;
  if (step === "funds") {
    body = (
      <TransferFundsStep
        funds={funds}
        fromFundId={fromFundId}
        toFundId={toFundId}
        onFrom={setFromFundId}
        onTo={setToFundId}
      />
    );
  } else if (step === "amount") {
    body = (
      <TransferAmountStep
        fromName={fromFund?.name ?? "the fund"}
        toName={toFund?.name ?? "the fund"}
        amountText={amountText}
        onAmountChange={setAmountText}
        amountError={amountError}
        date={date}
        onDateChange={setDate}
        note={note}
        onNoteChange={setNote}
        overdraftPence={overdraftPence}
      />
    );
  } else if (moved) {
    body = (
      <TransferDoneStep
        fromName={moved.fromName}
        toName={moved.toName}
        amountPence={moved.amountPence}
        onMoreMoney={moveMore}
        onDone={onClose}
      />
    );
  }

  return (
    <WizardFrame
      ariaLabel="New transfer between funds"
      title="New transfer between funds"
      // Locks every control while the transfer is being saved, so it can't be repeated.
      locked={saving}
      onClose={requestClose}
      onBack={previous ? () => go(previous) : undefined}
      progress={{ total: TRANSFER_STEPS.length, current: TRANSFER_STEPS.indexOf(step) }}
      rail={rail}
      receipt={step === "done" ? undefined : <TransferReceipt from={fromFund} to={toFund} amountPence={pence} />}
      bodyRef={bodyRef}
      footer={footer}
    >
      {body}
    </WizardFrame>
  );
}
