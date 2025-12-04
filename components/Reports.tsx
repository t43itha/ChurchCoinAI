import React, { useState } from 'react';
import { Transaction, Fund } from '../types';
import { generateTreasurerReport, generateGiftAidSchedule } from '../services/gemini';
import { FileText, Download, Share2, Sparkles, PoundSterling } from 'lucide-react';

interface ReportsProps {
  transactions: Transaction[];
  funds: Fund[];
}

const Reports: React.FC<ReportsProps> = ({ transactions, funds }) => {
  const [reportText, setReportText] = useState('');
  const [reportTitle, setReportTitle] = useState('Report');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateTreasurerReport = async () => {
    setIsGenerating(true);
    setReportTitle("Treasurer's Financial Commentary");
    setReportText("");
    try {
        const text = await generateTreasurerReport(transactions, funds);
        setReportText(text || "No report generated.");
    } catch (e) {
        console.error(e);
        setReportText("Error generating report. Please check API Key.");
    } finally {
        setIsGenerating(false);
    }
  };

  const handleGenerateGiftAid = async () => {
      setIsGenerating(true);
      setReportTitle("HMRC Gift Aid Schedule Draft");
      setReportText("");
      try {
          const text = await generateGiftAidSchedule(transactions);
          setReportText(text || "No gift aid transactions found.");
      } catch (e) {
          console.error(e);
          setReportText("Error generating Gift Aid report.");
      } finally {
          setIsGenerating(false);
      }
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-serif font-bold text-slate-800">Reports & Analysis</h2>
        <p className="text-slate-500">Generate professional reports for your Trustees or HMRC.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
            {/* Treasurer Report Card */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-800 mb-4">Treasurer's Report</h3>
                <p className="text-sm text-slate-500 mb-6">
                    Use AI to draft a commentary on this month's financial activity, highlighting key variances and fund status.
                </p>
                <button 
                    onClick={handleGenerateTreasurerReport}
                    disabled={isGenerating}
                    className="w-full flex justify-center items-center gap-2 bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 transition-all shadow-md font-medium disabled:opacity-70"
                >
                    {isGenerating && reportTitle.includes("Treasurer") ? (
                        <>Generating...</>
                    ) : (
                        <>
                            <Sparkles size={18} />
                            Generate with Gemini
                        </>
                    )}
                </button>
            </div>

            {/* Gift Aid Card */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                 <h3 className="font-bold text-slate-700 mb-4">Gift Aid Schedule</h3>
                 <p className="text-sm text-slate-500 mb-6">
                    Analyze eligible donations and create a draft schedule for your HMRC claim.
                 </p>
                 <button 
                    onClick={handleGenerateGiftAid}
                    disabled={isGenerating}
                    className="w-full flex justify-center items-center gap-2 bg-emerald-600 text-white py-3 rounded-lg hover:bg-emerald-700 transition-all shadow-md font-medium disabled:opacity-70"
                >
                    {isGenerating && reportTitle.includes("HMRC") ? (
                        <>Scanning...</>
                    ) : (
                        <>
                            <PoundSterling size={18} />
                            Draft Claim
                        </>
                    )}
                </button>
            </div>
        </div>

        <div className="lg:col-span-2">
            <div className="bg-white min-h-[500px] p-8 rounded-xl shadow-sm border border-slate-100 relative">
                <div className="absolute top-4 right-4 flex gap-2">
                     <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded" title="Download PDF">
                        <Download size={20} />
                     </button>
                     <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded" title="Share">
                        <Share2 size={20} />
                     </button>
                </div>
                
                {reportText ? (
                    <article className="prose prose-slate max-w-none">
                        <div className="mb-8 border-b border-slate-100 pb-4">
                            <h1 className="text-2xl font-serif font-bold text-slate-900 mb-1">{reportTitle}</h1>
                            <p className="text-sm text-slate-500">Generated on {new Date().toLocaleDateString()}</p>
                        </div>
                        <div className="whitespace-pre-line text-slate-700 leading-relaxed font-serif">
                            {reportText}
                        </div>
                    </article>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300">
                        <FileText size={64} className="mb-4 text-slate-200"/>
                        <p>Select a report type to generate.</p>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;