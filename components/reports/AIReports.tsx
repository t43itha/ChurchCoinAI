import React, { useMemo, useState } from 'react';
import { useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Transaction, Fund, Pledge, ChurchDetails } from '../../types';
import { sumMoney } from '../../convex/lib/money';
import { filterIncomeAndExpenditure } from '../../lib/reportableTransactions';
import { isGiftAidEnabled } from '../../lib/giftAid';
import {
  Calendar,
  FileText,
  ArrowRight,
  PoundSterling,
  TrendingUp,
  Download,
  Share2,
  Sparkles,
  Megaphone,
  Target,
} from 'lucide-react';

// ============ AI REPORTS CONTENT ============

interface AIReportsProps {
  transactions: Transaction[];
  funds: Fund[];
  pledges: Pledge[];
  churchDetails: ChurchDetails;
}

const AIReports: React.FC<AIReportsProps> = ({ transactions, funds, pledges, churchDetails }) => {
  const giftAidEnabled = isGiftAidEnabled(churchDetails);
  const activeTransactions = useMemo(() => filterIncomeAndExpenditure(transactions), [transactions]);
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
      const totalIncome = sumMoney(activeTransactions.filter(t => t.type === 'Income'), t => t.amount);
      const totalExpenditure = sumMoney(activeTransactions.filter(t => t.type === 'Expenditure'), t => t.amount);
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
      const periodIncome = sumMoney(periodTxns.filter(t => t.type === 'Income'), t => t.amount);
      const periodExpense = sumMoney(periodTxns.filter(t => t.type === 'Expenditure'), t => t.amount);
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
      const totalRaisedCash = sumMoney(fundTxns, t => t.amount);
      const totalPledged = sumMoney(fundPledges, p => p.amount);
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
      periodTxns.forEach(t => {
        if (t.type === 'Income') {
          incomeByCategory[t.category] = (incomeByCategory[t.category] || 0) + t.amount;
        } else {
          expenditureByCategory[t.category] = (expenditureByCategory[t.category] || 0) + t.amount;
        }
      });
      const text = await annualStatement({
        period: `${start || 'Start'} to ${end || 'End'}`,
        incomeByCategory: JSON.stringify(incomeByCategory),
        expenditureByCategory: JSON.stringify(expenditureByCategory),
        totalIncome: sumMoney(periodTxns.filter(t => t.type === 'Income'), t => t.amount),
        totalExpenditure: sumMoney(periodTxns.filter(t => t.type !== 'Income'), t => t.amount)
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
      const monthly: Record<string, typeof periodTxns> = {};
      periodTxns.forEach(t => {
        const monthKey = t.date.substring(0, 7);
        (monthly[monthKey] ??= []).push(t);
      });
      const monthlyData = Object.entries(monthly)
        .map(([month, rows]) => ({
          month,
          income: sumMoney(rows.filter(t => t.type === 'Income'), t => t.amount),
          expense: sumMoney(rows.filter(t => t.type !== 'Income'), t => t.amount),
        }))
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
    <div className="ledger-space-y-6">
      {/* Header with tax year selector */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <p className="text-grey-mid text-sm font-medium">
          AI-generated commentary and compliance documents.
        </p>
        <div className="flex items-center gap-3">
          <div className="bg-white border border-ledger rounded-[10px] h-10 px-3 flex items-center gap-2">
            <Calendar size={14} className="text-grey-mid"/>
            <select
              value={taxYear}
              onChange={(e) => setTaxYear(e.target.value)}
              className="text-sm font-medium text-grey-dark outline-hidden bg-transparent cursor-pointer"
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
        <div className="ledger-space-y-4">
          {/* Treasurer Report Card */}
          <div className="rounded-2xl border border-ledger bg-white p-6 cursor-pointer hover:border-grey-mid transition-colors group" onClick={handleGenerateTreasurerReport}>
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
          <div className="rounded-2xl border border-ledger bg-white p-6 group">
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
                className="flex-1 py-1.5 bg-ink text-white rounded-sm text-xs font-bold uppercase tracking-wide hover:bg-charcoal transition-colors"
              >
                Annual
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleGenerateMonthlyBreakdown(); }}
                className="flex-1 py-1.5 bg-white border border-ledger text-grey-dark rounded-sm text-xs font-bold uppercase tracking-wide hover:border-grey-mid transition-colors"
              >
                Monthly
              </button>
            </div>
          </div>

          {/* Gift Aid Card */}
          {giftAidEnabled && (
          <div className="rounded-2xl border border-ledger bg-white p-6 cursor-pointer hover:border-grey-mid transition-colors group" onClick={handleGenerateGiftAid}>
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
          )}

          {/* Project Impact Card */}
          <div className="rounded-2xl border border-ledger bg-white p-6 cursor-pointer hover:border-grey-mid transition-colors group" onClick={handleGenerateProjectReport}>
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
              className="w-full mb-4 text-xs p-2 bg-white border border-ledger rounded-lg outline-hidden focus:ring-1 focus:ring-ink cursor-pointer"
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
          <div className="rounded-2xl border border-ledger bg-white p-6 cursor-pointer hover:border-grey-mid transition-colors group" onClick={handleGenerateCampaignReport}>
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
              className="w-full mb-4 text-xs p-2 bg-white border border-ledger rounded-lg outline-hidden focus:ring-1 focus:ring-ink cursor-pointer"
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
          <div className="rounded-2xl border border-ledger bg-white min-h-[600px] p-10 relative">
            <div className="absolute top-6 right-6 flex gap-2">
              <button className="p-2 text-grey-mid hover:text-ink hover:bg-grey-light rounded-sm transition-colors" title="Download">
                <Download size={18} />
              </button>
              <button className="p-2 text-grey-mid hover:text-ink hover:bg-grey-light rounded-sm transition-colors" title="Share">
                <Share2 size={18} />
              </button>
            </div>

            {reportText ? (
              <article className="prose prose-slate prose-headings:font-mono prose-p:font-serif max-w-none">
                <div className="mb-10 border-b border-ledger pb-6">
                  <h1 className="text-2xl font-bold tracking-tight text-ink mb-2 tracking-tight">{reportTitle}</h1>
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


export { AIReports };
