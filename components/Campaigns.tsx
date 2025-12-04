import React, { useState } from 'react';
import { Fund, Pledge, Transaction } from '../types';
import { reconcilePledges } from '../services/gemini';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Upload, Users, Target, Calendar, Wand2, Check } from 'lucide-react';

interface CampaignsProps {
    funds: Fund[];
    pledges: Pledge[];
    transactions: Transaction[];
    onAddPledge: (p: Pledge) => void;
}

const COLORS = ['#10b981', '#cbd5e1']; // Emerald (Received), Slate (Remaining)

const Campaigns: React.FC<CampaignsProps> = ({ funds, pledges, transactions, onAddPledge }) => {
    const [selectedFundId, setSelectedFundId] = useState<string>(funds.find(f => f.type === 'Restricted')?.id || funds[0].id);
    const [isReconciling, setIsReconciling] = useState(false);
    const [matches, setMatches] = useState<any[]>([]);

    const selectedFund = funds.find(f => f.id === selectedFundId);
    
    // Filter pledges for this campaign/fund
    const campaignPledges = pledges.filter(p => p.fundId === selectedFundId);
    
    const totalPledged = campaignPledges.reduce((acc, p) => acc + p.amount, 0);
    const totalCollected = transactions
        .filter(t => t.fundId === selectedFundId && t.type === 'Income')
        .reduce((acc, t) => acc + t.amount, 0);
    
    // Use target from fund, or fallback to pledged amount
    const target = selectedFund?.targetAmount || totalPledged * 1.2; 
    const percentComplete = Math.min((totalCollected / target) * 100, 100);

    const pieData = [
        { name: 'Collected', value: totalCollected },
        { name: 'Remaining', value: Math.max(0, target - totalCollected) }
    ];

    const handleUploadPledges = () => {
        // Simulating upload
        const newPledge: Pledge = {
            id: `p-${Date.now()}`,
            donorName: 'New Donor (Imported)',
            amount: 1200,
            fundId: selectedFundId,
            frequency: 'Monthly',
            startDate: new Date().toISOString().split('T')[0],
            status: 'Active'
        };
        onAddPledge(newPledge);
        alert("Simulated: 1 Pledge imported from CSV.");
    };

    const handleAIReconcile = async () => {
        setIsReconciling(true);
        try {
            const results = await reconcilePledges(transactions, pledges);
            setMatches(results);
        } catch (e) {
            console.error(e);
        } finally {
            setIsReconciling(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <header className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-serif font-bold text-slate-800">Campaigns & Pledges</h2>
                    <p className="text-slate-500">Track capital projects, pledges, and restricted fund goals.</p>
                </div>
                <div className="flex gap-2">
                    <select 
                        className="bg-white border border-slate-300 text-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={selectedFundId}
                        onChange={(e) => setSelectedFundId(e.target.value)}
                    >
                        {funds.filter(f => f.type === 'Restricted' || f.type === 'Designated').map(f => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                    </select>
                </div>
            </header>

            {/* Campaign Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h3 className="text-xl font-bold text-slate-800 font-serif">{selectedFund?.name}</h3>
                            <p className="text-slate-500 text-sm mt-1">{selectedFund?.description}</p>
                        </div>
                        <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-semibold border border-emerald-100">
                            Active Campaign
                        </span>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between text-sm font-medium text-slate-600 mb-2">
                                <span>Progress towards £{target.toLocaleString()}</span>
                                <span>{percentComplete.toFixed(1)}%</span>
                            </div>
                            <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-emerald-500 rounded-full transition-all duration-1000 ease-out relative"
                                    style={{ width: `${percentComplete}%` }}
                                >
                                    <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-50">
                            <div>
                                <p className="text-xs text-slate-400">Total Pledged</p>
                                <p className="text-lg font-bold text-slate-800">£{totalPledged.toLocaleString()}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-400">Received (YTD)</p>
                                <p className="text-lg font-bold text-emerald-600">£{totalCollected.toLocaleString()}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-400">Deadline</p>
                                <p className="text-lg font-bold text-slate-800">{selectedFund?.deadline || 'None'}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col items-center justify-center">
                    <h4 className="text-sm font-semibold text-slate-500 mb-4 w-full text-left">Fund Composition</h4>
                    <div className="w-40 h-40">
                         <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={pieData} innerRadius={35} outerRadius={55} paddingAngle={5} dataKey="value" stroke="none">
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex gap-4 mt-4 text-xs">
                         <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                            <span>Raised</span>
                         </div>
                         <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                            <span>To Go</span>
                         </div>
                    </div>
                </div>
            </div>

            {/* Pledges & AI Reconciliation */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <Users size={18} /> Donor Pledges
                        </h3>
                        <div className="flex gap-2">
                             <button 
                                onClick={handleAIReconcile}
                                disabled={isReconciling}
                                className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 text-xs font-medium transition-colors"
                            >
                                {isReconciling ? <Wand2 size={14} className="animate-spin"/> : <Wand2 size={14} />}
                                AI Reconcile
                            </button>
                            <button 
                                onClick={handleUploadPledges}
                                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 text-xs font-medium transition-colors"
                            >
                                <Upload size={14} />
                                Import CSV
                            </button>
                        </div>
                    </div>
                    
                    {/* AI Suggestions Box */}
                    {matches.length > 0 && (
                        <div className="p-4 bg-indigo-50 border-b border-indigo-100">
                            <h4 className="text-xs font-bold text-indigo-800 uppercase tracking-wide mb-2">Gemini Suggested Matches</h4>
                            <div className="space-y-2">
                                {matches.map((m, i) => (
                                    <div key={i} className="flex justify-between items-center bg-white p-2 rounded border border-indigo-100 text-sm">
                                        <div className="flex gap-2 items-center">
                                            <span className="text-slate-500">Transaction:</span>
                                            <span className="font-medium text-slate-800">"{m.desc}"</span>
                                            <span className="text-indigo-400">→</span>
                                            <span className="text-slate-500">Donor:</span>
                                            <span className="font-medium text-indigo-700">{m.donorName}</span>
                                        </div>
                                        <button className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">Confirm</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-3 font-semibold text-slate-600">Donor Name</th>
                                <th className="px-6 py-3 font-semibold text-slate-600">Frequency</th>
                                <th className="px-6 py-3 font-semibold text-slate-600">Amount</th>
                                <th className="px-6 py-3 font-semibold text-slate-600">Start Date</th>
                                <th className="px-6 py-3 font-semibold text-slate-600">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {campaignPledges.map((pledge) => (
                                <tr key={pledge.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-3 font-medium text-slate-800">{pledge.donorName}</td>
                                    <td className="px-6 py-3 text-slate-500">{pledge.frequency}</td>
                                    <td className="px-6 py-3 text-emerald-600 font-semibold">£{pledge.amount.toLocaleString()}</td>
                                    <td className="px-6 py-3 text-slate-500">{pledge.startDate}</td>
                                    <td className="px-6 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                            pledge.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                        }`}>
                                            {pledge.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {campaignPledges.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400 italic">
                                        No pledges recorded for this fund yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Schedule / Timeline */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Calendar size={18} /> Project Schedule
                    </h3>
                    <div className="relative border-l-2 border-slate-200 ml-3 space-y-6 pb-2">
                        <div className="relative pl-6">
                            <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow-sm"></div>
                            <p className="text-xs text-slate-400 font-mono">OCT 2023</p>
                            <h4 className="font-medium text-slate-800">Campaign Launch</h4>
                            <p className="text-sm text-slate-500">Pledges open for Roof Project</p>
                        </div>
                        <div className="relative pl-6">
                            <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-sm"></div>
                            <p className="text-xs text-slate-400 font-mono">DEC 2023</p>
                            <h4 className="font-medium text-slate-800">First Milestone</h4>
                            <p className="text-sm text-slate-500">Reach £25k for materials deposit.</p>
                        </div>
                        <div className="relative pl-6 opacity-50">
                            <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-slate-300 border-2 border-white shadow-sm"></div>
                            <p className="text-xs text-slate-400 font-mono">JUN 2024</p>
                            <h4 className="font-medium text-slate-800">Construction Begins</h4>
                            <p className="text-sm text-slate-500">Contractors on site.</p>
                        </div>
                    </div>
                    <div className="mt-6 p-4 bg-indigo-50 rounded-lg">
                        <h5 className="text-xs font-bold text-indigo-800 mb-1">AI FORECAST</h5>
                        <p className="text-xs text-indigo-700 leading-relaxed">
                            Based on current giving rates (avg £{ (totalCollected / 3).toFixed(0) }/mo), 
                            you are on track to hit the Phase 1 target by Feb 2024.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Campaigns;