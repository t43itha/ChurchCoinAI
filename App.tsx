import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import TransactionManager from './components/TransactionManager';
import FundManager from './components/FundManager';
import Campaigns from './components/Campaigns';
import Reports from './components/Reports';
import AICoPilot from './components/AICoPilot';
import DonorManager from './components/DonorManager';
import Settings from './components/Settings';
import { INITIAL_FUNDS, INITIAL_TRANSACTIONS, INITIAL_PLEDGES, INITIAL_DONORS, MOCK_USERS, CATEGORIES as INITIAL_CATEGORIES } from './constants';
import { Transaction, Fund, Pledge, Donor, AppUser, UserRole, ChurchDetails } from './types';
import { Menu, Command } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [currentUser, setCurrentUser] = useState<AppUser>(MOCK_USERS[0]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // App State
  const [funds, setFunds] = useState<Fund[]>(INITIAL_FUNDS);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [pledges, setPledges] = useState<Pledge[]>(INITIAL_PLEDGES);
  const [donors, setDonors] = useState<Donor[]>(INITIAL_DONORS);
  const [users, setUsers] = useState<AppUser[]>(MOCK_USERS);
  const [categories, setCategories] = useState<string[]>(INITIAL_CATEGORIES);
  const [transactionFilterFundId, setTransactionFilterFundId] = useState<string | undefined>(undefined);
  
  // New: Organization Config
  const [churchDetails, setChurchDetails] = useState<ChurchDetails>({
    name: 'ChurchCoin Community',
    email: 'finance@churchcoin.app',
    address: '123 High Street, London, UK',
    charityNumber: '11223344',
    reportingPeriod: 'tax_year' // Default to UK Tax Year
  });

  const handleSwitchUser = (user: AppUser) => {
      const upToDateUser = users.find(u => u.id === user.id) || user;
      setCurrentUser(upToDateUser);
      if (activeTab === 'donors' && !['Admin', 'Finance Team'].includes(upToDateUser.role)) setActiveTab('dashboard');
      if (activeTab === 'settings' && !['Admin', 'Finance Team'].includes(upToDateUser.role)) setActiveTab('dashboard');
  };

  const handleViewFundLedger = (fundId: string) => {
      setTransactionFilterFundId(fundId);
      setActiveTab('transactions');
  };

  const handleAddTransaction = (t: Transaction) => {
    setTransactions(prev => [t, ...prev]);
    setFunds(prev => prev.map(f => {
        if (f.id === t.fundId) return { ...f, balance: f.balance + (t.type === 'Income' ? t.amount : -t.amount) };
        return f;
    }));
  };

  const handleUpdateTransaction = (updatedT: Transaction) => {
      const oldT = transactions.find(t => t.id === updatedT.id);
      if (!oldT) return;
      setTransactions(prev => prev.map(t => t.id === updatedT.id ? updatedT : t));
      setFunds(prev => prev.map(f => {
          let balanceChange = 0;
          if (f.id === oldT.fundId) balanceChange -= (oldT.type === 'Income' ? oldT.amount : -oldT.amount);
          if (f.id === updatedT.fundId) balanceChange += (updatedT.type === 'Income' ? updatedT.amount : -updatedT.amount);
          if (balanceChange !== 0) return { ...f, balance: f.balance + balanceChange };
          return f;
      }));
  };

  const handleBulkAdd = (newTransactions: Transaction[]) => {
      setTransactions(prev => [...newTransactions, ...prev]);
      const fundUpdates: Record<string, number> = {};
      newTransactions.forEach(t => {
          const change = t.type === 'Income' ? t.amount : -t.amount;
          fundUpdates[t.fundId] = (fundUpdates[t.fundId] || 0) + change;
      });
      setFunds(prev => prev.map(f => {
          if (fundUpdates[f.id]) return { ...f, balance: f.balance + fundUpdates[f.id] };
          return f;
      }));
  };

  const handleBulkUpdateTransaction = (ids: string[], updates: Partial<Transaction>) => {
      const idsSet = new Set(ids);
      if (updates.fundId) {
          const fundDiffs: Record<string, number> = {};
          transactions.forEach(t => {
              if (idsSet.has(t.id) && t.fundId !== updates.fundId) {
                  const val = t.type === 'Income' ? t.amount : -t.amount;
                  fundDiffs[t.fundId] = (fundDiffs[t.fundId] || 0) - val;
                  fundDiffs[updates.fundId!] = (fundDiffs[updates.fundId!] || 0) + val;
              }
          });
          if (Object.keys(fundDiffs).length > 0) {
              setFunds(prev => prev.map(f => {
                  if (fundDiffs[f.id]) return { ...f, balance: f.balance + fundDiffs[f.id] };
                  return f;
              }));
          }
      }
      setTransactions(prev => prev.map(t => idsSet.has(t.id) ? { ...t, ...updates } : t));
  };

  const handleBatchUpdate = (updates: { id: string; changes: Partial<Transaction> }[]) => {
      const updatesMap = new Map(updates.map(u => [u.id, u.changes]));
      const fundDiffs: Record<string, number> = {};
      transactions.forEach(t => {
          const changes = updatesMap.get(t.id);
          if (changes && changes.fundId && changes.fundId !== t.fundId) {
               const val = t.type === 'Income' ? t.amount : -t.amount;
               fundDiffs[t.fundId] = (fundDiffs[t.fundId] || 0) - val;
               fundDiffs[changes.fundId] = (fundDiffs[changes.fundId] || 0) + val;
          }
      });
      if (Object.keys(fundDiffs).length > 0) {
          setFunds(prev => prev.map(f => {
              if (fundDiffs[f.id]) return { ...f, balance: f.balance + fundDiffs[f.id] };
              return f;
          }));
      }
      setTransactions(prev => prev.map(t => {
          const changes = updatesMap.get(t.id);
          return changes ? { ...t, ...changes } : t;
      }));
  };

  const handleAddDonor = (newDonor: Donor) => setDonors(prev => [...prev, newDonor]);
  const handleUpdateDonor = (updatedDonor: Donor) => setDonors(prev => prev.map(d => d.id === updatedDonor.id ? updatedDonor : d));
  const handleBulkAddPledges = (newPledges: Pledge[]) => setPledges(prev => [...prev, ...newPledges]);

  // Settings Handlers
  const handleUpdateUserRole = (userId: string, newRole: UserRole) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    if (currentUser.id === userId) setCurrentUser(prev => ({ ...prev, role: newRole }));
  };
  const handleAddUser = (user: AppUser) => setUsers(prev => [...prev, user]);
  const handleAddCategory = (cat: string) => !categories.includes(cat) && setCategories(prev => [...prev, cat]);
  const handleRemoveCategory = (cat: string) => setCategories(prev => prev.filter(c => c !== cat));
  
  // New Handlers
  const handleUpdateChurchDetails = (details: ChurchDetails) => setChurchDetails(details);
  const handleAddFund = (fund: Fund) => setFunds(prev => [...prev, fund]);
  const handleUpdateFund = (fund: Fund) => setFunds(prev => prev.map(f => f.id === fund.id ? fund : f));
  const handleRemoveFund = (fundId: string) => setFunds(prev => prev.filter(f => f.id !== fundId));

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard funds={funds} transactions={transactions} />;
      case 'transactions': return <TransactionManager transactions={transactions} funds={funds} pledges={pledges} categories={categories} onAddTransaction={handleAddTransaction} onUpdateTransaction={handleUpdateTransaction} onBulkAdd={handleBulkAdd} onBulkUpdate={handleBulkUpdateTransaction} onBatchUpdate={handleBatchUpdate} currentUser={currentUser} initialFundId={transactionFilterFundId} />;
      case 'funds': return <FundManager funds={funds} onViewLedger={handleViewFundLedger} />;
      case 'donors': return <DonorManager donors={donors} transactions={transactions} pledges={pledges} funds={funds} onAddDonor={handleAddDonor} onUpdateDonor={handleUpdateDonor} onAddPledge={p => setPledges(prev => [...prev, p])} onUpdateTransaction={handleUpdateTransaction} currentUser={currentUser} churchDetails={churchDetails} />;
      case 'campaigns': return <Campaigns funds={funds} pledges={pledges} transactions={transactions} onAddPledge={p => setPledges(prev => [...prev, p])} onBulkAddPledges={handleBulkAddPledges} onUpdateTransaction={handleUpdateTransaction} currentUser={currentUser} />;
      case 'reports': return <Reports transactions={transactions} funds={funds} pledges={pledges} churchDetails={churchDetails} />;
      case 'copilot': return <AICoPilot transactions={transactions} funds={funds} />;
      case 'settings': return <Settings currentUser={currentUser} users={users} categories={categories} funds={funds} churchDetails={churchDetails} onUpdateUserRole={handleUpdateUserRole} onAddCategory={handleAddCategory} onRemoveCategory={handleRemoveCategory} onAddUser={handleAddUser} onUpdateChurchDetails={handleUpdateChurchDetails} onAddFund={handleAddFund} onUpdateFund={handleUpdateFund} onRemoveFund={handleRemoveFund} />;
      default: return <Dashboard funds={funds} transactions={transactions} />;
    }
  };

  return (
    <div className="flex bg-[#FDFCF8] min-h-screen font-sans text-slate-800 selection:bg-orange-100 selection:text-orange-900">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} users={users} onSwitchUser={handleSwitchUser} isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      <main className="flex-1 md:ml-64 flex flex-col h-screen overflow-hidden">
        <header className="md:hidden flex items-center justify-between p-4 border-b border-slate-200 bg-[#FDFCF8]/95 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-slate-800 text-orange-50 flex items-center justify-center rounded-lg"><Command size={16} /></div>
             <span className="font-bold text-slate-900 font-display">ChurchCoin</span>
          </div>
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-md"><Menu size={24} /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 md:p-8">{renderContent()}</div>
      </main>
    </div>
  );
}

export default App;