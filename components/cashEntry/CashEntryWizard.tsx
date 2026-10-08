import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, X } from "lucide-react";
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
import { WizardRail, WizardReceipt } from "./WizardSidebars";
import SavedCollectionSummary from "./SavedCollectionSummary";
import { btnLg, btnPrimary } from "./ui";
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

function StepFooter({ label, value, children }: { label?: string; value?: number; children: ReactNode }) {
  return (
    <div className="shrink-0 border-t border-ledger bg-paper px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:px-8 lg:pb-6">
      {label !== undefined && value !== undefined && (
        <div className="mb-2.5 flex items-baseline justify-between px-0.5 text-xs text-grey-mid">
          <span>{label}</span>
          <b className="font-mono text-sm text-ink">{gbp(value)}</b>
        </div>
      )}
      {children}
    </div>
  );
}

// The walkthrough is a full-screen sheet below lg and a centred three-column
// panel from lg up. The portal is skipped when there is no document (static
// markup in tests), so the same tree renders in both places.
export default function CashEntryWizard(props: CashEntryWizardProps) {
  const panel = <WizardPanel {...props} />;
  if (typeof document === "undefined") return panel;
  return createPortal(panel, document.body);
}

function WizardPanel({
  funds,
  categories,
  initialCollection,
  storageScope,
  onClose,
  onBankIt,
}: CashEntryWizardProps) {
  const wizard = useCollectionDraft({ funds, categories, initialCollection, storageScope });
  const { model, isEdit, saved, saving, error, existingCount, resumable } = wizard;
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

  return (
    <div className="fixed inset-0 z-50 bg-paper lg:flex lg:items-center lg:justify-center lg:bg-ink/45 lg:p-6">
      {/* Locks every control while a save is in flight, so the request can't be changed or repeated. */}
      <fieldset disabled={saving} className="contents">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Record giving"
          className={`flex h-full w-full flex-col bg-paper lg:grid lg:h-[min(820px,100%)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden lg:rounded-3xl lg:border lg:border-ledger lg:shadow-soft-lg ${readOnly ? "lg:max-w-2xl lg:grid-cols-[minmax(0,1fr)]" : "lg:max-w-6xl lg:grid-cols-[230px_minmax(0,1fr)_310px]"}`}
        >
          {/* A read-only collection is shown from the saved entries, not the draft, so the draft's rail and receipt are hidden. */}
          {!readOnly && <WizardRail draft={draft} steps={steps} current={stepPosition} onGo={go} />}

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="flex shrink-0 items-center gap-2 px-3 pt-3 lg:px-6 lg:pt-5">
              {step.kind !== "start" && step.kind !== "done" && !readOnly ? (
                <button
                  type="button"
                  onClick={() => go(stepPosition - 1)}
                  aria-label="Back"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] text-grey-dark hover:bg-white"
                >
                  <ChevronLeft size={22} aria-hidden="true" />
                </button>
              ) : (
                <span className="h-11 w-11 shrink-0" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1 truncate text-center text-[15px] font-bold text-ink">{title}</div>
              <button
                type="button"
                onClick={requestClose}
                aria-label="Close"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] text-grey-dark hover:bg-white"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>

            {hasProgress && (
              <div className="flex shrink-0 gap-1 px-4 pb-1 pt-2.5 lg:px-6" aria-hidden="true">
                {steps.slice(1, -1).map((_, index) => {
                  const segment = index + 1;
                  const tone =
                    segment < stepPosition ? "bg-sage" : segment === stepPosition ? "bg-ink" : "bg-ledger";
                  return <span key={segment} className={`h-1 flex-1 rounded-full ${tone}`} />;
                })}
              </div>
            )}

            <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4 lg:px-8">
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
                {step.kind === "giving" && (
                  <GivingStep
                    model={model}
                    serviceIndex={step.serviceIndex}
                    onCount={(target, label) =>
                      setCounting({ serviceId: draft.services[step.serviceIndex].id, target, label })
                    }
                  />
                )}
                {step.kind === "tithes" && <TitheStep model={model} serviceIndex={step.serviceIndex} />}
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
            </div>

            {step.kind === "start" && (
              <StepFooter>
                <button
                  type="button"
                  disabled={!firstService}
                  onClick={() => {
                    // A new count would overwrite the unfinished one, so ask first.
                    if (wizard.hasStoredDraft) {
                      if (!window.confirm("Start a new count? Your unfinished count will be deleted.")) return;
                      wizard.discardStored();
                    }
                    go(1);
                  }}
                  className={`${btnPrimary} ${btnLg}`}
                >
                  {firstService ? `Start with ${firstService.label} →` : "Tick a service"}
                </button>
              </StepFooter>
            )}

            {step.kind === "giving" && service && (
              <StepFooter label={`${service.label} giving`} value={serviceGivingTotal(service)}>
                <button type="button" onClick={() => go(stepPosition + 1)} className={`${btnPrimary} ${btnLg}`}>
                  Next: tithe envelopes →
                </button>
              </StepFooter>
            )}

            {step.kind === "tithes" && (
              <StepFooter label="Week so far" value={draftTotals(draft, ctx).grand}>
                <button type="button" onClick={() => go(stepPosition + 1)} className={`${btnPrimary} ${btnLg}`}>
                  {nextService ? `Next: ${nextService.label} →` : "Check the week →"}
                </button>
              </StepFooter>
            )}

            {step.kind === "review" && !readOnly && (
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
            )}

            {/* Covers the whole column, header and footer included, so the count is the only thing in reach. */}
            {counting && countingService && (
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
            )}
          </div>

          {!readOnly && <WizardReceipt model={viewModel} autosaved={!isEdit && !saved} />}
        </div>
      </fieldset>
    </div>
  );
}
