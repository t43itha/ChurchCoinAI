import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  draftTotals,
  editBlocker,
  hasEntries,
  serviceGivingTotal,
  type CashCount,
  type LineTarget,
  type ServiceDraft,
} from "../../lib/cashCollectionDraft";
import type { InPersonGivingLedger } from "../../lib/inPersonGiving";
import type { Fund } from "../../types";
import CountSheet from "./CountSheet";
import DoneStep from "./DoneStep";
import GivingStep from "./GivingStep";
import ReviewStep, { ReviewFooter } from "./ReviewStep";
import StartStep from "./StartStep";
import TitheStep from "./TitheStep";
import { gbp, shortDate } from "./format";
import { buildSteps, stepIndexOfGiving, type WizardStep } from "./steps";
import { AUTOSAVE_FAILED_MESSAGE, WizardRail, WizardReceipt } from "./WizardSidebars";
import SavedCollectionSummary from "./SavedCollectionSummary";
import StepFooter from "../wizard/StepFooter";
import WizardFrame from "../wizard/WizardFrame";
import { btnLg, btnPrimary } from "../wizard/ui";
import { useCollectionDraft, type CategoryOption } from "./useCollectionDraft";

export interface CashEntryWizardProps {
  funds: Fund[];
  categories: CategoryOption[];
  initialCollection?: InPersonGivingLedger;
  // Scopes the local draft to one user. Pass the signed-in user's id.
  storageScope: string;
  onClose: () => void;
  onBankIt?: () => void;
}

interface CountingState {
  serviceId: string;
  target: LineTarget;
  label: string;
}

const DONE: WizardStep = { kind: "done" };
const UNFINISHED_ENVELOPE_PROMPT = "You've typed an envelope but haven't added it. Leave without adding it?";

function countOf(service: ServiceDraft, target: LineTarget): CashCount | null {
  switch (target.kind) {
    case "offering":
      return service.offering.count;
    case "fund":
      return service.funds.find((line) => line.id === target.lineId)?.count ?? null;
    case "programme":
      return service.programmes.find((line) => line.id === target.lineId)?.count ?? null;
  }
}

export default function CashEntryWizard({
  funds,
  categories,
  initialCollection,
  storageScope,
  onClose,
  onBankIt,
}: CashEntryWizardProps) {
  const wizard = useCollectionDraft({ funds, categories, initialCollection, storageScope });
  const { model, isEdit, saved, saving, error, existingCount, resumable, autosaveFailed } = wizard;
  const { draft, ctx } = model;
  // A saved collection the walkthrough can't reproduce exactly is shown read-only.
  const readOnlyReason = initialCollection ? editBlocker(initialCollection, ctx) : null;
  const readOnly = readOnlyReason !== null;
  const steps = buildSteps(draft);
  const lastMiddle = steps.length - 2;

  // Edit mode opens on the check screen; a new collection starts on Start.
  const [position, setPosition] = useState(() => (isEdit ? lastMiddle : 0));
  const [counting, setCounting] = useState<CountingState | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const unfinishedEnvelopeRef = useRef(false);
  const setUnfinishedEnvelope = useCallback((unfinished: boolean) => {
    unfinishedEnvelopeRef.current = unfinished;
  }, []);

  // Done is only reachable through a successful save, never through the step list.
  const stepPosition = saved ? steps.length - 1 : Math.min(position, lastMiddle);
  const step: WizardStep = saved ? DONE : steps[stepPosition];
  const service = step.kind === "giving" || step.kind === "tithes" ? draft.services[step.serviceIndex] : undefined;
  const countingService = counting ? draft.services.find((candidate) => candidate.id === counting.serviceId) : undefined;
  const hasProgress = step.kind === "giving" || step.kind === "tithes" || step.kind === "review";
  // Done renders from what was submitted, not from the draft that may still be edited.
  const viewModel = saved ? { ...model, draft: saved.draft } : model;

  const go = (next: number) => {
    if (saving) return;
    // Leaving Start begins a new count, which would overwrite an unfinished
    // one, so every route out (button or rail) asks first.
    if (step.kind === "start" && next > 0 && wizard.hasStoredDraft) {
      if (!window.confirm("Start a new count? Your unfinished count will be deleted.")) return;
      wizard.discardStored();
    }
    if (step.kind === "tithes" && next !== stepPosition && unfinishedEnvelopeRef.current) {
      if (!window.confirm(UNFINISHED_ENVELOPE_PROMPT)) return;
    }
    setPosition(Math.max(0, Math.min(next, steps.length - 1)));
    setCounting(null);
    bodyRef.current?.scrollTo({ top: 0 });
  };

  const { discardDraft } = wizard;
  // Closing an unsaved new count asks first. Edit mode has nothing to discard,
  // and a stored draft the user never answered stays in storage.
  const requestClose = useCallback(() => {
    if (saving) return;
    if (!saved && !isEdit && hasEntries(draft)) {
      if (!window.confirm("Discard this count?")) return;
      discardDraft();
    } else if (!saved && unfinishedEnvelopeRef.current) {
      if (!window.confirm(UNFINISHED_ENVELOPE_PROMPT)) return;
    }
    onClose();
  }, [saving, saved, isEdit, draft, discardDraft, onClose]);

  // Escape closes the count sheet first, then the walkthrough.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || saving) return;
      if (counting) setCounting(null);
      else requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [counting, requestClose, saving]);

  const recordAnotherWeek = () => {
    wizard.startFresh();
    setPosition(0);
    setCounting(null);
    bodyRef.current?.scrollTo({ top: 0 });
  };

  const title = (() => {
    if (step.kind === "start") return "Record giving";
    if (service) return `${service.label} · ${shortDate(service.date)}`;
    if (step.kind === "review") return "Check the week";
    return "";
  })();

  const firstService = draft.services[0];
  const nextService = step.kind === "tithes" ? draft.services[step.serviceIndex + 1] : undefined;

  let footer: ReactNode = null;
  if (step.kind === "start") {
    footer = (
      <StepFooter>
        <button type="button" disabled={!firstService} onClick={() => go(1)} className={`${btnPrimary} ${btnLg}`}>
          {firstService ? `Start with ${firstService.label} →` : "Tick a service"}
        </button>
      </StepFooter>
    );
  } else if (step.kind === "giving" && service) {
    footer = (
      <StepFooter label={`${service.label} giving`} value={gbp(serviceGivingTotal(service))}>
        <button type="button" onClick={() => go(stepPosition + 1)} className={`${btnPrimary} ${btnLg}`}>
          Next: tithe envelopes →
        </button>
      </StepFooter>
    );
  } else if (step.kind === "tithes") {
    footer = (
      <StepFooter label="Week so far" value={gbp(draftTotals(draft, ctx).grand)}>
        <button type="button" onClick={() => go(stepPosition + 1)} className={`${btnPrimary} ${btnLg}`}>
          {nextService ? `Next: ${nextService.label} →` : "Check the week →"}
        </button>
      </StepFooter>
    );
  } else if (step.kind === "review" && !readOnly) {
    footer = (
      <StepFooter>
        <ReviewFooter
          model={model}
          saving={saving}
          error={error}
          onSave={(status) => {
            void wizard.submit(status);
          }}
        />
      </StepFooter>
    );
  }

  return (
    <WizardFrame
      ariaLabel="Record giving"
      title={title}
      // Locks every control while a save is in flight, so the request can't be changed or repeated.
      locked={saving}
      onClose={requestClose}
      onBack={step.kind !== "start" && step.kind !== "done" && !readOnly ? () => go(stepPosition - 1) : undefined}
      // Segment index is 0-based: the first step after Start is segment 0.
      progress={hasProgress ? { total: steps.length - 2, current: stepPosition - 1 } : undefined}
      // A read-only collection is shown from the saved entries, not the draft, so the draft's rail and receipt are hidden.
      rail={readOnly ? undefined : <WizardRail draft={draft} steps={steps} current={stepPosition} onGo={go} />}
      receipt={
        readOnly ? undefined : (
          <WizardReceipt model={viewModel} autosaved={!isEdit && !saved} autosaveFailed={autosaveFailed} />
        )
      }
      bodyRef={bodyRef}
      // The receipt that carries this warning is hidden below lg, so the footer repeats it there.
      notice={
        autosaveFailed && !isEdit && !saved ? (
          <p className="mx-4 mb-2 rounded-xl bg-amber-light px-3 py-2.5 text-xs font-semibold text-amber lg:hidden">
            {AUTOSAVE_FAILED_MESSAGE}
          </p>
        ) : undefined
      }
      footer={footer}
      // Covers the whole column, header and footer included, so the count is the only thing in reach.
      overlay={
        counting && countingService ? (
          <CountSheet
            label={counting.label}
            where={`${countingService.label} · ${shortDate(countingService.date)}`}
            initial={countOf(countingService, counting.target)}
            onCancel={() => setCounting(null)}
            onUse={(count) => {
              model.dispatch({
                type: "applyCount",
                serviceId: countingService.id,
                target: counting.target,
                count,
              });
              setCounting(null);
            }}
          />
        ) : undefined
      }
    >
      <fieldset disabled={readOnly} className="contents">
        {step.kind === "start" && (
          <StartStep
            model={model}
            existingCount={existingCount}
            resumable={resumable}
            onResume={wizard.resume}
            onDiscardStored={wizard.discardStored}
          />
        )}
        {/* Keyed by service so switching services never carries local state (an open picker, an unfinished envelope) across. */}
        {step.kind === "giving" && (
          <GivingStep
            key={`${step.kind}:${draft.services[step.serviceIndex].id}`}
            model={model}
            serviceIndex={step.serviceIndex}
            onCount={(target, label) =>
              setCounting({ serviceId: draft.services[step.serviceIndex].id, target, label })
            }
          />
        )}
        {step.kind === "tithes" && (
          <TitheStep
            key={`${step.kind}:${draft.services[step.serviceIndex].id}`}
            model={model}
            serviceIndex={step.serviceIndex}
            onUnfinishedChange={setUnfinishedEnvelope}
          />
        )}
        {step.kind === "review" &&
          (readOnlyReason && initialCollection ? (
            <SavedCollectionSummary ledger={initialCollection} reason={readOnlyReason} />
          ) : (
            <ReviewStep model={model} onEdit={(serviceIndex) => go(stepIndexOfGiving(steps, serviceIndex))} />
          ))}
        {step.kind === "done" && saved && (
          <DoneStep
            model={model}
            saved={saved}
            onBankIt={
              onBankIt
                ? () => {
                    onBankIt();
                    onClose();
                  }
                : undefined
            }
            onRecordAnother={isEdit ? undefined : recordAnotherWeek}
          />
        )}
      </fieldset>
    </WizardFrame>
  );
}
