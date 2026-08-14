import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Lightbulb,
  ListChecks,
  Loader2,
  MessageCircleQuestion,
  Send,
  ShieldCheck,
  TicketCheck,
  X,
} from "lucide-react";
import type { Id } from "../convex/_generated/dataModel";
import {
  SUPPORT_STATUS_LABELS,
  SupportTicketImpact,
  SupportTicketStatus,
  SupportTicketType,
  validateSupportTicketInput,
} from "../lib/supportTickets";
import { takeSupportDraft } from "../lib/supportDraft";

type SupportCenterProps = {
  open: boolean;
  onClose: () => void;
};

type SupportTicketListItem = {
  _id: Id<"supportTickets">;
  reference: string;
  type: SupportTicketType;
  impact: SupportTicketImpact;
  title: string;
  description: string;
  status: SupportTicketStatus;
  createdAt: number;
  updatedAt: number;
};

const submitSupportTicket = makeFunctionReference<
  "mutation",
  {
    type: SupportTicketType;
    impact: SupportTicketImpact;
    title: string;
    description: string;
    expectedBehaviour?: string;
    reproductionSteps?: string;
    appPath: string;
    appRelease: string;
    browserSummary: string;
  },
  { ticketId: Id<"supportTickets">; reference: string }
>("mutations/supportTickets:submit");

const listMySupportTickets = makeFunctionReference<
  "query",
  Record<string, never>,
  SupportTicketListItem[]
>("queries/supportTickets:listMine");

type SupportForm = {
  type: SupportTicketType;
  impact: SupportTicketImpact;
  title: string;
  description: string;
  expectedBehaviour: string;
  reproductionSteps: string;
};

const EMPTY_FORM: SupportForm = {
  type: "bug",
  impact: "difficult",
  title: "",
  description: "",
  expectedBehaviour: "",
  reproductionSteps: "",
};

const typeOptions: Array<{
  value: SupportTicketType;
  label: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    value: "bug",
    label: "Something's wrong",
    description: "A feature is not working as expected",
    icon: AlertCircle,
  },
  {
    value: "question",
    label: "I need help",
    description: "A question about using ChurchCoin",
    icon: MessageCircleQuestion,
  },
  {
    value: "feature",
    label: "I have an idea",
    description: "A suggestion that could improve the product",
    icon: Lightbulb,
  },
];

const impactOptions: Array<{ value: SupportTicketImpact; label: string }> = [
  { value: "blocking", label: "Blocking my work" },
  { value: "difficult", label: "Difficult to continue" },
  { value: "minor", label: "Minor issue" },
];

const statusTone: Record<SupportTicketStatus, string> = {
  submitted: "bg-grey-light text-grey-dark border-ledger",
  under_review: "bg-amber-light text-amber-dark border-amber/25",
  in_progress: "bg-[#eef3ee] text-sage-dark border-sage/25",
  waiting_for_reporter: "bg-amber-light text-amber-dark border-amber/25",
  resolved: "bg-[#eef3ee] text-sage-dark border-sage/25",
  closed: "bg-grey-light text-grey-dark border-ledger",
};

const formatDate = (timestamp: number) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(timestamp);

const SupportCenter: React.FC<SupportCenterProps> = ({ open, onClose }) => {
  const location = useLocation();
  const submitTicket = useMutation(submitSupportTicket);
  const tickets = useQuery(listMySupportTickets, open ? {} : "skip");
  const [view, setView] = useState<"new" | "requests">("new");
  const [form, setForm] = useState<SupportForm>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedReference, setSubmittedReference] = useState<string | null>(
    null
  );
  const titleInputRef = useRef<HTMLInputElement>(null);

  const appRelease = useMemo(
    () => import.meta.env.VITE_APP_RELEASE?.trim() || import.meta.env.MODE,
    []
  );
  const browserSummary = useMemo(() => {
    if (typeof navigator === "undefined") return "unknown";
    return navigator.userAgent.slice(0, 300);
  }, []);

  useEffect(() => {
    if (!open) return;
    const draft = takeSupportDraft();
    if (draft) {
      setForm((current) => ({
        ...current,
        type: draft.type ?? current.type,
        impact: draft.impact ?? current.impact,
        title: draft.title ?? current.title,
        description: draft.description ?? current.description,
      }));
      setView("new");
    }
    const focusTimer = window.setTimeout(() => titleInputRef.current?.focus(), 80);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isSubmitting, onClose, open]);

  if (!open) return null;

  const updateForm = <Key extends keyof SupportForm>(
    key: Key,
    value: SupportForm[Key]
  ) => setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      validateSupportTicketInput(form);
      setIsSubmitting(true);
      const result = await submitTicket({
        ...form,
        expectedBehaviour: form.expectedBehaviour || undefined,
        reproductionSteps: form.reproductionSteps || undefined,
        // Query strings can contain opaque IDs or callback tokens, so only the
        // route is collected automatically.
        appPath: location.pathname,
        appRelease,
        browserSummary,
      });
      setSubmittedReference(result.reference);
      setForm(EMPTY_FORM);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Your request could not be submitted. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeAndReset = () => {
    if (isSubmitting) return;
    setError(null);
    setSubmittedReference(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-5">
      <button
        type="button"
        className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
        onClick={closeAndReset}
        aria-label="Close support centre"
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-centre-title"
        className="relative flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-[18px] border border-ledger bg-paper shadow-2xl sm:max-h-[88vh] sm:max-w-[760px] sm:rounded-[16px]"
      >
        <header className="flex items-start justify-between border-b border-ledger bg-white px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#e4d0b5] bg-amber-light text-amber-dark">
              <CircleHelp size={19} strokeWidth={2} />
            </span>
            <div>
              <h2 id="support-centre-title" className="text-[16px] font-bold text-ink">
                Help & feedback
              </h2>
              <p className="mt-0.5 text-[12px] text-grey-mid">
                Tell us what you need and keep track of the response.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeAndReset}
            disabled={isSubmitting}
            className="rounded-[9px] p-2 text-grey-mid transition-colors hover:bg-grey-light hover:text-ink disabled:opacity-40"
            aria-label="Close support centre"
          >
            <X size={18} />
          </button>
        </header>

        <div className="grid grid-cols-2 border-b border-ledger bg-white px-5 sm:px-6">
          <button
            type="button"
            onClick={() => setView("new")}
            className={`flex items-center justify-center gap-2 border-b-2 px-3 py-3 text-[12px] font-bold transition-colors ${
              view === "new"
                ? "border-ink text-ink"
                : "border-transparent text-grey-mid hover:text-ink"
            }`}
          >
            <Send size={14} /> New request
          </button>
          <button
            type="button"
            onClick={() => setView("requests")}
            className={`flex items-center justify-center gap-2 border-b-2 px-3 py-3 text-[12px] font-bold transition-colors ${
              view === "requests"
                ? "border-ink text-ink"
                : "border-transparent text-grey-mid hover:text-ink"
            }`}
          >
            <ListChecks size={14} /> My requests
            {tickets && tickets.length > 0 && (
              <span className="rounded-full bg-grey-light px-1.5 py-0.5 font-mono text-[9px] text-grey-dark">
                {tickets.length}
              </span>
            )}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {view === "new" ? (
            submittedReference ? (
              <div className="flex min-h-[470px] flex-col items-center justify-center px-6 py-12 text-center">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-sage/20 bg-[#eef3ee] text-sage-dark">
                  <TicketCheck size={27} strokeWidth={1.8} />
                </span>
                <p className="mt-5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-sage-dark">
                  Request submitted
                </p>
                <h3 className="mt-2 text-[22px] font-bold tracking-tight text-ink">
                  We have it from here.
                </h3>
                <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-grey-mid">
                  Your reference is <strong className="font-mono text-ink">{submittedReference}</strong>.
                  You can follow its progress under My requests.
                </p>
                <div className="mt-7 flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSubmittedReference(null);
                      setView("requests");
                    }}
                    className="btn-primary inline-flex min-h-10 items-center gap-2 px-4 text-[12px] font-bold"
                  >
                    View my requests <ChevronRight size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={closeAndReset}
                    className="btn-outline min-h-10 px-4 text-[12px] font-bold"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6 p-5 sm:p-6">
                <fieldset>
                  <legend className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.09em] text-grey-mid">
                    What can we help with?
                  </legend>
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    {typeOptions.map((option) => {
                      const Icon = option.icon;
                      const selected = form.type === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => updateForm("type", option.value)}
                          className={`rounded-[11px] border p-3.5 text-left transition-all ${
                            selected
                              ? "border-ink bg-white shadow-soft-sm"
                              : "border-ledger bg-[#fcfbf9] hover:border-grey-mid"
                          }`}
                        >
                          <Icon
                            size={17}
                            className={selected ? "text-amber-dark" : "text-grey-mid"}
                          />
                          <span className="mt-2 block text-[12px] font-bold text-ink">
                            {option.label}
                          </span>
                          <span className="mt-1 block text-[10.5px] leading-[1.4] text-grey-mid">
                            {option.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="sm:col-span-2">
                    <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.09em] text-grey-mid">
                      Short title
                    </span>
                    <input
                      ref={titleInputRef}
                      value={form.title}
                      onChange={(event) => updateForm("title", event.target.value)}
                      maxLength={120}
                      required
                      placeholder="e.g. Imported transaction will not save"
                      className="w-full rounded-[10px] border border-ledger bg-white px-3.5 py-3 text-[13px] text-ink outline-none"
                    />
                  </label>

                  <label className="sm:col-span-2">
                    <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.09em] text-grey-mid">
                      What happened?
                    </span>
                    <textarea
                      value={form.description}
                      onChange={(event) =>
                        updateForm("description", event.target.value)
                      }
                      maxLength={5_000}
                      required
                      rows={4}
                      placeholder="Describe what you were trying to do and what went wrong. Please leave out donor, transaction and banking details."
                      className="w-full resize-y rounded-[10px] border border-ledger bg-white px-3.5 py-3 text-[13px] leading-relaxed text-ink outline-none"
                    />
                  </label>

                  {form.type === "bug" && (
                    <>
                      <label>
                        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.09em] text-grey-mid">
                          What did you expect?
                        </span>
                        <textarea
                          value={form.expectedBehaviour}
                          onChange={(event) =>
                            updateForm("expectedBehaviour", event.target.value)
                          }
                          maxLength={2_000}
                          rows={3}
                          placeholder="What should have happened?"
                          className="w-full resize-y rounded-[10px] border border-ledger bg-white px-3.5 py-3 text-[13px] leading-relaxed text-ink outline-none"
                        />
                      </label>
                      <label>
                        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.09em] text-grey-mid">
                          Steps to reproduce
                        </span>
                        <textarea
                          value={form.reproductionSteps}
                          onChange={(event) =>
                            updateForm("reproductionSteps", event.target.value)
                          }
                          maxLength={3_000}
                          rows={3}
                          placeholder="1. Open…  2. Select…  3. See…"
                          className="w-full resize-y rounded-[10px] border border-ledger bg-white px-3.5 py-3 text-[13px] leading-relaxed text-ink outline-none"
                        />
                      </label>
                    </>
                  )}
                </div>

                <fieldset>
                  <legend className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.09em] text-grey-mid">
                    How much is this affecting you?
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {impactOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={form.impact === option.value}
                        onClick={() => updateForm("impact", option.value)}
                        className={`min-h-9 rounded-full border px-3.5 text-[11px] font-bold transition-colors ${
                          form.impact === option.value
                            ? "border-ink bg-ink text-white"
                            : "border-ledger bg-white text-grey-dark hover:border-grey-mid"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="flex items-start gap-3 rounded-[11px] border border-sage/20 bg-[#f5f8f5] p-3.5">
                  <ShieldCheck size={17} className="mt-0.5 shrink-0 text-sage-dark" />
                  <p className="text-[11px] leading-relaxed text-grey-dark">
                    We automatically include only the current page, app release and browser type.
                    Please do not enter donor names, transaction details, bank information or passwords.
                  </p>
                </div>

                {error && (
                  <div className="flex items-start gap-2.5 rounded-[10px] border border-error/25 bg-error-light px-3.5 py-3 text-[12px] text-error" role="alert">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex flex-col-reverse gap-3 border-t border-ledger pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[10.5px] text-grey-mid">
                    Your request is saved before our issue tracker is contacted.
                  </p>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 px-5 text-[12px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                    {isSubmitting ? "Submitting…" : "Submit request"}
                  </button>
                </div>
              </form>
            )
          ) : (
            <div className="p-5 sm:p-6">
              {tickets === undefined ? (
                <div className="flex min-h-[360px] items-center justify-center">
                  <Loader2 size={22} className="animate-spin text-grey-mid" />
                </div>
              ) : tickets.length === 0 ? (
                <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-ledger bg-white text-grey-mid">
                    <CircleHelp size={22} />
                  </span>
                  <h3 className="mt-4 text-[16px] font-bold text-ink">No support requests yet</h3>
                  <p className="mt-2 max-w-xs text-[12px] leading-relaxed text-grey-mid">
                    When you need help, submit a request and its progress will appear here.
                  </p>
                  <button
                    type="button"
                    onClick={() => setView("new")}
                    className="btn-primary mt-5 px-4 py-2.5 text-[11px] font-bold"
                  >
                    Create a request
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="mb-5 flex items-end justify-between gap-4">
                    <div>
                      <h3 className="text-[14px] font-bold text-ink">Your recent requests</h3>
                      <p className="mt-1 text-[11px] text-grey-mid">
                        Status changes appear here automatically.
                      </p>
                    </div>
                    <span className="font-mono text-[10px] text-grey-mid">
                      {tickets.length} total
                    </span>
                  </div>
                  {tickets.map((ticket) => (
                    <article
                      key={ticket._id}
                      className="rounded-[12px] border border-ledger bg-white p-4 shadow-soft-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-grey-mid">
                              {ticket.reference}
                            </span>
                            <span className="h-1 w-1 rounded-full bg-ledger" />
                            <span className="text-[10.5px] text-grey-mid">
                              {formatDate(ticket.createdAt)}
                            </span>
                          </div>
                          <h4 className="mt-2 text-[13px] font-bold text-ink">
                            {ticket.title}
                          </h4>
                          <p className="mt-1.5 max-w-2xl text-[11.5px] leading-relaxed text-grey-mid">
                            {ticket.description.length > 220
                              ? `${ticket.description.slice(0, 220)}…`
                              : ticket.description}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9.5px] font-bold ${statusTone[ticket.status]}`}
                        >
                          {ticket.status === "resolved" ? (
                            <CheckCircle2 size={11} />
                          ) : (
                            <Clock3 size={11} />
                          )}
                          {SUPPORT_STATUS_LABELS[ticket.status]}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default SupportCenter;
