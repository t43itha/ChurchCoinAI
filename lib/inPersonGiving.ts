type PaymentMethod = "Cash" | "Cheque" | "Bank" | "Card" | "Online";

interface GivingCollection {
  _id: string;
  weekEndingDate: string;
  collectionDate: string;
  status: "draft" | "submitted" | "banked";
  recordedAt: number;
  recordedBy: string;
  createdAt: number;
  notes?: string;
  bankedDate?: string;
}

interface GivingTransaction {
  _id: string;
  date: string;
  description: string;
  amount: number;
  type: "Income" | "Expenditure";
  category: string;
  fundId: string;
  isReconciled: boolean;
  notes?: string;
  donorName?: string;
  donorId?: string;
  isGiftAidEligible?: boolean;
  paymentMethod?: PaymentMethod;
  cashCollectionId?: string;
  isVoided?: boolean;
}

interface GivingFund {
  _id: string;
  name: string;
}

export interface InPersonGivingLedgerRow {
  id: string;
  day: string;
  serviceDate: string;
  serviceNote: string;
  cash: number;
  pdq: number;
  cheque: number;
  total: number;
}

export interface InPersonGivingNamedDonation {
  id: string;
  donorName: string;
  category: string;
  fundId: string;
  fundName: string;
  paymentMethod?: PaymentMethod;
  isGiftAidEligible: boolean;
  amount: number;
}

export interface InPersonGivingLedger {
  collectionId: string;
  weekEndingDate: string;
  status: GivingCollection["status"];
  bankedDate?: string;
  fundNames: string[];
  fundTotals: Array<{
    fundId: string;
    fundName: string;
    total: number;
  }>;
  rows: InPersonGivingLedgerRow[];
  namedDonations: InPersonGivingNamedDonation[];
  total: number;
}

export const SERVICE_NOTE_PREFIX = "service:";

export function parseServiceNote(notes: string | undefined): string {
  if (!notes?.startsWith(SERVICE_NOTE_PREFIX)) {
    return "Service";
  }

  return notes.slice(SERVICE_NOTE_PREFIX.length).trim() || "Service";
}

function isServiceTransaction(transaction: GivingTransaction): boolean {
  return transaction.notes?.startsWith(SERVICE_NOTE_PREFIX) === true;
}

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
  });
}

function rowId(collectionId: string, serviceDate: string, serviceNote: string) {
  return `${collectionId}-${serviceDate}-${serviceNote}`;
}

export function groupInPersonGivingCollections({
  collections,
  transactions,
  funds,
}: {
  collections: GivingCollection[];
  transactions: GivingTransaction[];
  funds: GivingFund[];
}): InPersonGivingLedger[] {
  const fundNamesById = new Map(funds.map((fund) => [fund._id, fund.name]));

  return collections
    .map((collection) => {
      const collectionTransactions = transactions.filter(
        (transaction) =>
          transaction.cashCollectionId === collection._id &&
          transaction.type === "Income" &&
          transaction.isVoided !== true
      );

      const rowsByKey = new Map<string, InPersonGivingLedgerRow>();
      const fundNames = new Set<string>();
      const fundTotalsById = new Map<
        string,
        { fundId: string; fundName: string; total: number }
      >();
      const namedDonations: InPersonGivingNamedDonation[] = [];

      for (const transaction of collectionTransactions) {
        const fundName =
          fundNamesById.get(transaction.fundId) ?? "Unassigned fund";

        const fundTotal = fundTotalsById.get(transaction.fundId) ?? {
          fundId: transaction.fundId,
          fundName,
          total: 0,
        };
        fundTotal.total += transaction.amount;
        fundTotalsById.set(transaction.fundId, fundTotal);
        fundNames.add(fundName);

        if (!isServiceTransaction(transaction)) {
          namedDonations.push({
            id: transaction._id,
            donorName: transaction.donorName ?? "Unknown donor",
            category: transaction.category,
            fundId: transaction.fundId,
            fundName,
            paymentMethod: transaction.paymentMethod,
            isGiftAidEligible: transaction.isGiftAidEligible === true,
            amount: transaction.amount,
          });
          continue;
        }

        const serviceNote = parseServiceNote(transaction.notes);
        const key = rowId(collection._id, transaction.date, serviceNote);
        const existing =
          rowsByKey.get(key) ??
          ({
            id: key,
            day: formatDay(transaction.date),
            serviceDate: transaction.date,
            serviceNote,
            cash: 0,
            pdq: 0,
            cheque: 0,
            total: 0,
          } satisfies InPersonGivingLedgerRow);

        if (transaction.paymentMethod === "Cash") {
          existing.cash += transaction.amount;
        } else if (transaction.paymentMethod === "Cheque") {
          existing.cheque += transaction.amount;
        } else if (transaction.paymentMethod === "Card") {
          existing.pdq += transaction.amount;
        }

        existing.total += transaction.amount;
        rowsByKey.set(key, existing);
      }

      const rows = Array.from(rowsByKey.values()).sort((a, b) =>
        a.serviceDate.localeCompare(b.serviceDate)
      );
      const sortedNamedDonations = namedDonations.sort((a, b) =>
        a.donorName.localeCompare(b.donorName)
      );

      return {
        collectionId: collection._id,
        weekEndingDate: collection.weekEndingDate,
        status: collection.status,
        bankedDate: collection.bankedDate,
        fundNames: Array.from(fundNames).sort((a, b) => a.localeCompare(b)),
        fundTotals: Array.from(fundTotalsById.values()).sort((a, b) =>
          a.fundName.localeCompare(b.fundName)
        ),
        rows,
        namedDonations: sortedNamedDonations,
        total:
          rows.reduce((sum, row) => sum + row.total, 0) +
          sortedNamedDonations.reduce(
            (sum, donation) => sum + donation.amount,
            0
          ),
      };
    })
    .filter(
      (ledger) => ledger.rows.length > 0 || ledger.namedDonations.length > 0
    )
    .sort((a, b) => b.weekEndingDate.localeCompare(a.weekEndingDate));
}

export function filterInPersonGivingLedgersByMonth(
  ledgers: InPersonGivingLedger[],
  month: number | null,
  year: number | null
): InPersonGivingLedger[] {
  if (month === null && year === null) {
    return ledgers;
  }

  return ledgers.filter((ledger) => {
    const weekEndingDate = new Date(`${ledger.weekEndingDate}T00:00:00`);

    if (year !== null && weekEndingDate.getFullYear() !== year) {
      return false;
    }

    if (month !== null && weekEndingDate.getMonth() !== month) {
      return false;
    }

    return true;
  });
}
