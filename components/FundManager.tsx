import React from 'react';
import { Fund, Transaction, FundType, TransactionType } from '../types';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { ArrowRight, Wallet, Target, Activity } from 'lucide-react';

interface FundManagerProps {
  funds: Fund[];
  transactions: Transaction[];
  onViewLedger: (fundId: string) => void;
}

const COLORS = ['#d97706', '#57534e', '#a8a29e', '#e7e5e4'];

const FundManager: React.FC<FundManagerProps> = ({ funds, transactions, onViewLedger }) => {
  const data = funds.map(f => ({ name: f.name, value: f.balance }));

  // Calculate General Fund (Unrestricted) Expenditure Breakdown
  const generalFunds = funds.filter(f => f.type === FundType.UNRESTRICTED);
  const generalFundIds = new Set(generalFunds.map(f => f.id));
  
  const generalFundExpenditure = transactions.filter(t => 
    generalFundIds.has(t.fundId) && t.type === TransactionType.EXPENDITURE
  );

  const categoryTotals: Record<string, number> = {};
  generalFundExpenditure.forEach(t => {
      categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
  });

  const expenditureData = Object.entries(categoryTotals)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6); // Top 6 categories

  return (
    <div className="space-y-8 animate-enter max-w-6xl mx-auto">
       <header className="border-b border-slate-200 pb-6">
        <h2 className="text-3xl font-bold text-slate-800 font-display tracking-tight">Funds</h2>
        <p className="text-slate-500 mt-1 text-sm font-medium">Restricted and unrestricted balances.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
            {funds.map((fund, index) => (
                <div 
                    key={fund.id} 
                    className="swiss-card p-6 group relative overflow-hidden"
                    style={{ transitionDelay: `${index * 50}ms` }}
                >
                    <div className="absolute top-0 right-0 p-10 bg-slate-50 rounded-bl-[100px] -mr-10 -mt-10 opacity-50 group-hover:scale-110 transition-transform duration-500 pointer-events-none"></div>

                    <div className="flex justify-between items-start mb-6 relative z-10">
                        <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shadow-sm ${fund.type === 'Restricted' ? 'bg-amber-100 text-amber-700' : 'bg-white border border-slate-100 text-slate-600'}`}>
                                <Wallet size={18} />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">{fund.name}</h3>
                                <p className="text-xs text-slate-500 uppercase tracking-wide mt-0.5 font-bold">{fund.type}</p>
                            </div>
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 font-mono tracking-tighter">£{fund.balance.toLocaleString()}</h3>
                    </div>
                    
                    <p className="text-sm text-slate-600 mb-6 font-medium leading-relaxed max-w-sm relative z-10">{fund.description}</p>
                    
                    {fund.targetAmount && (
                        <div className="mb-6 bg-stone-50 p-4 rounded-lg border border-stone-100 relative z-10">
                            <div className="flex justify-between text-xs font-bold text-stone-500 mb-2 uppercase tracking-wide">
                                <span className="flex items-center gap-1"><Target size={12}/> Target Progress</span>
                                <span className="font-mono text-stone-700">£{fund.targetAmount.toLocaleString()}</span>
                            </div>
                            <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
                                <div 
                                    className="bg-amber-500 h-2 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.5)]" 
                                    style={{ width: `${Math.min((fund.balance / fund.targetAmount) * 100, 100)}%`}}
                                ></div>
                            </div>
                        </div>
                    )}
                    
                    <div className="flex justify-end relative z-10">
                        <button 
                            onClick={() => onViewLedger(fund.id)}
                            className="text-xs font-bold uppercase tracking-wide text-slate-400 group-hover:text-orange-600 flex items-center gap-2 transition-colors"
                        >
                            Ledger History <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                </div>
            ))}
        </div>

        {/* Visuals Column */}
        <div className="space-y-6">
            
            {/* General Fund Breakdown */}
            <div className="swiss-card p-6 bg-white">
                <div className="flex items-center gap-2 mb-6">
                    <div className="p-1.5 bg-indigo-50 rounded text-indigo-600"><Activity size={14}/></div>
                    <div>
                        <h3 className="font-bold text-slate-800 font-display text-sm">General Fund Expenditure</h3>
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Top Categories</p>
                    </div>
                </div>
                
                <div className="w-full h-48">
                    {expenditureData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={expenditureData} layout="vertical" margin={{ top: 0, right: 30, left: 30, bottom: 0 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 10, fill: '#78716c'}} axisLine={false} tickLine={false} />
                                <Tooltip 
                                    cursor={{fill: '#f8fafc'}}
                                    contentStyle={{ borderRadius: '8px', border: '1px solid #e7e5e4', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', fontFamily: 'JetBrains Mono', fontSize: '11px' }}
                                />
                                <Bar dataKey="value" fill="#292524" radius={[0, 4, 4, 0]} barSize={16} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-slate-300 text-xs">No expenditure data available.</div>
                    )}
                </div>
            </div>

            {/* Existing Capital Allocation */}
            <div className="swiss-card p-8 flex flex-col justify-center items-center bg-white">
                <h3 className="font-bold text-slate-800 mb-8 font-display text-lg">Capital Allocation</h3>
                <div className="w-full h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data}
                                innerRadius={70}
                                outerRadius={100}
                                paddingAngle={5}
                                dataKey="value"
                                stroke="none"
                            >
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e7e5e4', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', fontFamily: 'JetBrains Mono', fontSize: '12px' }}/>
                            <Legend verticalAlign="bottom" height={36} iconType="circle"/>
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="mt-8 text-center bg-orange-50 p-4 rounded-lg border border-orange-100 text-orange-900 max-w-sm">
                    <p className="text-xs font-medium leading-relaxed">
                        <strong>Note:</strong> Restricted funds must be reported separately in year-end accounts.
                    </p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default FundManager;