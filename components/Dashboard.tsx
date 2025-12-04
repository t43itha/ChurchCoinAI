import React, { useEffect, useState } from 'react';
import { Fund, Transaction, Insight } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle2, Info, ArrowUpRight, Sparkles } from 'lucide-react';
import { generateInsights } from '../services/gemini';

interface DashboardProps {
  funds: Fund[];
  transactions: Transaction[];
}

// Warmer Color Palette for Charts
const COLORS = ['#d97706', '#57534e', '#a8a29e', '#e7e5e4']; // Amber-600, Stone-600, Stone-400, Stone-200

const Dashboard: React.FC<DashboardProps> = ({ funds, transactions }) => {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchInsights = async () => {
        if (transactions.length > 0) {
            setLoadingInsights(true);
            const generated = await generateInsights(transactions);
            if (isMounted) {
                setInsights(generated.map((g: any, i: number) => ({ ...g, id: `ai-${i}`, date: new Date().toISOString() })));
                setLoadingInsights(false);
            }
        }
    };
    fetchInsights();
    return () => { isMounted = false; };
  }, [transactions]); 

  const totalBalance = funds.reduce((acc, f) => acc + f.balance, 0);
  const totalIncome = transactions.filter(t => t.type === 'Income').reduce((acc, t) => acc + t.amount, 0);
  const totalExpenditure = transactions.filter(t => t.type === 'Expenditure').reduce((acc, t) => acc + t.amount, 0);
  const fundData = funds.map(f => ({ name: f.name, value: f.balance }));

  return (
    <div className="space-y-8 animate-enter max-w-6xl mx-auto">
      <header className="flex items-end justify-between border-b border-slate-200 pb-6">
        <div>
            <h2 className="text-3xl font-bold text-slate-800 font-display tracking-tight">Overview</h2>
            <p className="text-slate-500 mt-1 text-sm font-medium">Financial ledger status as of {new Date().toLocaleDateString()}</p>
        </div>
        <div className="text-right hidden md:block bg-white/60 backdrop-blur px-5 py-2.5 border border-slate-200 rounded-xl shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono mb-1">Total Assets</p>
            <p className="text-2xl font-mono font-bold text-slate-800 tracking-tighter">£{totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
      </header>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="swiss-card p-6 relative group bg-white">
          <div className="flex justify-between items-start mb-4">
              <div className="p-2.5 bg-orange-50 rounded-lg border border-orange-100 text-orange-600">
                  <TrendingUp size={20} />
              </div>
              <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-100 uppercase tracking-wide">Healthy</span>
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide font-display">Total Funds</p>
          <h3 className="text-3xl font-bold text-slate-800 font-mono mt-2 tracking-tighter">£{totalBalance.toLocaleString()}</h3>
        </div>

        <div className="swiss-card p-6 bg-white">
           <div className="flex justify-between items-start mb-4">
              <div className="p-2.5 bg-stone-100 rounded-lg border border-stone-200 text-stone-600">
                  <ArrowUpRight size={20} />
              </div>
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide font-display">YTD Income</p>
          <h3 className="text-3xl font-bold text-slate-800 font-mono mt-2 tracking-tighter">£{totalIncome.toLocaleString()}</h3>
        </div>

        <div className="swiss-card p-6 bg-white">
           <div className="flex justify-between items-start mb-4">
              <div className="p-2.5 bg-rose-50 rounded-lg border border-rose-100 text-rose-500">
                  <TrendingDown size={20} />
              </div>
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide font-display">YTD Expenditure</p>
          <h3 className="text-3xl font-bold text-slate-800 font-mono mt-2 tracking-tighter">£{totalExpenditure.toLocaleString()}</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 swiss-card p-8">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-bold text-slate-800 font-display text-lg">Fund Allocation</h3>
            <button className="text-xs font-bold text-stone-500 hover:text-stone-800 uppercase tracking-wider transition-colors">View Details</button>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fundData} layout="vertical" margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e7e5e4" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 11, fontFamily: 'Inter', fill: '#78716c', fontWeight: 500}} tickLine={false} axisLine={false} />
                <Tooltip 
                    cursor={{fill: '#fafaf9'}}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e7e5e4', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)', fontFamily: 'JetBrains Mono', fontSize: '12px' }}
                />
                <Bar dataKey="value" barSize={28} radius={[0, 4, 4, 0]}>
                  {fundData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Insights */}
        <div className="swiss-card p-0 flex flex-col bg-white overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-orange-50/30">
             <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800 font-display flex items-center gap-2">
                <Sparkles size={16} className="text-orange-500"/> Smart Insights
                </h3>
                {loadingInsights && <div className="animate-spin h-3 w-3 border-2 border-orange-500 border-t-transparent rounded-full"></div>}
            </div>
          </div>
          
          <div className="space-y-0 flex-1 overflow-y-auto max-h-[300px]">
            {insights.length === 0 && !loadingInsights && (
               <div className="h-full flex items-center justify-center text-center p-8">
                 <p className="text-sm font-medium text-slate-400">Ledger analysis pending...</p>
               </div>
            )}
            
            {insights.map((insight, idx) => (
              <div 
                key={insight.id} 
                className="p-6 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors group"
              >
                <div className="flex items-start gap-4">
                  {insight.type === 'warning' && <div className="mt-1"><AlertCircle className="text-amber-500" size={16} /></div>}
                  {insight.type === 'success' && <div className="mt-1"><CheckCircle2 className="text-teal-600" size={16} /></div>}
                  {insight.type === 'info' && <div className="mt-1"><Info className="text-sky-500" size={16} /></div>}
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 mb-1 group-hover:text-orange-900 transition-colors">{insight.title}</h4>
                    <p className="text-xs text-slate-500 leading-relaxed font-medium">{insight.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
            <button className="text-xs font-bold text-slate-400 hover:text-orange-600 uppercase tracking-wide transition-colors">Generate New Report</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;