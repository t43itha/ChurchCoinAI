import { useId, useState, type ReactNode } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { ChevronDown, FileText, Link as LinkIcon, Mail, MapPin, MessageSquare, Phone, Wallet, type LucideIcon } from "lucide-react";
import { filterIncomeAndExpenditure } from "../../lib/reportableTransactions";
import type { Donor, Fund, Pledge, Transaction } from "../../types";
import HeroCard from "../hub/HeroCard";
import { NeedsYou, NeedsYouItem } from "../hub/NeedsYou";
import SectionTitle from "../hub/SectionTitle";
import {
  btnMd,
  btnOutline,
  btnSage,
  card,
  eyebrow,
  giftAidOff,
  giftAidOn,
  linkBtn,
  tagGrey,
  tagSage,
  txtInput,
} from "../wizard/ui";
import { formatPounds, giftAidState, shortGiftDate, whatsappNumber } from "./donorDirectory";

const RECENT_COUNT = 5;

export interface DonorDetailProps {
  donor: Donor;
  giftAidEnabled: boolean;
  canEdit: boolean;
  now: number;
  year: number;
  // Reportable income this year, in pounds, and the number of those gifts.
  yearTotal: number;
  yearCount: number;
  // What a missing Gift Aid declaration would reclaim this year; see undeclaredGiftAid.
  undeclared: { giving: number; claimable: number | null };
  lifetimeTotal: number;
  // Every transaction for this donor, newest first.
  gifts: Transaction[];
  // This donor's schedules, and the active ones that a gift can be linked to.
  donorPledges: Pledge[];
  allPledges: Pledge[];
  funds: Fund[];
  onEdit: () => void;
  onExport: () => void;
  onAddSchedule: () => void;
  onThankYou: () => void;
  onLinkPledge: (transaction: Transaction, pledgeId: string) => void;
  onUnlinkPledge: (transaction: Transaction) => void;
}

// One donor's profile: the year's giving and the one thing that needs doing, then recent gifts
// and contact. Schedules, notes and the thank-you message sit behind "More".
export default function DonorDetail({
  donor,
  giftAidEnabled,
  canEdit,
  now,
  year,
  yearTotal,
  yearCount,
  undeclared,
  lifetimeTotal,
  gifts,
  donorPledges,
  allPledges,
  funds,
  onEdit,
  onExport,
  onAddSchedule,
  onThankYou,
  onLinkPledge,
  onUnlinkPledge,
}: DonorDetailProps) {
  const moreId = useId();
  const [showAllGifts, setShowAllGifts] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const pill = giftAidState(donor, giftAidEnabled);
  const activePledges = donorPledges.filter((pledge) => pledge.status === "Active");
  const fundName = (fundId: string) => funds.find((fund) => fund._id === fundId)?.name;
  // Only individuals can declare Gift Aid, and only giving income counts towards it.
  const needsDeclaration = donor.type === "Individual" && pill === "missing" && undeclared.giving > 0;
  const shownGifts = showAllGifts ? gifts : gifts.slice(0, RECENT_COUNT);

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3.5">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-ink font-mono text-lg font-bold text-white"
        >
          {donor.name.charAt(0)}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-[20px] font-bold leading-tight text-ink">{donor.name}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-grey-mid">
            {donor.type}
            {pill === "on" && <span className={giftAidOn}>Gift Aid</span>}
            {pill === "missing" && <span className={giftAidOff}>No declaration</span>}
          </p>
        </div>
      </header>

      <div className="flex gap-2.5">
        {canEdit && (
          <button type="button" onClick={onEdit} className={`${btnOutline} ${btnMd} !w-auto px-4`}>
            Edit
          </button>
        )}
        <button type="button" onClick={onExport} className={`${btnOutline} ${btnMd} !w-auto px-4`}>
          Export
        </button>
      </div>

      <HeroCard
        label={`Given in ${year}`}
        value={formatPounds(yearTotal)}
        sub={`${yearCount} ${yearCount === 1 ? "gift" : "gifts"} · ${formatPounds(lifetimeTotal)} over time`}
      />

      <div className="space-y-3">
        <SectionTitle>Needs you</SectionTitle>
        <NeedsYou emptyText="Nothing needs doing for this donor.">
          {needsDeclaration && (
            <NeedsYouItem
              tone="amber"
              icon={FileText}
              title="No Gift Aid declaration"
              detail={
                undeclared.claimable === null
                  ? "Amount shows once this year's gifts are categorised"
                  : `Would add ${formatPounds(undeclared.claimable)} this year`
              }
              action={canEdit ? "Record" : undefined}
              onClick={canEdit ? onEdit : undefined}
            />
          )}
        </NeedsYou>
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <SectionTitle>Recent gifts</SectionTitle>
          {gifts.length > RECENT_COUNT && (
            <button type="button" onClick={() => setShowAllGifts((open) => !open)} className={linkBtn}>
              {showAllGifts ? "Show fewer" : `All ${gifts.length}`}
            </button>
          )}
        </div>
        {gifts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-ledger p-4 text-sm text-grey-mid">
            No gifts recorded for this donor yet.
          </p>
        ) : (
          <ul className="divide-y divide-ledger overflow-hidden rounded-2xl border border-ledger bg-white">
            {shownGifts.map((transaction) => {
              const income = transaction.type === "Income";
              const linked = allPledges.find((pledge) => pledge._id === transaction.pledgeId);
              return (
                <li key={transaction._id} className="grid gap-2 px-3.5 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">
                      <b className="block truncate text-sm text-ink">{transaction.description}</b>
                      <span className="text-xs text-grey-mid">
                        {shortGiftDate(new Date(transaction.date).getTime(), now)} · {fundName(transaction.fundId)}
                      </span>
                    </span>
                    <span className={`whitespace-nowrap font-mono text-sm font-bold ${income ? "text-sage" : "text-ink"}`}>
                      {income ? "+" : "−"}
                      {formatPounds(transaction.amount)}
                    </span>
                  </div>
                  {income && canEdit &&
                    (linked ? (
                      <div className="flex items-center justify-between">
                        <span className={tagSage}>
                          <LinkIcon size={11} aria-hidden="true" /> Linked to schedule
                        </span>
                        <button type="button" onClick={() => onUnlinkPledge(transaction)} className={linkBtn}>
                          Unlink
                        </button>
                      </div>
                    ) : (
                      activePledges.length > 0 && (
                        <select
                          aria-label={`Link ${transaction.description} to a schedule`}
                          value=""
                          onChange={(event) => event.target.value && onLinkPledge(transaction, event.target.value)}
                          className={txtInput}
                        >
                          <option value="">Link to a schedule…</option>
                          {activePledges.map((pledge) => (
                            <option key={pledge._id} value={pledge._id}>
                              {fundName(pledge.fundId)} ({formatPounds(pledge.amount)})
                            </option>
                          ))}
                        </select>
                      )
                    ))}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <SectionTitle>Contact</SectionTitle>
        <div className="grid gap-2">
          <ContactRow icon={Mail} text={donor.email || "No email provided"} />
          <ContactRow
            icon={Phone}
            text={donor.phone || "No phone number"}
            action={
              donor.phone ? (
                <button
                  type="button"
                  onClick={() => openWhatsApp(donor.phone ?? "")}
                  className={`${btnSage} !w-auto shrink-0 px-3 text-xs`}
                >
                  <MessageSquare size={13} aria-hidden="true" /> WhatsApp
                </button>
              ) : undefined
            }
          />
          <ContactRow
            icon={MapPin}
            text={donor.address || "No address on file"}
            sub={donor.postcode}
          />
        </div>
      </div>

      <div>
        <button
          type="button"
          aria-expanded={showMore}
          aria-controls={moreId}
          onClick={() => setShowMore((open) => !open)}
          className={`${btnOutline} ${btnMd}`}
        >
          More
          <ChevronDown size={16} aria-hidden="true" className={`transition-transform ${showMore ? "rotate-180" : ""}`} />
        </button>

        {showMore && (
          <div id={moreId} className="mt-5 space-y-6">
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <SectionTitle>Giving schedules</SectionTitle>
                {canEdit && (
                  <button type="button" onClick={onAddSchedule} className={linkBtn}>
                    + New schedule
                  </button>
                )}
              </div>
              {donorPledges.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-ledger p-4 text-sm text-grey-mid">
                  No schedules for this donor.
                </p>
              ) : (
                <ul className="grid gap-2">
                  {donorPledges.map((pledge) => (
                    <li key={pledge._id} className={`${card} flex items-center gap-3`}>
                      <Wallet size={16} aria-hidden="true" className="shrink-0 text-grey-mid" />
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-sm text-ink">{fundName(pledge.fundId)}</b>
                        <span className="text-xs text-grey-mid">
                          {formatPounds(pledge.amount)} · {pledge.frequency.toLowerCase()}
                        </span>
                      </span>
                      <span className={pledge.status === "Active" ? tagSage : tagGrey}>{pledge.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-3">
              <SectionTitle>Giving trend (last 10)</SectionTitle>
              <div className={`${card} h-56`}>
                <GivingTrend gifts={gifts} />
              </div>
            </div>

            <div className="space-y-3">
              <SectionTitle>Notes and settings</SectionTitle>
              <div className={`${card} grid gap-2.5 text-sm`}>
                <p className="whitespace-pre-wrap text-grey-dark">{donor.notes || "No private notes added."}</p>
                <p className="flex justify-between gap-3 border-t border-ledger pt-2.5">
                  <span className={eyebrow}>Prefers to hear by</span>
                  <span className="font-semibold text-ink">{donor.communicationPreference || "Email"}</span>
                </p>
              </div>
            </div>

            <button type="button" onClick={onThankYou} className={`${btnOutline} ${btnMd}`}>
              Thank-you message
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Opens WhatsApp on the device with the donor's number, as the Communicate tab did before.
function openWhatsApp(phone: string) {
  window.location.href = `whatsapp://send?phone=${whatsappNumber(phone)}`;
}

function ContactRow({
  icon: Icon,
  text,
  sub,
  action,
}: {
  icon: LucideIcon;
  text: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className={`${card} flex items-center gap-3`}>
      <Icon size={16} aria-hidden="true" className="shrink-0 text-grey-mid" />
      <span className="min-w-0 flex-1">
        <span className="block whitespace-pre-wrap break-words text-sm text-grey-dark">{text}</span>
        {sub && <span className="block font-mono text-xs text-grey-mid">{sub}</span>}
      </span>
      {action}
    </div>
  );
}

// The last ten reportable gifts, oldest first.
function GivingTrend({ gifts }: { gifts: Transaction[] }) {
  const data = filterIncomeAndExpenditure(gifts)
    .filter((transaction) => transaction.type === "Income")
    .slice(0, 10)
    .map((transaction) => ({
      date: new Date(transaction.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      amount: transaction.amount,
    }))
    .reverse();

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#78716c" }} tickLine={false} axisLine={false} dy={10} />
        <Tooltip
          cursor={{ fill: "#faf9f7" }}
          contentStyle={{
            borderRadius: "12px",
            fontSize: "12px",
            border: "1px solid #e7e5e1",
            boxShadow: "0 16px 40px -16px rgba(28,25,23,.28)",
            fontFamily: "JetBrains Mono",
          }}
        />
        <Bar dataKey="amount" fill="#1c1917" radius={[4, 4, 0, 0]} barSize={30} />
      </BarChart>
    </ResponsiveContainer>
  );
}
