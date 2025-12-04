import React, { useState } from 'react';
import { Fund, Pledge, Transaction } from '../types';
import { reconcilePledges } from '../services/gemini';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Upload, Users, Calendar, Wand2, Check, X } from 'lucide-react';

interface CampaignsProps {
    funds: Fund[];
    pledges: Pledge[];
    transactions: Transaction[];
    onAddPledge: (p: Pledge) => void;
    onUpdateTransaction: (t: Transaction) => void;
}

const COLORS = ['#10b981', '#e2e8f0'];

const Campaigns: React.FC<CampaignsProps> = ({ funds, pledges, transactions, onAddPledge, onUpdateTransaction }) => {
    const [selectedFundId, setSelectedFundId] = useState<string>(funds.find(f => f.type === 'Restricted')?.id || funds[0].id);
    const [isReconciling, setIsReconciling] = useState(false);
    const [matches, setMatches] = useState<any[]>([]);

    const selectedFund = funds.find(f => f.id === selectedFundId);
    const campaignPledges = pledges.filter(p => p.fundId === selectedFundId);
    
    const totalPledged = campaignPledges.reduce((acc, p) => acc + p.amount, 0);
    const totalCollected = transactions.filter(t => t.fundId === selectedFundId && t.type === 'Income').reduce((acc, t) => acc + t.amount, 0);
    const target = selectedFund?.targetAmount || totalPledged * 1.2; 
    const percentComplete = Math.min((totalCollected / target) * 100, 100);

    const pieData = [{ name: 'Collected', value: totalCollected }, { name: 'Remaining', value: Math.max(0, target - totalCollected) }];

    const handleAIReconcile = async () => {
        setIsReconciling(true);
        try {
            const results = await reconcilePledges(transactions, pledges);
            setMatches(results);
        } catch (e) { console.error(e); } finally { setIsReconciling(false); }
    };

    const handleConfirmMatch = (match: any) => {
        const t = transactions.find(tr => tr.id === match.transactionId);
        if (t) {
            onUpdateTransaction({
                ...t,
                pledgeId: match.pledgeId,
                donorName: match.donorName || t.donorName
            });
            setMatches(prev => prev.filter(m => m !== match));
        }
    };

    const handleRejectMatch = (match: any) => {
        setMatches(prev => prev.filter(m => m !== match));
    };

    return (
        <div className="space-y-6 animate-enter max-w-6xl mx-auto">
            <header className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b border-slate-200 pb-6">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 font-display tracking-tight">Campaigns</h2>
                    <p className="text-slate-500 mt-1 text-sm font-medium">Capital projects and pledged giving.</p>
                </div>
                <div className="flex gap-2">
                    <select 
                        className="bg-white border border-slate-200 text-slate-900 rounded-md px-3 py-2 text-sm font-medium outline-none focus:ring-1 focus:ring-slate-900"
                        value={selectedFundId}
                        onChange={(e) => setSelectedFundId(e.target.value)}
                    >
                        {funds.filter(f => f.type === 'Restricted' || f.type === 'Designated').map(f => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                    </select>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 swiss-card p-8">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h3 className="text-2xl font-bold text-slate-900 font-display">{selectedFund?.name}</h3>
                            <p className="text-slate-500 text-sm mt-1 max-w-md">{selectedFund?.description}</p>
                        </div>
                        <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border border-emerald-100">Active</span>
                    </div>

                    <div className="space-y-8">
                        <div>
                            <div className="flex justify-between text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
                                <span>Collection Progress</span>
                                <span>{percentComplete.toFixed(1)}%</span>
                            </div>
                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000 ease-out" style={{ width: `${percentComplete}%` }}></div>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-8">
                            <div>
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-wide mb-1">Pledged</p>
                                <p className="text-xl font-bold text-slate-900 font-mono">£{totalPledged.toLocaleString()}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-wide mb-1">Collected</p>
                                <p className="text-xl font-bold text-emerald-600 font-mono">£{totalCollected.toLocaleString()}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-wide mb-1">Target</p>
                                <p className="text-xl font-bold text-slate-900 font-mono">£{target.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="swiss-card p-6 flex flex-col items-center justify-center">
                    <div className="w-40 h-40">
                         <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={pieData} innerRadius={35} outerRadius={55} paddingAngle={5} dataKey="value" stroke="none">
                                    {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 swiss-card overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide flex items-center gap-2"><Users size={16} /> Pledges</h3>
                        <button onClick={handleAIReconcile} disabled={isReconciling} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-indigo-600 rounded-md hover:border-indigo-200 text-xs font-bold uppercase tracking-wide transition-colors">
                            {isReconciling ? <Wand2 size={14} className="animate-spin"/> : <Wand2 size={14} />} AI Match
                        </button>
                    </div>
                    
                    {matches.length > 0 && (
                        <div className="p-4 bg-indigo-50/30 border-b border-indigo-100">
                            <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                                <Wand2 size={12} /> Suggested Links
                            </h4>
                            <div className="space-y-3">
                                {matches.map((m, i) => {
                                    const txn = transactions.find(t => t.id === m.transactionId);
                                    if (!txn) return null;
                                    
                                    return (
                                        <div key={i} className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-3 rounded border border-indigo-100 shadow-sm gap-3">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-baseline gap-2">
                                                    <span className="font-mono text-xs text-slate-500">{txn.date}</span>
                                                    <span className="font-medium text-slate-900 text-sm">{txn.description}</span>
                                                    <span className="font-mono text-xs font-bold text-emerald-600">£{txn.amount}</span>
                                                </div>
                                                <div className="flex gap-2 text-[10px] items-center">
                                                    <span className="text-indigo-600 font-bold uppercase">Reason:</span>
                                                    <span className="text-slate-600 italic">{m.reason}</span>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 shrink-0">
                                                 <button onClick={() => handleRejectMatch(m)} className="text-[10px] border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 px-3 py-1.5 rounded font-bold uppercase flex items-center gap-1 transition-colors">
                                                    <X size={12}/> Dismiss
                                                </button>
                                                <button onClick={() => handleConfirmMatch(m)} className="text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded font-bold uppercase flex items-center gap-1 transition-colors shadow-sm">
                                                    <Check size={12}/> Confirm Link
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <table className="w-full text-left ledger-table">
                        <thead>
                            <tr>
                                <th className="px-6">Donor</th>
                                <th className="px-6">Frequency</th>
                                <th className="px-6 text-right">Amount</th>
                                <th className="px-6 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {campaignPledges.map((pledge) => (
                                <tr key={pledge.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-3 font-medium text-slate-900 text-sm">{pledge.donorName}</td>
                                    <td className="px-6 py-3 text-slate-500 text-xs">{pledge.frequency}</td>
                                    <td className="px-6 py-3 text-emerald-600 font-mono font-bold text-right text-sm">£{pledge.amount.toLocaleString()}</td>
                                    <td className="px-6 py-3 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${pledge.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                            {pledge.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="swiss-card p-6">
                    <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2 font-display"><Calendar size={18} /> Timeline</h3>
                    <div className="space-y-8 pl-2">
                        {[
                            { date: 'OCT 2023', title: 'Launch', color: 'bg-emerald-500' },
                            { date: 'DEC 2023', title: 'Milestone 1', color: 'bg-indigo-500' },
                            { date: 'JUN 2024', title: 'Construction', color: 'bg-slate-300' }
                        ].map((item, i) => (
                            <div key={i} className="relative pl-6 border-l border-slate-200 last:border-0 pb-2">
                                <div className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ${item.color} ring-4 ring-white`}></div>
                                <p className="text-[10px] font-bold text-slate-400 font-mono mb-1">{item.date}</p>
                                <h4 className="font-bold text-slate-900 text-sm">{item.title}</h4>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Campaigns;