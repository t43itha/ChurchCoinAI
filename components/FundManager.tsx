import React from 'react';
import { Fund } from '../types';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ArrowRight } from 'lucide-react';

interface FundManagerProps {
  funds: Fund[];
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6'];

const FundManager: React.FC<FundManagerProps> = ({ funds }) => {
  const data = funds.map(f => ({ name: f.name, value: f.balance }));

  return (
    <div className="space-y-6">
       <header>
        <h2 className="text-3xl font-serif font-bold text-slate-800">Funds & Balances</h2>
        <p className="text-slate-500">Monitor restricted, unrestricted, and designated funds.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fund List */}
        <div className="space-y-4">
            {funds.map((fund) => (
                <div key={fund.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">{fund.name}</h3>
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${
                                fund.type === 'Restricted' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                fund.type === 'Unrestricted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                'bg-blue-50 text-blue-700 border-blue-200'
                            }`}>
                                {fund.type}
                            </span>
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800">£{fund.balance.toLocaleString()}</h3>
                    </div>
                    <p className="text-slate-500 text-sm mb-4">{fund.description}</p>
                    {fund.targetAmount && (
                        <div>
                            <div className="flex justify-between text-xs text-slate-500 mb-1">
                                <span>Progress</span>
                                <span>£{fund.targetAmount.toLocaleString()} Target</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2">
                                <div 
                                    className="bg-blue-500 h-2 rounded-full transition-all duration-500" 
                                    style={{ width: `${Math.min((fund.balance / fund.targetAmount) * 100, 100)}%`}}
                                ></div>
                            </div>
                        </div>
                    )}
                     <div className="mt-4 pt-4 border-t border-slate-50 flex justify-end">
                        <button className="text-sm font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                            View History <ArrowRight size={14} />
                        </button>
                    </div>
                </div>
            ))}
        </div>

        {/* Visual */}
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-center items-center">
            <h3 className="text-lg font-semibold text-slate-800 mb-6 font-serif w-full text-center">Fund Distribution</h3>
            <div className="w-full h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            innerRadius={80}
                            outerRadius={120}
                            paddingAngle={5}
                            dataKey="value"
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip />
                        <Legend verticalAlign="bottom" height={36}/>
                    </PieChart>
                </ResponsiveContainer>
            </div>
            <div className="mt-8 text-center bg-slate-50 p-4 rounded-lg">
                <p className="text-sm text-slate-600">
                    <strong>Tip:</strong> Keep Restricted Funds in separate bank accounts or clearly designated virtual pots to simplify audits.
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};

export default FundManager;