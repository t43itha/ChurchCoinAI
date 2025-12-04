import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import TransactionManager from './components/TransactionManager';
import FundManager from './components/FundManager';
import Campaigns from './components/Campaigns';
import Reports from './components/Reports';
import AICoPilot from './components/AICoPilot';
import DonorManager from './components/DonorManager';
import { INITIAL_FUNDS, INITIAL_TRANSACTIONS, INITIAL_PLEDGES, INITIAL_DONORS } from './constants';
import { Transaction, Fund, Pledge, Donor } from './types';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [funds, setFunds] = useState<Fund[]>(INITIAL_FUNDS);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [pledges, setPledges] = useState<Pledge[]>(INITIAL_PLEDGES);
  const [donors, setDonors] = useState<Donor[]>(INITIAL_DONORS);

  const handleAddTransaction = (t: Transaction) => {
    setTransactions(prev => [t, ...prev]);
    // Simplistic fund balance update
    setFunds(prev => prev.map(f => {
        if (f.id === t.fundId) {
            return {
                ...f,
                balance: f.balance + (t.type === 'Income' ? t.amount : -t.amount)
            };
        }
        return f;
    }));
  };

  const handleUpdateTransaction = (updatedT: Transaction) => {
      const oldT = transactions.find(t => t.id === updatedT.id);
      if (!oldT) return;

      // Update Transactions list
      setTransactions(prev => prev.map(t => t.id === updatedT.id ? updatedT : t));

      // Update Funds
      setFunds(prev => prev.map(f => {
          let balanceChange = 0;

          // Revert old transaction if it belonged to this fund
          if (f.id === oldT.fundId) {
              balanceChange -= (oldT.type === 'Income' ? oldT.amount : -oldT.amount);
          }

          // Apply new transaction if it belongs to this fund
          if (f.id === updatedT.fundId) {
              balanceChange += (updatedT.type === 'Income' ? updatedT.amount : -updatedT.amount);
          }

          if (balanceChange !== 0) {
              return { ...f, balance: f.balance + balanceChange };
          }
          return f;
      }));
  };

  const handleBulkAdd = (newTransactions: Transaction[]) => {
      setTransactions(prev => [...newTransactions, ...prev]);
      // Update funds in bulk
      const fundUpdates: Record<string, number> = {};
      newTransactions.forEach(t => {
          const change = t.type === 'Income' ? t.amount : -t.amount;
          fundUpdates[t.fundId] = (fundUpdates[t.fundId] || 0) + change;
      });

      setFunds(prev => prev.map(f => {
          if (fundUpdates[f.id]) {
              return { ...f, balance: f.balance + fundUpdates[f.id] };
          }
          return f;
      }));
  };

  const handleBulkUpdateTransaction = (ids: string[], updates: Partial<Transaction>) => {
      const idsSet = new Set(ids);
      
      // 1. Handle Fund Re-calculation if fundId is changing
      if (updates.fundId) {
          const fundDiffs: Record<string, number> = {};
          
          transactions.forEach(t => {
              if (idsSet.has(t.id) && t.fundId !== updates.fundId) {
                  // Revert impact on old fund
                  const val = t.type === 'Income' ? t.amount : -t.amount;
                  fundDiffs[t.fundId] = (fundDiffs[t.fundId] || 0) - val;
                  
                  // Apply impact to new fund
                  // Note: assuming amount/type hasn't changed in this specific bulk update
                  fundDiffs[updates.fundId!] = (fundDiffs[updates.fundId!] || 0) + val;
              }
          });

          if (Object.keys(fundDiffs).length > 0) {
              setFunds(prev => prev.map(f => {
                  if (fundDiffs[f.id]) {
                      return { ...f, balance: f.balance + fundDiffs[f.id] };
                  }
                  return f;
              }));
          }
      }

      // 2. Update Transactions
      setTransactions(prev => prev.map(t => idsSet.has(t.id) ? { ...t, ...updates } : t));
  };

  // Batch update for applying DIFFERENT updates to multiple transactions (e.g. AI Categorization)
  const handleBatchUpdate = (updates: { id: string; changes: Partial<Transaction> }[]) => {
      const updatesMap = new Map(updates.map(u => [u.id, u.changes]));
      const fundDiffs: Record<string, number> = {};

      // Calculate fund changes if fundIds are modified
      transactions.forEach(t => {
          const changes = updatesMap.get(t.id);
          if (changes && changes.fundId && changes.fundId !== t.fundId) {
               // Revert old fund impact
               const val = t.type === 'Income' ? t.amount : -t.amount;
               fundDiffs[t.fundId] = (fundDiffs[t.fundId] || 0) - val;
               
               // Apply new fund impact
               // Assuming type/amount doesn't change in batch categorization, only meta data
               fundDiffs[changes.fundId] = (fundDiffs[changes.fundId] || 0) + val;
          }
      });

      // Apply Fund Updates
      if (Object.keys(fundDiffs).length > 0) {
          setFunds(prev => prev.map(f => {
              if (fundDiffs[f.id]) {
                  return { ...f, balance: f.balance + fundDiffs[f.id] };
              }
              return f;
          }));
      }

      // Apply Transaction Updates
      setTransactions(prev => prev.map(t => {
          const changes = updatesMap.get(t.id);
          return changes ? { ...t, ...changes } : t;
      }));
  };

  const handleAddPledge = (p: Pledge) => {
      setPledges(prev => [...prev, p]);
  };

  const handleAddDonor = (d: Donor) => {
      setDonors(prev => [...prev, d]);
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard funds={funds} transactions={transactions} />;
      case 'transactions':
        return (
            <TransactionManager 
                transactions={transactions} 
                funds={funds} 
                onAddTransaction={handleAddTransaction}
                onUpdateTransaction={handleUpdateTransaction} 
                onBulkAdd={handleBulkAdd}
                onBulkUpdate={handleBulkUpdateTransaction}
                onBatchUpdate={handleBatchUpdate}
            />
        );
      case 'funds':
        return <FundManager funds={funds} />;
      case 'donors':
        return <DonorManager donors={donors} transactions={transactions} pledges={pledges} funds={funds} onAddDonor={handleAddDonor} onAddPledge={handleAddPledge} />;
      case 'campaigns':
        return <Campaigns funds={funds} pledges={pledges} transactions={transactions} onAddPledge={handleAddPledge} />;
      case 'reports':
        return <Reports transactions={transactions} funds={funds} />;
      case 'copilot':
        return <AICoPilot transactions={transactions} funds={funds} />;
      default:
        return <Dashboard funds={funds} transactions={transactions} />;
    }
  };

  return (
    <div className="flex bg-slate-50 min-h-screen">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="ml-64 flex-1 p-8 h-screen overflow-y-auto">
        <div className="max-w-7xl mx-auto">
            {renderContent()}
        </div>
      </main>
    </div>
  );
}

export default App;