import React, { useMemo, useState } from 'react';
import { useQuery, useAction } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Transaction, Fund, Pledge, ChurchDetails, CategoryGroup, WeeklyBreakdownItem, TitheBreakdownItem, MissionTitheItem } from '../types';
import {
  Calendar,
  FileText,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  PoundSterling,
  TrendingUp,
  TrendingDown,
  FileSpreadsheet,
  BarChart3,
  Wallet,
  Download,
  Share2,
  Sparkles,
  Megaphone,
  Target
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { filterReportableTransactions } from '../lib/reportableTransactions';

// ============ TYPE DEFINITIONS ============

interface ReportsProps {
  transactions: Transaction[];
  funds: Fund[];
  pledges: Pledge[];
  churchDetails: ChurchDetails;
}

type ReportTab = 'monthly' | 'annual' | 'ai';

// ============ TAB CONFIGURATION ============

const tabs: { id: ReportTab; label: string; icon: typeof Calendar }[] = [
  { id: 'monthly', label: 'Monthly', icon: Calendar },
  { id: 'annual', label: 'Annual', icon: FileText },
  { id: 'ai', label: 'AI Reports', icon: Sparkles },
];

// ============ HELPER FUNCTIONS ============

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatPercent = (value: number) => {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

// ============ MONTHLY REPORT CONTENT ============

interface MonthlyReportContentProps {
  churchDetails: ChurchDetails;
}

const MonthlyReportContent: React.FC<MonthlyReportContentProps> = ({ churchDetails }) => {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['receipts', 'payments']));
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const reportData = useQuery(api.queries.reports.monthlyReportData, { year, month });

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const handlePreviousMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  const handleExportPDF = async () => {
    if (!reportData) return;
    setIsExportingPdf(true);
    try {
      const { generateMonthlyReportHTML, sanitizePdfFilenamePart } = await import('../services/pdfGenerator');
      const html = generateMonthlyReportHTML(reportData, churchDetails);

      const churchPart = sanitizePdfFilenamePart(churchDetails.name || 'Church');
      const filename = `${churchPart}_Monthly_Report_${sanitizePdfFilenamePart(reportData.monthName)}`;
      const { ensureHtmlTitleForPdf, renderPdfBlobFromHtml, savePdfBlob } = await import('../services/pdfExport');
      const htmlWithTitle = ensureHtmlTitleForPdf(html, filename);
      const blob = await renderPdfBlobFromHtml({ html: htmlWithTitle });
      await savePdfBlob({ blob, filename });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportExcel = async () => {
    if (!reportData) return;
    setIsExportingExcel(true);
    try {
      const { generateMonthlyReportXLSX } = await import('../services/excelGenerator');
      const blob = await generateMonthlyReportXLSX(reportData, churchDetails);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Monthly-Report-${reportData.monthName.replace(' ', '-')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Excel export failed:', error);
    } finally {
      setIsExportingExcel(false);
    }
  };

  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: i,
    label: new Date(2024, i).toLocaleDateString('en-GB', { month: 'long' }),
  }));

  const yearOptions = Array.from({ length: 5 }, (_, i) => today.getFullYear() - i);

  if (!reportData) {
    return (
      <div className="swiss-card p-12 flex flex-col items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-sage border-t-transparent mb-4"></div>
        <p className="text-grey-mid text-sm">Loading monthly report...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <p className="text-grey-mid text-sm font-medium">
          {churchDetails.name} Monthly Accounts - {reportData.monthName}
        </p>
        <div className="flex items-center gap-3">
          {/* Month/Year Navigation */}
          <div className="flex items-center gap-1 bg-white border border-ledger rounded-md">
            <button
              onClick={handlePreviousMonth}
              className="p-2 hover:bg-grey-light transition-colors rounded-l-md"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="flex items-center gap-2 px-2">
              <Calendar size={14} className="text-grey-mid" />
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="text-sm font-medium text-grey-dark outline-none bg-transparent cursor-pointer"
              >
                {monthOptions.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="text-sm font-medium text-grey-dark outline-none bg-transparent cursor-pointer"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleNextMonth}
              className="p-2 hover:bg-grey-light transition-colors rounded-r-md"
            >
              <ArrowRight size={16} />
            </button>
          </div>

          {/* Export Buttons */}
          <button
            onClick={handleExportPDF}
            disabled={isExportingPdf || isExportingExcel}
            className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-md text-sm font-medium hover:bg-charcoal transition-colors"
          >
            <FileText size={16} />
            {isExportingPdf ? 'Exporting...' : 'PDF'}
          </button>
          <button
            onClick={handleExportExcel}
            disabled={isExportingPdf || isExportingExcel}
            className="flex items-center gap-2 px-4 py-2 bg-sage text-white rounded-md text-sm font-medium hover:bg-sage/90 transition-colors"
          >
            <FileSpreadsheet size={16} />
            {isExportingExcel ? 'Exporting...' : 'Excel'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="swiss-card p-4">
          <div className="flex items-center gap-2 text-grey-mid mb-1">
            <TrendingUp size={14} />
            <span className="text-xs font-medium uppercase tracking-wide">Gross Income</span>
          </div>
          <p className="text-2xl font-bold text-sage font-mono">
            {formatCurrency(reportData.totals.grossIncome)}
          </p>
        </div>
        <div className="swiss-card p-4">
          <div className="flex items-center gap-2 text-grey-mid mb-1">
            <TrendingDown size={14} />
            <span className="text-xs font-medium uppercase tracking-wide">Total Expenditure</span>
          </div>
          <p className="text-2xl font-bold text-error font-mono">
            {formatCurrency(reportData.totals.totalExpenditure)}
          </p>
        </div>
        <div className="swiss-card p-4">
          <div className="flex items-center gap-2 text-grey-mid mb-1">
            <PoundSterling size={14} />
            <span className="text-xs font-medium uppercase tracking-wide">Net Bankable</span>
          </div>
          <p className={`text-2xl font-bold font-mono ${reportData.totals.netBankable >= 0 ? 'text-ink' : 'text-error'}`}>
            {formatCurrency(reportData.totals.netBankable)}
          </p>
        </div>
        <div className="swiss-card p-4">
          <div className="flex items-center gap-2 text-grey-mid mb-1">
            <PoundSterling size={14} />
            <span className="text-xs font-medium uppercase tracking-wide">Gift Aid Claimable</span>
          </div>
          <p className="text-2xl font-bold text-amber font-mono">
            {formatCurrency(reportData.giftAidSummary.claimable)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Receipts Section */}
        <div className="swiss-card">
          <button
            onClick={() => toggleSection('receipts')}
            className="w-full p-4 flex items-center justify-between hover:bg-grey-light/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {expandedSections.has('receipts') ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              <h3 className="font-bold text-ink">Receipts (Income)</h3>
            </div>
            <span className="font-mono font-bold text-sage">
              {formatCurrency(reportData.totals.grossIncome)}
            </span>
          </button>

          {expandedSections.has('receipts') && (
            <div className="border-t border-ledger">
              {reportData.receipts.length === 0 ? (
                <p className="p-4 text-grey-mid text-sm">No income recorded for this month.</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-ledger bg-paper">
                      <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-grey-mid">Category</th>
                      <th className="px-4 py-2 text-right text-xs font-bold uppercase tracking-wide text-grey-mid">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.receipts.map((group: CategoryGroup) => (
                      <React.Fragment key={group.mainCategory}>
                        <tr className="bg-grey-light/30 border-b border-ledger">
                          <td className="px-4 py-2 font-bold text-sm text-ink">{group.mainCategory}</td>
                          <td className="px-4 py-2 text-right font-mono font-bold text-sm text-ink">
                            {formatCurrency(group.total)}
                          </td>
                        </tr>
                        {group.subcategories.map((sub) => (
                          <tr key={`${group.mainCategory}-${sub.name}`} className="border-b border-ledger/50">
                            <td className="px-4 py-2 pl-8 text-sm text-grey-dark">{sub.name}</td>
                            <td className="px-4 py-2 text-right font-mono text-sm text-grey-dark">
                              {formatCurrency(sub.total)}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Payments Section */}
        <div className="swiss-card">
          <button
            onClick={() => toggleSection('payments')}
            className="w-full p-4 flex items-center justify-between hover:bg-grey-light/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {expandedSections.has('payments') ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              <h3 className="font-bold text-ink">Payments (Expenditure)</h3>
            </div>
            <span className="font-mono font-bold text-error">
              {formatCurrency(reportData.totals.totalExpenditure)}
            </span>
          </button>

          {expandedSections.has('payments') && (
            <div className="border-t border-ledger">
              {reportData.payments.length === 0 ? (
                <p className="p-4 text-grey-mid text-sm">No expenditure recorded for this month.</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-ledger bg-paper">
                      <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-grey-mid">Category</th>
                      <th className="px-4 py-2 text-right text-xs font-bold uppercase tracking-wide text-grey-mid">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.payments.map((group: CategoryGroup) => (
                      <React.Fragment key={group.mainCategory}>
                        <tr className="bg-grey-light/30 border-b border-ledger">
                          <td className="px-4 py-2 font-bold text-sm text-ink">{group.mainCategory}</td>
                          <td className="px-4 py-2 text-right font-mono font-bold text-sm text-ink">
                            {formatCurrency(group.total)}
                          </td>
                        </tr>
                        {group.subcategories.map((sub) => (
                          <tr key={`${group.mainCategory}-${sub.name}`} className="border-b border-ledger/50">
                            <td className="px-4 py-2 pl-8 text-sm text-grey-dark">{sub.name}</td>
                            <td className="px-4 py-2 text-right font-mono text-sm text-grey-dark">
                              {formatCurrency(sub.total)}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Weekly Summary */}
      <div className="swiss-card">
        <button
          onClick={() => toggleSection('weekly')}
          className="w-full p-4 flex items-center justify-between hover:bg-grey-light/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            {expandedSections.has('weekly') ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
            <h3 className="font-bold text-ink">Weekly Summary</h3>
          </div>
          <span className="text-xs text-grey-mid font-medium">
            {reportData.weeklyBreakdown.length} weeks
          </span>
        </button>

        {expandedSections.has('weekly') && (
          <div className="border-t border-ledger overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ledger bg-paper">
                  <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-grey-mid">Week Ending</th>
                  <th className="px-4 py-2 text-right text-xs font-bold uppercase tracking-wide text-grey-mid">Receipts</th>
                  <th className="px-4 py-2 text-right text-xs font-bold uppercase tracking-wide text-grey-mid">Payments</th>
                  <th className="px-4 py-2 text-right text-xs font-bold uppercase tracking-wide text-grey-mid">Net</th>
                </tr>
              </thead>
              <tbody>
                {reportData.weeklyBreakdown.map((week: WeeklyBreakdownItem, idx: number) => (
                  <tr key={week.weekEnding} className={`border-b border-ledger ${idx % 2 === 0 ? '' : 'bg-grey-light/20'}`}>
                    <td className="px-4 py-3 text-sm font-medium text-ink">
                      {new Date(week.weekEnding).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-sage">
                      {formatCurrency(week.receiptsTotal)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-error">
                      {formatCurrency(week.paymentsTotal)}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono text-sm font-bold ${(week.receiptsTotal - week.paymentsTotal) >= 0 ? 'text-ink' : 'text-error'}`}>
                      {formatCurrency(week.receiptsTotal - week.paymentsTotal)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-grey-light/50 font-bold">
                  <td className="px-4 py-3 text-sm text-ink">Total</td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-sage">
                    {formatCurrency(reportData.totals.grossIncome)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-error">
                    {formatCurrency(reportData.totals.totalExpenditure)}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono text-sm ${reportData.totals.netBankable >= 0 ? 'text-ink' : 'text-error'}`}>
                    {formatCurrency(reportData.totals.netBankable)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mission Tithe */}
      {reportData.missionTithe && (
        <div className="swiss-card">
          <button
            onClick={() => toggleSection('missionTithe')}
            className="w-full p-4 flex items-center justify-between hover:bg-grey-light/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {expandedSections.has('missionTithe') ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              <h3 className="font-bold text-ink">Mission Tithe (10% of General Fund Donations)</h3>
            </div>
            <span className="font-mono font-bold text-amber">
              {formatCurrency(reportData.missionTithe.titheToPay)}
            </span>
          </button>

          {expandedSections.has('missionTithe') && (
            <div className="border-t border-ledger overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ledger bg-paper">
                    <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-grey-mid">Week Ending</th>
                    <th className="px-4 py-2 text-right text-xs font-bold uppercase tracking-wide text-grey-mid">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.missionTithe.weeklyBreakdown.map((week: MissionTitheItem, idx: number) => (
                    <tr key={week.weekEnding} className={`border-b border-ledger ${idx % 2 === 0 ? '' : 'bg-grey-light/20'}`}>
                      <td className="px-4 py-3 text-sm font-medium text-ink">
                        {new Date(week.weekEnding).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-ink">
                        {formatCurrency(week.total)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-grey-light/50 font-bold">
                    <td className="px-4 py-3 text-sm text-ink">Total</td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-ink">
                      {formatCurrency(reportData.missionTithe.total)}
                    </td>
                  </tr>
                  <tr className="bg-grey-light/50 font-bold">
                    <td className="px-4 py-3 text-sm text-amber">Mission Tithe to Pay</td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-amber">
                      {formatCurrency(reportData.missionTithe.titheToPay)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tithes Breakdown & Gift Aid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tithes Breakdown */}
        <div className="swiss-card">
          <button
            onClick={() => toggleSection('tithes')}
            className="w-full p-4 flex items-center justify-between hover:bg-grey-light/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {expandedSections.has('tithes') ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              <h3 className="font-bold text-ink">Tithes Breakdown</h3>
            </div>
            <span className="text-xs text-grey-mid font-medium">
              {reportData.tithes.length} contributors
            </span>
          </button>

          {expandedSections.has('tithes') && (
            <div className="border-t border-ledger">
              {reportData.tithes.length === 0 ? (
                <p className="p-4 text-grey-mid text-sm">No tithe contributions recorded.</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-ledger bg-paper">
                      <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-grey-mid">Donor</th>
                      <th className="px-4 py-2 text-center text-xs font-bold uppercase tracking-wide text-grey-mid">Gift Aid</th>
                      <th className="px-4 py-2 text-right text-xs font-bold uppercase tracking-wide text-grey-mid">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.tithes.map((tithe: TitheBreakdownItem, idx: number) => (
                      <tr key={`${tithe.donorName}-${idx}`} className="border-b border-ledger/50">
                        <td className="px-4 py-2 text-sm text-grey-dark">{tithe.donorName}</td>
                        <td className="px-4 py-2 text-center">
                          {tithe.isGiftAidEligible ? (
                            <span className="inline-block px-2 py-0.5 bg-sage-light text-sage text-xs font-bold rounded">
                              Yes
                            </span>
                          ) : (
                            <span className="text-grey-mid text-xs">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-sm text-grey-dark">
                          {formatCurrency(tithe.amount)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-grey-light/50 font-bold">
                      <td className="px-4 py-2 text-sm text-ink">Total</td>
                      <td className="px-4 py-2"></td>
                      <td className="px-4 py-2 text-right font-mono text-sm text-ink">
                        {formatCurrency(reportData.tithes.reduce((sum: number, t: TitheBreakdownItem) => sum + t.amount, 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Gift Aid Summary */}
        <div className="swiss-card p-6">
          <h3 className="font-bold text-ink mb-4 flex items-center gap-2">
            <PoundSterling size={18} />
            Gift Aid Summary
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-ledger">
              <span className="text-sm text-grey-dark">Total Gift Aid Eligible</span>
              <span className="font-mono font-bold text-ink">
                {formatCurrency(reportData.giftAidSummary.eligible)}
              </span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-ledger">
              <span className="text-sm text-grey-dark">Claimable from HMRC (25%)</span>
              <span className="font-mono font-bold text-amber">
                {formatCurrency(reportData.giftAidSummary.claimable)}
              </span>
            </div>
            <div className="bg-sage-light/30 rounded-lg p-4 mt-4">
              <p className="text-xs text-grey-dark leading-relaxed">
                Gift Aid allows the church to reclaim 25p for every {'\u00A3'}1 donated by UK taxpayers
                who have made a valid Gift Aid declaration. Ensure donor declarations are up to date.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="swiss-card p-6 bg-grey-light/30">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-grey-dark">
              <span className="font-bold">{churchDetails.name}</span>
              {churchDetails.charityNumber && (
                <span className="ml-2 text-grey-mid">Charity No: {churchDetails.charityNumber}</span>
              )}
            </p>
            <p className="text-xs text-grey-mid mt-1">
              Report generated on {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-grey-mid uppercase tracking-wide">{churchDetails.name} Monthly Accounts</p>
            <p className="text-xs text-grey-mid">{reportData.monthName}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ ANNUAL REPORT CONTENT ============

interface AnnualReportContentProps {
  churchDetails: ChurchDetails;
}

const AnnualReportContent: React.FC<AnnualReportContentProps> = ({ churchDetails }) => {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['income', 'expenditure', 'trend']));
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const reportData = useQuery(api.queries.reports.annualReportData, { year });

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const handleExportPDF = async () => {
    if (!reportData) return;
    setIsExportingPdf(true);
    try {
      const { generateAnnualReportHTML, sanitizePdfFilenamePart } = await import('../services/pdfGenerator');
      const html = generateAnnualReportHTML(reportData, churchDetails);

      const churchPart = sanitizePdfFilenamePart(churchDetails.name || 'Church');
      const filename = `${churchPart}_Annual_Report_${sanitizePdfFilenamePart(String(year))}`;
      const { ensureHtmlTitleForPdf, renderPdfBlobFromHtml, savePdfBlob } = await import('../services/pdfExport');
      const htmlWithTitle = ensureHtmlTitleForPdf(html, filename);
      const blob = await renderPdfBlobFromHtml({ html: htmlWithTitle });
      await savePdfBlob({ blob, filename });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportExcel = async () => {
    if (!reportData) return;
    setIsExportingExcel(true);
    try {
      const { generateAnnualReportXLSX } = await import('../services/excelGenerator');
      const blob = await generateAnnualReportXLSX(reportData, churchDetails);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Annual-Report-${year}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Excel export failed:', error);
    } finally {
      setIsExportingExcel(false);
    }
  };

  const yearOptions = Array.from({ length: 10 }, (_, i) => today.getFullYear() - i);

  if (!reportData) {
    return (
      <div className="swiss-card p-12 flex flex-col items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-sage border-t-transparent mb-4"></div>
        <p className="text-grey-mid text-sm">Loading annual report...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <p className="text-grey-mid text-sm font-medium">
          {churchDetails.name} Annual Financial Report - {year}
        </p>
        <div className="flex items-center gap-3">
          {/* Year Navigation */}
          <div className="flex items-center gap-1 bg-white border border-ledger rounded-md">
            <button
              onClick={() => setYear(year - 1)}
              className="p-2 hover:bg-grey-light transition-colors rounded-l-md"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="flex items-center gap-2 px-2">
              <Calendar size={14} className="text-grey-mid" />
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="text-sm font-medium text-grey-dark outline-none bg-transparent cursor-pointer"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setYear(year + 1)}
              className="p-2 hover:bg-grey-light transition-colors rounded-r-md"
              disabled={year >= today.getFullYear()}
            >
              <ArrowRight size={16} />
            </button>
          </div>

          {/* Export Buttons */}
          <button
            onClick={handleExportPDF}
            disabled={isExportingPdf || isExportingExcel}
            className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-md text-sm font-medium hover:bg-charcoal transition-colors"
          >
            <FileText size={16} />
            {isExportingPdf ? 'Exporting...' : 'PDF'}
          </button>
          <button
            onClick={handleExportExcel}
            disabled={isExportingPdf || isExportingExcel}
            className="flex items-center gap-2 px-4 py-2 bg-sage text-white rounded-md text-sm font-medium hover:bg-sage/90 transition-colors"
          >
            <FileSpreadsheet size={16} />
            {isExportingExcel ? 'Exporting...' : 'Excel'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="swiss-card p-4">
          <div className="flex items-center gap-2 text-grey-mid mb-1">
            <TrendingUp size={14} />
            <span className="text-xs font-medium uppercase tracking-wide">Total Income</span>
          </div>
          <p className="text-2xl font-bold text-sage font-mono">
            {formatCurrency(reportData.totals.totalIncome)}
          </p>
          {reportData.yearOverYear && (
            <p className={`text-xs font-medium mt-1 ${reportData.yearOverYear.incomeChange >= 0 ? 'text-sage' : 'text-error'}`}>
              {formatPercent(reportData.yearOverYear.incomeChange)} vs {year - 1}
            </p>
          )}
        </div>
        <div className="swiss-card p-4">
          <div className="flex items-center gap-2 text-grey-mid mb-1">
            <TrendingDown size={14} />
            <span className="text-xs font-medium uppercase tracking-wide">Total Expenditure</span>
          </div>
          <p className="text-2xl font-bold text-error font-mono">
            {formatCurrency(reportData.totals.totalExpenditure)}
          </p>
          {reportData.yearOverYear && (
            <p className={`text-xs font-medium mt-1 ${reportData.yearOverYear.expenditureChange <= 0 ? 'text-sage' : 'text-error'}`}>
              {formatPercent(reportData.yearOverYear.expenditureChange)} vs {year - 1}
            </p>
          )}
        </div>
        <div className="swiss-card p-4">
          <div className="flex items-center gap-2 text-grey-mid mb-1">
            <PoundSterling size={14} />
            <span className="text-xs font-medium uppercase tracking-wide">Net Movement</span>
          </div>
          <p className={`text-2xl font-bold font-mono ${reportData.totals.netMovement >= 0 ? 'text-ink' : 'text-error'}`}>
            {formatCurrency(reportData.totals.netMovement)}
          </p>
        </div>
        <div className="swiss-card p-4">
          <div className="flex items-center gap-2 text-grey-mid mb-1">
            <PoundSterling size={14} />
            <span className="text-xs font-medium uppercase tracking-wide">Gift Aid Claimable</span>
          </div>
          <p className="text-2xl font-bold text-amber font-mono">
            {formatCurrency(reportData.giftAidAnnual.totalClaimable)}
          </p>
        </div>
      </div>

      {/* Monthly Trend Chart */}
      <div className="swiss-card">
        <button
          onClick={() => toggleSection('trend')}
          className="w-full p-4 flex items-center justify-between hover:bg-grey-light/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            {expandedSections.has('trend') ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
            <BarChart3 size={18} className="text-grey-mid" />
            <h3 className="font-bold text-ink">Monthly Trend</h3>
          </div>
        </button>

        {expandedSections.has('trend') && (
          <div className="border-t border-ledger p-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={reportData.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#78716c" />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="#78716c"
                  tickFormatter={(value) => `£${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value: number | string | undefined) =>
                    formatCurrency(typeof value === 'number' ? value : Number(value) || 0)
                  }
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e7e5e4',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                />
                <Legend />
                <Bar dataKey="income" fill="#779E7E" name="Income" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenditure" fill="#E57373" name="Expenditure" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income Breakdown */}
        <div className="swiss-card">
          <button
            onClick={() => toggleSection('income')}
            className="w-full p-4 flex items-center justify-between hover:bg-grey-light/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {expandedSections.has('income') ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              <h3 className="font-bold text-ink">Income Breakdown</h3>
            </div>
            <span className="font-mono font-bold text-sage">
              {formatCurrency(reportData.totals.totalIncome)}
            </span>
          </button>

          {expandedSections.has('income') && (
            <div className="border-t border-ledger">
              {Object.keys(reportData.incomeByMainCategory).length === 0 ? (
                <p className="p-4 text-grey-mid text-sm">No income recorded for this year.</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-ledger bg-paper">
                      <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-grey-mid">Category</th>
                      <th className="px-4 py-2 text-right text-xs font-bold uppercase tracking-wide text-grey-mid">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(reportData.incomeByMainCategory).map(([mainCategory, data]: [string, any]) => (
                      <React.Fragment key={mainCategory}>
                        <tr className="bg-grey-light/30 border-b border-ledger">
                          <td className="px-4 py-2 font-bold text-sm text-ink">{mainCategory}</td>
                          <td className="px-4 py-2 text-right font-mono font-bold text-sm text-ink">
                            {formatCurrency(data.total)}
                          </td>
                        </tr>
                        {data.subcategories.map((sub: { name: string; total: number }) => (
                          <tr key={`${mainCategory}-${sub.name}`} className="border-b border-ledger/50">
                            <td className="px-4 py-2 pl-8 text-sm text-grey-dark">{sub.name}</td>
                            <td className="px-4 py-2 text-right font-mono text-sm text-grey-dark">
                              {formatCurrency(sub.total)}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Expenditure Breakdown */}
        <div className="swiss-card">
          <button
            onClick={() => toggleSection('expenditure')}
            className="w-full p-4 flex items-center justify-between hover:bg-grey-light/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {expandedSections.has('expenditure') ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              <h3 className="font-bold text-ink">Expenditure Breakdown</h3>
            </div>
            <span className="font-mono font-bold text-error">
              {formatCurrency(reportData.totals.totalExpenditure)}
            </span>
          </button>

          {expandedSections.has('expenditure') && (
            <div className="border-t border-ledger">
              {Object.keys(reportData.expenditureByMainCategory).length === 0 ? (
                <p className="p-4 text-grey-mid text-sm">No expenditure recorded for this year.</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-ledger bg-paper">
                      <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-grey-mid">Category</th>
                      <th className="px-4 py-2 text-right text-xs font-bold uppercase tracking-wide text-grey-mid">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(reportData.expenditureByMainCategory).map(([mainCategory, data]: [string, any]) => (
                      <React.Fragment key={mainCategory}>
                        <tr className="bg-grey-light/30 border-b border-ledger">
                          <td className="px-4 py-2 font-bold text-sm text-ink">{mainCategory}</td>
                          <td className="px-4 py-2 text-right font-mono font-bold text-sm text-ink">
                            {formatCurrency(data.total)}
                          </td>
                        </tr>
                        {data.subcategories.map((sub: { name: string; total: number }) => (
                          <tr key={`${mainCategory}-${sub.name}`} className="border-b border-ledger/50">
                            <td className="px-4 py-2 pl-8 text-sm text-grey-dark">{sub.name}</td>
                            <td className="px-4 py-2 text-right font-mono text-sm text-grey-dark">
                              {formatCurrency(sub.total)}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Year-over-Year & Gift Aid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Year-over-Year Comparison */}
        {reportData.yearOverYear && (
          <div className="swiss-card p-6">
            <h3 className="font-bold text-ink mb-4 flex items-center gap-2">
              <TrendingUp size={18} />
              Year-over-Year Comparison
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div></div>
                <div className="text-xs font-bold uppercase tracking-wide text-grey-mid">{year - 1}</div>
                <div className="text-xs font-bold uppercase tracking-wide text-grey-mid">{year}</div>
              </div>
              <div className="grid grid-cols-3 gap-4 items-center py-3 border-b border-ledger">
                <span className="text-sm text-grey-dark">Income</span>
                <span className="text-center font-mono text-sm text-grey-mid">
                  {formatCurrency(reportData.yearOverYear.previous.income)}
                </span>
                <div className="text-center">
                  <span className="font-mono font-bold text-sm text-sage">
                    {formatCurrency(reportData.yearOverYear.current.income)}
                  </span>
                  <span className={`ml-2 text-xs font-medium ${reportData.yearOverYear.incomeChange >= 0 ? 'text-sage' : 'text-error'}`}>
                    {formatPercent(reportData.yearOverYear.incomeChange)}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 items-center py-3 border-b border-ledger">
                <span className="text-sm text-grey-dark">Expenditure</span>
                <span className="text-center font-mono text-sm text-grey-mid">
                  {formatCurrency(reportData.yearOverYear.previous.expenditure)}
                </span>
                <div className="text-center">
                  <span className="font-mono font-bold text-sm text-error">
                    {formatCurrency(reportData.yearOverYear.current.expenditure)}
                  </span>
                  <span className={`ml-2 text-xs font-medium ${reportData.yearOverYear.expenditureChange <= 0 ? 'text-sage' : 'text-error'}`}>
                    {formatPercent(reportData.yearOverYear.expenditureChange)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Gift Aid Summary */}
        <div className="swiss-card p-6">
          <h3 className="font-bold text-ink mb-4 flex items-center gap-2">
            <PoundSterling size={18} />
            Gift Aid Annual Summary
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-ledger">
              <span className="text-sm text-grey-dark">Total Gift Aid Eligible</span>
              <span className="font-mono font-bold text-ink">
                {formatCurrency(reportData.giftAidAnnual.totalEligible)}
              </span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-ledger">
              <span className="text-sm text-grey-dark">Claimable from HMRC (25%)</span>
              <span className="font-mono font-bold text-amber">
                {formatCurrency(reportData.giftAidAnnual.totalClaimable)}
              </span>
            </div>
            <div className="bg-amber-light/30 rounded-lg p-4 mt-4">
              <p className="text-xs text-grey-dark leading-relaxed">
                Total potential Gift Aid claim for the year. Remember to submit claims within 4 years
                of the tax year in which donations were received.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Fund Balances */}
      <div className="swiss-card">
        <button
          onClick={() => toggleSection('funds')}
          className="w-full p-4 flex items-center justify-between hover:bg-grey-light/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            {expandedSections.has('funds') ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
            <Wallet size={18} className="text-grey-mid" />
            <h3 className="font-bold text-ink">Fund Balances (End of Year)</h3>
          </div>
          <span className="text-xs text-grey-mid font-medium">
            {reportData.fundBalances.length} funds
          </span>
        </button>

        {expandedSections.has('funds') && (
          <div className="border-t border-ledger overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ledger bg-paper">
                  <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-grey-mid">Fund</th>
                  <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-grey-mid">Type</th>
                  <th className="px-4 py-2 text-right text-xs font-bold uppercase tracking-wide text-grey-mid">Balance</th>
                </tr>
              </thead>
              <tbody>
                {reportData.fundBalances.map((fund: { fund: string; type: string; balance: number }, idx: number) => (
                  <tr key={fund.fund} className={`border-b border-ledger ${idx % 2 === 0 ? '' : 'bg-grey-light/20'}`}>
                    <td className="px-4 py-3 text-sm font-medium text-ink">{fund.fund}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                        fund.type === 'Unrestricted' ? 'bg-sage-light text-sage' :
                        fund.type === 'Restricted' ? 'bg-amber-light text-amber' :
                        fund.type === 'Designated' ? 'bg-blue-100 text-blue-700' :
                        'bg-grey-light text-grey-dark'
                      }`}>
                        {fund.type}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-mono text-sm font-bold ${fund.balance >= 0 ? 'text-ink' : 'text-error'}`}>
                      {formatCurrency(fund.balance)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-grey-light/50 font-bold">
                  <td className="px-4 py-3 text-sm text-ink">Total</td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-ink">
                    {formatCurrency(reportData.fundBalances.reduce((sum: number, f: { balance: number }) => sum + f.balance, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="swiss-card p-6 bg-grey-light/30">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-grey-dark">
              <span className="font-bold">{churchDetails.name}</span>
              {churchDetails.charityNumber && (
                <span className="ml-2 text-grey-mid">Charity No: {churchDetails.charityNumber}</span>
              )}
            </p>
            <p className="text-xs text-grey-mid mt-1">
              Report generated on {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-grey-mid uppercase tracking-wide">{churchDetails.name} Annual Report</p>
            <p className="text-xs text-grey-mid">Financial Year {year}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ AI REPORTS CONTENT ============

interface AIReportsContentProps {
  transactions: Transaction[];
  funds: Fund[];
  pledges: Pledge[];
  churchDetails: ChurchDetails;
}

const AIReportsContent: React.FC<AIReportsContentProps> = ({ transactions, funds, pledges, churchDetails }) => {
  const activeTransactions = useMemo(() => filterReportableTransactions(transactions), [transactions]);
  const [reportText, setReportText] = useState('');
  const [reportTitle, setReportTitle] = useState('Report');
  const [isGenerating, setIsGenerating] = useState(false);
  const treasurerReport = useAction(api.actions.ai.generateTreasurerReport);
  const giftAidSchedule = useAction(api.actions.ai.generateGiftAidSchedule);
  const projectReport = useAction(api.actions.ai.generateProjectReport);
  const campaignReport = useAction(api.actions.ai.generateCampaignReport);
  const annualStatement = useAction(api.actions.ai.generateAnnualStatement);
  const monthlyBreakdown = useAction(api.actions.ai.generateMonthlyBreakdown);

  const [taxYear, setTaxYear] = useState('current');
  const [selectedFundId, setSelectedFundId] = useState(funds[0]?._id || '');

  const getDatesForTaxYear = (year: string) => {
    const today = new Date();
    const currentYear = today.getFullYear();

    const isCalendar = churchDetails?.reportingPeriod === 'calendar_year';

    if (year === 'all') return { start: undefined, end: undefined };

    if (isCalendar) {
      if (year === 'current') {
        return { start: `${currentYear}-01-01`, end: `${currentYear}-12-31` };
      } else if (year === 'previous') {
        return { start: `${currentYear - 1}-01-01`, end: `${currentYear - 1}-12-31` };
      }
    } else {
      const taxYearStartYear = (today.getMonth() < 3 || (today.getMonth() === 3 && today.getDate() < 6))
        ? currentYear - 1
        : currentYear;

      if (year === 'current') {
        return { start: `${taxYearStartYear}-04-06`, end: `${taxYearStartYear + 1}-04-05` };
      } else if (year === 'previous') {
        return { start: `${taxYearStartYear - 1}-04-06`, end: `${taxYearStartYear}-04-05` };
      }
    }

    return { start: undefined, end: undefined };
  };

  const handleGenerateTreasurerReport = async () => {
    setIsGenerating(true);
    setReportTitle("Treasurer's Financial Commentary");
    try {
      const totalIncome = activeTransactions.filter(t => t.type === 'Income').reduce((s, t) => s + t.amount, 0);
      const totalExpenditure = activeTransactions.filter(t => t.type === 'Expenditure').reduce((s, t) => s + t.amount, 0);
      const fundsStatus = funds.map(f => ({ name: f.name, balance: f.balance }));
      const recentLargeTransactions = activeTransactions
        .filter(t => t.amount > 500)
        .map(t => ({ desc: t.description, amount: t.amount }));
      const summaryData = JSON.stringify({ totalIncome, totalExpenditure, fundsStatus, recentLargeTransactions });
      const text = await treasurerReport({ summaryData });
      setReportText(text || "No report generated.");
    } catch (e) {
      console.error(e);
      setReportText("Error generating report.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateGiftAid = async () => {
    setIsGenerating(true);
    setReportTitle("HMRC Gift Aid Schedule");
    const { start, end } = getDatesForTaxYear(taxYear);
    try {
      const eligible = activeTransactions.filter(t =>
        t.type === 'Income' &&
        t.isGiftAidEligible &&
        (!start || t.date >= start) &&
        (!end || t.date <= end)
      );
      const text = await giftAidSchedule({
        eligibleTransactions: JSON.stringify(eligible),
        startDate: start,
        endDate: end
      });
      setReportText(text || "No gift aid transactions found.");
    } catch (e) {
      console.error(e);
      setReportText("Error generating Gift Aid report.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateProjectReport = async () => {
    const fund = funds.find(f => f._id === selectedFundId);
    if (!fund) return;

    setIsGenerating(true);
    setReportTitle(`${fund.name} Impact Report`);
    const { start, end } = getDatesForTaxYear(taxYear);
    try {
      const periodTxns = activeTransactions.filter(t =>
        t.fundId === fund._id &&
        (!start || t.date >= start) &&
        (!end || t.date <= end)
      );
      const periodIncome = periodTxns.filter(t => t.type === 'Income').reduce((s, t) => s + t.amount, 0);
      const periodExpense = periodTxns.filter(t => t.type === 'Expenditure').reduce((s, t) => s + t.amount, 0);
      const recentTransactions = JSON.stringify(periodTxns.slice(0, 15));
      const text = await projectReport({
        fundName: fund.name,
        fundBalance: fund.balance,
        targetAmount: fund.targetAmount,
        periodIncome,
        periodExpense,
        recentTransactions
      });
      setReportText(text || "No activity found.");
    } catch (e) {
      console.error(e);
      setReportText("Error generating project report.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateCampaignReport = async () => {
    const fund = funds.find(f => f._id === selectedFundId);
    if (!fund) return;

    setIsGenerating(true);
    setReportTitle(`${fund.name} Campaign Analysis`);
    try {
      const fundTxns = activeTransactions.filter(t => t.fundId === fund._id && t.type === 'Income');
      const fundPledges = pledges.filter(p => p.fundId === fund._id);
      const totalRaisedCash = fundTxns.reduce((s, t) => s + t.amount, 0);
      const totalPledged = fundPledges.reduce((s, p) => s + p.amount, 0);
      const donorSet = new Set(fundTxns.map(t => t.donorName).filter(Boolean));
      const donorCount = donorSet.size || fundTxns.length;
      const avgDonation = fundTxns.length ? totalRaisedCash / fundTxns.length : 0;
      const text = await campaignReport({
        fundName: fund.name,
        target: fund.targetAmount,
        totalRaisedCash,
        totalPledged,
        donorCount,
        avgDonation,
        deadline: fund.deadline
      });
      setReportText(text || "No campaign data analysis available.");
    } catch (e) {
      console.error(e);
      setReportText("Error generating campaign report.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateAnnualStatement = async () => {
    setIsGenerating(true);
    setReportTitle("Annual Financial Statement");
    const { start, end } = getDatesForTaxYear(taxYear);
    try {
      const periodTxns = activeTransactions.filter(t =>
        (!start || t.date >= start) &&
        (!end || t.date <= end)
      );
      const incomeByCategory: Record<string, number> = {};
      const expenditureByCategory: Record<string, number> = {};
      let totalIncome = 0;
      let totalExpenditure = 0;
      periodTxns.forEach(t => {
        if (t.type === 'Income') {
          incomeByCategory[t.category] = (incomeByCategory[t.category] || 0) + t.amount;
          totalIncome += t.amount;
        } else {
          expenditureByCategory[t.category] = (expenditureByCategory[t.category] || 0) + t.amount;
          totalExpenditure += t.amount;
        }
      });
      const text = await annualStatement({
        period: `${start || 'Start'} to ${end || 'End'}`,
        incomeByCategory: JSON.stringify(incomeByCategory),
        expenditureByCategory: JSON.stringify(expenditureByCategory),
        totalIncome,
        totalExpenditure
      });
      setReportText(text || "No transactions found for this period.");
    } catch (e) {
      console.error(e);
      setReportText("Error generating annual statement.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateMonthlyBreakdown = async () => {
    setIsGenerating(true);
    setReportTitle("Monthly Income & Expense Breakdown");
    const { start, end } = getDatesForTaxYear(taxYear);
    try {
      const periodTxns = activeTransactions.filter(t =>
        (!start || t.date >= start) &&
        (!end || t.date <= end)
      );
      const monthly: Record<string, { income: number; expense: number }> = {};
      periodTxns.forEach(t => {
        const monthKey = t.date.substring(0, 7);
        if (!monthly[monthKey]) monthly[monthKey] = { income: 0, expense: 0 };
        if (t.type === 'Income') monthly[monthKey].income += t.amount;
        else monthly[monthKey].expense += t.amount;
      });
      const monthlyData = Object.entries(monthly)
        .map(([month, data]) => ({ month, income: data.income, expense: data.expense }))
        .sort((a, b) => a.month.localeCompare(b.month));
      const text = await monthlyBreakdown({ monthlyData: JSON.stringify(monthlyData) });
      setReportText(text || "No transactions found for this period.");
    } catch (e) {
      console.error(e);
      setReportText("Error generating monthly breakdown.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with tax year selector */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <p className="text-grey-mid text-sm font-medium">
          AI-generated commentary and compliance documents.
        </p>
        <div className="flex items-center gap-3">
          <div className="bg-white border border-ledger rounded-md px-3 py-2 flex items-center gap-2">
            <Calendar size={14} className="text-grey-mid"/>
            <select
              value={taxYear}
              onChange={(e) => setTaxYear(e.target.value)}
              className="text-sm font-medium text-grey-dark outline-none bg-transparent cursor-pointer"
            >
              <option value="current">
                Current {churchDetails?.reportingPeriod === 'calendar_year' ? 'Calendar' : 'Tax'} Year
              </option>
              <option value="previous">
                Previous {churchDetails?.reportingPeriod === 'calendar_year' ? 'Calendar' : 'Tax'} Year
              </option>
              <option value="all">All Time</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          {/* Treasurer Report Card */}
          <div className="swiss-card p-6 cursor-pointer hover:border-grey-mid transition-colors group" onClick={handleGenerateTreasurerReport}>
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 bg-sage-light rounded-lg flex items-center justify-center text-sage">
                <Sparkles size={20} />
              </div>
            </div>
            <h3 className="font-bold text-ink mb-2">Treasurer's Commentary</h3>
            <p className="text-sm text-grey-mid mb-4 leading-relaxed">
              General financial health summary for the Board of Trustees meeting.
            </p>
            <div className="flex items-center text-xs font-bold text-sage uppercase tracking-wide group-hover:translate-x-1 transition-transform">
              {isGenerating && reportTitle.includes("Treasurer") ? 'Generating...' : <span className="flex items-center gap-2">Create Draft <ArrowRight size={12}/></span>}
            </div>
          </div>

          {/* Financial Performance Card */}
          <div className="swiss-card p-6 group">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 bg-grey-light rounded-lg flex items-center justify-center text-slate-600">
                <TrendingUp size={20} />
              </div>
            </div>
            <h3 className="font-bold text-ink mb-2">Financial Performance</h3>
            <p className="text-sm text-grey-mid mb-4 leading-relaxed">
              Income and Expenditure statements for the selected tax year.
            </p>
            <div className="flex gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); handleGenerateAnnualStatement(); }}
                className="flex-1 py-1.5 bg-ink text-white rounded text-xs font-bold uppercase tracking-wide hover:bg-charcoal transition-colors"
              >
                Annual
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleGenerateMonthlyBreakdown(); }}
                className="flex-1 py-1.5 bg-white border border-ledger text-grey-dark rounded text-xs font-bold uppercase tracking-wide hover:border-grey-mid transition-colors"
              >
                Monthly
              </button>
            </div>
          </div>

          {/* Gift Aid Card */}
          <div className="swiss-card p-6 cursor-pointer hover:border-grey-mid transition-colors group" onClick={handleGenerateGiftAid}>
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 bg-sage-light rounded-lg flex items-center justify-center text-sage">
                <PoundSterling size={20} />
              </div>
            </div>
            <h3 className="font-bold text-ink mb-2">Gift Aid Schedule</h3>
            <p className="text-sm text-grey-mid mb-4 leading-relaxed">
              Calculate claimable amounts (25%) and format schedule for HMRC.
            </p>
            <div className="flex items-center text-xs font-bold text-sage uppercase tracking-wide group-hover:translate-x-1 transition-transform">
              {isGenerating && reportTitle.includes("HMRC") ? 'Calculating...' : <span className="flex items-center gap-2">Generate Schedule <ArrowRight size={12}/></span>}
            </div>
          </div>

          {/* Project Impact Card */}
          <div className="swiss-card p-6 cursor-pointer hover:border-grey-mid transition-colors group" onClick={handleGenerateProjectReport}>
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 bg-amber-light rounded-lg flex items-center justify-center text-amber">
                <Megaphone size={20} />
              </div>
            </div>
            <h3 className="font-bold text-ink mb-2">Project Impact Update</h3>
            <p className="text-sm text-grey-mid mb-3 leading-relaxed">
              Create a newsletter update for a specific restricted fund.
            </p>
            <select
              className="w-full mb-4 text-xs p-2 bg-paper border border-ledger rounded outline-none focus:ring-1 focus:ring-ink cursor-pointer"
              value={selectedFundId}
              onChange={(e) => { e.stopPropagation(); setSelectedFundId(e.target.value); }}
              onClick={(e) => e.stopPropagation()}
            >
              {funds.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
            </select>
            <div className="flex items-center text-xs font-bold text-amber uppercase tracking-wide group-hover:translate-x-1 transition-transform">
              {isGenerating && reportTitle.includes("Impact") ? 'Writing...' : <span className="flex items-center gap-2">Write Update <ArrowRight size={12}/></span>}
            </div>
          </div>

          {/* Campaign Status Card */}
          <div className="swiss-card p-6 cursor-pointer hover:border-grey-mid transition-colors group" onClick={handleGenerateCampaignReport}>
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 bg-error-light rounded-lg flex items-center justify-center text-error">
                <Target size={20} />
              </div>
            </div>
            <h3 className="font-bold text-ink mb-2">Campaign Status</h3>
            <p className="text-sm text-grey-mid mb-3 leading-relaxed">
              Analyze fundraising metrics, donor count, and projection to goal.
            </p>
            <select
              className="w-full mb-4 text-xs p-2 bg-paper border border-ledger rounded outline-none focus:ring-1 focus:ring-ink cursor-pointer"
              value={selectedFundId}
              onChange={(e) => { e.stopPropagation(); setSelectedFundId(e.target.value); }}
              onClick={(e) => e.stopPropagation()}
            >
              {funds.filter(f => f.type === 'Restricted' || f.type === 'Designated').map(f => (
                <option key={f._id} value={f._id}>{f.name}</option>
              ))}
            </select>
            <div className="flex items-center text-xs font-bold text-error uppercase tracking-wide group-hover:translate-x-1 transition-transform">
              {isGenerating && reportTitle.includes("Campaign") ? 'Analyzing...' : <span className="flex items-center gap-2">Run Analysis <ArrowRight size={12}/></span>}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="swiss-card min-h-[600px] p-10 relative">
            <div className="absolute top-6 right-6 flex gap-2">
              <button className="p-2 text-grey-mid hover:text-ink hover:bg-grey-light rounded transition-colors" title="Download">
                <Download size={18} />
              </button>
              <button className="p-2 text-grey-mid hover:text-ink hover:bg-grey-light rounded transition-colors" title="Share">
                <Share2 size={18} />
              </button>
            </div>

            {reportText ? (
              <article className="prose prose-slate prose-headings:font-mono prose-p:font-serif max-w-none">
                <div className="mb-10 border-b border-ledger pb-6">
                  <h1 className="text-2xl font-bold text-ink mb-2 tracking-tight">{reportTitle}</h1>
                  <div className="flex items-center gap-4 text-xs font-mono text-grey-mid uppercase tracking-widest">
                    <span>Generated {new Date().toLocaleDateString()}</span>
                    <span>•</span>
                    <span>Period: {taxYear}</span>
                  </div>
                </div>
                <div className="whitespace-pre-line text-grey-dark leading-relaxed text-sm">
                  {reportText}
                </div>
              </article>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-ledger">
                <FileText size={48} className="mb-4 opacity-20"/>
                <p className="text-sm font-medium">Select a report type to generate.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ ERROR BOUNDARY ============

type ReportsErrorBoundaryProps = {
  children: React.ReactNode;
};

type ReportsErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

class ReportsErrorBoundary extends React.Component<
  ReportsErrorBoundaryProps,
  ReportsErrorBoundaryState
> {
  constructor(props: ReportsErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Reports error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="swiss-card p-12 flex flex-col items-center justify-center min-h-[400px] text-center">
          <div className="w-12 h-12 bg-error-light rounded-full flex items-center justify-center mb-4">
            <span className="text-error text-xl font-bold">!</span>
          </div>
          <h3 className="text-lg font-bold text-ink mb-2">Something went wrong</h3>
          <p className="text-sm text-grey-mid mb-6 max-w-md">
            An error occurred while loading the report. This may be due to a data sync issue.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-6 py-2 bg-ink text-white rounded-md text-sm font-medium hover:bg-charcoal transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============ MAIN UNIFIED REPORTS COMPONENT ============

const Reports: React.FC<ReportsProps> = ({ transactions, funds, pledges, churchDetails }) => {
  const [activeTab, setActiveTab] = useState<ReportTab>('monthly');

  return (
    <div className="space-y-[22px] animate-enter max-w-7xl mx-auto pb-12">
      {/* Header */}
      <header className="swiss-card-static p-6 md:p-[26px]">
        <h2 className="text-[32px] leading-tight font-bold text-ink tracking-tight">Reports</h2>
        <p className="text-grey-mid mt-2 text-[15px] font-medium">
          Financial reports, analytics, and AI-generated documents.
        </p>
      </header>

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-white border border-ledger rounded-xl w-fit overflow-x-auto max-w-full">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-amber-light text-amber'
                  : 'text-grey-mid hover:text-ink hover:bg-grey-light'
              }`}
            >
              <Icon size={16} className={isActive ? 'text-amber' : ''} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        <ReportsErrorBoundary>
          {activeTab === 'monthly' && (
            <MonthlyReportContent churchDetails={churchDetails} />
          )}
          {activeTab === 'annual' && (
            <AnnualReportContent churchDetails={churchDetails} />
          )}
          {activeTab === 'ai' && (
            <AIReportsContent
              transactions={transactions}
              funds={funds}
              pledges={pledges}
              churchDetails={churchDetails}
            />
          )}
        </ReportsErrorBoundary>
      </div>
    </div>
  );
};

export default Reports;
