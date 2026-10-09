import { useEffect, useCallback, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { linkState } from "../../lib/movementMatching";
import { notify } from "../../lib/notifications";
import type { Fund, Transaction } from "../../types";
import LinkDoneStep from "../movements/LinkDoneStep";
import {
  OtherSideStep,
  LinkSummary,
  ReceivedLoanStep,
  RepaymentStep,
  type LinkFormProps,
} from "../movements/LinkMatchStep";
import {
  LINK_STEPS,
  linkedSummary,
  railStateFor,
  type LinkArgs,
  type LinkedWith,
  type LinkStep,
} from "../movements/linkSteps";
import RailStep from "../wizard/RailStep";
import WizardFrame from "../wizard/WizardFrame";
import { eyebrow } from "../wizard/ui";

const LABELS: Record<LinkStep, string> = { match: "Match", done: "Done" };

// Shows the form for the way this transaction is waiting: the other side of a transfer or
// returned payment, or a loan received (Income) or repaid (Expenditure).
export function LinkMovementPanel(props: LinkFormProps) {
  const { transaction } = props;
  const state = linkState(transaction);
  if (state.status !== "waiting") return null;
  return (
    <>
      <LinkSummary transaction={transaction} funds={props.funds} />
      {state.kind === "loan" ? (
        transaction.type === "Income" ? <ReceivedLoanStep {...props} /> : <RepaymentStep {...props} />
      ) : (
        <OtherSideStep {...props} kind={state.kind} />
      )}
    </>
  );
}

export interface LinkMovementModalProps {
  transaction: Transaction;
  transactions: Transaction[];
  funds: Fund[];
  // Test-only: opens at a later step. The product always opens on the match step.
  initialStep?: LinkStep;
  onClose: () => void;
}

// Walkthrough for linking this transaction to the other side of its movement.
export default function LinkMovementModal({ transaction, transactions, funds, initialStep, onClose }: LinkMovementModalProps) {
  const link = useMutation(api.mutations.movements.link);
  const state = linkState(transaction);
  const isLoan = state.status === "waiting" && state.kind === "loan";
  const loans = useQuery(api.queries.movements.listLoans, isLoan ? {} : "skip");
  const [isSaving, setIsSaving] = useState(false);
  const [linked, setLinked] = useState<{ summary: string | null } | null>(
    initialStep === "done" ? { summary: null } : null
  );
  const step: LinkStep = linked ? "done" : "match";

  const requestClose = useCallback(() => {
    if (!isSaving) onClose();
  }, [isSaving, onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  const handleLink = async (args: LinkArgs, linkedWith: LinkedWith) => {
    setIsSaving(true);
    try {
      await link(args);
      notify("Linked", "Both sides are now linked.");
      setLinked({ summary: linkedSummary(linkedWith) });
    } catch (error) {
      notify("Error", error instanceof Error ? error.message : "Failed to link this transaction.");
    } finally {
      setIsSaving(false);
    }
  };

  const rail = (
    <aside className="hidden min-h-0 flex-col overflow-y-auto border-r border-ledger bg-white p-4 lg:flex">
      <div className={`${eyebrow} mx-2.5 mb-1`}>Movement</div>
      {LINK_STEPS.map((kind, index) => (
        <RailStep
          key={kind}
          marker={String(index + 1)}
          label={LABELS[kind]}
          state={railStateFor(kind, step)}
          // The steps follow one another, so the rail only shows progress.
          disabled
          onClick={() => undefined}
        />
      ))}
    </aside>
  );

  return (
    <WizardFrame
      ariaLabel="Link other side"
      title="Link other side"
      // Locks every control while the link is being saved, so it can't be repeated.
      locked={isSaving}
      onClose={requestClose}
      progress={{ total: LINK_STEPS.length, current: LINK_STEPS.indexOf(step) }}
      rail={rail}
    >
      {step === "done" ? (
        <LinkDoneStep summary={linked?.summary ?? null} onDone={onClose} />
      ) : (
        <LinkMovementPanel
          transaction={transaction}
          transactions={transactions}
          funds={funds}
          loans={loans}
          isSaving={isSaving}
          onLink={(args, linkedWith) => void handleLink(args, linkedWith)}
        />
      )}
    </WizardFrame>
  );
}
