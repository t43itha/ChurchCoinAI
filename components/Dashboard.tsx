import React, { useEffect, useState, useMemo } from 'react';
import { Fund, Transaction, Insight, FundType } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line, Legend, Area } from 'recharts';
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle2, Info, ArrowUpRight, Sparkles, Activity, Users, Target, ArrowRight } from 'lucide-react';
import { generateInsights } from '../services/gemini';

interface DashboardProps {
  funds: Fund[];
  transactions: Transaction[];
}

const COLORS = ['#000000', '#d4a574', '#e5e5e5'];

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

  // --- Calculations ---

  // 1. Cash Flow Health (Current Month)
  const currentMonthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
  const currentMonthTxns = transactions.filter(t => t.date.startsWith(currentMonthKey));
  const incomeMonth = currentMonthTxns.filter(t => t.type === 'Income').reduce((s, t) => s + t.amount, 0);
  const expenseMonth = currentMonthTxns.filter(t => t.type === 'Expenditure').reduce((s, t) => s + t.amount, 0);
  const netCashFlow = incomeMonth - expenseMonth;

  // 2. Donor Momentum (Active Donors Current vs Previous Month)
  const prevDate = new Date();
  prevDate.setMonth(prevDate.getMonth() - 1);
  const prevMonthKey = prevDate.toISOString().slice(0, 7);
  
  const getActiveDonorCount = (monthKey: string) => {
      const donors = new Set(
          transactions
            .filter(t => t.date.startsWith(monthKey) && t.type === 'Income' && t.donorName)
            .map(t => t.donorName)
      );
      return donors.size;
  };
  const activeDonorsCurrent = getActiveDonorCount(currentMonthKey);
  const activeDonorsPrev = getActiveDonorCount(prevMonthKey);
  const donorGrowth = activeDonorsCurrent - activeDonorsPrev;

  // 3. Campaign Velocity (Primary Restricted Fund)
  const campaignFund = funds.find(f => f.type === FundType.RESTRICTED && f.targetAmount) || funds.find(f => f.type === FundType.RESTRICTED);
  const campaignProgress = campaignFund && campaignFund.targetAmount 
    ? Math.min((campaignFund.balance / campaignFund.targetAmount) * 100, 100)
    : 0;

  // 4. Chart Data (Last 6 Months)
  const chartData = useMemo(() => {
    const data = [];
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
       const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
       const monthKey = d.toISOString().slice(0, 7);
       const label = d.toLocaleString('default', { month: 'short' });
       
       const monthlyTxns = transactions.filter(t => t.date.startsWith(monthKey));
       const inc = monthlyTxns.filter(t => t.type === 'Income').reduce((s, t) => s + t.amount, 0);
       const exp = monthlyTxns.filter(t => t.type === 'Expenditure').reduce((s, t) => s + t.amount, 0);
       
       data.push({ name: label, Income: inc, Expenditure: exp });
    }
    return data;
  }, [transactions]);

  // 5. Priority Funds (Restricted or Low Balance)
  const priorityFunds = funds
    .filter(f => f.type === FundType.RESTRICTED || f.balance < 1000)
    .sort((a, b) => (a.targetAmount ? 0 : 1) - (b.targetAmount ? 0 : 1)) // Prioritize those with targets
    .slice(0, 5);

  return (
    <div className="space-y-8 animate-enter max-w-6xl mx-auto pb-12">
      <header className="flex items-end justify-between border-b border-ledger pb-6">
        <div>
            <h2 className="text-3xl font-bold text-ink tracking-tight">Overview</h2>
            <p className="text-grey-mid mt-1 text-sm font-medium">Finance & Donor Health Status</p>
        </div>
        <div className="flex gap-2">
             <span className="text-[10px] uppercase bg-grey-light px-2 py-1 rounded text-grey-mid font-bold tracking-wider">
                 {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
             </span>
        </div>
      </header>

      {/* Strategic KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Cash Flow Health */}
        <div className="swiss-card p-6 bg-white flex flex-col justify-between h-40 group">
            <div className="flex justify-between items-start">
                <div className={`p-2 rounded-lg border ${netCashFlow >= 0 ? 'bg-sage-light border-sage text-sage' : 'bg-error-light border-error text-error'}`}>
                    <Activity size={20} />
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border ${netCashFlow >= 0 ? 'bg-sage-light text-sage-dark border-sage' : 'bg-error-light text-error border-error'}`}>
                    {netCashFlow >= 0 ? 'Positive' : 'Deficit'}
                </span>
            </div>
            <div>
                <p className="text-xs font-bold text-grey-mid uppercase tracking-wide">Net Monthly Movement</p>
                <div className="flex items-baseline gap-2 mt-1">
                    <h3 className={`text-2xl font-bold tracking-tighter ${netCashFlow >= 0 ? 'text-ink' : 'text-error'}`}>
                        {netCashFlow >= 0 ? '+' : ''}£{Math.abs(netCashFlow).toLocaleString()}
                    </h3>
                </div>
            </div>
        </div>

        {/* Donor Momentum */}
        <div className="swiss-card p-6 bg-white flex flex-col justify-between h-40 group">
            <div className="flex justify-between items-start">
                <div className="p-2 bg-sage-light rounded-lg border border-sage text-sage">
                    <Users size={20} />
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border ${donorGrowth >= 0 ? 'bg-sage-light text-sage-dark border-sage' : 'bg-grey-light text-grey-mid border-ledger'}`}>
                    {donorGrowth > 0 ? `+${donorGrowth} New` : donorGrowth === 0 ? 'Stable' : `${donorGrowth} Loss`}
                </span>
            </div>
            <div>
                <p className="text-xs font-bold text-grey-mid uppercase tracking-wide">Active Donors (This Month)</p>
                <div className="flex items-baseline gap-2 mt-1">
                    <h3 className="text-2xl font-bold text-ink tracking-tighter">{activeDonorsCurrent}</h3>
                    <span className="text-xs text-grey-mid font-medium">vs {activeDonorsPrev} last month</span>
                </div>
            </div>
        </div>

        {/* Campaign Velocity */}
        <div className="swiss-card p-6 bg-white flex flex-col justify-between h-40 group">
            <div className="flex justify-between items-start">
                <div className="p-2 bg-amber-light rounded-lg border border-amber text-amber">
                    <Target size={20} />
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border bg-amber-light text-amber-dark border-amber">
                    Velocity
                </span>
            </div>
            <div>
                <p className="text-xs font-bold text-grey-mid uppercase tracking-wide truncate">{campaignFund?.name || 'No Active Campaign'}</p>
                {campaignFund ? (
                    <div className="mt-2">
                        <div className="flex justify-between text-xs font-bold text-ink mb-1">
                             <span>{campaignProgress.toFixed(1)}%</span>
                             <span className="text-grey-mid">of £{campaignFund.targetAmount?.toLocaleString()}</span>
                        </div>
                        <div className="w-full h-1.5 bg-grey-light rounded-full overflow-hidden">
                            <div className="h-full bg-amber rounded-full" style={{ width: `${campaignProgress}%` }}></div>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm font-medium text-grey-mid mt-1">Start a restricted fund to track.</p>
                )}
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart: Income vs Expense Trend */}
        <div className="lg:col-span-2 swiss-card p-8">
          <div className="flex justify-between items-center mb-8">
            <div>
                <h3 className="font-bold text-ink text-lg">Financial Trend</h3>
                <p className="text-xs text-grey-mid font-medium">6 Month Income vs Expenditure</p>
            </div>
            <div className="flex gap-4 text-xs font-bold uppercase tracking-wide">
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-ink"></div> Income</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber"></div> Expense</div>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#666666'}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#666666'}} />
                <Tooltip
                    cursor={{fill: '#fafaf9'}}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #000000', boxShadow: '4px 4px 0px rgba(0,0,0,1)', fontFamily: 'JetBrains Mono', fontSize: '12px' }}
                />
                <Bar dataKey="Income" barSize={32} fill="#000000" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="Expenditure" stroke="#d4a574" strokeWidth={3} dot={{r: 4, fill: '#d4a574', strokeWidth: 2, stroke: '#fff'}} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Priority Fund List */}
        <div className="swiss-card overflow-hidden flex flex-col">
           <div className="p-6 border-b border-ledger flex justify-between items-center bg-paper">
                <h3 className="font-bold text-ink text-sm uppercase tracking-wide">Priority Funds</h3>
                <ArrowRight size={14} className="text-grey-mid" />
           </div>
           <div className="flex-1 overflow-y-auto">
               {priorityFunds.length === 0 ? (
                   <div className="p-8 text-center text-grey-mid text-sm">All funds healthy.</div>
               ) : (
                   <table className="w-full text-left">
                       <tbody>
                           {priorityFunds.map(f => (
                               <tr key={f._id} className="border-b border-ledger last:border-0 hover:bg-amber-light transition-colors">
                                   <td className="px-6 py-4">
                                       <div className="font-bold text-ink text-sm">{f.name}</div>
                                       <div className="text-[10px] text-grey-mid uppercase tracking-wide mt-0.5">{f.type}</div>
                                   </td>
                                   <td className="px-6 py-4 text-right">
                                       <div className="font-bold text-ink text-sm">£{f.balance.toLocaleString()}</div>
                                       {f.targetAmount && (
                                           <div className="text-[10px] text-amber font-medium mt-0.5">
                                               {Math.round((f.balance / f.targetAmount)*100)}% of Goal
                                           </div>
                                       )}
                                   </td>
                               </tr>
                           ))}
                       </tbody>
                   </table>
               )}
           </div>
        </div>
      </div>

      {/* AI Decision Panel */}
      <div className="swiss-card p-0 flex flex-col bg-white overflow-hidden">
          <div className="p-6 border-b border-ledger bg-sage-light/30 flex items-center justify-between">
             <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-sage" />
                <h3 className="font-bold text-ink">Decision Ready Insights</h3>
             </div>
             {loadingInsights && <div className="animate-spin h-3 w-3 border-2 border-sage border-t-transparent rounded-full"></div>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-ledger">
            {insights.length === 0 && !loadingInsights && (
               <div className="col-span-3 p-12 text-center text-grey-mid text-sm">
                   Waiting for ledger data to generate strategic insights...
               </div>
            )}

            {insights.map((insight) => (
              <div key={insight.id} className="p-6 hover:bg-amber-light transition-colors group">
                 <div className="flex items-center gap-2 mb-3">
                    {insight.type === 'warning' && <AlertCircle className="text-error" size={16} />}
                    {insight.type === 'success' && <TrendingUp className="text-sage" size={16} />}
                    {insight.type === 'info' && <Info className="text-amber" size={16} />}
                    <h4 className="text-xs font-bold text-grey-mid uppercase tracking-wide group-hover:text-ink transition-colors">
                        {insight.type === 'warning' ? 'Action Required' : insight.type === 'success' ? 'Good News' : 'For Info'}
                    </h4>
                 </div>
                 <h5 className="font-bold text-ink text-sm mb-2">{insight.title}</h5>
                 <p className="text-xs text-grey-mid leading-relaxed">{insight.description}</p>
              </div>
            ))}
          </div>
      </div>
    </div>
  );
};

export default Dashboard;