import { useEffect, useMemo, useState, type FC } from "react";
import { useConvex, useMutation } from "convex/react";
import { Plus, ShieldAlert } from "lucide-react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { meetsMoneyTarget, sumMoney } from "../convex/lib/money";
import { notify } from "../lib/notifications";
import { filterIncomeAndExpenditure, sumReportableIncome } from "../lib/reportableTransactions";
import { isGiftAidEnabled } from "../lib/giftAid";
import { can } from "../lib/permissions";
import type { AppUser, ChurchDetails, Donor, DonorCreateInput, Fund, Pledge, PledgeCreateInput, Transaction } from "../types";
import HubHeader from "./hub/HubHeader";
import WizardFrame from "./wizard/WizardFrame";
import { btnMd, btnOutline, btnPrimary, card, eyebrow } from "./wizard/ui";
import DonorDetail from "./donors/DonorDetail";
import DonorList, { type MergeControls } from "./donors/DonorList";
import DonorSheet from "./donors/DonorSheet";
import ExportSheet, { type ExportPeriod, type ExportReport } from "./donors/ExportSheet";
import MergeSheet, { type DuplicateGroup } from "./donors/MergeSheet";
import ScheduleSheet from "./donors/ScheduleSheet";
import ThankYouWalkthrough from "./donors/ThankYouWalkthrough";
import {
  activeScheduleMap,
  filterDonors,
  givingStats,
  statFor,
  whatsappNumber,
  type DonorFilter,
} from "./donors/donorDirectory";

interface DonorManagerProps {
  donors: Donor[];
  transactions: Transaction[];
  pledges: Pledge[];
  funds: Fund[];
  onAddDonor: (d: DonorCreateInput) => Promise<string | undefined>;
  onUpdateDonor: (d: Donor) => void;
  onAddPledge: (p: PledgeCreateInput) => void;
  onUpdatePledge: (p: Pledge) => void;
  onUpdateTransaction: (t: Transaction) => void;
  currentUser: AppUser;
  churchDetails?: ChurchDetails;
}

// The one sheet open over the page. Null when the page is showing on its own.
type Sheet = "add" | "edit" | "schedule" | "export" | "merge" | "thankYou" | null;

const DAY_MS = 86_400_000;
const NEW_DONOR_DEFAULTS: Partial<Donor> = { type: "Individual", isGiftAidActive: false, communicationPreference: "Email" };

// Below xl the donor profile opens as a sheet; from xl it sits beside the directory.
function useWideLayout() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1280px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

const DonorManager: FC<DonorManagerProps> = ({ donors, transactions, pledges, funds, onAddDonor, onUpdateDonor, onAddPledge, onUpdatePledge, onUpdateTransaction, currentUser, churchDetails }) => {
  const convex = useConvex();
  const giftAidEnabled = isGiftAidEnabled(churchDetails);
  const canEdit = can(currentUser.role, "donors.write");
  const canView = can(currentUser.role, "donors.read");
  const wide = useWideLayout();

  const [selectedDonorId, setSelectedDonorId] = useState<string | null>(donors[0]?._id ?? null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DonorFilter>("everyone");
  const [sheet, setSheet] = useState<Sheet>(null);

  // Export state
  const [exportPeriod, setExportPeriod] = useState<ExportPeriod>("year");
  const [exportYear, setExportYear] = useState(new Date().getFullYear());
  const [exportReport, setExportReport] = useState<ExportReport>({ type: "all" });
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Merge state
  const mergeDonors = useMutation(api.mutations.donors.merge);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [isFindingDuplicates, setIsFindingDuplicates] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [selectedMergeGroup, setSelectedMergeGroup] = useState<number | null>(null);
  const [selectedPrimaryId, setSelectedPrimaryId] = useState<string | null>(null);
  const [manualMergeMode, setManualMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set());
  const [manualPrimaryId, setManualPrimaryId] = useState<string | null>(null);

  const year = new Date().getFullYear();
  const now = Date.now();
  const stats = useMemo(() => givingStats(transactions, year), [transactions, year]);
  const schedules = useMemo(() => activeScheduleMap(pledges), [pledges]);

  const summary = useMemo(() => {
    let active = 0;
    let needsReview = 0;
    for (const donor of donors) {
      const { lastGift } = statFor(stats, donor);
      if (lastGift >= now - 365 * DAY_MS) active++;
      if ((giftAidEnabled && !donor.isGiftAidActive) || lastGift < now - 60 * DAY_MS) needsReview++;
    }
    const month = new Date().getMonth();
    const monthTotal = sumMoney(
      filterIncomeAndExpenditure(transactions).filter(
        (t) => t.type === "Income" && new Date(t.date).getMonth() === month && new Date(t.date).getFullYear() === year
      ),
      (t) => t.amount
    );
    return {
      active,
      needsReview,
      monthTotal,
      giftAid: donors.filter((donor) => donor.isGiftAidActive).length,
      monthLabel: new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    };
  }, [donors, transactions, stats, giftAidEnabled, now, year]);

  const visibleDonors = filterDonors(donors, { search, filter, stats, giftAidEnabled, now });

  // After all hooks (Rules of Hooks) — Guests cannot view donor records.
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] text-grey-mid">
        <div className="w-16 h-16 bg-grey-light rounded-2xl flex items-center justify-center mb-6 text-ledger"><ShieldAlert size={32} /></div>
        <h2 className="text-lg font-bold text-ink font-mono mb-2">Access Restricted</h2>
        <p className="text-sm max-w-sm text-center">Your user role ({currentUser.role}) does not have permission to view donor records.</p>
      </div>
    );
  }

  const selectedDonor = donors.find((donor) => donor._id === selectedDonorId);
  const gifts = selectedDonor
    ? transactions
        .filter((t) => t.donorId === selectedDonor._id || t.donorName === selectedDonor.name)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    : [];
  const donorPledges = selectedDonor
    ? pledges.filter((p) => p.donorId === selectedDonor._id || p.donorName === selectedDonor.name)
    : [];
  const yearGifts = filterIncomeAndExpenditure(gifts).filter(
    (t) => t.type === "Income" && new Date(t.date).getFullYear() === year
  );
  const yearTotal = sumMoney(yearGifts, (t) => t.amount);
  const churchName = churchDetails?.name || "Church";

  const closeSheet = () => setSheet(null);

  const selectDonor = (donor: Donor) => {
    setSelectedDonorId(donor._id);
    setDetailOpen(true);
  };

  const submitNewDonor = async (values: Partial<Donor>) => {
    if (!values.name) return;
    const createdId = await onAddDonor({
      name: values.name,
      email: values.email,
      phone: values.phone,
      address: values.address,
      postcode: values.postcode,
      notes: values.notes,
      type: values.type || "Individual",
      isGiftAidActive: values.isGiftAidActive,
      communicationPreference: values.communicationPreference,
    });
    setSheet(null);
    if (createdId) {
      setSelectedDonorId(createdId);
      setDetailOpen(true);
    }
  };

  const saveDonorEdit = (values: Partial<Donor>) => {
    if (selectedDonor && values.name) {
      onUpdateDonor({ ...selectedDonor, ...values } as Donor);
      setSheet(null);
    }
  };

  const addSchedule = (pledge: PledgeCreateInput) => {
    onAddPledge(pledge);
    setSheet(null);
  };

  const handleLinkTransaction = (transaction: Transaction, pledgeId: string) => {
    // We rely on the parent component (App.tsx) handling onUpdateTransaction to check for completion
    onUpdateTransaction({ ...transaction, pledgeId });
  };

  const handleUnlinkTransaction = (transaction: Transaction) => {
    const oldPledgeId = transaction.pledgeId;
    if (!oldPledgeId) return;

    onUpdateTransaction({ ...transaction, pledgeId: undefined });

    // Check if unlinking should reactivate a completed pledge
    const pledge = pledges.find((p) => p._id === oldPledgeId);
    if (pledge && pledge.status === "Completed") {
      const remainingSum = sumReportableIncome(
        transactions.filter((t) => t.pledgeId === oldPledgeId && t._id !== transaction._id)
      );
      if (!meetsMoneyTarget(remainingSum, pledge.amount)) {
        onUpdatePledge({ ...pledge, status: "Active" });
      }
    }
  };

  // Get date range for export based on period selection
  const getExportDateRange = () => {
    if (exportPeriod === "all") return { start: undefined, end: undefined };
    if (exportPeriod === "last6months") {
      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - 6);
      return {
        start: start.toISOString().split("T")[0],
        end: end.toISOString().split("T")[0],
      };
    }
    return { start: `${exportYear}-01-01`, end: `${exportYear}-12-31` };
  };

  const getPeriodDescription = () => {
    if (exportPeriod === "all") return "all giving history";
    if (exportPeriod === "last6months") {
      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - 6);
      return `${start.toLocaleDateString("en-GB", { month: "short", year: "numeric" })} - ${end.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`;
    }
    return String(exportYear);
  };

  const buildScheduleExport = async (filterType: "all" | "tithes" | "campaign", fundId?: string) => {
    if (!selectedDonor) return null;

    let filteredPledges = donorPledges;
    let filteredTransactions = filterIncomeAndExpenditure(gifts);
    let logoOverride: string | undefined;
    let campaignName: string | undefined;

    const { start: periodStart, end: periodEnd } = getExportDateRange();

    if (periodStart && periodEnd) {
      filteredTransactions = filteredTransactions.filter((t) => t.date >= periodStart && t.date <= periodEnd);
    }

    if (filterType === "tithes") {
      const titheFundIds = funds.filter((f) => f.type === "Unrestricted").map((f) => f._id);
      filteredPledges = donorPledges.filter((p) => titheFundIds.includes(p.fundId));
      const tithePledgeIds = pledges.filter((p) => titheFundIds.includes(p.fundId)).map((p) => p._id);
      filteredTransactions = filteredTransactions.filter(
        (t) => titheFundIds.includes(t.fundId) || (t.pledgeId && tithePledgeIds.includes(t.pledgeId))
      );
    } else if (filterType === "campaign" && fundId) {
      filteredPledges = donorPledges.filter((p) => p.fundId === fundId);
      const campaignPledgeIds = pledges.filter((p) => p.fundId === fundId).map((p) => p._id);
      filteredTransactions = filteredTransactions.filter(
        (t) => t.fundId === fundId || (t.pledgeId && campaignPledgeIds.includes(t.pledgeId))
      );

      const campaignFund = funds.find((f) => f._id === fundId);
      if (campaignFund?.logoUrl) logoOverride = campaignFund.logoUrl;
      campaignName = campaignFund?.name;
    }

    const details = churchDetails || { name: "ChurchCoin", address: "", email: "" };
    const { generateScheduleHTML, buildDonorSchedulePdfFilename } = await import("../services/pdfGenerator");
    const html = generateScheduleHTML(
      selectedDonor,
      filteredPledges,
      funds,
      details,
      logoOverride,
      filteredTransactions,
      periodStart,
      periodEnd,
      filterType,
      campaignName
    );

    const filename = buildDonorSchedulePdfFilename({
      donorName: selectedDonor.name,
      reportType: filterType,
      periodStart,
      periodEnd,
      campaignName,
    });

    return { html, filename };
  };

  const generateSchedulePdf = async (filterType: "all" | "tithes" | "campaign", fundId?: string) => {
    const exportData = await buildScheduleExport(filterType, fundId);
    if (!exportData) return null;

    const { ensureHtmlTitleForPdf, renderPdfBlobFromHtml } = await import("../services/pdfExport");
    const htmlWithTitle = ensureHtmlTitleForPdf(exportData.html, exportData.filename);
    const blob = await renderPdfBlobFromHtml({ html: htmlWithTitle });
    return { blob, filename: exportData.filename };
  };

  const handlePrintSchedule = async (filterType: "all" | "tithes" | "campaign", fundId?: string) => {
    if (!selectedDonor || isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      const pdf = await generateSchedulePdf(filterType, fundId);
      if (!pdf) return;
      const { savePdfBlob } = await import("../services/pdfExport");
      const didSave = await savePdfBlob({ blob: pdf.blob, filename: pdf.filename });
      if (didSave) setSheet(null);
    } catch (e) {
      console.error("PDF export failed:", e);
      notify("Error", e instanceof Error ? e.message : "Could not create the donor schedule.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Send via WhatsApp
  const handleSendViaWhatsApp = async (filterType: "all" | "tithes" | "campaign", fundId?: string) => {
    if (!selectedDonor?.phone || isGeneratingPdf) return;
    setIsGeneratingPdf(true);

    try {
      const pdf = await generateSchedulePdf(filterType, fundId);
      if (!pdf) return;

      const filenameWithExt = `${pdf.filename}.pdf`;
      const formatted = whatsappNumber(selectedDonor.phone);

      const message = `Hi ${selectedDonor.name},

Please find attached your giving statement for ${getPeriodDescription()}.

Thank you for your faithful support!

— ${churchName} Finance Team

📎 Please attach: ${filenameWithExt}`;

      try {
        await navigator.clipboard.writeText(message);
      } catch {
        // ignore
      }

      const { downloadPdfBlob, sharePdfBlob } = await import("../services/pdfExport");

      const anyNavigator = navigator as any;
      const isMobile =
        typeof anyNavigator.userAgentData?.mobile === "boolean"
          ? anyNavigator.userAgentData.mobile
          : window.matchMedia?.("(pointer:coarse)")?.matches || /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);

      if (isMobile) {
        const didShare = await sharePdfBlob({
          blob: pdf.blob,
          filename: pdf.filename,
          title: `Giving Statement - ${getPeriodDescription()}`,
          text: message,
        });
        if (didShare) {
          setSheet(null);
          return;
        }
      }

      // Desktop (or fallback): download the PDF, then open WhatsApp with message prefilled.
      downloadPdfBlob({ blob: pdf.blob, filename: pdf.filename });
      window.location.href = `whatsapp://send?phone=${formatted}&text=${encodeURIComponent(message)}`;

      setSheet(null);
    } catch (e) {
      console.error("WhatsApp send failed:", e);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Send via Email
  const handleSendViaEmail = async (filterType: "all" | "tithes" | "campaign", fundId?: string) => {
    if (!selectedDonor?.email || isGeneratingPdf) return;
    setIsGeneratingPdf(true);

    try {
      const pdf = await generateSchedulePdf(filterType, fundId);
      if (!pdf) return;

      const filenameWithExt = `${pdf.filename}.pdf`;
      const subject = `Your Giving Statement - ${getPeriodDescription()}`;
      const body = `Dear ${selectedDonor.name},

Please find attached your giving statement for ${getPeriodDescription()}.

Thank you for your faithful support!

Kind regards,
${churchName} Finance Team

---
[Please attach the downloaded PDF: ${filenameWithExt}]`;

      const { sharePdfBlob, savePdfBlob } = await import("../services/pdfExport");
      const didShare = await sharePdfBlob({ blob: pdf.blob, filename: pdf.filename, title: subject, text: body });

      if (!didShare) {
        const didSave = await savePdfBlob({ blob: pdf.blob, filename: pdf.filename });
        if (!didSave) return;
        const mailtoUrl = `mailto:${selectedDonor.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailtoUrl;
      }

      setSheet(null);
    } catch (e) {
      console.error("Email send failed:", e);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Handle finding duplicate donors
  const handleFindDuplicates = async () => {
    setIsFindingDuplicates(true);
    try {
      const groups = await convex.query(api.mutations.donors.findDuplicates, {});
      setDuplicateGroups(groups);
      if (groups.length === 0) {
        notify("Notice", "No duplicate donors found.");
      } else {
        setSelectedMergeGroup(null);
        setSelectedPrimaryId(null);
        setSheet("merge");
      }
    } catch (error) {
      console.error("Error finding duplicates:", error);
      notify("Error", "Failed to find duplicates.");
    } finally {
      setIsFindingDuplicates(false);
    }
  };

  // Handle merging donors (auto-detected)
  const handleMergeDonors = async (groupIndex: number) => {
    const group = duplicateGroups[groupIndex];
    if (!group || !selectedPrimaryId) return;

    setIsMerging(true);
    try {
      const duplicateIds = group.donors.filter((d) => d._id !== selectedPrimaryId).map((d) => d._id);

      const result = await mergeDonors({
        primaryDonorId: selectedPrimaryId as Id<"donors">,
        duplicateDonorIds: duplicateIds as Id<"donors">[],
      });

      notify(
        "Merge Completed",
        `Moved ${result.mergedTransactions} transactions, ${result.mergedPledges} pledges, and removed ${result.deletedDonors} duplicate donors.`
      );

      // Remove this group from the list
      setDuplicateGroups((prev) => prev.filter((_, i) => i !== groupIndex));
      setSelectedMergeGroup(null);
      setSelectedPrimaryId(null);

      // If no more groups, close the sheet
      if (duplicateGroups.length <= 1) setSheet(null);
    } catch (error) {
      console.error("Error merging donors:", error);
      notify("Error", "Failed to merge donors.");
    } finally {
      setIsMerging(false);
    }
  };

  const pickDuplicate = (groupIndex: number, donorId: string) => {
    setSelectedMergeGroup(groupIndex);
    setSelectedPrimaryId(donorId);
  };

  // Toggle donor selection for manual merge
  const toggleDonorForMerge = (donorId: string) => {
    setSelectedForMerge((prev) => {
      const next = new Set(prev);
      if (next.has(donorId)) {
        next.delete(donorId);
        // If we removed the primary, reset it
        if (manualPrimaryId === donorId) setManualPrimaryId(null);
      } else {
        next.add(donorId);
      }
      return next;
    });
  };

  // Handle manual merge
  const handleManualMerge = async () => {
    if (!manualPrimaryId || selectedForMerge.size < 2) return;

    setIsMerging(true);
    try {
      const duplicateIds = Array.from(selectedForMerge).filter((id) => id !== manualPrimaryId);

      const result = await mergeDonors({
        primaryDonorId: manualPrimaryId as Id<"donors">,
        duplicateDonorIds: duplicateIds as Id<"donors">[],
      });

      notify(
        "Merge Completed",
        `Moved ${result.mergedTransactions} transactions, ${result.mergedPledges} pledges, and removed ${result.deletedDonors} duplicate donors.`
      );

      cancelManualMerge();
    } catch (error) {
      console.error("Error merging donors:", error);
      notify("Error", "Failed to merge donors.");
    } finally {
      setIsMerging(false);
    }
  };

  // Cancel manual merge mode
  const cancelManualMerge = () => {
    setManualMergeMode(false);
    setSelectedForMerge(new Set());
    setManualPrimaryId(null);
  };

  const mergeControls: MergeControls | undefined = canEdit
    ? {
        active: manualMergeMode,
        selected: selectedForMerge,
        primaryId: manualPrimaryId,
        busy: isMerging,
        onStart: () => setManualMergeMode(true),
        onToggle: toggleDonorForMerge,
        onKeep: (donorId) => setManualPrimaryId(donorId),
        onMerge: () => void handleManualMerge(),
        onCancel: cancelManualMerge,
      }
    : undefined;

  const openExport = () => {
    setExportReport({ type: "all" });
    setSheet("export");
  };

  const detail = selectedDonor ? (
    <DonorDetail
      donor={selectedDonor}
      giftAidEnabled={giftAidEnabled}
      canEdit={canEdit}
      now={now}
      year={year}
      yearTotal={yearTotal}
      yearCount={yearGifts.length}
      lifetimeTotal={sumReportableIncome(gifts)}
      gifts={gifts}
      donorPledges={donorPledges}
      allPledges={pledges}
      funds={funds}
      onEdit={() => setSheet("edit")}
      onExport={openExport}
      onAddSchedule={() => setSheet("schedule")}
      onThankYou={() => setSheet("thankYou")}
      onLinkPledge={handleLinkTransaction}
      onUnlinkPledge={handleUnlinkTransaction}
    />
  ) : null;

  return (
    <div className="animate-enter space-y-6 pb-12">
      <HubHeader
        title="Donors"
        status={
          giftAidEnabled
            ? `${donors.length} ${donors.length === 1 ? "person" : "people"} · ${summary.giftAid} have a Gift Aid declaration`
            : `${donors.length} ${donors.length === 1 ? "person" : "people"}`
        }
        actions={
          canEdit ? (
            <>
              <button
                type="button"
                onClick={() => void handleFindDuplicates()}
                disabled={isFindingDuplicates}
                className={`${btnOutline} ${btnMd} !w-auto px-4`}
              >
                {isFindingDuplicates ? "Searching…" : "Find duplicates"}
              </button>
              <button type="button" onClick={() => setSheet("add")} className={`${btnPrimary} ${btnMd} !w-auto px-5`}>
                <Plus size={16} aria-hidden="true" />
                Add donor
              </button>
            </>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Active donors" value={String(summary.active)} sub="Gave in last 12 months" />
        <SummaryCard
          label="Giving this month"
          value={`£${summary.monthTotal.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`}
          sub={summary.monthLabel}
        />
        <SummaryCard label="Needs review" value={String(summary.needsReview)} sub="Stopped giving, or no Gift Aid" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
        <DonorList
          donors={donors}
          visible={visibleDonors}
          search={search}
          onSearch={setSearch}
          filter={filter}
          onFilter={setFilter}
          stats={stats}
          schedules={schedules}
          giftAidEnabled={giftAidEnabled}
          now={now}
          selectedId={selectedDonorId}
          onSelect={selectDonor}
          merge={mergeControls}
        />

        <aside className="hidden max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-ledger bg-white p-5 xl:sticky xl:top-6 xl:block" aria-label="Donor profile">
          {detail ?? <p className="py-12 text-center text-sm text-grey-mid">Select a donor to see their giving.</p>}
        </aside>
      </div>

      {!wide && detailOpen && sheet === null && selectedDonor && (
        <WizardFrame ariaLabel={`${selectedDonor.name} profile`} title={selectedDonor.name} onClose={() => setDetailOpen(false)}>
          {detail}
        </WizardFrame>
      )}

      {sheet === "add" && canEdit && (
        <DonorSheet mode="add" initial={NEW_DONOR_DEFAULTS} giftAidEnabled={giftAidEnabled} onSubmit={(values) => void submitNewDonor(values)} onClose={closeSheet} />
      )}
      {sheet === "edit" && canEdit && selectedDonor && (
        <DonorSheet key={selectedDonor._id} mode="edit" initial={selectedDonor} giftAidEnabled={giftAidEnabled} onSubmit={saveDonorEdit} onClose={closeSheet} />
      )}
      {sheet === "schedule" && canEdit && selectedDonor && (
        <ScheduleSheet donorId={selectedDonor._id} donorName={selectedDonor.name} funds={funds} onSubmit={addSchedule} onClose={closeSheet} />
      )}
      {sheet === "export" && selectedDonor && (
        <ExportSheet
          donor={selectedDonor}
          funds={funds}
          incomeTransactions={filterIncomeAndExpenditure(gifts).filter((t) => t.type === "Income")}
          period={exportPeriod}
          onPeriodChange={setExportPeriod}
          year={exportYear}
          onYearChange={setExportYear}
          report={exportReport}
          onReportChange={setExportReport}
          busy={isGeneratingPdf}
          onSavePdf={() => void handlePrintSchedule(exportReport.type, exportReport.campaignId)}
          onWhatsApp={() => void handleSendViaWhatsApp(exportReport.type, exportReport.campaignId)}
          onEmail={() => void handleSendViaEmail(exportReport.type, exportReport.campaignId)}
          onClose={closeSheet}
        />
      )}
      {sheet === "merge" && canEdit && (
        <MergeSheet
          groups={duplicateGroups}
          giftAidEnabled={giftAidEnabled}
          selectedGroup={selectedMergeGroup}
          selectedPrimaryId={selectedPrimaryId}
          busy={isMerging}
          onPick={pickDuplicate}
          onMerge={(groupIndex) => void handleMergeDonors(groupIndex)}
          onClose={closeSheet}
        />
      )}
      {sheet === "thankYou" && selectedDonor && (
        <ThankYouWalkthrough
          key={selectedDonor._id}
          donor={selectedDonor}
          donorPledges={donorPledges}
          funds={funds}
          yearTotal={yearTotal}
          churchName={churchName}
          onClose={closeSheet}
        />
      )}
    </div>
  );
};

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className={card}>
      <p className={eyebrow}>{label}</p>
      <p className="mt-1.5 font-mono text-xl font-bold tabular-nums text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-grey-mid">{sub}</p>
    </div>
  );
}

export default DonorManager;
