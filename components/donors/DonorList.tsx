import { Search } from "lucide-react";
import type { Donor, Pledge } from "../../types";
import { btnMd, btnPrimary, chip, eyebrow, giftAidOff, giftAidOn, linkBtn, linkBtnSm, txtInput } from "../wizard/ui";
import {
  filterCounts,
  formatPounds,
  giftAidState,
  groupByInitial,
  scheduleFor,
  shortGiftDate,
  statFor,
  type DonorFilter,
  type GivingStat,
} from "./donorDirectory";

export interface MergeControls {
  active: boolean;
  selected: Set<string>;
  primaryId: string | null;
  busy: boolean;
  onStart: () => void;
  onToggle: (donorId: string) => void;
  onKeep: (donorId: string) => void;
  onMerge: () => void;
  onCancel: () => void;
}

export interface DonorListProps {
  donors: Donor[];
  visible: Donor[];
  search: string;
  onSearch: (search: string) => void;
  filter: DonorFilter;
  onFilter: (filter: DonorFilter) => void;
  stats: Map<string, GivingStat>;
  schedules: Map<string, Pledge>;
  pledgesBehind: Set<string>;
  giftAidEnabled: boolean;
  now: number;
  selectedId: string | null;
  onSelect: (donor: Donor) => void;
  // Omitted for readers who cannot merge, so the merge controls never render.
  merge?: MergeControls;
}

const FILTERS: Array<{ key: DonorFilter; label: string; giftAidOnly?: boolean }> = [
  { key: "everyone", label: "Everyone" },
  { key: "noGiftAid", label: "No Gift Aid", giftAidOnly: true },
  { key: "pledgesBehind", label: "Pledges behind" },
  { key: "stoppedGiving", label: "Stopped giving" },
];

const chipOn = "inline-flex h-11 items-center gap-1.5 rounded-[13px] border-[1.5px] border-ink bg-ink px-4 text-sm font-semibold text-white";

// The directory: search, the filter chips, then donors grouped by initial. Merge mode swaps the rows for checkboxes.
export default function DonorList({
  donors,
  visible,
  search,
  onSearch,
  filter,
  onFilter,
  stats,
  schedules,
  pledgesBehind,
  giftAidEnabled,
  now,
  selectedId,
  onSelect,
  merge,
}: DonorListProps) {
  const counts = filterCounts(donors, stats, giftAidEnabled, now, pledgesBehind);
  const groups = groupByInitial(visible);
  const merging = merge?.active ?? false;

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-ledger bg-white" aria-label="Donor directory">
      <div className="grid gap-3 border-b border-ledger bg-paper p-3.5">
        <label className="relative block">
          <span className="sr-only">Search donors by name</span>
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-grey-mid" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search by name"
            className={`${txtInput} pl-10`}
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter donors">
            {FILTERS.filter((option) => !option.giftAidOnly || giftAidEnabled).map((option) => {
              const on = filter === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onFilter(option.key)}
                  className={on ? chipOn : chip}
                >
                  {option.label}
                  <span className="font-mono text-xs opacity-70">{counts[option.key]}</span>
                </button>
              );
            })}
          </div>
          {merge && !merge.active && (
            <button type="button" onClick={merge.onStart} className={`${linkBtnSm} ml-auto`}>
              Select donors to merge
            </button>
          )}
        </div>

        {merging && merge && <MergeBanner merge={merge} />}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.length === 0 && <p className="p-8 text-center text-sm text-grey-mid">No donors found.</p>}
        {groups.map((group) => (
          <section key={group.letter} aria-label={group.letter}>
            <h3 className={`${eyebrow} sticky top-0 border-b border-ledger bg-white/95 px-4 py-1.5`}>{group.letter}</h3>
            <ul>
              {group.donors.map((donor) => (
                <DonorRow
                  key={donor._id}
                  donor={donor}
                  stat={statFor(stats, donor)}
                  schedule={scheduleFor(schedules, donor)}
                  giftAidEnabled={giftAidEnabled}
                  now={now}
                  selected={!merging && selectedId === donor._id}
                  merge={merging ? merge : undefined}
                  onSelect={() => onSelect(donor)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

function MergeBanner({ merge }: { merge: MergeControls }) {
  const count = merge.selected.size;
  const hint =
    count === 0
      ? "Tap donors to select them."
      : count === 1
        ? "Select at least one more donor."
        : merge.primaryId
          ? `Ready to merge ${count} donors.`
          : "Now tap Keep on the donor to keep as primary.";
  return (
    <div className="grid gap-2.5 rounded-2xl border border-[#ecd8bd] bg-amber-light p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-amber">{hint}</p>
        <button type="button" onClick={merge.onCancel} className={linkBtn}>
          Cancel
        </button>
      </div>
      {count >= 2 && merge.primaryId && (
        <button type="button" onClick={merge.onMerge} disabled={merge.busy} className={`${btnPrimary} ${btnMd}`}>
          {merge.busy ? "Merging…" : `Merge ${count} donors`}
        </button>
      )}
    </div>
  );
}

function DonorRow({
  donor,
  stat,
  schedule,
  giftAidEnabled,
  now,
  selected,
  merge,
  onSelect,
}: {
  donor: Donor;
  stat: GivingStat;
  schedule?: Pledge;
  giftAidEnabled: boolean;
  now: number;
  selected: boolean;
  merge?: MergeControls;
  onSelect: () => void;
}) {
  const pill = giftAidState(donor, giftAidEnabled);
  const picked = merge?.selected.has(donor._id) ?? false;
  const isPrimary = merge?.primaryId === donor._id;
  const lastGift = stat.lastGift > 0 ? `last gave ${shortGiftDate(stat.lastGift, now)}` : "no gifts yet";
  const giving = schedule ? `${schedule.frequency.toLowerCase()} schedule` : lastGift;

  return (
    <li className={`flex items-center gap-2 border-b border-ledger pr-3 ${selected ? "bg-grey-light" : ""}`}>
      {merge && (
        <button
          type="button"
          aria-pressed={picked}
          aria-label={`Select ${donor.name} to merge`}
          onClick={() => merge.onToggle(donor._id)}
          className={`ml-3 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] border-[1.5px] text-xs font-bold ${
            picked ? "border-ink bg-ink text-white" : "border-[#d6d3cd] text-transparent"
          }`}
        >
          ✓
        </button>
      )}

      <button
        type="button"
        onClick={merge ? () => merge.onToggle(donor._id) : onSelect}
        aria-current={selected ? "true" : undefined}
        className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left"
      >
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#efeee9] font-mono text-xs font-bold text-grey-dark"
        >
          {initialsOf(donor.name)}
        </span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[14.5px] text-ink">
            {donor.name}
            {isPrimary && <span className="ml-1.5 text-xs font-bold text-amber">Primary</span>}
          </b>
          <span className="block truncate text-[12.5px] text-grey-mid">
            {formatPounds(stat.ytd)} this year · {giving}
          </span>
        </span>
        {pill === "on" && <span className={giftAidOn}>Gift Aid</span>}
        {pill === "missing" && <span className={giftAidOff}>No declaration</span>}
      </button>

      {merge && picked && merge.selected.size >= 2 && !isPrimary && (
        <button type="button" onClick={() => merge.onKeep(donor._id)} className={`${linkBtn} shrink-0`}>
          Keep
        </button>
      )}
    </li>
  );
}

// Two initials from the first two words that start with a letter, so "James & Ruth Bailey" gives "JR".
function initialsOf(name: string) {
  const initials = name
    .split(/\s+/)
    .filter((word) => /^[A-Za-z]/.test(word))
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
  return initials || "?";
}
