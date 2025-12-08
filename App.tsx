
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import TransactionManager from './components/TransactionManager';
import FundManager from './components/FundManager';
import Campaigns from './components/Campaigns';
import Reports from './components/Reports';
import AICoPilot from './components/AICoPilot';
import DonorManager from './components/DonorManager';
import Settings from './components/Settings';
import Onboarding from './components/Onboarding';
import { INITIAL_FUNDS, INITIAL_TRANSACTIONS, INITIAL_PLEDGES, INITIAL_DONORS, MOCK_USERS, CATEGORIES as INITIAL_CATEGORIES } from './constants';
import { Transaction, Fund, Pledge, Donor, AppUser, UserRole, ChurchDetails, FundType } from './types';
import { Menu, Command, CheckCircle2, X } from 'lucide-react';

function App() {
  // Onboarding State with Persistence
  const [isOnboarded, setIsOnboarded] = useState(() => {
      return localStorage.getItem('churchcoin_onboarded') === 'true';
  });

  // App State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [currentUser, setCurrentUser] = useState<AppUser>(MOCK_USERS[0]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [notification, setNotification] = useState<{ visible: boolean; title: string; message: string }>({ visible: false, title: '', message: '' });
  
  // Data State
  const [funds, setFunds] = useState<Fund[]>(INITIAL_FUNDS);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [pledges, setPledges] = useState<Pledge[]>(INITIAL_PLEDGES);
  const [donors, setDonors] = useState<Donor[]>(INITIAL_DONORS);
  const [users, setUsers] = useState<AppUser[]>(MOCK_USERS);
  const [categories, setCategories] = useState<string[]>(INITIAL_CATEGORIES);
  const [transactionFilterFundId, setTransactionFilterFundId] = useState<string | undefined>(undefined);
  
  // Organization Config
  const [churchDetails, setChurchDetails] = useState<ChurchDetails>({
    name: 'ChurchCoin Community',
    email: 'finance@churchcoin.app',
    address: '123 High Street, London, UK',
    charityNumber: '11223344',
    reportingPeriod: 'tax_year'
  });

  // --- Logic: Pledge Fulfillment ---
  const checkPledgeFulfilment = (currentTransactions: Transaction[], specificPledgeId?: string) => {
    // Check specific pledge or all active pledges
    const activePledges = pledges.filter(p => p.status === 'Active' && (specificPledgeId ? p.id === specificPledgeId : true));
    const completedPledgeIds: string[] = [];

    activePledges.forEach(pledge => {
         const totalIncome = currentTransactions
            .filter(t => t.pledgeId === pledge.id && t.type === 'Income')
            .reduce((sum, t) => sum + t.amount, 0);
         
         // Threshold: exact or greater
         if (totalIncome >= pledge.amount) {
             completedPledgeIds.push(pledge.id);
             
             // Trigger Notification
             setNotification({
                 visible: true,
                 title: 'Pledge Fulfilled! 🎉',
                 message: `${pledge.donorName} has completed their goal of £${pledge.amount.toLocaleString()}.`
             });
             
             // Auto-hide
             setTimeout(() => setNotification(prev => ({ ...prev, visible: false })), 6000);
         }
    });

    if (completedPledgeIds.length > 0) {
        setPledges(prev => prev.map(p => completedPledgeIds.includes(p.id) ? { ...p, status: 'Completed' } : p));
    }
  };

  const handleOnboardingComplete = (user: AppUser, details: ChurchDetails, useDemoData: boolean) => {
      setCurrentUser(user);
      setChurchDetails(details);
      
      if (useDemoData) {
          // Keep existing mock data but prepend the new admin user
          setUsers(prev => [user, ...prev]);
      } else {
          // Wipe data for a fresh start
          setUsers([user]);
          setFunds([{ 
            id: 'f1', 
            name: 'General Fund', 
            type: FundType.UNRESTRICTED, 
            balance: 0, 
            description: 'Day-to-day running costs' 
          }]);
          setTransactions([]);
          setPledges([]);
          setDonors([]);
      }
      setIsOnboarded(true);
      localStorage.setItem('churchcoin_onboarded', 'true');
  };

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
    const newTxns = [t, ...transactions];
    setTransactions(newTxns);
    setFunds(prev => prev.map(f => {
        if (f.id === t.fundId) return { ...f, balance: f.balance + (t.type === 'Income' ? t.amount : -t.amount) };
        return f;
    }));
    // Check if this new transaction fulfills a pledge
    if (t.pledgeId) checkPledgeFulfilment(newTxns, t.pledgeId);
  };

  const handleUpdateTransaction = (updatedT: Transaction) => {
      const oldT = transactions.find(t => t.id === updatedT.id);
      if (!oldT) return;
      
      const newTxns = transactions.map(t => t.id === updatedT.id ? updatedT : t);
      setTransactions(newTxns);
      
      setFunds(prev => prev.map(f => {
          let balanceChange = 0;
          if (f.id === oldT.fundId) balanceChange -= (oldT.type === 'Income' ? oldT.amount : -oldT.amount);
          if (f.id === updatedT.fundId) balanceChange += (updatedT.type === 'Income' ? updatedT.amount : -updatedT.amount);
          if (balanceChange !== 0) return { ...f, balance: f.balance + balanceChange };
          return f;
      }));

      // Check fulfilment if pledge ID exists or changed
      if (updatedT.pledgeId) checkPledgeFulfilment(newTxns, updatedT.pledgeId);
  };

  const handleBulkAdd = (newTransactions: Transaction[]) => {
      const mergedTxns = [...newTransactions, ...transactions];
      setTransactions(mergedTxns);
      
      const fundUpdates: Record<string, number> = {};
      const pledgeIdsToCheck = new Set<string>();

      newTransactions.forEach(t => {
          const change = t.type === 'Income' ? t.amount : -t.amount;
          fundUpdates[t.fundId] = (fundUpdates[t.fundId] || 0) + change;
          if (t.pledgeId) pledgeIdsToCheck.add(t.pledgeId);
      });

      setFunds(prev => prev.map(f => {
          if (fundUpdates[f.id]) return { ...f, balance: f.balance + fundUpdates[f.id] };
          return f;
      }));
      
      // Batch check pledges
      pledgeIdsToCheck.forEach(pid => checkPledgeFulfilment(mergedTxns, pid));
  };

  const handleBulkUpdateTransaction = (ids: string[], updates: Partial<Transaction>) => {
      const idsSet = new Set(ids);
      let updatedTxns = [...transactions];
      
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
      
      updatedTxns = transactions.map(t => idsSet.has(t.id) ? { ...t, ...updates } : t);
      setTransactions(updatedTxns);

      // If updating pledges, check them
      if (updates.pledgeId) {
           checkPledgeFulfilment(updatedTxns);
      }
  };

  const handleBatchUpdate = (updates: { id: string; changes: Partial<Transaction> }[]) => {
      const updatesMap = new Map(updates.map(u => [u.id, u.changes]));
      const fundDiffs: Record<string, number> = {};
      const affectedPledges = new Set<string>();

      transactions.forEach(t => {
          const changes = updatesMap.get(t.id);
          if (changes) {
              if (changes.fundId && changes.fundId !== t.fundId) {
                   const val = t.type === 'Income' ? t.amount : -t.amount;
                   fundDiffs[t.fundId] = (fundDiffs[t.fundId] || 0) - val;
                   fundDiffs[changes.fundId] = (fundDiffs[changes.fundId] || 0) + val;
              }
              if (changes.pledgeId || t.pledgeId) {
                  if (t.pledgeId) affectedPledges.add(t.pledgeId);
                  if (changes.pledgeId) affectedPledges.add(changes.pledgeId);
              }
          }
      });

      if (Object.keys(fundDiffs).length > 0) {
          setFunds(prev => prev.map(f => {
              if (fundDiffs[f.id]) return { ...f, balance: f.balance + fundDiffs[f.id] };
              return f;
          }));
      }
      
      const newTxns = transactions.map(t => {
          const changes = updatesMap.get(t.id);
          return changes ? { ...t, ...changes } : t;
      });
      setTransactions(newTxns);

      affectedPledges.forEach(pid => checkPledgeFulfilment(newTxns, pid));
  };

  const handleAddDonor = (newDonor: Donor) => setDonors(prev => [...prev, newDonor]);
  const handleUpdateDonor = (updatedDonor: Donor) => setDonors(prev => prev.map(d => d.id === updatedDonor.id ? updatedDonor : d));
  const handleBulkAddPledges = (newPledges: Pledge[]) => setPledges(prev => [...prev, ...newPledges]);
  const handleUpdatePledge = (updatedPledge: Pledge) => setPledges(prev => prev.map(p => p.id === updatedPledge.id ? updatedPledge : p));

  const handleBulkAddDonors = (newDonors: Donor[]) => {
      setDonors(prev => {
          const existingMap = new Map(prev.map(d => [d.id, d]));
          // Upsert logic
          newDonors.forEach(d => existingMap.set(d.id, d));
          return Array.from(existingMap.values());
      });
  };

  // Settings Handlers
  const handleUpdateUserRole = (userId: string, newRole: UserRole) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    if (currentUser.id === userId) setCurrentUser(prev => ({ ...prev, role: newRole }));
  };
  const handleAddUser = (user: AppUser) => setUsers(prev => [...prev, user]);
  const handleAddCategory = (cat: string) => !categories.includes(cat) && setCategories(prev => [...prev, cat]);
  const handleRemoveCategory = (cat: string) => setCategories(prev => prev.filter(c => c !== cat));
  const handleUpdateChurchDetails = (details: ChurchDetails) => setChurchDetails(details);
  const handleAddFund = (fund: Fund) => setFunds(prev => [...prev, fund]);
  const handleUpdateFund = (fund: Fund) => setFunds(prev => prev.map(f => f.id === fund.id ? fund : f));
  const handleRemoveFund = (fundId: string) => setFunds(prev => prev.filter(f => f.id !== fundId));

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard funds={funds} transactions={transactions} />;
      case 'transactions': return <TransactionManager transactions={transactions} funds={funds} pledges={pledges} categories={categories} onAddTransaction={handleAddTransaction} onUpdateTransaction={handleUpdateTransaction} onBulkAdd={handleBulkAdd} onBulkUpdate={handleBulkUpdateTransaction} onBatchUpdate={handleBatchUpdate} currentUser={currentUser} initialFundId={transactionFilterFundId} />;
      case 'funds': return <FundManager funds={funds} transactions={transactions} onViewLedger={handleViewFundLedger} />;
      case 'donors': return <DonorManager donors={donors} transactions={transactions} pledges={pledges} funds={funds} onAddDonor={handleAddDonor} onUpdateDonor={handleUpdateDonor} onAddPledge={p => setPledges(prev => [...prev, p])} onUpdatePledge={handleUpdatePledge} onUpdateTransaction={handleUpdateTransaction} currentUser={currentUser} churchDetails={churchDetails} />;
      case 'campaigns': return <Campaigns funds={funds} pledges={pledges} transactions={transactions} donors={donors} onAddPledge={p => setPledges(prev => [...prev, p])} onUpdatePledge={handleUpdatePledge} onBulkAddPledges={handleBulkAddPledges} onBulkAddDonors={handleBulkAddDonors} onUpdateTransaction={handleUpdateTransaction} currentUser={currentUser} />;
      case 'reports': return <Reports transactions={transactions} funds={funds} pledges={pledges} churchDetails={churchDetails} />;
      case 'copilot': return <AICoPilot transactions={transactions} funds={funds} />;
      case 'settings': return <Settings currentUser={currentUser} users={users} categories={categories} funds={funds} churchDetails={churchDetails} onUpdateUserRole={handleUpdateUserRole} onAddCategory={handleAddCategory} onRemoveCategory={handleRemoveCategory} onAddUser={handleAddUser} onUpdateChurchDetails={handleUpdateChurchDetails} onAddFund={handleAddFund} onUpdateFund={handleUpdateFund} onRemoveFund={handleRemoveFund} />;
      default: return <Dashboard funds={funds} transactions={transactions} />;
    }
  };

  if (!isOnboarded) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="flex bg-[#FDFCF8] min-h-screen font-sans text-slate-800 selection:bg-orange-100 selection:text-orange-900 animate-enter relative">
       {/* Global Toast Notification */}
       {notification.visible && (
            <div className="fixed top-4 right-4 z-[100] bg-emerald-900 text-emerald-50 shadow-2xl rounded-lg p-4 flex items-start gap-3 animate-enter max-w-sm border border-emerald-800">
                <div className="mt-0.5 w-6 h-6 rounded-full bg-emerald-800 flex items-center justify-center text-emerald-300 shrink-0 border border-emerald-700">
                    <CheckCircle2 size={14} strokeWidth={3} />
                </div>
                <div>
                    <h4 className="text-sm font-bold">{notification.title}</h4>
                    <p className="text-xs text-emerald-200 mt-0.5 leading-relaxed">{notification.message}</p>
                </div>
                <button 
                    onClick={() => setNotification(prev => ({ ...prev, visible: false }))} 
                    className="text-emerald-400 hover:text-white transition-colors ml-2"
                >
                    <X size={14} />
                </button>
            </div>
        )}

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
