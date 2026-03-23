
import React, { useState, useRef } from 'react';
import { AppUser, FundCreateInput, UserRole, ChurchDetails, Fund, FundType, Invitation, InvitationCreateInput } from '../types';
import { ShieldAlert, Plus, X, UserCog, Tag, Save, Building2, Wallet, Users, Edit2, Trash2, Globe, Mail, MapPin, Hash, CalendarClock, Target, Upload, Image as ImageIcon, Landmark, Clock, Copy, Check } from 'lucide-react';

import BankConnectionsSettings from './BankConnectionsSettings';

interface SettingsProps {
  currentUser: AppUser;
  users: AppUser[];
  funds: Fund[];
  categories: string[];
  churchDetails: ChurchDetails;
  pendingInvitations: Invitation[];
  onUpdateUserRole: (userId: string, newRole: UserRole) => void;
  onAddCategory: (category: string) => void;
  onRemoveCategory: (category: string) => void;
  onInviteUser: (invitation: InvitationCreateInput) => void;
  onCancelInvitation: (invitationId: string) => void;
  onUpdateChurchDetails: (details: ChurchDetails) => void;
  onAddFund: (fund: FundCreateInput) => void;
  onUpdateFund: (fund: Fund) => void;
  onRemoveFund: (fundId: string) => void;
}

const Settings: React.FC<SettingsProps> = ({
  currentUser,
  users,
  funds,
  categories,
  churchDetails,
  pendingInvitations,
  onUpdateUserRole,
  onAddCategory,
  onRemoveCategory,
  onInviteUser,
  onCancelInvitation,
  onUpdateChurchDetails,
  onAddFund,
  onUpdateFund,
  onRemoveFund
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'funds' | 'categories' | 'users' | 'bank'>('general');
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [localChurchDetails, setLocalChurchDetails] = useState<ChurchDetails>(churchDetails);
  
  // Refs for file inputs
  const orgLogoInputRef = useRef<HTMLInputElement>(null);
  const fundLogoInputRef = useRef<HTMLInputElement>(null);

  // User/Invitation State
  const [showAddUser, setShowAddUser] = useState(false);
  const [newInvitation, setNewInvitation] = useState<InvitationCreateInput>({ email: '', role: 'Guest' });
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<{ email: string; role: string } | null>(null);
  const [copiedNewInvite, setCopiedNewInvite] = useState(false);

  // Category State
  const [newCategory, setNewCategory] = useState('');

  // Fund State
  const [showFundModal, setShowFundModal] = useState(false);
  const [editingFund, setEditingFund] = useState<Partial<Fund> | null>(null);

  // Access Control
  if (!['Admin', 'Finance Team'].includes(currentUser.role)) {
    return (
        <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] text-grey-mid animate-enter">
            <div className="w-16 h-16 bg-grey-light rounded-2xl flex items-center justify-center mb-6 text-slate-300">
                <ShieldAlert size={32} />
            </div>
            <h2 className="text-lg font-bold text-ink font-mono mb-2">Restricted Access</h2>
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

  const handleCreateInvitation = (e: React.FormEvent) => {
    e.preventDefault();
    if (newInvitation.email) {
      onInviteUser(newInvitation);
      // Show success state with copy option
      setInviteSuccess({ email: newInvitation.email, role: newInvitation.role });
      setCopiedNewInvite(false);
    } else {
      alert("Please provide an email address.");
    }
  };

  const handleCloseInviteModal = () => {
    setShowAddUser(false);
    setNewInvitation({ email: '', role: 'Guest' });
    setInviteSuccess(null);
    setCopiedNewInvite(false);
  };

  const formatExpiryDate = (expiresAt: number) => {
    const days = Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
    if (days <= 0) return 'Expired';
    if (days === 1) return '1 day left';
    return `${days} days left`;
  };

  const generateInviteMessage = (email: string, role: string) => {
    const appUrl = window.location.origin;
    return `Hi there!

You've been invited to join ${churchDetails.name} on ChurchCoin as a ${role} member.

To accept this invitation:
1. Go to ${appUrl}
2. Sign up or log in using this email address: ${email}
3. You'll be automatically added to our organization

This invitation expires in 30 days.

See you soon!
${currentUser.name}`;
  };

  const handleCopyInvite = async (invitation: Invitation) => {
    const message = generateInviteMessage(invitation.email, invitation.role);
    try {
      await navigator.clipboard.writeText(message);
      setCopiedInviteId(invitation._id);
      setTimeout(() => setCopiedInviteId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCopyNewInvite = async (email: string, role: string) => {
    const message = generateInviteMessage(email, role);
    try {
      await navigator.clipboard.writeText(message);
      return true;
    } catch (err) {
      console.error('Failed to copy:', err);
      return false;
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
        const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
        if (!allowedTypes.includes(file.type)) {
            alert("Unsupported image type. Please upload PNG/JPEG/WEBP/GIF (SVG is not allowed).");
            return;
        }
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
          if (editingFund._id) {
              onUpdateFund(editingFund as Fund);
          } else {
              onAddFund({
                  name: editingFund.name,
                  type: editingFund.type as FundType,
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
          onRemoveFund(fund._id);
      }
  };

  const calculateProgress = (fund: Fund) => {
      if (!fund.targetAmount || fund.targetAmount <= 0) return 0;
      return Math.min((fund.balance / fund.targetAmount) * 100, 100);
  };

  return (
    <div className="space-y-6 animate-enter max-w-5xl mx-auto pb-20">
      <header className="border-b border-ledger pb-6">
        <h2 className="text-3xl font-bold text-ink font-mono tracking-tight">Settings</h2>
        <p className="text-grey-mid mt-1 text-sm font-medium">System configuration and access control.</p>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-ledger px-2 flex items-center gap-4 md:gap-8 sticky top-0 z-10 overflow-x-auto scrollbar-hide">
        {[
            { id: 'general', label: 'Organization', icon: Building2 },
            { id: 'funds', label: 'Funds & Campaigns', icon: Wallet },
            { id: 'categories', label: 'Categories', icon: Tag },
            { id: 'users', label: 'Users', icon: Users },
            { id: 'bank', label: 'Bank Connections', icon: Landmark },
        ].map(tab => (
            <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-4 text-xs font-bold uppercase tracking-wide border-b-2 transition-all duration-200 ${
                    activeTab === tab.id 
                    ? 'border-ink text-ink' 
                    : 'border-transparent text-grey-mid hover:text-grey-dark'
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
                <div className="p-6 border-b border-ledger flex justify-between items-center bg-paper/50">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white border border-ledger rounded-lg flex items-center justify-center text-grey-dark">
                            <Building2 size={16} />
                        </div>
                        <div>
                            <h3 className="font-bold text-ink text-sm uppercase tracking-wide">Organization Profile</h3>
                            <p className="text-[10px] text-grey-mid">Legal and contact details for reports.</p>
                        </div>
                    </div>
                    {!isEditingDetails && (
                        <button onClick={() => { setLocalChurchDetails(churchDetails); setIsEditingDetails(true); }} className="flex items-center gap-2 px-4 py-2 bg-white border border-ledger text-grey-dark hover:border-grey-mid hover:text-ink rounded text-xs font-bold uppercase tracking-wide transition-colors shadow-sm">
                            <Edit2 size={12} /> Edit Details
                        </button>
                    )}
                </div>
                
                <div className="p-8">
                    {isEditingDetails ? (
                        <form onSubmit={handleSaveChurchDetails} className="space-y-8">
                             <div className="flex items-start gap-6">
                                <div className="w-24 h-24 bg-grey-light border border-ledger border-dashed rounded-lg flex items-center justify-center shrink-0 overflow-hidden relative group">
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
                                        className="absolute inset-0 bg-ink/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                        onClick={() => orgLogoInputRef.current?.click()}
                                    >
                                        <Upload size={16} className="text-white" />
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1.5">Organization Logo</label>
                                    <p className="text-xs text-grey-mid mb-2">Used on PDF schedules and reports. Recommended size: 200x200px.</p>
                                    <button 
                                        type="button" 
                                        onClick={() => orgLogoInputRef.current?.click()}
                                        className="text-xs font-bold text-sage hover:text-sage-dark"
                                    >
                                        {localChurchDetails.logoUrl ? 'Change Logo' : 'Upload Logo'}
                                    </button>
                                </div>
                             </div>

                             <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                <div className="col-span-2">
                                    <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1.5">Organization Name</label>
                                    <input 
                                        type="text" 
                                        value={localChurchDetails.name} 
                                        onChange={e => setLocalChurchDetails({...localChurchDetails, name: e.target.value})}
                                        className="w-full p-3 bg-paper border border-ledger rounded-md text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none transition-shadow"
                                        required
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1.5">Charity Number</label>
                                    <div className="relative">
                                        <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-mid" />
                                        <input 
                                            type="text" 
                                            value={localChurchDetails.charityNumber || ''} 
                                            onChange={e => setLocalChurchDetails({...localChurchDetails, charityNumber: e.target.value})}
                                            className="w-full pl-9 p-3 bg-paper border border-ledger rounded-md text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none font-mono"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1.5">Contact Email</label>
                                    <div className="relative">
                                        <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-mid" />
                                        <input 
                                            type="email" 
                                            value={localChurchDetails.email || ''} 
                                            onChange={e => setLocalChurchDetails({...localChurchDetails, email: e.target.value})}
                                            className="w-full pl-9 p-3 bg-paper border border-ledger rounded-md text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1.5">Reporting Period</label>
                                    <div className="relative">
                                        <CalendarClock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-mid" />
                                        <select 
                                            value={localChurchDetails.reportingPeriod || 'tax_year'}
                                            onChange={e => setLocalChurchDetails({...localChurchDetails, reportingPeriod: e.target.value as 'tax_year' | 'calendar_year'})}
                                            className="w-full pl-9 p-3 bg-paper border border-ledger rounded-md text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none appearance-none cursor-pointer"
                                        >
                                            <option value="tax_year">UK Tax Year (April - April)</option>
                                            <option value="calendar_year">Calendar Year (Jan - Dec)</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="col-span-2">
                                    <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1.5">Registered Address</label>
                                    <textarea 
                                        value={localChurchDetails.address || ''} 
                                        onChange={e => setLocalChurchDetails({...localChurchDetails, address: e.target.value})}
                                        className="w-full p-3 bg-paper border border-ledger rounded-md text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none h-24 resize-none"
                                    />
                                </div>
                             </div>
                             
                             <div className="flex justify-end gap-3 pt-6 border-t border-ledger">
                                <button type="button" onClick={() => setIsEditingDetails(false)} className="px-5 py-2.5 text-xs font-bold uppercase text-grey-mid hover:bg-paper rounded-md transition-colors">Cancel</button>
                                <button type="submit" className="btn-primary px-6 py-2.5 text-xs font-bold uppercase tracking-wide flex items-center gap-2">
                                    <Save size={14} /> Save Changes
                                </button>
                             </div>
                        </form>
                    ) : (
                        <div className="space-y-8">
                             <div className="flex items-start gap-6 pb-6 border-b border-grey-light">
                                {churchDetails.logoUrl && (
                                    <div className="w-20 h-20 bg-white border border-ledger rounded-lg p-1 shrink-0">
                                        <img src={churchDetails.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                                    </div>
                                )}
                                <div>
                                    <p className="text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-2 flex items-center gap-2"><Building2 size={12}/> Legal Name</p>
                                    <p className="text-2xl font-bold text-ink font-mono">{churchDetails.name}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <p className="text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-2 flex items-center gap-2"><Hash size={12}/> Charity Number</p>
                                    <p className="text-sm font-medium text-grey-dark font-mono bg-paper inline-block px-2 py-1 rounded">{churchDetails.charityNumber || 'N/A'}</p>
                                </div>
                                
                                <div>
                                    <p className="text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-2 flex items-center gap-2"><Mail size={12}/> Contact Email</p>
                                    <p className="text-sm font-medium text-grey-dark">{churchDetails.email || 'N/A'}</p>
                                </div>
                                
                                <div>
                                    <p className="text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-2 flex items-center gap-2"><CalendarClock size={12}/> Reporting Period</p>
                                    <p className="text-sm font-medium text-grey-dark flex items-center gap-2">
                                        {churchDetails.reportingPeriod === 'calendar_year' ? 'Calendar Year (Jan-Dec)' : 'UK Tax Year (Apr-Apr)'}
                                    </p>
                                </div>
                                
                                <div>
                                    <p className="text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-2 flex items-center gap-2"><MapPin size={12}/> Address</p>
                                    <p className="text-sm font-medium text-grey-dark whitespace-pre-wrap leading-relaxed">{churchDetails.address || 'N/A'}</p>
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
                <div className="p-6 border-b border-ledger flex justify-between items-center bg-paper/50">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white border border-ledger rounded-lg flex items-center justify-center text-grey-dark">
                            <Wallet size={16} />
                        </div>
                        <div>
                            <h3 className="font-bold text-ink text-sm uppercase tracking-wide">Fund Management</h3>
                            <p className="text-[10px] text-grey-mid">Configure restricted and unrestricted funds.</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => { setEditingFund({ type: FundType.UNRESTRICTED }); setShowFundModal(true); }}
                        className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-md text-xs font-bold uppercase tracking-wide hover:bg-charcoal transition-colors shadow-sm"
                    >
                        <Plus size={12} /> Add Fund
                    </button>
                </div>
                
                {/* Stats Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 p-6 border-b border-ledger bg-white">
                    <div className="p-4 bg-paper rounded-lg border border-ledger">
                        <p className="text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Total Funds</p>
                        <p className="text-xl font-bold text-ink font-mono">{funds.length}</p>
                    </div>
                    <div className="p-4 bg-sage-light rounded-lg border border-sage/30">
                        <p className="text-[10px] font-bold text-sage-dark uppercase tracking-wide mb-1">Unrestricted Balance</p>
                        <p className="text-xl font-bold text-sage-dark font-mono">
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

                {/* Mobile Cards View */}
                <div className="md:hidden p-4 space-y-3">
                    {funds.map(fund => {
                        const progress = calculateProgress(fund);
                        return (
                            <div key={fund._id} className="bg-white p-4 rounded-lg border border-ledger">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        {fund.logoUrl && <img src={fund.logoUrl} className="w-10 h-10 rounded-md object-cover border border-ledger" alt="Fund Logo" />}
                                        <div>
                                            <div className="font-bold text-ink text-sm">{fund.name}</div>
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border mt-1 ${
                                                fund.type === FundType.UNRESTRICTED ? 'bg-grey-light text-grey-dark border-ledger' :
                                                fund.type === FundType.RESTRICTED ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                                'bg-sage-light text-sage-dark border-sage/30'
                                            }`}>
                                                {fund.type}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={() => { setEditingFund(fund); setShowFundModal(true); }} className="p-2 text-grey-mid hover:text-sage hover:bg-sage-light rounded transition-colors" title="Edit">
                                            <Edit2 size={16} />
                                        </button>
                                        <button onClick={() => handleDeleteFund(fund)} className="p-2 text-grey-mid hover:text-error hover:bg-error-light rounded transition-colors" title="Delete">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                                <div className="text-xs text-grey-mid mb-3 line-clamp-2">{fund.description}</div>
                                <div className="flex justify-between items-center mb-3">
                                    <span className="text-[10px] font-bold text-grey-mid uppercase">Balance</span>
                                    <span className="font-mono text-lg font-bold text-ink">£{fund.balance.toLocaleString()}</span>
                                </div>
                                {fund.targetAmount && (
                                    <div>
                                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-grey-mid mb-1.5">
                                            <span>{progress.toFixed(0)}%</span>
                                            <span className="font-mono">Target: £{fund.targetAmount.toLocaleString()}</span>
                                        </div>
                                        <div className="h-2 w-full bg-grey-light rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full ${progress >= 100 ? 'bg-sage-light0' : 'bg-amber-500'}`} style={{ width: `${progress}%` }}></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left ledger-table">
                        <thead>
                            <tr className="bg-paper/50 border-b border-ledger">
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
                                    <tr key={fund._id} className="hover:bg-paper transition-colors group">
                                        <td className="px-6 py-5 pl-8">
                                            <div className="flex items-center gap-3">
                                                 {fund.logoUrl && <img src={fund.logoUrl} className="w-8 h-8 rounded-md object-cover border border-ledger" alt="Fund Logo" />}
                                                 <div>
                                                    <div className="font-bold text-ink text-sm">{fund.name}</div>
                                                    <div className="text-xs text-grey-mid truncate max-w-[200px] mt-0.5">{fund.description}</div>
                                                 </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                             <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                                                fund.type === FundType.UNRESTRICTED ? 'bg-grey-light text-grey-dark border-ledger' :
                                                fund.type === FundType.RESTRICTED ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                                'bg-sage-light text-sage-dark border-sage/30'
                                             }`}>
                                                 {fund.type}
                                             </span>
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <div className="font-mono text-sm font-bold text-ink">£{fund.balance.toLocaleString()}</div>
                                        </td>
                                        <td className="px-6 py-5">
                                            {fund.targetAmount ? (
                                                <div className="w-full max-w-xs">
                                                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-grey-mid mb-1.5">
                                                        <span>{progress.toFixed(0)}%</span>
                                                        <span className="font-mono text-grey-mid">Target: £{fund.targetAmount.toLocaleString()}</span>
                                                    </div>
                                                    <div className="h-1.5 w-full bg-grey-light rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${progress >= 100 ? 'bg-sage-light0' : 'bg-amber-500'}`}
                                                            style={{ width: `${progress}%` }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-grey-mid italic">No target set</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-5 text-right pr-8">
                                            <div className="flex justify-end gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => { setEditingFund(fund); setShowFundModal(true); }} className="p-1.5 text-grey-mid hover:text-sage hover:bg-sage-light rounded transition-colors" title="Edit">
                                                    <Edit2 size={14} />
                                                </button>
                                                <button onClick={() => handleDeleteFund(fund)} className="p-1.5 text-grey-mid hover:text-error hover:bg-error-light rounded transition-colors" title="Delete">
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
            <div className="space-y-6">
                {/* Active Users */}
                <div className="swiss-card overflow-hidden">
                    <div className="p-6 border-b border-ledger flex justify-between items-center bg-paper/50">
                        <h3 className="font-bold text-ink text-sm uppercase tracking-wide">Active Users</h3>
                        <button
                            onClick={() => setShowAddUser(true)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-ledger text-grey-dark hover:border-grey-mid rounded text-xs font-bold uppercase tracking-wide transition-colors"
                        >
                            <Plus size={12} /> Invite
                        </button>
                    </div>
                    {/* Mobile Cards View */}
                    <div className="md:hidden p-4 space-y-3">
                        {users.map(user => (
                            <div key={user._id} className="bg-white p-4 rounded-lg border border-ledger">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-ledger flex items-center justify-center text-sm font-bold text-grey-dark">
                                            {user.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full rounded-full object-cover"/> : user.name.charAt(0)}
                                        </div>
                                        <div>
                                            <div className="font-bold text-ink text-sm">{user.name}</div>
                                            <div className="font-mono text-[10px] text-grey-mid">{user.email}</div>
                                        </div>
                                    </div>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-sage-light text-sage-dark border border-sage/30">
                                        Active
                                    </span>
                                </div>
                                <div className="mt-3 pt-3 border-t border-grey-light">
                                    <label className="text-[10px] font-bold text-grey-mid uppercase tracking-wide">Role</label>
                                    <select
                                        value={user.role}
                                        onChange={(e) => onUpdateUserRole(user._id, e.target.value as UserRole)}
                                        disabled={user._id === currentUser._id}
                                        className="w-full mt-1 bg-paper border border-ledger hover:border-grey-mid rounded px-3 py-2 text-sm font-medium text-grey-dark outline-none focus:ring-1 focus:ring-ink cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                    >
                                        <option value="Admin">Admin</option>
                                        <option value="Finance Team">Finance Team</option>
                                        <option value="Pastorate">Pastorate</option>
                                        <option value="Guest">Guest</option>
                                    </select>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
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
                                <tr key={user._id} className="group hover:bg-paper transition-colors">
                                    <td className="px-6 py-4 border-b border-grey-light">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-ledger flex items-center justify-center text-xs font-bold text-grey-dark">
                                        {user.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full rounded-full object-cover"/> : user.name.charAt(0)}
                                        </div>
                                        <div>
                                        <div className="font-bold text-ink text-sm">{user.name}</div>
                                        <div className="font-mono text-[10px] text-grey-mid">{user.email}</div>
                                        </div>
                                    </div>
                                    </td>
                                    <td className="px-6 py-4 border-b border-grey-light">
                                    <select
                                        value={user.role}
                                        onChange={(e) => onUpdateUserRole(user._id, e.target.value as UserRole)}
                                        disabled={user._id === currentUser._id}
                                        className="bg-transparent border border-transparent hover:border-ledger hover:bg-white rounded px-2 py-1 text-xs font-medium text-grey-dark outline-none focus:ring-1 focus:ring-ink cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                    >
                                        <option value="Admin">Admin</option>
                                        <option value="Finance Team">Finance Team</option>
                                        <option value="Pastorate">Pastorate</option>
                                        <option value="Guest">Guest</option>
                                    </select>
                                    </td>
                                    <td className="px-6 py-4 border-b border-grey-light text-right">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-sage-light text-sage-dark border border-sage/30">
                                        Active
                                    </span>
                                    </td>
                                </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Pending Invitations */}
                {pendingInvitations.length > 0 && (
                    <div className="swiss-card overflow-hidden">
                        <div className="p-6 border-b border-ledger bg-amber-50/50">
                            <div className="flex items-center gap-2">
                                <Clock size={16} className="text-amber-600" />
                                <h3 className="font-bold text-amber-900 text-sm uppercase tracking-wide">Pending Invitations</h3>
                                <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold">
                                    {pendingInvitations.length}
                                </span>
                            </div>
                            <p className="text-xs text-amber-700 mt-1">These users have been invited but haven't signed up yet.</p>
                        </div>
                        {/* Mobile Cards View */}
                        <div className="md:hidden p-4 space-y-3">
                            {pendingInvitations.map(invitation => (
                                <div key={invitation._id} className="bg-white p-4 rounded-lg border border-amber-200">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700">
                                                <Mail size={16} />
                                            </div>
                                            <div>
                                                <div className="font-mono text-sm text-grey-dark break-all">{invitation.email}</div>
                                                <div className="text-xs text-grey-mid mt-0.5">{invitation.role}</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-xs text-amber-700 mb-3">
                                        Expires: {formatExpiryDate(invitation.expiresAt)}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleCopyInvite(invitation)}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-sage-light text-sage-dark rounded text-xs font-bold uppercase tracking-wide hover:bg-sage/20 transition-colors"
                                        >
                                            {copiedInviteId === invitation._id ? (
                                                <><Check size={14} /> Copied!</>
                                            ) : (
                                                <><Copy size={14} /> Copy Invite</>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => onCancelInvitation(invitation._id)}
                                            className="px-4 py-2 text-error border border-error/30 rounded text-xs font-bold uppercase tracking-wide hover:bg-error-light transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left ledger-table">
                                <thead>
                                    <tr>
                                        <th className="px-6 pl-6">Email</th>
                                        <th className="px-6">Role</th>
                                        <th className="px-6">Expires</th>
                                        <th className="px-6 text-right pr-6">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pendingInvitations.map(invitation => (
                                    <tr key={invitation._id} className="group hover:bg-paper transition-colors">
                                        <td className="px-6 py-4 border-b border-grey-light">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-xs font-bold text-amber-700">
                                                    <Mail size={14} />
                                                </div>
                                                <div className="font-mono text-sm text-grey-dark">{invitation.email}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 border-b border-grey-light">
                                            <span className="text-xs font-medium text-grey-dark">{invitation.role}</span>
                                        </td>
                                        <td className="px-6 py-4 border-b border-grey-light">
                                            <span className="text-xs text-grey-mid">{formatExpiryDate(invitation.expiresAt)}</span>
                                        </td>
                                        <td className="px-6 py-4 border-b border-grey-light text-right pr-6">
                                            <div className="flex items-center justify-end gap-3">
                                                <button
                                                    onClick={() => handleCopyInvite(invitation)}
                                                    className="flex items-center gap-1.5 text-xs font-bold text-sage hover:text-sage-dark transition-colors"
                                                    title="Copy invite message"
                                                >
                                                    {copiedInviteId === invitation._id ? (
                                                        <>
                                                            <Check size={14} />
                                                            Copied!
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Copy size={14} />
                                                            Copy Invite
                                                        </>
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => onCancelInvitation(invitation._id)}
                                                    className="text-xs font-bold text-error hover:text-error-dark transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* CATEGORIES TAB */}
        {activeTab === 'categories' && (
            <div className="swiss-card flex flex-col max-w-3xl">
                <div className="p-6 border-b border-ledger flex justify-between items-center bg-paper/50">
                    <h3 className="font-bold text-ink flex items-center gap-2 font-mono text-sm uppercase tracking-wide">
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
                            className="flex-1 bg-paper border border-ledger rounded text-sm px-3 py-2 outline-none focus:ring-1 focus:ring-ink transition-colors"
                        />
                        <button
                            type="submit"
                            disabled={!newCategory.trim()}
                            className="px-4 py-2 bg-ink text-white rounded text-xs font-bold uppercase hover:bg-charcoal disabled:opacity-50 transition-colors"
                        >
                            Add
                        </button>
                    </form>

                    <div className="flex flex-wrap gap-2">
                    {categories.map(category => (
                        <div key={category} className="group flex items-center gap-2 px-3 py-1.5 bg-white border border-ledger rounded-md shadow-sm hover:border-grey-mid transition-colors">
                        <span className="text-xs font-medium text-grey-dark">{category}</span>
                        <button
                            onClick={() => onRemoveCategory(category)}
                            className="text-slate-300 hover:text-error transition-colors"
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

        {/* BANK CONNECTIONS TAB */}
        {activeTab === 'bank' && (
            <BankConnectionsSettings funds={funds} />
        )}

      </div>

      {/* Invite User Modal */}
      {showAddUser && (
        <div className="fixed inset-0 bg-ink/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-lg shadow-2xl border border-ledger animate-enter">
                <div className="p-4 border-b border-ledger flex justify-between items-center bg-paper rounded-t-lg">
                    <h3 className="font-bold text-ink text-sm uppercase tracking-wide">
                        {inviteSuccess ? 'Invitation Created' : 'Invite User'}
                    </h3>
                    <button onClick={handleCloseInviteModal} className="text-grey-mid hover:text-grey-dark"><X size={16}/></button>
                </div>

                {inviteSuccess ? (
                    // Success state with copy option
                    <div className="p-6 space-y-4">
                        <div className="text-center">
                            <div className="w-12 h-12 bg-sage-light rounded-full flex items-center justify-center mx-auto mb-3">
                                <Check size={24} className="text-sage" />
                            </div>
                            <h4 className="font-bold text-ink">Invitation Sent!</h4>
                            <p className="text-sm text-grey-mid mt-1">
                                Invited <span className="font-mono text-ink">{inviteSuccess.email}</span> as {inviteSuccess.role}
                            </p>
                        </div>

                        <div className="p-4 bg-paper border border-ledger rounded-lg">
                            <p className="text-xs font-bold text-grey-mid uppercase tracking-wide mb-2">Share Instructions</p>
                            <p className="text-xs text-grey-dark leading-relaxed mb-3">
                                Copy the invite message below and send it to the user via email, WhatsApp, or any messenger.
                            </p>
                            <button
                                onClick={async () => {
                                    const copied = await handleCopyNewInvite(inviteSuccess.email, inviteSuccess.role);
                                    if (copied) setCopiedNewInvite(true);
                                }}
                                className={`w-full py-2.5 rounded text-sm font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-all ${
                                    copiedNewInvite
                                        ? 'bg-sage-light text-sage-dark border border-sage'
                                        : 'bg-ink text-white hover:bg-charcoal'
                                }`}
                            >
                                {copiedNewInvite ? (
                                    <>
                                        <Check size={16} />
                                        Copied to Clipboard!
                                    </>
                                ) : (
                                    <>
                                        <Copy size={16} />
                                        Copy Invite Message
                                    </>
                                )}
                            </button>
                        </div>

                        <div className="flex justify-end pt-2">
                            <button
                                onClick={handleCloseInviteModal}
                                className="px-6 py-2 bg-white border border-ledger text-grey-dark rounded text-xs font-bold uppercase tracking-wide hover:bg-grey-light"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                ) : (
                    // Form state
                    <form onSubmit={handleCreateInvitation} className="p-6 space-y-4">
                        <div>
                            <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Email Address</label>
                            <input
                                type="email"
                                required
                                value={newInvitation.email}
                                onChange={(e) => setNewInvitation({...newInvitation, email: e.target.value})}
                                placeholder="user@example.com"
                                className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none"
                            />
                            <p className="text-[10px] text-grey-mid mt-1">The user will need to sign up with this email address.</p>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Role</label>
                            <select
                                value={newInvitation.role}
                                onChange={(e) => setNewInvitation({...newInvitation, role: e.target.value as UserRole})}
                                className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none"
                            >
                                <option value="Admin">Admin</option>
                                <option value="Finance Team">Finance Team</option>
                                <option value="Pastorate">Pastorate</option>
                                <option value="Guest">Guest</option>
                            </select>
                        </div>
                        <div className="p-3 bg-amber-50 border border-amber-100 rounded-md">
                            <p className="text-xs text-amber-800">
                                The invitation will expire in 30 days. After creating, you'll get a message to share with the user.
                            </p>
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button type="button" onClick={handleCloseInviteModal} className="px-4 py-2 text-xs font-bold uppercase text-grey-mid hover:bg-grey-light rounded">Cancel</button>
                            <button type="submit" className="px-6 py-2 bg-ink text-white rounded text-xs font-bold uppercase tracking-wide hover:bg-charcoal flex items-center gap-2">
                                <Mail size={14} /> Create Invitation
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
      )}

      {/* Fund Modal */}
      {showFundModal && (
          <div className="fixed inset-0 bg-ink/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-lg shadow-2xl border border-ledger animate-enter">
                <div className="p-4 border-b border-ledger flex justify-between items-center bg-paper rounded-t-lg">
                    <h3 className="font-bold text-ink text-sm uppercase tracking-wide">
                        {editingFund?._id ? 'Edit Fund / Campaign' : 'Create Fund / Campaign'}
                    </h3>
                    <button onClick={() => setShowFundModal(false)} className="text-grey-mid hover:text-grey-dark"><X size={16}/></button>
                </div>
                <form onSubmit={handleSaveFund} className="p-6 space-y-4">
                     {/* Fund Logo Upload */}
                    <div className="flex items-center gap-4">
                        <div 
                            className="w-16 h-16 bg-grey-light border border-ledger border-dashed rounded-lg flex items-center justify-center shrink-0 overflow-hidden relative group cursor-pointer"
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
                            <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-0.5">Campaign Logo</label>
                            <p className="text-[10px] text-grey-mid">Optional. For specific reports.</p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Fund Name *</label>
                        <input 
                            type="text" 
                            required
                            value={editingFund?.name || ''} 
                            onChange={(e) => setEditingFund({...editingFund, name: e.target.value})}
                            className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none"
                        />
                    </div>
                    
                    <div>
                        <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Type *</label>
                        <select 
                            value={editingFund?.type || FundType.UNRESTRICTED}
                            onChange={(e) => setEditingFund({...editingFund, type: e.target.value as FundType})}
                            className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none"
                        >
                            <option value={FundType.UNRESTRICTED}>Unrestricted (General)</option>
                            <option value={FundType.RESTRICTED}>Restricted (Campaign)</option>
                            <option value={FundType.DESIGNATED}>Designated</option>
                        </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                             <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Target Amount (£)</label>
                             <input 
                                type="number" 
                                value={editingFund?.targetAmount || ''} 
                                onChange={(e) => setEditingFund({...editingFund, targetAmount: parseFloat(e.target.value)})}
                                className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none font-mono"
                                placeholder="Optional"
                             />
                        </div>
                        <div>
                             <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Deadline</label>
                             <input 
                                type="date" 
                                value={editingFund?.deadline || ''} 
                                onChange={(e) => setEditingFund({...editingFund, deadline: e.target.value})}
                                className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none font-mono"
                             />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-grey-mid uppercase tracking-wide mb-1">Description</label>
                        <textarea 
                            value={editingFund?.description || ''} 
                            onChange={(e) => setEditingFund({...editingFund, description: e.target.value})}
                            className="w-full p-2.5 bg-paper border border-ledger rounded text-sm focus:bg-white focus:ring-1 focus:ring-ink outline-none h-20 resize-none"
                            placeholder="Purpose of this fund..."
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => setShowFundModal(false)} className="px-4 py-2 text-xs font-bold uppercase text-grey-mid hover:bg-grey-light rounded">Cancel</button>
                        <button type="submit" className="px-6 py-2 bg-ink text-white rounded text-xs font-bold uppercase tracking-wide hover:bg-charcoal flex items-center gap-2">
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
