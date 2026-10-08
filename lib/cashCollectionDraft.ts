import { roundMoney, sumMoney } from "../convex/lib/money";
import type {
  InPersonGivingLedger,
  InPersonGivingLedgerRow,
  InPersonGivingNamedDonation,
} from "./inPersonGiving";

export const NOTE_VALUES = [50, 20, 10, 5] as const;
export type NoteValue = (typeof NOTE_VALUES)[number];
export const COIN_KEYS = ["£2", "£1", "50p", "20p", "10p", "5p", "2p & 1p"] as const;
export type CoinKey = (typeof COIN_KEYS)[number];

// Notes are counted by quantity, coins by bagged value (a typed £ string).
export interface CashCount {
  notes: Partial<Record<NoteValue, number>>;
  coins: Partial<Record<CoinKey, string>>;
}

// Amounts stay as the typed strings so inputs keep partial values like "12.".
export interface PaymentLine {
  cash: string;
  cheque: string;
  card: string;
  count: CashCount | null;
}

// Line ids are stable so edits, removals and React keys survive two lines on
// the same fund (a loaded collection can hold the same fund under two categories).
// `category` is only set on lines loaded from an existing collection, so a
// re-save keeps the category the ledger already has.
export interface FundLine extends PaymentLine {
  id: string;
  fundId: string;
  category?: string;
}

// `fundId` and `category` are only set on lines loaded from an existing
// collection; a programme can sit on another fund or category than the default.
export interface ProgrammeLine extends PaymentLine {
  id: string;
  programmeId: string;
  fundId?: string;
  category?: string;
}

export type TitheMethod = "Cash" | "Cheque" | "Card";

export interface TitheEnvelope {
  id: string;
  donorId?: string;
  donorName: string;
  anonymous: boolean;
  amount: string;
  method: TitheMethod;
  giftAid: boolean;
  category?: string;
  // Loaded donations only: the fund they were recorded to, and whether they had
  // no service note, so a re-save doesn't give them one.
  fundId?: string;
  noServiceNote?: boolean;
}

export interface ServiceDraft {
  id: string;
  label: string;
  date: string;
  offering: PaymentLine;
  funds: FundLine[];
  programmes: ProgrammeLine[];
  tithes: TitheEnvelope[];
}

export interface CollectionDraft {
  weekEndingDate: string;
  // Kept from a saved collection. New drafts leave it unset, so the first service date is used.
  collectionDate?: string;
  services: ServiceDraft[];
  notes: string;
  counters: [string, string];
}

// One id per count, so two tabs never write over each other's copy.
export interface StoredDraft {
  savedAt: string;
  draftId: string;
  draft: CollectionDraft;
}

export interface ServicePreset {
  id: string;
  label: string;
  dayOffset: number;
  usual: boolean;
}

export const SERVICE_PRESETS: readonly ServicePreset[] = [
  { id: "mon", label: "Monday", dayOffset: -6, usual: false },
  { id: "tue", label: "Tuesday", dayOffset: -5, usual: false },
  { id: "wed", label: "Wednesday", dayOffset: -4, usual: false },
  { id: "thu", label: "Thursday", dayOffset: -3, usual: false },
  { id: "fri", label: "Friday", dayOffset: -2, usual: true },
  { id: "sat", label: "Saturday", dayOffset: -1, usual: false },
  { id: "sun-am", label: "Sunday morning", dayOffset: 0, usual: true },
  { id: "sun-pm", label: "Sunday evening", dayOffset: 0, usual: false },
];

export interface LedgerContext {
  generalFundId: string;
  offeringCategory: string;
  titheCategory: string;
}

export type LineTarget =
  | { kind: "offering" }
  | { kind: "fund"; lineId: string }
  | { kind: "programme"; lineId: string };

export type AmountField = "cash" | "cheque" | "card";

export interface EnvelopePatch {
  amount?: string;
  method?: TitheMethod;
  giftAid?: boolean;
}

// Anything that creates a line takes its id from the caller, so the reducer stays pure.
export type DraftAction =
  | { type: "setWeek"; weekEndingDate: string }
  | { type: "toggleService"; presetId: string; usualFundIds: string[] }
  | { type: "addCustomService"; id: string; label: string; date: string }
  | { type: "setAmount"; serviceId: string; target: LineTarget; field: AmountField; value: string }
  | { type: "applyCount"; serviceId: string; target: LineTarget; count: CashCount }
  | { type: "addFund"; serviceId: string; fundId: string; lineId: string }
  | { type: "removeFund"; serviceId: string; lineId: string }
  | { type: "reassignFundLine"; serviceId: string; lineId: string; fundId: string }
  | { type: "addProgramme"; serviceId: string; programmeId: string; lineId: string }
  | { type: "removeProgramme"; serviceId: string; lineId: string }
  | { type: "addTithe"; serviceId: string; envelope: TitheEnvelope }
  | { type: "updateEnvelope"; serviceId: string; envelopeId: string; patch: EnvelopePatch }
  | { type: "removeTithe"; serviceId: string; envelopeId: string }
  | { type: "setNotes"; notes: string }
  | { type: "setCounter"; index: 0 | 1; value: string };

export interface DraftTotals {
  grand: number;
  byFund: { fundId: string; total: number }[];
  byProgramme: { programmeId: string; total: number }[];
  byMethod: { cash: number; cheque: number; card: number };
  giftAidEligible: number;
  slip: { notes: Partial<Record<NoteValue, number>>; coins: number; counted: number };
  namedCount: number;
  anonymousCount: number;
  noDeclaration: { donorName: string; total: number }[];
}

export interface ServiceRowPayload {
  serviceDate: string;
  serviceNote: string;
  fundId: string;
  category?: string;
  programmeId?: string;
  cash: number;
  pdq: number;
  cheque: number;
}

export interface NamedDonationPayload {
  donorId?: string;
  donorName: string;
  category: string;
  fundId: string;
  paymentMethod: TitheMethod;
  amount: number;
  isGiftAidEligible: boolean;
  serviceDate: string;
  // Omitted for a donation that had no service note, so saving doesn't give it one.
  serviceNote?: string;
}

export interface CollectionPayload {
  weekEndingDate: string;
  collectionDate: string;
  notes?: string;
  serviceRows: ServiceRowPayload[];
  namedDonations: NamedDonationPayload[];
}

const DEFAULT_SERVICE_LABEL = "Service";
const COUNTED_BY = "Counted by ";
const DAY_MS = 86_400_000;

const sumAmounts = (amounts: readonly number[]) => sumMoney(amounts, (amount) => amount);

const toAmountString = (amount: number) => {
  const rounded = roundMoney(amount);
  return rounded === 0 ? "" : rounded.toFixed(2);
};

const compareDates = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const presetById = (id: string) => SERVICE_PRESETS.find((preset) => preset.id === id);

export const isPresetServiceId = (id: string) => presetById(id) !== undefined;

const METHOD_KEY: Record<TitheMethod, "cash" | "cheque" | "card"> = {
  Cash: "cash",
  Cheque: "cheque",
  Card: "card",
};

const serviceKey = (date: string, label: string) => `${date}\u0000${label}`;

function linesOf(service: ServiceDraft): PaymentLine[] {
  return [service.offering, ...service.funds, ...service.programmes];
}

function envelopeAmount(envelope: TitheEnvelope): number {
  return parseAmount(envelope.amount);
}

function pushTo<K>(map: Map<K, number[]>, key: K, amount: number) {
  const list = map.get(key);
  if (list) {
    list.push(amount);
  } else {
    map.set(key, [amount]);
  }
}

function serviceIdFor(date: string, label: string, weekEndingDate: string): string {
  const preset = SERVICE_PRESETS.find(
    (candidate) => candidate.label === label && presetDate(weekEndingDate, candidate) === date
  );
  return preset ? preset.id : `custom-${date}-${label}`;
}

// Usual funds are added with a new service, so their line ids only need to be
// unique within it.
function newService(weekEndingDate: string, preset: ServicePreset, usualFundIds: string[]): ServiceDraft {
  return {
    id: preset.id,
    label: preset.label,
    date: presetDate(weekEndingDate, preset),
    offering: emptyLine(),
    funds: usualFundIds.map((fundId) => ({ id: `${preset.id}:fund:${fundId}`, fundId, ...emptyLine() })),
    programmes: [],
    tithes: [],
  };
}

function sortServices(services: ServiceDraft[]): ServiceDraft[] {
  const presetRank = (id: string) => {
    const index = SERVICE_PRESETS.findIndex((preset) => preset.id === id);
    return index === -1 ? SERVICE_PRESETS.length : index;
  };
  return [...services].sort(
    (a, b) =>
      compareDates(a.date, b.date) ||
      presetRank(a.id) - presetRank(b.id) ||
      a.label.localeCompare(b.label)
  );
}

export function shiftIsoDate(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

// A custom service must fall within the week being recorded.
export function customServiceDateRange(weekEndingDate: string) {
  return { min: shiftIsoDate(weekEndingDate, -6), max: weekEndingDate };
}

export function parseAmount(value: string): number {
  const amount = Number(value.replace(/[£,\s]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : 0;
}

export function emptyLine(): PaymentLine {
  return { cash: "", cheque: "", card: "", count: null };
}

export function presetDate(weekEndingDate: string, preset: ServicePreset): string {
  return shiftIsoDate(weekEndingDate, preset.dayOffset);
}

export function newDraft(weekEndingDate: string, usualFundIds: string[]): CollectionDraft {
  return {
    weekEndingDate,
    services: SERVICE_PRESETS.filter((preset) => preset.usual).map((preset) =>
      newService(weekEndingDate, preset, usualFundIds)
    ),
    notes: "",
    counters: ["", ""],
  };
}

export function countTotal(count: CashCount): number {
  return sumAmounts([
    ...NOTE_VALUES.map((value) => value * (count.notes[value] ?? 0)),
    ...COIN_KEYS.map((key) => parseAmount(count.coins[key] ?? "")),
  ]);
}

export function lineTotal(line: PaymentLine): number {
  return sumAmounts([parseAmount(line.cash), parseAmount(line.cheque), parseAmount(line.card)]);
}

export function serviceGivingTotal(service: ServiceDraft): number {
  return sumAmounts(linesOf(service).map(lineTotal));
}

export function serviceTitheTotal(service: ServiceDraft): number {
  return sumAmounts(service.tithes.map(envelopeAmount));
}

export function draftTotals(draft: CollectionDraft, ctx: LedgerContext): DraftTotals {
  const fundAmounts = new Map<string, number[]>([[ctx.generalFundId, []]]);
  const programmeAmounts = new Map<string, number[]>();
  const methods: Record<"cash" | "cheque" | "card", number[]> = { cash: [], cheque: [], card: [] };
  const giftAid: number[] = [];
  const noteQuantities: Partial<Record<NoteValue, number>> = {};
  const coinAmounts: number[] = [];
  const countedAmounts: number[] = [];
  const undeclared = new Map<string, { donorName: string; amounts: number[] }>();
  let namedCount = 0;
  let anonymousCount = 0;

  for (const service of draft.services) {
    for (const line of linesOf(service)) {
      methods.cash.push(parseAmount(line.cash));
      methods.cheque.push(parseAmount(line.cheque));
      methods.card.push(parseAmount(line.card));

      const count = line.count;
      if (count) {
        for (const value of NOTE_VALUES) {
          const quantity = count.notes[value];
          if (quantity !== undefined) {
            noteQuantities[value] = (noteQuantities[value] ?? 0) + quantity;
          }
        }
        coinAmounts.push(...COIN_KEYS.map((key) => parseAmount(count.coins[key] ?? "")));
        countedAmounts.push(countTotal(count));
      }
    }

    pushTo(fundAmounts, ctx.generalFundId, lineTotal(service.offering));
    for (const line of service.funds) {
      pushTo(fundAmounts, line.fundId, lineTotal(line));
    }
    for (const line of service.programmes) {
      pushTo(programmeAmounts, line.programmeId, lineTotal(line));
      pushTo(fundAmounts, line.fundId ?? ctx.generalFundId, lineTotal(line));
    }

    for (const envelope of service.tithes) {
      const amount = envelopeAmount(envelope);
      methods[METHOD_KEY[envelope.method]].push(amount);
      pushTo(fundAmounts, envelope.fundId ?? ctx.generalFundId, amount);

      if (envelope.anonymous) {
        if (amount > 0) anonymousCount += 1;
        continue;
      }
      if (amount > 0) namedCount += 1;
      if (envelope.giftAid) {
        giftAid.push(amount);
        continue;
      }
      const key = envelope.donorName.trim().toLowerCase();
      const entry = undeclared.get(key) ?? { donorName: envelope.donorName.trim(), amounts: [] };
      entry.amounts.push(amount);
      undeclared.set(key, entry);
    }
  }

  return {
    grand: sumAmounts(
      draft.services.map((service) =>
        sumAmounts([serviceGivingTotal(service), serviceTitheTotal(service)])
      )
    ),
    byFund: [...fundAmounts]
      .map(([fundId, amounts]) => ({ fundId, total: sumAmounts(amounts) }))
      .filter((fund) => fund.total !== 0),
    byProgramme: [...programmeAmounts]
      .map(([programmeId, amounts]) => ({ programmeId, total: sumAmounts(amounts) }))
      .filter((programme) => programme.total !== 0),
    byMethod: {
      cash: sumAmounts(methods.cash),
      cheque: sumAmounts(methods.cheque),
      card: sumAmounts(methods.card),
    },
    giftAidEligible: sumAmounts(giftAid),
    slip: {
      notes: noteQuantities,
      coins: sumAmounts(coinAmounts),
      counted: sumAmounts(countedAmounts),
    },
    namedCount,
    anonymousCount,
    noDeclaration: [...undeclared.values()]
      .map((entry) => ({ donorName: entry.donorName, total: sumAmounts(entry.amounts) }))
      .filter((entry) => entry.total !== 0),
  };
}

type RowIdentity = Pick<ServiceRowPayload, "fundId" | "category" | "programmeId">;

export function toPayload(draft: CollectionDraft, ctx: LedgerContext): CollectionPayload {
  const serviceRows: ServiceRowPayload[] = [];
  const namedDonations: NamedDonationPayload[] = [];

  for (const service of draft.services) {
    const place = { serviceDate: service.date, serviceNote: service.label };

    const pushRow = (row: RowIdentity, cash: number, pdq: number, cheque: number) => {
      if (cash === 0 && pdq === 0 && cheque === 0) return;
      serviceRows.push({ ...place, ...row, cash, pdq, cheque });
    };
    const pushLine = (line: PaymentLine, row: RowIdentity) =>
      pushRow(row, parseAmount(line.cash), parseAmount(line.card), parseAmount(line.cheque));

    pushLine(service.offering, { fundId: ctx.generalFundId, category: ctx.offeringCategory });
    for (const line of service.funds) {
      pushLine(line, {
        fundId: line.fundId,
        ...(line.category ? { category: line.category } : {}),
      });
    }
    for (const line of service.programmes) {
      pushLine(line, {
        fundId: line.fundId ?? ctx.generalFundId,
        category: line.category ?? ctx.offeringCategory,
        programmeId: line.programmeId,
      });
    }

    const anonymous = service.tithes.filter((envelope) => envelope.anonymous);
    const anonymousTotal = (method: TitheMethod) =>
      sumAmounts(anonymous.filter((envelope) => envelope.method === method).map(envelopeAmount));
    pushRow(
      { fundId: ctx.generalFundId, category: ctx.titheCategory },
      anonymousTotal("Cash"),
      anonymousTotal("Card"),
      anonymousTotal("Cheque")
    );

    for (const envelope of service.tithes) {
      const amount = envelopeAmount(envelope);
      if (envelope.anonymous || amount === 0) continue;
      namedDonations.push({
        ...(envelope.donorId ? { donorId: envelope.donorId } : {}),
        donorName: envelope.donorName.trim(),
        category: envelope.category || ctx.titheCategory,
        fundId: envelope.fundId ?? ctx.generalFundId,
        paymentMethod: envelope.method,
        amount,
        isGiftAidEligible: envelope.giftAid,
        serviceDate: service.date,
        ...(envelope.noServiceNote ? {} : { serviceNote: service.label }),
      });
    }
  }

  const countedBy = draft.counters.map((name) => name.trim()).filter((name) => name !== "");
  const countedLine = countedBy.length > 0 ? `${COUNTED_BY}${countedBy.join(" and ")}` : "";
  const notes = [draft.notes.trim(), countedLine].filter((part) => part !== "").join("\n");

  return {
    weekEndingDate: draft.weekEndingDate,
    collectionDate: draft.collectionDate ?? draft.services[0]?.date ?? draft.weekEndingDate,
    notes: notes === "" ? undefined : notes,
    serviceRows,
    namedDonations,
  };
}

interface AmountBucket {
  cash: number[];
  cheque: number[];
  card: number[];
}

const newBucket = (): AmountBucket => ({ cash: [], cheque: [], card: [] });

function addRowToBucket(bucket: AmountBucket, row: InPersonGivingLedgerRow) {
  bucket.cash.push(row.cash);
  bucket.cheque.push(row.cheque);
  bucket.card.push(row.pdq);
}

function bucketLine(bucket: AmountBucket): PaymentLine {
  return {
    cash: toAmountString(sumAmounts(bucket.cash)),
    cheque: toAmountString(sumAmounts(bucket.cheque)),
    card: toAmountString(sumAmounts(bucket.card)),
    count: null,
  };
}

function anonymousEnvelope(id: string, method: TitheMethod, amount: number): TitheEnvelope {
  return { id, donorName: "", anonymous: true, amount: toAmountString(amount), method, giftAid: false };
}

function envelopeFromDonation(donation: InPersonGivingNamedDonation, ctx: LedgerContext): TitheEnvelope {
  const method: TitheMethod =
    donation.paymentMethod === "Cheque" || donation.paymentMethod === "Card"
      ? donation.paymentMethod
      : "Cash";
  return {
    id: donation.id,
    ...(donation.donorId ? { donorId: donation.donorId } : {}),
    donorName: donation.donorName,
    anonymous: false,
    amount: toAmountString(donation.amount),
    method,
    giftAid: donation.isGiftAidEligible,
    fundId: donation.fundId,
    ...(donation.category !== ctx.titheCategory ? { category: donation.category } : {}),
    ...(donation.serviceNote === undefined ? { noServiceNote: true } : {}),
  };
}

function serviceFromRows(
  date: string,
  label: string,
  rows: InPersonGivingLedgerRow[],
  weekEndingDate: string,
  ctx: LedgerContext
): ServiceDraft {
  const id = serviceIdFor(date, label, weekEndingDate);
  const offering = newBucket();
  const programmes = new Map<
    string,
    { programmeId: string; fundId: string; category: string; bucket: AmountBucket }
  >();
  const funds = new Map<string, { fundId: string; category: string; bucket: AmountBucket }>();
  const tithes: TitheEnvelope[] = [];

  for (const row of rows) {
    if (row.programmeId) {
      const key = `${row.programmeId}\u0000${row.fundId}\u0000${row.category}`;
      const entry = programmes.get(key) ?? {
        programmeId: row.programmeId,
        fundId: row.fundId,
        category: row.category,
        bucket: newBucket(),
      };
      addRowToBucket(entry.bucket, row);
      programmes.set(key, entry);
      continue;
    }

    if (row.fundId === ctx.generalFundId && row.category === ctx.offeringCategory) {
      addRowToBucket(offering, row);
      continue;
    }

    if (row.fundId === ctx.generalFundId && row.category === ctx.titheCategory && row.pdq === 0) {
      if (row.cash > 0) {
        tithes.push(anonymousEnvelope(`${id}-anon-${tithes.length}`, "Cash", row.cash));
      }
      if (row.cheque > 0) {
        tithes.push(anonymousEnvelope(`${id}-anon-${tithes.length}`, "Cheque", row.cheque));
      }
      continue;
    }

    const key = `${row.fundId}\u0000${row.category}`;
    const entry = funds.get(key) ?? { fundId: row.fundId, category: row.category, bucket: newBucket() };
    addRowToBucket(entry.bucket, row);
    funds.set(key, entry);
  }

  return {
    id,
    label,
    date,
    offering: bucketLine(offering),
    funds: [...funds.values()].map((entry, index) => ({
      id: `${id}:loaded-fund:${index}`,
      fundId: entry.fundId,
      category: entry.category,
      ...bucketLine(entry.bucket),
    })),
    programmes: [...programmes.values()].map((entry, index) => ({
      id: `${id}:loaded-programme:${index}`,
      programmeId: entry.programmeId,
      fundId: entry.fundId,
      category: entry.category,
      ...bucketLine(entry.bucket),
    })),
    tithes,
  };
}

// Splits saved notes back into the free text and the counters toPayload wrote.
function splitNotes(notes: string | undefined): { notes: string; counters: [string, string] } {
  const lines = (notes ?? "").split("\n");
  const last = (lines[lines.length - 1] ?? "").trim();
  if (!last.startsWith(COUNTED_BY)) {
    return { notes: (notes ?? "").trim(), counters: ["", ""] };
  }
  // Split at the last " and " so a counter whose name contains " and " survives.
  const names = last.slice(COUNTED_BY.length);
  const separator = names.lastIndexOf(" and ");
  const counters: [string, string] =
    separator === -1
      ? [names.trim(), ""]
      : [names.slice(0, separator).trim(), names.slice(separator + 5).trim()];
  return { notes: lines.slice(0, -1).join("\n").trim(), counters };
}

export function fromLedger(ledger: InPersonGivingLedger, ctx: LedgerContext): CollectionDraft {
  const { weekEndingDate } = ledger;
  const groups = new Map<string, { date: string; label: string; rows: InPersonGivingLedgerRow[] }>();
  const groupFor = (date: string, label: string) => {
    const key = serviceKey(date, label);
    const group = groups.get(key) ?? { date, label, rows: [] };
    groups.set(key, group);
    return group;
  };

  for (const row of ledger.rows) {
    groupFor(row.serviceDate, row.serviceNote).rows.push(row);
  }
  // A donation keeps its own date and label, so it gets a service of its own
  // when no loose giving shares them.
  for (const donation of ledger.namedDonations) {
    groupFor(donation.serviceDate, donation.serviceNote ?? DEFAULT_SERVICE_LABEL);
  }

  const built = new Map<string, ServiceDraft>();
  for (const [key, group] of groups) {
    built.set(key, serviceFromRows(group.date, group.label, group.rows, weekEndingDate, ctx));
  }
  for (const donation of ledger.namedDonations) {
    const service = built.get(serviceKey(donation.serviceDate, donation.serviceNote ?? DEFAULT_SERVICE_LABEL));
    service?.tithes.push(envelopeFromDonation(donation, ctx));
  }

  const saved = splitNotes(ledger.notes);
  return {
    weekEndingDate,
    ...(ledger.collectionDate ? { collectionDate: ledger.collectionDate } : {}),
    services: sortServices([...built.values()]),
    notes: saved.notes,
    counters: saved.counters,
  };
}

// Returns why the walkthrough can't show this collection without losing
// something, or null when saving it back would reproduce it.
export function editBlocker(ledger: InPersonGivingLedger, ctx: LedgerContext): string | null {
  const unsupported = ledger.namedDonations.find(
    (donation) =>
      donation.paymentMethod !== "Cash" &&
      donation.paymentMethod !== "Cheque" &&
      donation.paymentMethod !== "Card"
  );
  if (unsupported) {
    return `The gift from ${unsupported.donorName} isn't recorded as cash, a cheque or a card, so this collection can't be edited here.`;
  }
  // Named gifts are saved without a programme, so editing would drop the tag.
  const tagged = ledger.namedDonations.find((donation) => donation.programmeId);
  if (tagged) {
    return `The gift from ${tagged.donorName} is tagged to a programme, so this collection can't be edited here.`;
  }

  const ledgerTotal = sumMoney(
    [...ledger.rows.map((row) => row.total), ...ledger.namedDonations.map((donation) => donation.amount)],
    (amount) => amount
  );
  if (roundMoney(ledgerTotal) !== roundMoney(draftTotals(fromLedger(ledger, ctx), ctx).grand)) {
    return "Part of this collection is not cash, cheque or card (for example a bank transfer), so it can't be edited here.";
  }
  return null;
}

// Reads a stored draft back from storage. Anything malformed returns null.
export function parseStoredDraft(raw: unknown): StoredDraft | null {
  if (!isRecord(raw)) return null;
  const { savedAt, draftId, draft: rawDraft } = raw;
  if (typeof savedAt !== "string" || typeof draftId !== "string" || draftId === "") return null;
  const draft = parseDraft(rawDraft);
  return draft && hasEntries(draft) ? { savedAt, draftId, draft } : null;
}

// Fund lines whose fund is gone. They keep their amount, so the user can choose
// another fund rather than lose the money.
export function missingFundLines(
  draft: CollectionDraft,
  fundIds: ReadonlySet<string>
): { serviceId: string; serviceLabel: string; line: FundLine }[] {
  return draft.services.flatMap((service) =>
    service.funds
      .filter((line) => !fundIds.has(line.fundId))
      .map((line) => ({ serviceId: service.id, serviceLabel: service.label, line }))
  );
}

// Drops programme lines and donor links that no longer exist. The donor's name
// stays on the envelope. Fund lines are kept (see missingFundLines).
export function pruneStoredDraft(
  draft: CollectionDraft,
  known: {
    fundIds: ReadonlySet<string>;
    programmeIds: ReadonlySet<string>;
    donorIds: ReadonlySet<string>;
  }
): CollectionDraft {
  return {
    ...draft,
    services: draft.services.map((service) => ({
      ...service,
      programmes: service.programmes.filter(
        (line) =>
          known.programmeIds.has(line.programmeId) &&
          (line.fundId === undefined || known.fundIds.has(line.fundId))
      ),
      tithes: service.tithes.map((envelope) =>
        envelope.donorId && !known.donorIds.has(envelope.donorId)
          ? { ...envelope, donorId: undefined }
          : envelope
      ),
    })),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isIsoDate = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

const optionalString = (value: unknown) => value === undefined || typeof value === "string";

function parseAll<T>(value: unknown, parse: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const parsed: T[] = [];
  for (const item of value) {
    const result = parse(item);
    if (result === null) return null;
    parsed.push(result);
  }
  return parsed;
}

function parseCount(value: unknown): CashCount | null {
  if (!isRecord(value) || !isRecord(value.notes) || !isRecord(value.coins)) return null;
  const notes: Partial<Record<NoteValue, number>> = {};
  for (const [key, quantity] of Object.entries(value.notes)) {
    const denomination = NOTE_VALUES.find((note) => String(note) === key);
    if (
      denomination === undefined ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 0
    ) {
      return null;
    }
    notes[denomination] = quantity;
  }
  const coins: Partial<Record<CoinKey, string>> = {};
  for (const [key, amount] of Object.entries(value.coins)) {
    const coin = COIN_KEYS.find((candidate) => candidate === key);
    if (coin === undefined || typeof amount !== "string") return null;
    coins[coin] = amount;
  }
  return { notes, coins };
}

function parseLine(value: unknown): PaymentLine | null {
  if (!isRecord(value)) return null;
  const { cash, cheque, card, count } = value;
  if (typeof cash !== "string" || typeof cheque !== "string" || typeof card !== "string") return null;
  if (count === null) return { cash, cheque, card, count: null };
  const parsed = parseCount(count);
  return parsed ? { cash, cheque, card, count: parsed } : null;
}

function parseFundLine(value: unknown): FundLine | null {
  const line = parseLine(value);
  if (!line || !isRecord(value)) return null;
  const { id, fundId, category } = value;
  if (typeof id !== "string" || typeof fundId !== "string" || !optionalString(category)) return null;
  return { ...line, id, fundId, ...(typeof category === "string" ? { category } : {}) };
}

function parseProgrammeLine(value: unknown): ProgrammeLine | null {
  const line = parseLine(value);
  if (!line || !isRecord(value)) return null;
  const { id, programmeId, fundId, category } = value;
  if (typeof id !== "string" || typeof programmeId !== "string") return null;
  if (!optionalString(fundId) || !optionalString(category)) return null;
  return {
    ...line,
    id,
    programmeId,
    ...(typeof fundId === "string" ? { fundId } : {}),
    ...(typeof category === "string" ? { category } : {}),
  };
}

const METHODS: readonly TitheMethod[] = ["Cash", "Cheque", "Card"];

function parseEnvelope(value: unknown): TitheEnvelope | null {
  if (!isRecord(value)) return null;
  const { id, donorId, donorName, anonymous, amount, giftAid, category, fundId, noServiceNote } = value;
  const method = METHODS.find((candidate) => candidate === value.method);
  if (
    typeof id !== "string" ||
    !optionalString(donorId) ||
    typeof donorName !== "string" ||
    typeof anonymous !== "boolean" ||
    typeof amount !== "string" ||
    method === undefined ||
    typeof giftAid !== "boolean" ||
    !optionalString(category) ||
    !optionalString(fundId) ||
    (noServiceNote !== undefined && typeof noServiceNote !== "boolean")
  ) {
    return null;
  }
  return {
    id,
    donorName,
    anonymous,
    amount,
    method,
    giftAid,
    ...(typeof donorId === "string" ? { donorId } : {}),
    ...(typeof category === "string" ? { category } : {}),
    ...(typeof fundId === "string" ? { fundId } : {}),
    ...(typeof noServiceNote === "boolean" ? { noServiceNote } : {}),
  };
}

function parseService(value: unknown): ServiceDraft | null {
  if (!isRecord(value)) return null;
  const { id, label, date, offering, funds, programmes, tithes } = value;
  if (typeof id !== "string" || typeof label !== "string" || !isIsoDate(date)) return null;
  const parsedOffering = parseLine(offering);
  const parsedFunds = parseAll(funds, parseFundLine);
  const parsedProgrammes = parseAll(programmes, parseProgrammeLine);
  const parsedTithes = parseAll(tithes, parseEnvelope);
  if (!parsedOffering || !parsedFunds || !parsedProgrammes || !parsedTithes) return null;
  return {
    id,
    label,
    date,
    offering: parsedOffering,
    funds: parsedFunds,
    programmes: parsedProgrammes,
    tithes: parsedTithes,
  };
}

function parseDraft(value: unknown): CollectionDraft | null {
  if (!isRecord(value)) return null;
  const { weekEndingDate, collectionDate, services, notes, counters } = value;
  if (!isIsoDate(weekEndingDate) || typeof notes !== "string") return null;
  if (collectionDate !== undefined && !isIsoDate(collectionDate)) return null;
  if (!Array.isArray(counters) || counters.length !== 2) return null;
  const [first, second] = counters;
  if (typeof first !== "string" || typeof second !== "string") return null;
  const parsedServices = parseAll(services, parseService);
  if (!parsedServices) return null;
  return {
    weekEndingDate,
    ...(typeof collectionDate === "string" ? { collectionDate } : {}),
    services: parsedServices,
    notes,
    counters: [first, second],
  };
}

export function draftReducer(draft: CollectionDraft, action: DraftAction): CollectionDraft {
  switch (action.type) {
    case "setWeek": {
      // Every service moves by the same number of days, so a custom service
      // keeps its place relative to the week.
      const delta = daysBetween(draft.weekEndingDate, action.weekEndingDate);
      return {
        ...draft,
        weekEndingDate: action.weekEndingDate,
        ...(draft.collectionDate ? { collectionDate: shiftIsoDate(draft.collectionDate, delta) } : {}),
        services: draft.services.map((service) => ({
          ...service,
          date: shiftIsoDate(service.date, delta),
        })),
      };
    }
    case "toggleService": {
      if (draft.services.some((service) => service.id === action.presetId)) {
        return {
          ...draft,
          services: draft.services.filter((service) => service.id !== action.presetId),
        };
      }
      const preset = presetById(action.presetId);
      if (!preset) return draft;
      return {
        ...draft,
        services: sortServices([
          ...draft.services,
          newService(draft.weekEndingDate, preset, action.usualFundIds),
        ]),
      };
    }
    case "addCustomService": {
      const label = action.label.trim();
      const { min, max } = customServiceDateRange(draft.weekEndingDate);
      if (label === "" || action.date < min || action.date > max) return draft;
      const service: ServiceDraft = {
        id: action.id,
        label,
        date: action.date,
        offering: emptyLine(),
        funds: [],
        programmes: [],
        tithes: [],
      };
      return { ...draft, services: sortServices([...draft.services, service]) };
    }
    case "setAmount": {
      const patch: LinePatch =
        action.field === "cash"
          ? { cash: action.value, count: null }
          : action.field === "cheque"
            ? { cheque: action.value }
            : { card: action.value };
      return mapService(draft, action.serviceId, (service) =>
        patchTarget(service, action.target, patch)
      );
    }
    case "applyCount": {
      const total = countTotal(action.count);
      const patch: LinePatch =
        total === 0 ? { count: null, cash: "" } : { count: action.count, cash: total.toFixed(2) };
      return mapService(draft, action.serviceId, (service) =>
        patchTarget(service, action.target, patch)
      );
    }
    case "addFund":
      return mapService(draft, action.serviceId, (service) =>
        service.funds.some((line) => line.fundId === action.fundId)
          ? service
          : {
              ...service,
              funds: [...service.funds, { id: action.lineId, fundId: action.fundId, ...emptyLine() }],
            }
      );
    case "removeFund":
      return mapService(draft, action.serviceId, (service) => ({
        ...service,
        funds: service.funds.filter((line) => line.id !== action.lineId),
      }));
    case "reassignFundLine":
      return mapService(draft, action.serviceId, (service) => ({
        ...service,
        funds: service.funds.map((line) =>
          line.id === action.lineId ? { ...line, fundId: action.fundId } : line
        ),
      }));
    case "addProgramme":
      return mapService(draft, action.serviceId, (service) =>
        service.programmes.some((line) => line.programmeId === action.programmeId)
          ? service
          : {
              ...service,
              programmes: [
                ...service.programmes,
                { id: action.lineId, programmeId: action.programmeId, ...emptyLine() },
              ],
            }
      );
    case "removeProgramme":
      return mapService(draft, action.serviceId, (service) => ({
        ...service,
        programmes: service.programmes.filter((line) => line.id !== action.lineId),
      }));
    case "addTithe":
      return mapService(draft, action.serviceId, (service) => ({
        ...service,
        tithes: [action.envelope, ...service.tithes],
      }));
    case "updateEnvelope":
      // Only the patched fields change; fund, category, donor and service note stay.
      return mapService(draft, action.serviceId, (service) => ({
        ...service,
        tithes: service.tithes.map((envelope) =>
          envelope.id === action.envelopeId
            ? {
                ...envelope,
                amount: action.patch.amount ?? envelope.amount,
                method: action.patch.method ?? envelope.method,
                giftAid: action.patch.giftAid ?? envelope.giftAid,
              }
            : envelope
        ),
      }));
    case "removeTithe":
      return mapService(draft, action.serviceId, (service) => ({
        ...service,
        tithes: service.tithes.filter((envelope) => envelope.id !== action.envelopeId),
      }));
    case "setNotes":
      return { ...draft, notes: action.notes };
    case "setCounter":
      return {
        ...draft,
        counters:
          action.index === 0 ? [action.value, draft.counters[1]] : [draft.counters[0], action.value],
      };
  }
}

type LinePatch = Partial<Pick<PaymentLine, "cash" | "cheque" | "card" | "count">>;

function mapService(
  draft: CollectionDraft,
  serviceId: string,
  update: (service: ServiceDraft) => ServiceDraft
): CollectionDraft {
  return {
    ...draft,
    services: draft.services.map((service) => (service.id === serviceId ? update(service) : service)),
  };
}

function patchTarget(service: ServiceDraft, target: LineTarget, patch: LinePatch): ServiceDraft {
  switch (target.kind) {
    case "offering":
      return { ...service, offering: { ...service.offering, ...patch } };
    case "fund":
      return {
        ...service,
        funds: service.funds.map((line) =>
          line.id === target.lineId ? { ...line, ...patch } : line
        ),
      };
    case "programme":
      return {
        ...service,
        programmes: service.programmes.map((line) =>
          line.id === target.lineId ? { ...line, ...patch } : line
        ),
      };
  }
}

export function hasEntries(draft: CollectionDraft): boolean {
  return draft.services.some(
    (service) =>
      linesOf(service).some((line) => lineTotal(line) > 0) ||
      service.tithes.some((envelope) => envelopeAmount(envelope) > 0)
  );
}
