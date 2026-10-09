import { ArrowLeftRight, Banknote, FileSpreadsheet, Landmark, PenLine, RefreshCw, type LucideIcon } from "lucide-react";
import { can, type Capability, type UserRole } from "../../lib/permissions";

// Kinds the chooser can pass to Transactions as ?new=<kind>. Each opens one existing
// modal there. Cash banking is a view, not a kind, so it uses ?view=cash-banking.
export const NEW_KINDS = ["giving", "statement", "sync", "entry", "transfer"] as const;
export type NewKind = (typeof NEW_KINDS)[number];

export type NewKindModal = "cashTakings" | "statementImport" | "bankSync" | "singleEntry" | "journalTransfer";

const KIND_MODAL: Record<NewKind, NewKindModal> = {
  giving: "cashTakings",
  statement: "statementImport",
  sync: "bankSync",
  entry: "singleEntry",
  transfer: "journalTransfer",
};

export function parseNewKind(value: string | null | undefined): NewKind | null {
  return NEW_KINDS.find((kind) => kind === value) ?? null;
}

export function newKindModal(kind: NewKind): NewKindModal {
  return KIND_MODAL[kind];
}

export interface NewChooserRow {
  id: string;
  title: string;
  detail: string;
  icon: LucideIcon;
  tone: "sage" | "grey" | "amber";
  capability: Capability;
  to: string;
}

// Each capability is the one the matching button on Transactions already checks.
const ROWS: NewChooserRow[] = [
  {
    id: "giving",
    title: "Sunday's giving",
    detail: "Count cash, cheques and tithe envelopes",
    icon: Banknote,
    tone: "sage",
    capability: "ledger.write",
    to: "/transactions?new=giving",
  },
  {
    id: "statement",
    title: "A bank statement",
    detail: "CSV or Excel from your bank",
    icon: FileSpreadsheet,
    tone: "grey",
    capability: "ledger.write",
    to: "/transactions?new=statement",
  },
  {
    id: "sync",
    title: "Sync from the bank",
    detail: "Pull the latest lines from your connected accounts",
    icon: RefreshCw,
    tone: "grey",
    capability: "ledger.write",
    to: "/transactions?new=sync",
  },
  {
    id: "entry",
    title: "One payment or receipt",
    detail: "A bill, a refund, a one-off gift",
    icon: PenLine,
    tone: "grey",
    capability: "ledger.write",
    to: "/transactions?new=entry",
  },
  {
    id: "transfer",
    title: "Move money between funds",
    detail: "A journal transfer",
    icon: ArrowLeftRight,
    tone: "grey",
    capability: "ledger.write",
    to: "/transactions?new=transfer",
  },
  {
    id: "cash-banking",
    title: "Bank cash and cheques",
    detail: "Pay in the cash and cheques you have counted",
    icon: Landmark,
    tone: "amber",
    capability: "reconciliation.manage",
    to: "/transactions?view=cash-banking",
  },
];

export function newChooserRows(role: UserRole): NewChooserRow[] {
  return ROWS.filter((row) => can(role, row.capability));
}

// The desktop "+ New" button and the phone bar's New slot only show when there is something to open.
export function canAddNew(role: UserRole): boolean {
  return newChooserRows(role).length > 0;
}

export type NewKindStep =
  | { type: "idle" }
  | { type: "wait" }
  | { type: "handled"; modal: NewKindModal | null; leaveReconciliation: boolean };

// What Transactions does with ?new=<kind> on this run of its effect. `handled` is the value the
// page already acted on, so a Strict Mode replay or a re-render does nothing a second time.
export function planNewKind({
  param,
  handled,
  canEdit,
  bankConnectionsLoaded,
}: {
  param: string | null;
  handled: string | null;
  canEdit: boolean;
  bankConnectionsLoaded: boolean;
}): NewKindStep {
  if (!param || param === handled) return { type: "idle" };
  const kind = parseNewKind(param);
  // Sync needs the connected accounts, so wait for them rather than report none.
  if (kind && canEdit && newKindModal(kind) === "bankSync" && !bankConnectionsLoaded) return { type: "wait" };
  const modal = kind && canEdit ? newKindModal(kind) : null;
  return { type: "handled", modal, leaveReconciliation: modal !== null };
}

// The deep-link params Transactions removes on this run of its effect, in one replacement so
// removing one never restores the other. `new` stays while a sync waits for bank connections, and
// is removed again when it is the one already handled: Strict Mode's replay hands the updater the
// original params, so leaving it out would put it back.
export function linkParamsToRemove(
  step: NewKindStep,
  viewParam: string | null,
  newParam: string | null = null,
  handled: string | null = null
): string[] {
  const keys: string[] = [];
  if (step.type === "handled" || (newParam !== null && newParam === handled)) keys.push("new");
  if (viewParam === "cash-banking") keys.push("view");
  return keys;
}
