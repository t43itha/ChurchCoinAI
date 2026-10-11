import { formatLocalDateInputValue } from "../../lib/dateUtils";
import type { Donor, DonorCreateInput, Pledge, PledgeCreateInput } from "../../types";

export const IMPORT_FIELDS = [
  { key: "donor", label: "Donor name", required: true },
  { key: "amount", label: "Amount" },
  { key: "frequency", label: "Frequency" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
  { key: "postcode", label: "Postcode" },
  { key: "commPref", label: "Comm pref" },
] as const;

export type ColumnMapping = Record<(typeof IMPORT_FIELDS)[number]["key"], string>;

export const emptyMapping = (): ColumnMapping => ({
  donor: "",
  amount: "",
  frequency: "",
  email: "",
  phone: "",
  address: "",
  postcode: "",
  commPref: "",
});

// Splits one CSV line, keeping commas inside quotes and stripping the quotes around each cell.
const parseLine = (line: string) =>
  line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((cell) => cell.trim().replace(/^"|"$/g, ""));

export function parseCsv(text: string): { headers: string[]; rows: string[][] } | null {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return null;
  return { headers: parseLine(lines[0]), rows: lines.slice(1).map(parseLine) };
}

const GUESSES: [keyof ColumnMapping, (header: string) => boolean][] = [
  ["donor", (h) => h.includes("name") || h.includes("donor")],
  ["amount", (h) => h.includes("amount") || h.includes("value")],
  ["frequency", (h) => h.includes("freq") || h.includes("period")],
  ["email", (h) => h.includes("email")],
  ["phone", (h) => h.includes("phone") || h.includes("tel") || h.includes("mobile")],
  ["postcode", (h) => h.includes("postcode")],
  ["address", (h) => h.includes("address") || h.includes("street")],
  ["commPref", (h) => h.includes("pref") || h.includes("comm") || h.includes("contact")],
];

// Each column goes to the first field it suits that is still empty.
export function guessColumnMapping(headers: string[]): ColumnMapping {
  const mapping = emptyMapping();
  headers.forEach((header) => {
    const lower = header.toLowerCase();
    const match = GUESSES.find(([field, suits]) => !mapping[field] && suits(lower));
    if (match) mapping[match[0]] = header;
  });
  return mapping;
}



export type PledgeImportPlan = {
  pledges: PledgeCreateInput[];
  donors: DonorCreateInput[];
  skippedRows: { row: number; reason: string }[];
};

// Turns the mapped CSV rows into pledges and donor upserts. Rows that duplicate an existing
// pledge or an earlier row for this fund are skipped. Donors are matched by name, and the
// last row for a donor wins for each detail.
export function buildPledgeImport({
  headers,
  rows,
  mapping,
  donors,
  pledges,
  fundId,
  today = formatLocalDateInputValue(new Date()),
}: {
  headers: string[];
  rows: string[][];
  mapping: ColumnMapping;
  donors: Donor[];
  pledges: Pledge[];
  fundId: string;
  today?: string;
}): PledgeImportPlan {
  const index = (header: string) => headers.indexOf(header);
  const donorIdx = index(mapping.donor);
  const amountIdx = index(mapping.amount);
  const freqIdx = index(mapping.frequency);
  const emailIdx = index(mapping.email);
  const phoneIdx = index(mapping.phone);
  const addressIdx = index(mapping.address);
  const postcodeIdx = index(mapping.postcode);
  const commPrefIdx = index(mapping.commPref);

  const newPledges: PledgeCreateInput[] = [];
  const donorsByName = new Map<string, DonorCreateInput>();
  const skippedRows: { row: number; reason: string }[] = [];
  const createdPledgeKeys = new Set<string>();

  rows.forEach((row, rowIndex) => {
    const line = rowIndex + 2; // header row plus one-based numbering
    const donorName = row[donorIdx]?.trim();
    if (!donorName) {
      skippedRows.push({ row: line, reason: "Empty donor name" });
      return;
    }

    // Amount defaults to 0 so outreach-only imports still work.
    let amount = 0;
    if (amountIdx !== -1) {
      const parsed = parseFloat((row[amountIdx] || "0").replace(/[£$,]/g, ""));
      amount = isNaN(parsed) ? 0 : parsed;
    }

    const freqRaw = freqIdx !== -1 ? row[freqIdx] : "One-off";
    const freqLower = freqRaw ? freqRaw.toLowerCase() : "";
    let frequency: PledgeCreateInput["frequency"] = "One-off";
    if (freqLower.includes("month")) frequency = "Monthly";
    else if (freqLower.includes("week")) frequency = "Weekly";
    else if (freqLower.includes("year") || freqLower.includes("ann")) frequency = "Annual";

    const key = donorName.toLowerCase();
    const existing = donors.find((donor) => donor.name.toLowerCase() === key);

    const duplicate = pledges.some((pledge) => {
      const sameDonor = existing ? pledge.donorId === existing._id : pledge.donorName.toLowerCase() === key;
      return sameDonor && pledge.fundId === fundId && pledge.amount === amount;
    });
    if (duplicate) {
      skippedRows.push({ row: line, reason: `Duplicate pledge exists (${donorName}, £${amount})` });
      return;
    }

    const batchKey = `${key}|${fundId}|${amount}`;
    if (createdPledgeKeys.has(batchKey)) {
      skippedRows.push({ row: line, reason: `Duplicate in CSV batch (${donorName}, £${amount})` });
      return;
    }
    createdPledgeKeys.add(batchKey);

    const pick = (idx: number) => (idx !== -1 ? row[idx] || undefined : undefined);
    const commRaw = pick(commPrefIdx)?.toLowerCase();
    const communicationPreference: DonorCreateInput["communicationPreference"] =
      commRaw === undefined
        ? undefined
        : commRaw.includes("email")
          ? "Email"
          : commRaw.includes("post") || commRaw.includes("mail")
            ? "Post"
            : commRaw.includes("phone")
              ? "Phone"
              : undefined;

    // Existing donors keep their stored details unless the CSV gives a new value.
    const prior = donorsByName.get(key);
    const base: DonorCreateInput = existing
      ? {
          name: existing.name,
          type: existing.type,
          email: existing.email,
          phone: existing.phone,
          address: existing.address,
          postcode: existing.postcode,
          communicationPreference: existing.communicationPreference,
        }
      : (prior ?? { name: donorName, type: "Individual", isGiftAidActive: false });

    donorsByName.set(key, {
      ...base,
      email: pick(emailIdx) || base.email,
      phone: pick(phoneIdx) || base.phone,
      address: pick(addressIdx) || base.address,
      postcode: pick(postcodeIdx) || base.postcode,
      communicationPreference: communicationPreference || base.communicationPreference,
    });

    newPledges.push({
      donorName,
      donorId: existing?._id,
      amount,
      fundId,
      frequency,
      startDate: today,
      status: "Active",
    });
  });

  return { pledges: newPledges, donors: Array.from(donorsByName.values()), skippedRows };
}

// Pledges take the Convex id of the donor the upsert returned for their name.
export function linkImportedDonors(
  plan: PledgeImportPlan,
  results: { id: string; name: string }[]
): PledgeCreateInput[] {
  const idByName = new Map(results.map((result) => [result.name.toLowerCase(), result.id]));
  return plan.pledges.map((pledge) => ({
    ...pledge,
    donorId: idByName.get(pledge.donorName.toLowerCase()) || pledge.donorId,
  }));
}
