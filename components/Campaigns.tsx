import React, { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { Clock, FileSpreadsheet, Pencil, Plus, Search, Target, Wand2 } from "lucide-react";
import { api } from "../convex/_generated/api";
import { roundMoney, sumMoney } from "../convex/lib/money";
import { formatLocalDateInputValue } from "../lib/dateUtils";
import { can } from "../lib/permissions";
import { pledgeFulfillmentTarget } from "../lib/pledgeProgress";
import { isReportableIncomeTransaction, sumRaised } from "../lib/reportableTransactions";
import { AppUser, Donor, DonorCreateInput, Fund, FundCreateInput, FundType, Pledge, PledgeCreateInput, Transaction } from "../types";
import { useGiftAidEnabled } from "./app/useGiftAidEnabled";
import { dayMonth, gbp } from "./cashEntry/format";
import HeroCard from "./hub/HeroCard";
import HubHeader from "./hub/HubHeader";
import HubLayout from "./hub/HubLayout";
import { NeedsYou, NeedsYouItem } from "./hub/NeedsYou";
import SectionTitle from "./hub/SectionTitle";
import MatchSheet, { type PledgeMatch } from "./campaigns/MatchSheet";
import NewCampaignWalkthrough from "./campaigns/NewCampaignWalkthrough";
import PledgeImportSheet from "./campaigns/PledgeImportSheet";
import PledgeSheet from "./campaigns/PledgeSheet";
import PledgeWalkthrough from "./campaigns/PledgeWalkthrough";
import SwitchCampaignSheet from "./campaigns/SwitchCampaignSheet";
import ThankWalkthrough from "./campaigns/ThankWalkthrough";
import {
  PLEDGE_TAG_LABEL,
  campaignSplit,
  endsLabel,
  formatWholePounds,
  initials,
  isOpenCampaign,
  latestDate,
  pledgeOutstandingPence,
  pledgeTag,
  receivedOn,
  selectedCampaign,
  type PledgeTag,
} from "./campaigns/logic";
import { ReceiptCard, ReceiptRow } from "./wizard/Receipt";
import { Segmented, btnMd, btnOutline, btnPrimary, eyebrow, hubTitle, linkBtn, nextIcon, tagAmber, tagGrey, tagSage, txtInput } from "./wizard/ui";

interface CampaignsProps {
  funds: Fund[];
  pledges: Pledge[];
  transactions: Transaction[];
  donors: Donor[];
  onAddPledge: (p: PledgeCreateInput) => Promise<boolean>;
  onUpdatePledge: (p: Pledge) => void;
  onBulkAddPledges: (ps: PledgeCreateInput[]) => void;
  onBulkAddDonors: (ds: DonorCreateInput[]) => Promise<{ id: string; name: string; isNew: boolean }[]>;
  onUpdateTransaction: (t: Transaction) => void;
  onAddFund: (fund: FundCreateInput) => Promise<string | null>;
  currentUser: AppUser;
  onPledgeCompleted?: (donorName: string, amount: number) => void;
}

const FILTERS = ["Everyone", "Behind", "Paid"] as const;
type Filter = (typeof FILTERS)[number];

// Open sheets and walkthroughs. Only one is open at a time.
type Panel =
  | { kind: "switch" }
  | { kind: "newCampaign" }
  | { kind: "addPledge" }
  | { kind: "editPledge"; pledge: Pledge }
  | { kind: "thank"; pledge: Pledge }
  | { kind: "import" }
  | { kind: "matches" };

const TAG_CLASS: Record<PledgeTag, string> = {
  paid: tagGrey,
  behind: tagAmber,
  onTrack: tagSage,
  cancelled: tagGrey,
};

const HERO_COLOURS = { received: "#a9cfa9", pledged: "#d9b98f", toFind: "rgba(255,255,255,0.3)" } as const;

// One campaign at a time. The hero shows how far it has got, the pledges are its donors, and the
// receipt has the money side. Sheets and walkthroughs handle the rest.
const Campaigns: React.FC<CampaignsProps> = ({
  funds,
  pledges,
  transactions,
  donors,
  onAddPledge,
  onUpdatePledge,
  onBulkAddPledges,
  onBulkAddDonors,
  onUpdateTransaction,
  onAddFund,
  currentUser,
}) => {
  // Only show Restricted (campaign) funds
  const campaignFunds = funds.filter((f) => f.type === FundType.RESTRICTED);
  const [selectedFundId, setSelectedFundId] = useState<string>("");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [filter, setFilter] = useState<Filter>("Everyone");
  const [pledgeSearch, setPledgeSearch] = useState("");
  const [matches, setMatches] = useState<PledgeMatch[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const reconcilePledgesAction = useAction(api.actions.ai.reconcilePledges);
  const generatePledgeCompletionMessageAction = useAction(api.actions.ai.generatePledgeCompletionMessage);
  const giftAidOn = useGiftAidEnabled();

  const canEdit = can(currentUser.role, "pledges.write");
  const canStartCampaign = can(currentUser.role, "funds.write");
  const today = formatLocalDateInputValue(new Date());

  // Set default selected fund when campaign funds are available
  useEffect(() => {
    if (campaignFunds.length > 0 && !selectedFundId) {
      setSelectedFundId(campaignFunds[0]._id);
    }
  }, [campaignFunds, selectedFundId]);

  const close = () => setPanel(null);

  const selectedFund = selectedCampaign(campaignFunds, selectedFundId);

  // A campaign started here becomes the one on screen, so the next pledge goes to it.
  const createCampaign = async (fund: FundCreateInput) => {
    const fundId = await onAddFund(fund);
    if (fundId) setSelectedFundId(fundId);
    return fundId;
  };

  // Undefined when there are no campaigns; only starting one is possible then.
  const renderSheets = () => {
    if (!panel) return null;
    if (panel.kind === "newCampaign") {
      return canStartCampaign ? <NewCampaignWalkthrough onAddFund={createCampaign} onClose={close} /> : null;
    }
    if (!selectedFund) return null;
    const fundId = selectedFund._id;
    const selectedName = selectedFund.name;
    switch (panel.kind) {
      case "switch":
        return (
          <SwitchCampaignSheet
            campaigns={campaignFunds}
            selectedId={fundId}
            today={today}
            canStartCampaign={canStartCampaign}
            onPick={(id) => {
              setSelectedFundId(id);
              close();
            }}
            onNew={() => setPanel({ kind: "newCampaign" })}
            onClose={close}
          />
        );
      case "addPledge":
        return canEdit ? (
          <PledgeWalkthrough campaignName={selectedName} fundId={fundId} donors={donors} today={today} onAdd={onAddPledge} onClose={close} />
        ) : null;
      case "editPledge":
        return canEdit ? (
          <PledgeSheet
            key={panel.pledge._id}
            campaignName={selectedName}
            pledge={panel.pledge}
            onSave={(pledge) => {
              onUpdatePledge(pledge);
              close();
            }}
            onClose={close}
          />
        ) : null;
      case "thank": {
        const { pledge } = panel;
        const fundName = funds.find((f) => f._id === pledge.fundId)?.name || "Campaign";
        return (
          <ThankWalkthrough
            key={pledge._id}
            pledge={pledge}
            campaignName={selectedName}
            donors={donors}
            draftMessage={() =>
              generatePledgeCompletionMessageAction({ donorName: pledge.donorName, pledgeAmount: pledge.amount, fundName })
            }
            onClose={close}
          />
        );
      }
      case "import":
        return canEdit ? (
          <PledgeImportSheet
            fundId={fundId}
            fundName={selectedName}
            donors={donors}
            pledges={pledges}
            onBulkAddDonors={onBulkAddDonors}
            onBulkAddPledges={onBulkAddPledges}
            onClose={close}
          />
        ) : null;
      case "matches":
        return canEdit ? (
          <MatchSheet
            matches={matches}
            transactions={transactions}
            onConfirm={handleConfirmMatch}
            onDismiss={handleDismissMatch}
            onClose={close}
          />
        ) : null;
      default:
        return null;
    }
  };

  if (campaignFunds.length === 0) {
    return (
      <>
        <div className="mx-auto flex max-w-md animate-enter flex-col items-center gap-3 py-16 text-center">
          <span className={`${nextIcon} bg-grey-light text-ink`}>
            <Target size={17} aria-hidden="true" />
          </span>
          <h1 className={hubTitle}>No campaigns yet</h1>
          <p className="text-sm text-grey-mid">Track pledges and gifts towards a project, such as a roof appeal.</p>
          {canStartCampaign ? (
            <button type="button" onClick={() => setPanel({ kind: "newCampaign" })} className={`${btnPrimary} ${btnMd} mt-2 !w-auto px-5`}>
              Start a campaign
            </button>
          ) : (
            <p className="text-xs text-grey-mid">Someone in Finance or an admin can start one.</p>
          )}
        </div>
        {renderSheets()}
      </>
    );
  }

  // --- Campaign figures ---

  const fundId = selectedFund._id;
  const campaignPledges = pledges.filter((p) => p.fundId === fundId);
  const fundTransactions = transactions.filter((t) => t.fundId === fundId);
  const incomeRows = transactions.filter(isReportableIncomeTransaction);

  const paymentsByPledge = new Map<string, Transaction[]>();
  incomeRows.forEach((row) => {
    if (!row.pledgeId) return;
    const payments = paymentsByPledge.get(row.pledgeId);
    if (payments) payments.push(row);
    else paymentsByPledge.set(row.pledgeId, [row]);
  });

  const rows = campaignPledges.map((pledge) => {
    const payments = paymentsByPledge.get(pledge._id) ?? [];
    return {
      pledge,
      // The whole schedule for a bounded pledge, null when open-ended.
      target: pledgeFulfillmentTarget(pledge),
      received: receivedOn(payments),
      lastPaid: latestDate(payments),
      tag: pledgeTag(pledge, incomeRows, today),
    };
  });

  const totalPledged = sumMoney(campaignPledges, (p) => p.amount);
  const collected = sumRaised(fundTransactions);
  const target = selectedFund.targetAmount || totalPledged * 1.2;
  // Real outstanding feeds the receipt and labels; the split is capped only to draw the bar.
  const outstandingPence = rows.reduce((sum, row) => sum + pledgeOutstandingPence(row.pledge, row.received), 0);
  const outstanding = outstandingPence / 100;
  const split = campaignSplit(target, collected, outstandingPence);
  const percent = target > 0 ? Math.min(Math.round((split.received / target) * 100), 100) : 0;

  const giftAidRows = fundTransactions.filter((t) => isReportableIncomeTransaction(t) && t.isGiftAidEligible === true);
  const giftAidToClaim = roundMoney(sumMoney(giftAidRows, (t) => t.amount) * 0.25);

  const behindCount = rows.filter((row) => row.tag === "behind").length;
  // Open-ended pledges add nothing to "Pledged, to come", so the receipt says how many it leaves out.
  const openEndedCount = rows.filter((row) => row.target === null && row.pledge.status === "Active").length;
  const openCount = campaignFunds.filter((f) => isOpenCampaign(f, today)).length;

  const search = pledgeSearch.trim().toLowerCase();
  const visibleRows = rows.filter(
    (row) =>
      (filter === "Everyone" || (filter === "Behind" ? row.tag === "behind" : row.tag === "paid")) &&
      (search === "" || row.pledge.donorName.toLowerCase().includes(search))
  );
  const emptyText = pledgeSearch
    ? `No pledges matching "${pledgeSearch}"`
    : campaignPledges.length === 0
      ? "No pledges recorded for this campaign yet."
      : "No pledges in this view.";

  // --- Actions ---

  const handleAIMatch = async () => {
    setIsMatching(true);
    try {
      const results = await reconcilePledgesAction({});
      setMatches(results);
      if (results.length > 0) setPanel({ kind: "matches" });
    } catch (e) {
      console.error(e);
    } finally {
      setIsMatching(false);
    }
  };

  function handleConfirmMatch(match: PledgeMatch) {
    const t = transactions.find((tr) => tr._id === match.transactionId);
    if (t) {
      onUpdateTransaction({
        ...t,
        pledgeId: match.pledgeId,
        donorName: match.donorName || t.donorName,
      });
      setMatches((prev) => prev.filter((m) => m !== match));
    }
  }

  function handleDismissMatch(match: PledgeMatch) {
    setMatches((prev) => prev.filter((m) => m !== match));
  }

  const needsYou = [
    behindCount > 0 && (
      <NeedsYouItem
        key="behind"
        tone="amber"
        icon={Clock}
        title={`${behindCount} ${behindCount === 1 ? "pledge is" : "pledges are"} behind`}
        detail="No payment in the usual window"
        action="Show"
        onClick={() => setFilter("Behind")}
      />
    ),
    canEdit && matches.length > 0 && (
      <NeedsYouItem
        key="matches"
        tone="sage"
        icon={Wand2}
        title={`${matches.length} ${matches.length === 1 ? "gift may match" : "gifts may match"} a pledge`}
        detail="Confirm or dismiss the suggestions"
        action="Review"
        onClick={() => setPanel({ kind: "matches" })}
      />
    ),
  ];

  return (
    <div className="animate-enter pb-12">
      <HubLayout
        receipt={
          <>
            <ReceiptCard>
              <p className={eyebrow}>This campaign</p>
              <div className="mt-2">
                <ReceiptRow label="Gifts received" value={gbp(collected)} />
                {giftAidOn && giftAidRows.length > 0 && (
                  <ReceiptRow label="Gift Aid to claim (25%)" value={gbp(giftAidToClaim)} />
                )}
                <ReceiptRow label="Pledged, to come" value={gbp(outstanding)} />
                {openEndedCount > 0 && (
                  <p className="pb-1 text-xs text-grey-mid">
                    Excludes {openEndedCount} {openEndedCount === 1 ? "pledge" : "pledges"} with no end date
                  </p>
                )}
                <ReceiptRow label="Still to find" value={gbp(split.toFind)} />
              </div>
            </ReceiptCard>
            <p className="px-1 text-xs leading-snug text-grey-mid">
              Figures exclude voided rows and cash banking deposits.
            </p>
          </>
        }
      >
        <HubHeader
          eyebrow={`Campaign · ${openCount} open`}
          title={selectedFund.name}
          status={endsLabel(selectedFund, today)}
          actions={
            <>
              <button type="button" onClick={() => setPanel({ kind: "switch" })} className={`${btnOutline} ${btnMd} !w-auto px-5`}>
                Switch campaign
              </button>
              {canEdit && (
                <button type="button" onClick={() => setPanel({ kind: "addPledge" })} className={`${btnPrimary} ${btnMd} !w-auto px-5`}>
                  <Plus size={16} aria-hidden="true" />
                  Add pledge
                </button>
              )}
            </>
          }
        />

        <HeroCard
          label="Raised so far"
          value={formatWholePounds(collected)}
          sub={`of ${formatWholePounds(target)} target · ${percent}%`}
          segments={[
            { label: "Received", value: formatWholePounds(collected), amount: split.received, colour: HERO_COLOURS.received },
            { label: "Pledged, still to come", value: formatWholePounds(outstanding), amount: split.pledged, colour: HERO_COLOURS.pledged },
            { label: "To find", value: formatWholePounds(split.toFind), amount: split.toFind, colour: HERO_COLOURS.toFind },
          ]}
        />

        <section className="space-y-3">
          <SectionTitle>Needs you</SectionTitle>
          <NeedsYou>{needsYou}</NeedsYou>
        </section>

        <section className="space-y-3">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <SectionTitle>Pledges · {campaignPledges.length}</SectionTitle>
            <div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-end">
              <div className="relative min-w-0 sm:w-64">
                <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-grey-mid" />
                <input
                  type="search"
                  aria-label="Search pledges"
                  placeholder="Search donors…"
                  value={pledgeSearch}
                  onChange={(event) => setPledgeSearch(event.target.value)}
                  className={`${txtInput} h-11 pl-10 pr-3.5`}
                />
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPanel({ kind: "import" })} className={`${btnOutline} h-11 !w-auto px-3.5 text-sm`}>
                    <FileSpreadsheet size={16} aria-hidden="true" />
                    Import CSV
                  </button>
                  <button
                    type="button"
                    disabled={isMatching}
                    onClick={() => void handleAIMatch()}
                    className={`${btnOutline} h-11 !w-auto px-3.5 text-sm`}
                  >
                    <Wand2 size={16} aria-hidden="true" />
                    {isMatching ? "Matching…" : "AI match"}
                  </button>
                </div>
              )}
            </div>
          </div>

          <Segmented options={FILTERS} value={filter} onChange={setFilter} label="Show pledges" />

          <ul className="divide-y divide-ledger overflow-hidden rounded-2xl border border-ledger bg-white">
            {visibleRows.map(({ pledge, target: pledgeTarget, received, lastPaid, tag }) => (
              <li key={pledge._id} className="flex items-center gap-3 px-3.5 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-grey-light text-xs font-bold text-grey-dark">
                    {initials(pledge.donorName)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[14.5px] text-ink">{pledge.donorName}</b>
                    <span className="block truncate text-xs text-grey-mid">
                      {pledgeTarget === null
                        ? `${gbp(pledge.amount)} ${pledge.frequency.toLowerCase()} · ${gbp(received)} received · no end date`
                        : `${gbp(received)} of ${gbp(pledgeTarget)} · ${pledge.frequency}`}
                      {lastPaid ? ` · last paid ${dayMonth(lastPaid)}` : ""}
                    </span>
                  </span>
                </div>
                <span className={TAG_CLASS[tag]}>{PLEDGE_TAG_LABEL[tag]}</span>
                {tag === "paid" && (
                  <button type="button" onClick={() => setPanel({ kind: "thank", pledge })} className={linkBtn}>
                    Thank
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    aria-label={`Edit pledge from ${pledge.donorName}`}
                    onClick={() => setPanel({ kind: "editPledge", pledge })}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] text-grey-mid hover:text-grey-dark"
                  >
                    <Pencil size={16} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
            {visibleRows.length === 0 && <li className="p-8 text-center text-sm text-grey-mid">{emptyText}</li>}
          </ul>
        </section>
      </HubLayout>

      {renderSheets()}
    </div>
  );
};

export default Campaigns;
