
import React, { useState, useRef } from 'react';
import { AppUser, UserRole, ChurchDetails, Fund, FundType } from '../types';
import { ShieldAlert, Plus, X, UserCog, Tag, Save, Building2, Wallet, Users, Edit2, Trash2, Globe, Mail, MapPin, Hash, CalendarClock, Target, Upload, Image as ImageIcon } from 'lucide-react';

interface SettingsProps {
  currentUser: AppUser;
  users: AppUser[];
  funds: Fund[];
  categories: string[];
  churchDetails: ChurchDetails;
  onUpdateUserRole: (userId: string, newRole: UserRole) => void;
  onAddCategory: (category: string) => void;
  onRemoveCategory: (category: string) => void;
  onAddUser: (user: AppUser) => void;
  onUpdateChurchDetails: (details: ChurchDetails) => void;
  onAddFund: (fund: Fund) => void;
  onUpdateFund: (fund: Fund) => void;
  onRemoveFund: (fundId: string) => void;
}

const Settings: React.FC<SettingsProps> = ({ 
  currentUser, 
  users, 
  funds,
  categories, 
  churchDetails,
  onUpdateUserRole, 
  onAddCategory, 
  onRemoveCategory,
  onAddUser,
  onUpdateChurchDetails,
  onAddFund,
  onUpdateFund,
  onRemoveFund
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'funds' | 'categories' | 'users'>('general');
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [localChurchDetails, setLocalChurchDetails] = useState<ChurchDetails>(churchDetails);
  
  // Refs for file inputs
  const orgLogoInputRef = useRef<HTMLInputElement>(null);
  const fundLogoInputRef = useRef<HTMLInputElement>(null);

  // User State
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState<Partial<AppUser>>({ role: 'Guest' });

  // Category State
  const [newCategory, setNewCategory] = useState('');

  // Fund State
  const [showFundModal, setShowFundModal] = useState(false);
  const [editingFund, setEditingFund] = useState<Partial<Fund> | null>(null);

  // Access Control
  if (!['Admin', 'Finance Team'].includes(currentUser.role)) {
    return (
        <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] text-slate-400 animate-enter">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-6 text-slate-300">
                <ShieldAlert size={32} />
            </div>
            <h2 className="text-lg font-bold text-slate-800 font-display mb-2">Restricted Access</h2>
            <p className="text-sm max-w-sm text-center">System configuration is restricted to Administrators and Finance Team members.</p>
        </div>
    );
  }

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCategory.trim()) {
      onAddCategory(newCategory.trim());
      setNewCategory('');
    }
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (newUser.name && newUser.email) {
      onAddUser({
        id: Math.random().toString(36).substr(2, 9),
        name: newUser.name,
        email: newUser.email,
        role: newUser.role as UserRole,
        avatarUrl: undefined // Default avatar will be used
      });
      setShowAddUser(false);
      setNewUser({ role: 'Guest' });
    }
  };

  const handleSaveChurchDetails = (e: React.FormEvent) => {
      e.preventDefault();
      onUpdateChurchDetails(localChurchDetails);
      setIsEditingDetails(false);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'org' | 'fund') => {
    const file = e.target.files?.[0];
    if (file) {
        if (file.size > 5 * 1024 * 1024) {
            alert("File size too large. Please upload an image under 5MB.");
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            if (target === 'org') {
                setLocalChurchDetails(prev => ({ ...prev, logoUrl: base64 }));
            } else {
                setEditingFund(prev => ({ ...prev, logoUrl: base64 }));
            }
        };
        reader.readAsDataURL(file);
    }
  };

  const handleSaveFund = (e: React.FormEvent) => {
      e.preventDefault();
      if (editingFund?.name && editingFund.type) {
          if (editingFund.id) {
              onUpdateFund(editingFund as Fund);
          } else {
              onAddFund({
                  id: Math.random().toString(36).substr(2, 9),
                  name: editingFund.name,
                  type: editingFund.type as FundType,
                  balance: editingFund.balance || 0,
                  description: editingFund.description,
                  targetAmount: editingFund.targetAmount ? Number(editingFund.targetAmount) : undefined,
                  deadline: editingFund.deadline,
                  logoUrl: editingFund.logoUrl
              });
          }
          setShowFundModal(false);
          setEditingFund(null);
      }
  };

  const handleDeleteFund = (fund: Fund) => {
      if (fund.balance !== 0) {
          alert("Cannot delete a fund with a non-zero balance. Please transfer funds out before deleting.");
          return;
      }
      if (window.confirm(`Are you sure you want to delete '${fund.name}'? This action cannot be undone.`)) {
          onRemoveFund(fund.id);
      }
  };

  const calculateProgress = (fund: Fund) => {
      if (!fund.targetAmount || fund.targetAmount <= 0) return 0;
      return Math.min((fund.balance / fund.targetAmount) * 100, 100);
  };

  return (
    <div className="space-y-6 animate-enter max-w-5xl mx-auto pb-20">
      <header className="border-b border-slate-200 pb-6">
        <h2 className="text-3xl font-bold text-slate-900 font-display tracking-tight">Settings</h2>
        <p className="text-slate-500 mt-1 text-sm font-medium">System configuration and access control.</p>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-2 flex items-center gap-8 sticky top-0 z-10">
        {[
            { id: 'general', label: 'Organization', icon: Building2 },
            { id: 'funds', label: 'Funds & Campaigns', icon: Wallet },
            { id: 'categories', label: 'Categories', icon: Tag },
            { id: 'users', label: 'Users', icon: Users },
        ].map(tab => (
            <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-4 text-xs font-bold uppercase tracking-wide border-b-2 transition-all duration-200 ${
                    activeTab === tab.id 
                    ? 'border-slate-900 text-slate-900' 
                    : 'border-transparent text-slate-400 hover:text-slate-700'
                }`}
            >
                <tab.icon size={14} /> {tab.label}
            </button>
        ))}
      </div>

      <div className="py-6">
        
        {/* GENERAL TAB */}
        {activeTab === 'general' && (
             <div className="swiss-card max-w-4xl">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-600">
                            <Building2 size={16} />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">Organization Profile</h3>
                            <p className="text-[10px] text-slate-500">Legal and contact details for reports.</p>
                        </div>
                    </div>
                    {!isEditingDetails && (
                        <button onClick={() => { setLocalChurchDetails(churchDetails); setIsEditingDetails(true); }} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:border-slate-300 hover:text-slate-900 rounded text-xs font-bold uppercase tracking-wide transition-colors shadow-sm">
                            <Edit2 size={12} /> Edit Details
                        </button>
                    )}
                </div>
                
                <div className="p-8">
                    {isEditingDetails ? (
                        <form onSubmit={handleSaveChurchDetails} className="space-y-8">
                             <div className="flex items-start gap-6">
                                <div className="w-24 h-24 bg-slate-100 border border-slate-200 border-dashed rounded-lg flex items-center justify-center shrink-0 overflow-hidden relative group">
                                    {localChurchDetails.logoUrl ? (
                                        <img src={localChurchDetails.logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                                    ) : (
                                        <ImageIcon size={24} className="text-slate-300" />
                                    )}
                                    <input 
                                        type="file" 
                                        ref={orgLogoInputRef}
                                        className="hidden" 
                                        accept="image/*"
                                        onChange={(e) => handleLogoUpload(e, 'org')}
                                    />
                                    <div 
                                        className="absolute inset-0 bg-slate-900/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                        onClick={() => orgLogoInputRef.current?.click()}
                                    >
                                        <Upload size={16} className="text-white" />
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Organization Logo</label>
                                    <p className="text-xs text-slate-400 mb-2">Used on PDF schedules and reports. Recommended size: 200x200px.</p>
                                    <button 
                                        type="button" 
                                        onClick={() => orgLogoInputRef.current?.click()}
                                        className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
                                    >
                                        {localChurchDetails.logoUrl ? 'Change Logo' : 'Upload Logo'}
                                    </button>
                                </div>
                             </div>

                             <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                <div className="col-span-2">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Organization Name</label>
                                    <input 
                                        type="text" 
                                        value={localChurchDetails.name} 
                                        onChange={e => setLocalChurchDetails({...localChurchDetails, name: e.target.value})}
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-md text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none transition-shadow"
                                        required
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Charity Number</label>
                                    <div className="relative">
                                        <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input 
                                            type="text" 
                                            value={localChurchDetails.charityNumber || ''} 
                                            onChange={e => setLocalChurchDetails({...localChurchDetails, charityNumber: e.target.value})}
                                            className="w-full pl-9 p-3 bg-slate-50 border border-slate-200 rounded-md text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none font-mono"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Contact Email</label>
                                    <div className="relative">
                                        <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input 
                                            type="email" 
                                            value={localChurchDetails.email || ''} 
                                            onChange={e => setLocalChurchDetails({...localChurchDetails, email: e.target.value})}
                                            className="w-full pl-9 p-3 bg-slate-50 border border-slate-200 rounded-md text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Reporting Period</label>
                                    <div className="relative">
                                        <CalendarClock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <select 
                                            value={localChurchDetails.reportingPeriod || 'tax_year'}
                                            onChange={e => setLocalChurchDetails({...localChurchDetails, reportingPeriod: e.target.value as 'tax_year' | 'calendar_year'})}
                                            className="w-full pl-9 p-3 bg-slate-50 border border-slate-200 rounded-md text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none appearance-none cursor-pointer"
                                        >
                                            <option value="tax_year">UK Tax Year (April - April)</option>
                                            <option value="calendar_year">Calendar Year (Jan - Dec)</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="col-span-2">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Registered Address</label>
                                    <textarea 
                                        value={localChurchDetails.address || ''} 
                                        onChange={e => setLocalChurchDetails({...localChurchDetails, address: e.target.value})}
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-md text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none h-24 resize-none"
                                    />
                                </div>
                             </div>
                             
                             <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                                <button type="button" onClick={() => setIsEditingDetails(false)} className="px-5 py-2.5 text-xs font-bold uppercase text-slate-500 hover:bg-slate-50 rounded-md transition-colors">Cancel</button>
                                <button type="submit" className="btn-primary px-6 py-2.5 text-xs font-bold uppercase tracking-wide flex items-center gap-2">
                                    <Save size={14} /> Save Changes
                                </button>
                             </div>
                        </form>
                    ) : (
                        <div className="space-y-8">
                             <div className="flex items-start gap-6 pb-6 border-b border-slate-50">
                                {churchDetails.logoUrl && (
                                    <div className="w-20 h-20 bg-white border border-slate-100 rounded-lg p-1 shrink-0">
                                        <img src={churchDetails.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                                    </div>
                                )}
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-2"><Building2 size={12}/> Legal Name</p>
                                    <p className="text-2xl font-bold text-slate-900 font-display">{churchDetails.name}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-2"><Hash size={12}/> Charity Number</p>
                                    <p className="text-sm font-medium text-slate-700 font-mono bg-slate-50 inline-block px-2 py-1 rounded">{churchDetails.charityNumber || 'N/A'}</p>
                                </div>
                                
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-2"><Mail size={12}/> Contact Email</p>
                                    <p className="text-sm font-medium text-slate-700">{churchDetails.email || 'N/A'}</p>
                                </div>
                                
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-2"><CalendarClock size={12}/> Reporting Period</p>
                                    <p className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                        {churchDetails.reportingPeriod === 'calendar_year' ? 'Calendar Year (Jan-Dec)' : 'UK Tax Year (Apr-Apr)'}
                                    </p>
                                </div>
                                
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-2"><MapPin size={12}/> Address</p>
                                    <p className="text-sm font-medium text-slate-700 whitespace-pre-wrap leading-relaxed">{churchDetails.address || 'N/A'}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
             </div>
        )}

        {/* FUNDS TAB */}
        {activeTab === 'funds' && (
            <div className="swiss-card overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-600">
                            <Wallet size={16} />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">Fund Management</h3>
                            <p className="text-[10px] text-slate-500">Configure restricted and unrestricted funds.</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => { setEditingFund({ type: FundType.UNRESTRICTED }); setShowFundModal(true); }}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-md text-xs font-bold uppercase tracking-wide hover:bg-slate-800 transition-colors shadow-sm"
                    >
                        <Plus size={12} /> Add Fund
                    </button>
                </div>
                
                {/* Stats Summary */}
                <div className="grid grid-cols-3 gap-6 p-6 border-b border-slate-100 bg-white">
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Total Funds</p>
                        <p className="text-xl font-bold text-slate-900 font-mono">{funds.length}</p>
                    </div>
                    <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                        <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide mb-1">Unrestricted Balance</p>
                        <p className="text-xl font-bold text-emerald-900 font-mono">
                            £{funds.filter(f => f.type === FundType.UNRESTRICTED).reduce((acc, f) => acc + f.balance, 0).toLocaleString()}
                        </p>
                    </div>
                    <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                        <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-1">Restricted Balance</p>
                        <p className="text-xl font-bold text-amber-900 font-mono">
                            £{funds.filter(f => f.type !== FundType.UNRESTRICTED).reduce((acc, f) => acc + f.balance, 0).toLocaleString()}
                        </p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left ledger-table">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-200">
                                <th className="px-6 py-4 pl-8">Fund Name</th>
                                <th className="px-6 py-4">Type</th>
                                <th className="px-6 py-4 text-right">Balance</th>
                                <th className="px-6 py-4 w-1/3">Target & Progress</th>
                                <th className="px-6 py-4 text-right pr-8">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {funds.map(fund => {
                                const progress = calculateProgress(fund);
                                return (
                                    <tr key={fund.id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-6 py-5 pl-8">
                                            <div className="flex items-center gap-3">
                                                 {fund.logoUrl && <img src={fund.logoUrl} className="w-8 h-8 rounded-md object-cover border border-slate-200" alt="Fund Logo" />}
                                                 <div>
                                                    <div className="font-bold text-slate-900 text-sm">{fund.name}</div>
                                                    <div className="text-xs text-slate-500 truncate max-w-[200px] mt-0.5">{fund.description}</div>
                                                 </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                             <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                                                fund.type === FundType.UNRESTRICTED ? 'bg-slate-100 text-slate-600 border-slate-200' : 
                                                fund.type === FundType.RESTRICTED ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                                'bg-indigo-50 text-indigo-700 border-indigo-100'
                                             }`}>
                                                 {fund.type}
                                             </span>
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <div className="font-mono text-sm font-bold text-slate-800">£{fund.balance.toLocaleString()}</div>
                                        </td>
                                        <td className="px-6 py-5">
                                            {fund.targetAmount ? (
                                                <div className="w-full max-w-xs">
                                                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                                                        <span>{progress.toFixed(0)}%</span>
                                                        <span className="font-mono text-slate-400">Target: £{fund.targetAmount.toLocaleString()}</span>
                                                    </div>
                                                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                        <div 
                                                            className={`h-full rounded-full ${progress >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                                                            style={{ width: `${progress}%` }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-400 italic">No target set</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-5 text-right pr-8">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => { setEditingFund(fund); setShowFundModal(true); }} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="Edit">
                                                    <Edit2 size={14} />
                                                </button>
                                                <button onClick={() => handleDeleteFund(fund)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors" title="Delete">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {/* USERS TAB */}
        {activeTab === 'users' && (
            <div className="swiss-card overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">User Permissions</h3>
                    <button 
                        onClick={() => setShowAddUser(true)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:border-slate-300 rounded text-xs font-bold uppercase tracking-wide transition-colors"
                    >
                        <Plus size={12} /> Invite
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left ledger-table">
                        <thead>
                            <tr>
                                <th className="px-6 pl-6">User</th>
                                <th className="px-6">Role</th>
                                <th className="px-6 text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                            <tr key={user.id} className="group hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 border-b border-slate-50">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                                    {user.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full rounded-full object-cover"/> : user.name.charAt(0)}
                                    </div>
                                    <div>
                                    <div className="font-bold text-slate-800 text-sm">{user.name}</div>
                                    <div className="font-mono text-[10px] text-slate-400">{user.email}</div>
                                    </div>
                                </div>
                                </td>
                                <td className="px-6 py-4 border-b border-slate-50">
                                <select 
                                    value={user.role}
                                    onChange={(e) => onUpdateUserRole(user.id, e.target.value as UserRole)}
                                    disabled={user.id === currentUser.id}
                                    className="bg-transparent border border-transparent hover:border-slate-200 hover:bg-white rounded px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:ring-1 focus:ring-slate-900 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    <option value="Admin">Admin</option>
                                    <option value="Finance Team">Finance Team</option>
                                    <option value="Pastorate">Pastorate</option>
                                    <option value="Guest">Guest</option>
                                </select>
                                </td>
                                <td className="px-6 py-4 border-b border-slate-50 text-right">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-100">
                                    Active
                                </span>
                                </td>
                            </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {/* CATEGORIES TAB */}
        {activeTab === 'categories' && (
            <div className="swiss-card flex flex-col max-w-3xl">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2 font-display text-sm uppercase tracking-wide">
                        <Tag size={16} /> Financial Codes
                    </h3>
                </div>
                
                <div className="p-6 flex-1 bg-white">
                    <form onSubmit={handleAddCategory} className="flex gap-2 mb-6">
                        <input 
                            type="text" 
                            value={newCategory}
                            onChange={(e) => setNewCategory(e.target.value)}
                            placeholder="New Category Name..."
                            className="flex-1 bg-slate-50 border border-slate-200 rounded text-sm px-3 py-2 outline-none focus:ring-1 focus:ring-slate-900 transition-colors"
                        />
                        <button 
                            type="submit" 
                            disabled={!newCategory.trim()}
                            className="px-4 py-2 bg-slate-900 text-white rounded text-xs font-bold uppercase hover:bg-slate-800 disabled:opacity-50 transition-colors"
                        >
                            Add
                        </button>
                    </form>

                    <div className="flex flex-wrap gap-2">
                    {categories.map(category => (
                        <div key={category} className="group flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-md shadow-sm hover:border-slate-300 transition-colors">
                        <span className="text-xs font-medium text-slate-700">{category}</span>
                        <button 
                            onClick={() => onRemoveCategory(category)}
                            className="text-slate-300 hover:text-rose-600 transition-colors"
                        >
                            <X size={12} />
                        </button>
                        </div>
                    ))}
                    </div>
                    
                    <div className="mt-8 p-4 bg-orange-50 border border-orange-100 rounded-lg">
                    <p className="text-xs text-orange-900 leading-relaxed">
                        <strong>Note:</strong> Deleting a category will not remove it from historical transactions, but it will no longer be available for new entries or the AI auto-categorization.
                    </p>
                    </div>
                </div>
            </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddUser && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-lg shadow-2xl border border-slate-200 animate-enter">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-lg">
                    <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">Invite User</h3>
                    <button onClick={() => setShowAddUser(false)} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
                </div>
                <form onSubmit={handleCreateUser} className="p-6 space-y-4">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Name</label>
                        <input 
                            type="text" 
                            required
                            value={newUser.name || ''} 
                            onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Email</label>
                        <input 
                            type="email" 
                            required
                            value={newUser.email || ''} 
                            onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Role</label>
                        <select 
                            value={newUser.role}
                            onChange={(e) => setNewUser({...newUser, role: e.target.value as UserRole})}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                        >
                            <option value="Admin">Admin</option>
                            <option value="Finance Team">Finance Team</option>
                            <option value="Pastorate">Pastorate</option>
                            <option value="Guest">Guest</option>
                        </select>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => setShowAddUser(false)} className="px-4 py-2 text-xs font-bold uppercase text-slate-500 hover:bg-slate-100 rounded">Cancel</button>
                        <button type="submit" className="px-6 py-2 bg-slate-900 text-white rounded text-xs font-bold uppercase tracking-wide hover:bg-slate-800 flex items-center gap-2">
                            <Plus size={14} /> Add User
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Fund Modal */}
      {showFundModal && (
          <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-lg shadow-2xl border border-slate-200 animate-enter">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-lg">
                    <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">
                        {editingFund?.id ? 'Edit Fund / Campaign' : 'Create Fund / Campaign'}
                    </h3>
                    <button onClick={() => setShowFundModal(false)} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
                </div>
                <form onSubmit={handleSaveFund} className="p-6 space-y-4">
                     {/* Fund Logo Upload */}
                    <div className="flex items-center gap-4">
                        <div 
                            className="w-16 h-16 bg-slate-100 border border-slate-200 border-dashed rounded-lg flex items-center justify-center shrink-0 overflow-hidden relative group cursor-pointer"
                            onClick={() => fundLogoInputRef.current?.click()}
                        >
                             {editingFund?.logoUrl ? (
                                <img src={editingFund.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                            ) : (
                                <ImageIcon size={20} className="text-slate-300" />
                            )}
                             <input 
                                type="file" 
                                ref={fundLogoInputRef}
                                className="hidden" 
                                accept="image/*"
                                onChange={(e) => handleLogoUpload(e, 'fund')}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">Campaign Logo</label>
                            <p className="text-[10px] text-slate-400">Optional. For specific reports.</p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Fund Name *</label>
                        <input 
                            type="text" 
                            required
                            value={editingFund?.name || ''} 
                            onChange={(e) => setEditingFund({...editingFund, name: e.target.value})}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                        />
                    </div>
                    
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Type *</label>
                        <select 
                            value={editingFund?.type || FundType.UNRESTRICTED}
                            onChange={(e) => setEditingFund({...editingFund, type: e.target.value as FundType})}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none"
                        >
                            <option value={FundType.UNRESTRICTED}>Unrestricted (General)</option>
                            <option value={FundType.RESTRICTED}>Restricted (Campaign)</option>
                            <option value={FundType.DESIGNATED}>Designated</option>
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                             <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Target Amount (£)</label>
                             <input 
                                type="number" 
                                value={editingFund?.targetAmount || ''} 
                                onChange={(e) => setEditingFund({...editingFund, targetAmount: parseFloat(e.target.value)})}
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none font-mono"
                                placeholder="Optional"
                             />
                        </div>
                        <div>
                             <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Deadline</label>
                             <input 
                                type="date" 
                                value={editingFund?.deadline || ''} 
                                onChange={(e) => setEditingFund({...editingFund, deadline: e.target.value})}
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none font-mono"
                             />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Description</label>
                        <textarea 
                            value={editingFund?.description || ''} 
                            onChange={(e) => setEditingFund({...editingFund, description: e.target.value})}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded text-sm focus:bg-white focus:ring-1 focus:ring-slate-900 outline-none h-20 resize-none"
                            placeholder="Purpose of this fund..."
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => setShowFundModal(false)} className="px-4 py-2 text-xs font-bold uppercase text-slate-500 hover:bg-slate-100 rounded">Cancel</button>
                        <button type="submit" className="px-6 py-2 bg-slate-900 text-white rounded text-xs font-bold uppercase tracking-wide hover:bg-slate-800 flex items-center gap-2">
                            <Save size={14} /> Save Fund
                        </button>
                    </div>
                </form>
            </div>
          </div>
      )}
    </div>
  );
};

export default Settings;