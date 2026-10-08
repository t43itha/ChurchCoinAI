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

// `category` is only set on lines loaded from an existing collection, so a
// re-save keeps the category the ledger already has.
export interface FundLine extends PaymentLine {
  fundId: string;
  category?: string;
}

export interface ProgrammeLine extends PaymentLine {
  programmeId: string;
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
  services: ServiceDraft[];
  notes: string;
  counters: [string, string];
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
  | { kind: "fund"; fundId: string }
  | { kind: "programme"; programmeId: string };

export type AmountField = "cash" | "cheque" | "card";

export type DraftAction =
  | { type: "setWeek"; weekEndingDate: string }
  | { type: "toggleService"; presetId: string; usualFundIds: string[] }
  | { type: "setAmount"; serviceId: string; target: LineTarget; field: AmountField; value: string }
  | { type: "applyCount"; serviceId: string; target: LineTarget; count: CashCount }
  | { type: "addFund"; serviceId: string; fundId: string }
  | { type: "removeFund"; serviceId: string; fundId: string }
  | { type: "addProgramme"; serviceId: string; programmeId: string }
  | { type: "removeProgramme"; serviceId: string; programmeId: string }
  | { type: "addTithe"; serviceId: string; envelope: TitheEnvelope }
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
  serviceNote: string;
}

export interface CollectionPayload {
  weekEndingDate: string;
  collectionDate: string;
  notes?: string;
  serviceRows: ServiceRowPayload[];
  namedDonations: NamedDonationPayload[];
}


const sumAmounts = (amounts: readonly number[]) => sumMoney(amounts, (amount) => amount);

const toAmountString = (amount: number) => {
  const rounded = roundMoney(amount);
  return rounded === 0 ? "" : rounded.toFixed(2);
};

const compareDates = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const presetById = (id: string) => SERVICE_PRESETS.find((preset) => preset.id === id);

const METHOD_KEY: Record<TitheMethod, "cash" | "cheque" | "card"> = {
  Cash: "cash",
  Cheque: "cheque",
  Card: "card",
};

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

function newService(weekEndingDate: string, preset: ServicePreset, usualFundIds: string[]): ServiceDraft {
  return {
    id: preset.id,
    label: preset.label,
    date: presetDate(weekEndingDate, preset),
    offering: emptyLine(),
    funds: usualFundIds.map((fundId) => ({ fundId, ...emptyLine() })),
    programmes: [],
    tithes: [],
  };
}

export function parseAmount(value: string): number {
  const amount = Number(value.replace(/[£,\s]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : 0;
}

export function emptyLine(): PaymentLine {
  return { cash: "", cheque: "", card: "", count: null };
}

export function presetDate(weekEndingDate: string, preset: ServicePreset): string {
  const date = new Date(`${weekEndingDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + preset.dayOffset);
  return date.toISOString().slice(0, 10);
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
      pushTo(fundAmounts, ctx.generalFundId, lineTotal(line));
    }

    for (const envelope of service.tithes) {
      const amount = envelopeAmount(envelope);
      methods[METHOD_KEY[envelope.method]].push(amount);
      pushTo(fundAmounts, ctx.generalFundId, amount);

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
        fundId: ctx.generalFundId,
        category: ctx.offeringCategory,
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
        fundId: ctx.generalFundId,
        paymentMethod: envelope.method,
        amount,
        isGiftAidEligible: envelope.giftAid,
        ...place,
      });
    }
  }

  const countedBy = draft.counters.map((name) => name.trim()).filter((name) => name !== "");
  const countedLine = countedBy.length > 0 ? `Counted by ${countedBy.join(" and ")}` : "";
  const notes = [draft.notes.trim(), countedLine].filter((part) => part !== "").join("\n");

  return {
    weekEndingDate: draft.weekEndingDate,
    collectionDate: draft.services[0]?.date ?? draft.weekEndingDate,
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
    ...(donation.category !== ctx.titheCategory ? { category: donation.category } : {}),
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
  const programmes = new Map<string, AmountBucket>();
  const funds = new Map<string, { fundId: string; category: string; bucket: AmountBucket }>();
  const tithes: TitheEnvelope[] = [];

  for (const row of rows) {
    if (row.programmeId) {
      const bucket = programmes.get(row.programmeId) ?? newBucket();
      addRowToBucket(bucket, row);
      programmes.set(row.programmeId, bucket);
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
    funds: [...funds.values()].map((entry) => ({
      fundId: entry.fundId,
      category: entry.category,
      ...bucketLine(entry.bucket),
    })),
    programmes: [...programmes].map(([programmeId, bucket]) => ({
      programmeId,
      ...bucketLine(bucket),
    })),
    tithes,
  };
}

export function fromLedger(ledger: InPersonGivingLedger, ctx: LedgerContext): CollectionDraft {
  const { weekEndingDate } = ledger;
  const groups = new Map<string, { date: string; note: string; rows: InPersonGivingLedgerRow[] }>();
  for (const row of ledger.rows) {
    const key = `${row.serviceDate}\u0000${row.serviceNote}`;
    const group = groups.get(key) ?? { date: row.serviceDate, note: row.serviceNote, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  const services = [...groups.values()]
    .sort((a, b) => compareDates(a.date, b.date))
    .map((group) => serviceFromRows(group.date, group.note, group.rows, weekEndingDate, ctx));

  const [firstDonation] = ledger.namedDonations;
  if (services.length === 0 && firstDonation) {
    const label = firstDonation.serviceNote ?? "Service";
    services.push({
      id: serviceIdFor(firstDonation.serviceDate, label, weekEndingDate),
      label,
      date: firstDonation.serviceDate,
      offering: emptyLine(),
      funds: [],
      programmes: [],
      tithes: [],
    });
  }

  for (const donation of ledger.namedDonations) {
    const note = donation.serviceNote ?? "Service";
    const target =
      services.find((service) => service.date === donation.serviceDate && service.label === note) ??
      services.find((service) => service.date === donation.serviceDate) ??
      services[services.length - 1];
    target.tithes.push(envelopeFromDonation(donation, ctx));
  }

  return { weekEndingDate, services, notes: "", counters: ["", ""] };
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
          line.fundId === target.fundId ? { ...line, ...patch } : line
        ),
      };
    case "programme":
      return {
        ...service,
        programmes: service.programmes.map((line) =>
          line.programmeId === target.programmeId ? { ...line, ...patch } : line
        ),
      };
  }
}

function sortServices(services: ServiceDraft[]): ServiceDraft[] {
  const presetRank = (id: string) => {
    const index = SERVICE_PRESETS.findIndex((preset) => preset.id === id);
    return index === -1 ? SERVICE_PRESETS.length : index;
  };
  return [...services].sort(
    (a, b) => compareDates(a.date, b.date) || presetRank(a.id) - presetRank(b.id)
  );
}

export function draftReducer(draft: CollectionDraft, action: DraftAction): CollectionDraft {
  switch (action.type) {
    case "setWeek":
      return {
        ...draft,
        weekEndingDate: action.weekEndingDate,
        services: draft.services.map((service) => {
          const preset = presetById(service.id);
          return preset ? { ...service, date: presetDate(action.weekEndingDate, preset) } : service;
        }),
      };
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
          : { ...service, funds: [...service.funds, { fundId: action.fundId, ...emptyLine() }] }
      );
    case "removeFund":
      return mapService(draft, action.serviceId, (service) => ({
        ...service,
        funds: service.funds.filter((line) => line.fundId !== action.fundId),
      }));
    case "addProgramme":
      return mapService(draft, action.serviceId, (service) =>
        service.programmes.some((line) => line.programmeId === action.programmeId)
          ? service
          : {
              ...service,
              programmes: [...service.programmes, { programmeId: action.programmeId, ...emptyLine() }],
            }
      );
    case "removeProgramme":
      return mapService(draft, action.serviceId, (service) => ({
        ...service,
        programmes: service.programmes.filter((line) => line.programmeId !== action.programmeId),
      }));
    case "addTithe":
      return mapService(draft, action.serviceId, (service) => ({
        ...service,
        tithes: [action.envelope, ...service.tithes],
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

export function hasEntries(draft: CollectionDraft): boolean {
  return draft.services.some(
    (service) =>
      linesOf(service).some((line) => lineTotal(line) > 0) ||
      service.tithes.some((envelope) => envelopeAmount(envelope) > 0)
  );
}
