import React, { useState } from 'react';
import { Transaction, Fund, Pledge } from '../types';
import { generateTreasurerReport, generateGiftAidSchedule, generateProjectReport, generateCampaignReport } from '../services/gemini';
import { FileText, Download, Share2, Sparkles, PoundSterling, Calendar, Megaphone, ArrowRight, Target } from 'lucide-react';

interface ReportsProps {
  transactions: Transaction[];
  funds: Fund[];
  pledges: Pledge[];
}

const Reports: React.FC<ReportsProps> = ({ transactions, funds, pledges }) => {
  const [reportText, setReportText] = useState('');
  const [reportTitle, setReportTitle] = useState('Report');
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Tax Year Configuration
  const [taxYear, setTaxYear] = useState('current'); // 'current', 'previous', 'all'
  const [selectedFundId, setSelectedFundId] = useState(funds[0]?.id || '');

  const getDatesForTaxYear = (year: string) => {
      const today = new Date();
      const currentYear = today.getFullYear();
      // UK Tax Year: April 6th to April 5th
      if (year === 'current') {
          return { start: `${currentYear}-04-06`, end: `${currentYear + 1}-04-05` };
      } else if (year === 'previous') {
          return { start: `${currentYear - 1}-04-06`, end: `${currentYear}-04-05` };
      }
      return { start: undefined, end: undefined };
  };

  const handleGenerateTreasurerReport = async () => {
    setIsGenerating(true);
    setReportTitle("Treasurer's Financial Commentary");
    try {
        const text = await generateTreasurerReport(transactions, funds);
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
          const text = await generateGiftAidSchedule(transactions, start, end);
          setReportText(text || "No gift aid transactions found.");
      } catch (e) {
          console.error(e);
          setReportText("Error generating Gift Aid report.");
      } finally {
          setIsGenerating(false);
      }
  };

  const handleGenerateProjectReport = async () => {
      const fund = funds.find(f => f.id === selectedFundId);
      if (!fund) return;
      
      setIsGenerating(true);
      setReportTitle(`${fund.name} Impact Report`);
      const { start, end } = getDatesForTaxYear(taxYear);
      try {
          const text = await generateProjectReport(transactions, fund, start, end);
          setReportText(text || "No activity found.");
      } catch (e) {
          console.error(e);
          setReportText("Error generating project report.");
      } finally {
          setIsGenerating(false);
      }
  };

  const handleGenerateCampaignReport = async () => {
      const fund = funds.find(f => f.id === selectedFundId);
      if (!fund) return;

      setIsGenerating(true);
      setReportTitle(`${fund.name} Campaign Analysis`);
      try {
          const text = await generateCampaignReport(transactions, fund, pledges);
          setReportText(text || "No campaign data analysis available.");
      } catch (e) {
          console.error(e);
          setReportText("Error generating campaign report.");
      } finally {
          setIsGenerating(false);
      }
  };

  return (
    <div className="space-y-6 animate-enter max-w-6xl mx-auto">
      <header className="border-b border-slate-200 pb-6 flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div>
            <h2 className="text-3xl font-bold text-slate-900 font-display tracking-tight">Reports</h2>
            <p className="text-slate-500 mt-1 text-sm font-medium">AI-generated commentary and compliance documents.</p>
        </div>
        <div className="flex items-center gap-3">
            <div className="bg-white border border-slate-200 rounded-md px-3 py-2 flex items-center gap-2">
                <Calendar size={14} className="text-slate-400"/>
                <select 
                    value={taxYear} 
                    onChange={(e) => setTaxYear(e.target.value)}
                    className="text-sm font-medium text-slate-700 outline-none bg-transparent cursor-pointer"
                >
                    <option value="current">Current Tax Year</option>
                    <option value="previous">Previous Tax Year</option>
                    <option value="all">All Time</option>
                </select>
            </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
            {/* Treasurer Report Card */}
            <div className="swiss-card p-6 cursor-pointer hover:border-slate-300 transition-colors group" onClick={handleGenerateTreasurerReport}>
                <div className="flex justify-between items-start mb-4">
                     <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
                        <Sparkles size={20} />
                    </div>
                </div>
                <h3 className="font-bold text-slate-900 mb-2">Treasurer's Commentary</h3>
                <p className="text-sm text-slate-500 mb-4 leading-relaxed">
                    General financial health summary for the Board of Trustees meeting.
                </p>
                <div className="flex items-center text-xs font-bold text-indigo-600 uppercase tracking-wide group-hover:translate-x-1 transition-transform">
                    {isGenerating && reportTitle.includes("Treasurer") ? 'Generating...' : <span className="flex items-center gap-2">Create Draft <ArrowRight size={12}/></span>}
                </div>
            </div>

            {/* Gift Aid Card */}
            <div className="swiss-card p-6 cursor-pointer hover:border-slate-300 transition-colors group" onClick={handleGenerateGiftAid}>
                 <div className="flex justify-between items-start mb-4">
                    <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
                        <PoundSterling size={20} />
                    </div>
                </div>
                 <h3 className="font-bold text-slate-900 mb-2">Gift Aid Schedule</h3>
                 <p className="text-sm text-slate-500 mb-4 leading-relaxed">
                    Calculate claimable amounts (25%) and format schedule for HMRC.
                 </p>
                 <div className="flex items-center text-xs font-bold text-emerald-600 uppercase tracking-wide group-hover:translate-x-1 transition-transform">
                    {isGenerating && reportTitle.includes("HMRC") ? 'Calculating...' : <span className="flex items-center gap-2">Generate Schedule <ArrowRight size={12}/></span>}
                </div>
            </div>

            {/* Project Impact Card */}
            <div className="swiss-card p-6 cursor-pointer hover:border-slate-300 transition-colors group" onClick={handleGenerateProjectReport}>
                 <div className="flex justify-between items-start mb-4">
                    <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600">
                        <Megaphone size={20} />
                    </div>
                </div>
                 <h3 className="font-bold text-slate-900 mb-2">Project Impact Update</h3>
                 <p className="text-sm text-slate-500 mb-3 leading-relaxed">
                    Create a newsletter update for a specific restricted fund.
                 </p>
                 <select 
                    className="w-full mb-4 text-xs p-2 bg-slate-50 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-slate-900 cursor-pointer"
                    value={selectedFundId}
                    onChange={(e) => { e.stopPropagation(); setSelectedFundId(e.target.value); }}
                    onClick={(e) => e.stopPropagation()}
                 >
                    {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                 </select>
                 <div className="flex items-center text-xs font-bold text-amber-600 uppercase tracking-wide group-hover:translate-x-1 transition-transform">
                    {isGenerating && reportTitle.includes("Impact") ? 'Writing...' : <span className="flex items-center gap-2">Write Update <ArrowRight size={12}/></span>}
                </div>
            </div>

             {/* Campaign Status Card */}
            <div className="swiss-card p-6 cursor-pointer hover:border-slate-300 transition-colors group" onClick={handleGenerateCampaignReport}>
                 <div className="flex justify-between items-start mb-4">
                    <div className="w-10 h-10 bg-rose-50 rounded-lg flex items-center justify-center text-rose-600">
                        <Target size={20} />
                    </div>
                </div>
                 <h3 className="font-bold text-slate-900 mb-2">Campaign Status</h3>
                 <p className="text-sm text-slate-500 mb-3 leading-relaxed">
                    Analyze fundraising metrics, donor count, and projection to goal.
                 </p>
                 <select 
                    className="w-full mb-4 text-xs p-2 bg-slate-50 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-slate-900 cursor-pointer"
                    value={selectedFundId}
                    onChange={(e) => { e.stopPropagation(); setSelectedFundId(e.target.value); }}
                    onClick={(e) => e.stopPropagation()}
                 >
                    {funds.filter(f => f.type === 'Restricted' || f.type === 'Designated').map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                 </select>
                 <div className="flex items-center text-xs font-bold text-rose-600 uppercase tracking-wide group-hover:translate-x-1 transition-transform">
                    {isGenerating && reportTitle.includes("Campaign") ? 'Analyzing...' : <span className="flex items-center gap-2">Run Analysis <ArrowRight size={12}/></span>}
                </div>
            </div>
        </div>

        <div className="lg:col-span-2">
            <div className="swiss-card min-h-[600px] p-10 relative">
                <div className="absolute top-6 right-6 flex gap-2">
                     <button className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors" title="Download">
                        <Download size={18} />
                     </button>
                     <button className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors" title="Share">
                        <Share2 size={18} />
                     </button>
                </div>
                
                {reportText ? (
                    <article className="prose prose-slate prose-headings:font-display prose-p:font-serif max-w-none">
                        <div className="mb-10 border-b border-slate-100 pb-6">
                            <h1 className="text-2xl font-bold text-slate-900 mb-2 tracking-tight">{reportTitle}</h1>
                            <div className="flex items-center gap-4 text-xs font-mono text-slate-400 uppercase tracking-widest">
                                <span>Generated {new Date().toLocaleDateString()}</span>
                                <span>•</span>
                                <span>Period: {taxYear}</span>
                            </div>
                        </div>
                        <div className="whitespace-pre-line text-slate-700 leading-relaxed text-sm">
                            {reportText}
                        </div>
                    </article>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300">
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

export default Reports;