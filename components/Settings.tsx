
import React, { useState, useRef } from 'react';
import { AppUser, FundCreateInput, UserRole, ChurchDetails, Fund, FundType, Invitation, InvitationCreateInput } from '../types';
import { ShieldAlert, Plus, X, Tag, Save, Building2, Wallet, Users, Edit2, Trash2, Mail, MapPin, Hash, CalendarClock, Upload, Image as ImageIcon, Landmark, Clock, Copy, Check } from 'lucide-react';

import BankConnectionsSettings from './BankConnectionsSettings';
import { notify } from '../lib/notifications';

// Refined Ledger tone palette (dot badges)
const TONE = {
  sage: { fg: '#557555', mid: '#6b8e6b' },
  amber: { fg: '#a9743f', mid: '#c79a5f' },
  error: { fg: '#b53d3d', mid: '#c64545' },
  neutral: { fg: '#78716c', mid: '#a8a29e' },
} as const;
type Tone = keyof typeof TONE;

const FUND_TYPE_TONE: Record<string, Tone> = {
  [FundType.UNRESTRICTED]: 'neutral',
  [FundType.RESTRICTED]: 'amber',
  [FundType.DESIGNATED]: 'sage',
};

const DotBadge: React.FC<{ tone: Tone; children: React.ReactNode }> = ({ tone, children }) => (
  <span
    className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.05em] whitespace-nowrap"
    style={{ color: TONE[tone].fg }}
  >
    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: TONE[tone].mid }} />
    {children}
  </span>
);

// Section card with Refined Ledger header (icon chip + title + sub + optional action)
const SectionCard: React.FC<{
  icon: React.ElementType;
  title: string;
  sub?: string;
  action?: React.ReactNode;
  pad?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ icon: Icon, title, sub, action, pad = true, className = '', children }) => (
  <div className={`swiss-card-static overflow-hidden ${className}`}>
    <div className="flex items-center justify-between gap-4 px-6 py-[18px] border-b border-grey-light bg-[#fcfbf9]">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-[9px] bg-white border border-ledger text-grey-dark shrink-0">
          <Icon size={16} strokeWidth={1.9} />
        </span>
        <div>
          <h3 className="text-[13.5px] font-bold text-ink uppercase tracking-[0.02em]">{title}</h3>
          {sub && <p className="text-[11.5px] text-grey-mid mt-0.5">{sub}</p>}
        </div>
      </div>
      {action}
    </div>
    <div className={pad ? 'p-6' : ''}>{children}</div>
  </div>
);

const inputClass =
  'w-full p-3 bg-white border border-ledger rounded-[10px] text-sm text-ink focus:ring-1 focus:ring-ink outline-none transition-shadow';
const labelClass = 'block text-[10.5px] font-bold text-grey-mid uppercase tracking-[0.08em] mb-1.5';
const primaryBtnClass =
  'inline-flex items-center gap-2 px-3.5 py-2 rounded-[9px] bg-ink text-white text-xs font-bold uppercase tracking-[0.04em] hover:bg-charcoal transition-colors disabled:opacity-50';
const secondaryBtnClass =
  'inline-flex items-center gap-2 px-3.5 py-2 rounded-[9px] bg-white border border-ledger text-grey-dark text-xs font-bold uppercase tracking-[0.04em] hover:border-grey-mid hover:text-ink transition-colors';

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
  type SettingsTab = 'general' | 'funds' | 'categories' | 'users' | 'bank';
  const getInitialTab = (): SettingsTab => {
    if (typeof window === 'undefined') return 'general';
    const tab = new URLSearchParams(window.location.search).get('tab');
    return ['general', 'funds', 'categories', 'users', 'bank'].includes(tab || '')
      ? tab as SettingsTab
      : 'general';
  };

  const [activeTab, setActiveTab] = useState<SettingsTab>(getInitialTab);
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
            <div className="w-16 h-16 bg-grey-light border border-ledger rounded-2xl flex items-center justify-center mb-6 text-grey-mid">
                <ShieldAlert size={32} strokeWidth={1.7} />
            </div>
            <h2 className="text-lg font-bold text-ink mb-2">Restricted Access</h2>
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
      notify("Error", "Please provide an email address.");
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
            notify("Error", "Unsupported image type. Please upload PNG/JPEG/WEBP/GIF (SVG is not allowed).");
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            notify("Error", "File size too large. Please upload an image under 5MB.");
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
          notify("Error", "Cannot delete a fund with a non-zero balance. Please transfer funds out before deleting.");
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

  // Display field for the read-only Organization view
  const Field: React.FC<{ icon: React.ElementType; label: string; value: React.ReactNode; mono?: boolean }> = ({ icon: Icon, label, value, mono }) => (
    <div>
      <p className="text-[10.5px] font-bold text-grey-mid uppercase tracking-[0.08em] flex items-center gap-1.5">
        <Icon size={12} strokeWidth={2} /> {label}
      </p>
      <p className={`text-[14.5px] font-medium text-ink mt-1.5 whitespace-pre-wrap leading-relaxed ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );

  return (
    <div className="space-y-[22px] animate-enter max-w-7xl mx-auto pb-20">
      <header className="swiss-card-static p-6 md:p-[26px]">
        <h2 className="text-[32px] leading-tight font-bold text-ink tracking-tight">Settings</h2>
        <p className="text-grey-mid mt-2 text-[15px] font-medium">Organization profile, funds, categories, users, and bank connections</p>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-ledger sticky top-0 z-10 bg-paper overflow-x-auto scrollbar-hide">
        {[
            { id: 'general', label: 'Organization', icon: Building2 },
            { id: 'funds', label: 'Funds & Campaigns', icon: Wallet },
            { id: 'categories', label: 'Categories', icon: Tag },
            { id: 'users', label: 'Users', icon: Users },
            { id: 'bank', label: 'Bank Connections', icon: Landmark },
        ].map(tab => (
            <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as SettingsTab)}
                className={`inline-flex items-center gap-2 px-4 py-3 -mb-px text-xs font-bold uppercase tracking-[0.05em] whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === tab.id
                    ? 'border-ink text-ink'
                    : 'border-transparent text-grey-mid hover:text-grey-dark'
                }`}
            >
                <tab.icon size={14} strokeWidth={1.9} /> {tab.label}
            </button>
        ))}
      </div>

      <div>

        {/* GENERAL TAB */}
        {activeTab === 'general' && (
            <SectionCard
                icon={Building2}
                title="Organization profile"
                sub="Legal and contact details for reports."
                className="max-w-4xl"
                action={!isEditingDetails ? (
                    <button onClick={() => { setLocalChurchDetails(churchDetails); setIsEditingDetails(true); }} className={secondaryBtnClass}>
                        <Edit2 size={13} strokeWidth={1.9} className="text-grey-mid" /> Edit details
                    </button>
                ) : undefined}
            >
                    {isEditingDetails ? (
                        <form onSubmit={handleSaveChurchDetails} className="space-y-8">
                             <div className="flex items-start gap-6">
                                <div className="w-[88px] h-[88px] bg-paper border border-ledger border-dashed rounded-[14px] flex items-center justify-center shrink-0 overflow-hidden relative group">
                                    {localChurchDetails.logoUrl ? (
                                        <img src={localChurchDetails.logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                                    ) : (
                                        <ImageIcon size={24} className="text-grey-mid" strokeWidth={1.7} />
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
                                    <label className={labelClass}>Organization Logo</label>
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
                                    <label className={labelClass}>Organization Name</label>
                                    <input
                                        type="text"
                                        value={localChurchDetails.name}
                                        onChange={e => setLocalChurchDetails({...localChurchDetails, name: e.target.value})}
                                        className={inputClass}
                                        required
                                    />
                                </div>

                                <div>
                                    <label className={labelClass}>Charity Number</label>
                                    <div className="relative">
                                        <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-mid" />
                                        <input
                                            type="text"
                                            value={localChurchDetails.charityNumber || ''}
                                            onChange={e => setLocalChurchDetails({...localChurchDetails, charityNumber: e.target.value})}
                                            className={`${inputClass} pl-9 font-mono`}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className={labelClass}>Contact Email</label>
                                    <div className="relative">
                                        <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-mid" />
                                        <input
                                            type="email"
                                            value={localChurchDetails.email || ''}
                                            onChange={e => setLocalChurchDetails({...localChurchDetails, email: e.target.value})}
                                            className={`${inputClass} pl-9`}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className={labelClass}>Reporting Period</label>
                                    <div className="relative">
                                        <CalendarClock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-grey-mid" />
                                        <select
                                            value={localChurchDetails.reportingPeriod || 'tax_year'}
                                            onChange={e => setLocalChurchDetails({...localChurchDetails, reportingPeriod: e.target.value as 'tax_year' | 'calendar_year'})}
                                            className={`${inputClass} pl-9 appearance-none cursor-pointer`}
                                        >
                                            <option value="tax_year">UK Tax Year (April - April)</option>
                                            <option value="calendar_year">Calendar Year (Jan - Dec)</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="col-span-2">
                                    <label className={labelClass}>Registered Address</label>
                                    <textarea
                                        value={localChurchDetails.address || ''}
                                        onChange={e => setLocalChurchDetails({...localChurchDetails, address: e.target.value})}
                                        className={`${inputClass} h-24 resize-none`}
                                    />
                                </div>
                             </div>

                             <div className="flex justify-end gap-3 pt-6 border-t border-grey-light">
                                <button type="button" onClick={() => setIsEditingDetails(false)} className="px-5 py-2.5 text-xs font-bold uppercase tracking-[0.04em] text-grey-mid hover:bg-paper rounded-[9px] transition-colors">Cancel</button>
                                <button type="submit" className={`${primaryBtnClass} px-5 py-2.5`}>
                                    <Save size={14} strokeWidth={1.9} /> Save Changes
                                </button>
                             </div>
                        </form>
                    ) : (
                        <div className="flex flex-col sm:flex-row items-start gap-6">
                            <div className="w-[88px] h-[88px] bg-paper border border-ledger rounded-[14px] flex items-center justify-center shrink-0 overflow-hidden">
                                {churchDetails.logoUrl ? (
                                    <img src={churchDetails.logoUrl} alt="Logo" className="w-full h-full object-contain p-1.5" />
                                ) : (
                                    <Building2 size={28} className="text-grey-mid" strokeWidth={1.5} />
                                )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-[22px] flex-1">
                                <Field icon={Building2} label="Registered name" value={churchDetails.name} />
                                <Field icon={Hash} label="Charity number" value={churchDetails.charityNumber || 'N/A'} mono />
                                <Field icon={Mail} label="Email" value={churchDetails.email || 'N/A'} />
                                <Field
                                    icon={CalendarClock}
                                    label="Reporting period"
                                    value={churchDetails.reportingPeriod === 'calendar_year' ? 'Calendar Year (Jan-Dec)' : 'UK Tax Year (Apr-Apr)'}
                                />
                                <Field icon={MapPin} label="Address" value={churchDetails.address || 'N/A'} />
                            </div>
                        </div>
                    )}
            </SectionCard>
        )}

        {/* FUNDS TAB */}
        {activeTab === 'funds' && (
            <SectionCard
                icon={Wallet}
                title="Fund management"
                sub="Add, edit, or archive funds and campaigns."
                pad={false}
                action={(
                    <button
                        onClick={() => { setEditingFund({ type: FundType.UNRESTRICTED }); setShowFundModal(true); }}
                        className={primaryBtnClass}
                    >
                        <Plus size={14} strokeWidth={2} /> New fund
                    </button>
                )}
            >
                {/* Stats Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 border-b border-grey-light">
                    {[
                        { label: 'Total funds', value: `${funds.length}`, tone: undefined as Tone | undefined },
                        {
                            label: 'Unrestricted balance',
                            value: `£${funds.filter(f => f.type === FundType.UNRESTRICTED).reduce((acc, f) => acc + f.balance, 0).toLocaleString()}`,
                            tone: 'sage' as Tone,
                        },
                        {
                            label: 'Restricted balance',
                            value: `£${funds.filter(f => f.type !== FundType.UNRESTRICTED).reduce((acc, f) => acc + f.balance, 0).toLocaleString()}`,
                            tone: 'amber' as Tone,
                        },
                    ].map((s, i) => (
                        <div key={s.label} className={`relative px-6 py-5 ${i < 2 ? 'sm:border-r border-[#efeee9]' : ''}`}>
                            {s.tone && (
                                <span className="absolute left-0 top-[18px] bottom-[18px] w-[3px] rounded-r" style={{ background: TONE[s.tone].mid }} />
                            )}
                            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-grey-mid whitespace-nowrap">{s.label}</p>
                            <p className="font-mono text-[22px] font-bold tracking-tight mt-1.5" style={{ color: s.tone ? TONE[s.tone].fg : '#1c1917' }}>
                                {s.value}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Mobile Cards View */}
                <div className="md:hidden p-4 space-y-3">
                    {funds.map(fund => {
                        const progress = calculateProgress(fund);
                        return (
                            <div key={fund._id} className="bg-white p-4 rounded-[10px] border border-ledger">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        {fund.logoUrl && <img src={fund.logoUrl} className="w-10 h-10 rounded-[9px] object-cover border border-ledger" alt="Fund Logo" />}
                                        <div>
                                            <div className="font-semibold text-ink text-[14.5px]">{fund.name}</div>
                                            <div className="mt-1">
                                                <DotBadge tone={FUND_TYPE_TONE[fund.type] ?? 'neutral'}>{fund.type}</DotBadge>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={() => { setEditingFund(fund); setShowFundModal(true); }} className="p-2 text-grey-mid hover:text-ink hover:bg-paper rounded-[9px] transition-colors" title="Edit">
                                            <Edit2 size={16} strokeWidth={1.9} />
                                        </button>
                                        <button onClick={() => handleDeleteFund(fund)} className="p-2 text-grey-mid hover:text-error hover:bg-error-light rounded-[9px] transition-colors" title="Delete">
                                            <Trash2 size={16} strokeWidth={1.9} />
                                        </button>
                                    </div>
                                </div>
                                <div className="text-xs text-grey-mid mb-3 line-clamp-2">{fund.description}</div>
                                <div className="flex justify-between items-center mb-3">
                                    <span className="text-[10.5px] font-bold text-grey-mid uppercase tracking-[0.08em]">Balance</span>
                                    <span className="font-mono text-lg font-bold text-ink">£{fund.balance.toLocaleString()}</span>
                                </div>
                                {fund.targetAmount && (
                                    <div>
                                        <div className="flex justify-between text-[10.5px] font-bold uppercase tracking-[0.08em] text-grey-mid mb-1.5">
                                            <span>{progress.toFixed(0)}%</span>
                                            <span className="font-mono">Target: £{fund.targetAmount.toLocaleString()}</span>
                                        </div>
                                        <div className="h-[7px] w-full bg-[#eceae5] rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full ${progress >= 100 ? 'bg-[#6b8e6b]' : 'bg-[#c79a5f]'}`} style={{ width: `${progress}%` }}></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Desktop rows */}
                <div className="hidden md:block">
                    <div className="grid grid-cols-[2fr_1.2fr_1fr_1.4fr_80px] gap-x-3.5 px-6 py-3 border-b border-grey-light">
                        {['Fund', 'Type', 'Balance', 'Target & progress', ''].map((h, i) => (
                            <div key={i} className={`text-[11px] font-bold uppercase tracking-[0.08em] text-grey-mid ${i === 2 ? 'text-right' : ''}`}>{h}</div>
                        ))}
                    </div>
                    {funds.map((fund, idx) => {
                        const progress = calculateProgress(fund);
                        return (
                            <div
                                key={fund._id}
                                className={`grid grid-cols-[2fr_1.2fr_1fr_1.4fr_80px] gap-x-3.5 items-center px-6 py-3.5 group hover:bg-[#fcfbf9] transition-colors ${idx < funds.length - 1 ? 'border-b border-grey-light' : ''}`}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    {fund.logoUrl && <img src={fund.logoUrl} className="w-8 h-8 rounded-[8px] object-cover border border-ledger shrink-0" alt="Fund Logo" />}
                                    <div className="min-w-0">
                                        <div className="text-[14.5px] font-semibold text-ink truncate">{fund.name}</div>
                                        {fund.description && <div className="text-xs text-grey-mid truncate max-w-[240px] mt-0.5">{fund.description}</div>}
                                    </div>
                                </div>
                                <div><DotBadge tone={FUND_TYPE_TONE[fund.type] ?? 'neutral'}>{fund.type}</DotBadge></div>
                                <div className="font-mono text-sm font-bold text-ink text-right">£{fund.balance.toLocaleString()}</div>
                                <div>
                                    {fund.targetAmount ? (
                                        <div className="w-full max-w-[220px]">
                                            <div className="flex justify-between text-[10.5px] font-bold uppercase tracking-[0.08em] text-grey-mid mb-1.5">
                                                <span>{progress.toFixed(0)}%</span>
                                                <span className="font-mono">£{fund.targetAmount.toLocaleString()}</span>
                                            </div>
                                            <div className="h-[6px] w-full bg-[#eceae5] rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${progress >= 100 ? 'bg-[#6b8e6b]' : 'bg-[#c79a5f]'}`}
                                                    style={{ width: `${progress}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    ) : (
                                        <span className="text-xs text-grey-mid italic">No target set</span>
                                    )}
                                </div>
                                <div className="flex justify-end gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => { setEditingFund(fund); setShowFundModal(true); }} className="p-1.5 text-grey-mid hover:text-ink rounded-[8px] transition-colors" title="Edit">
                                        <Edit2 size={14} strokeWidth={1.9} />
                                    </button>
                                    <button onClick={() => handleDeleteFund(fund)} className="p-1.5 text-grey-mid hover:text-error rounded-[8px] transition-colors" title="Delete">
                                        <Trash2 size={14} strokeWidth={1.9} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </SectionCard>
        )}

        {/* USERS TAB */}
        {activeTab === 'users' && (
            <div className="space-y-[18px]">
                {/* Active Users */}
                <SectionCard
                    icon={Users}
                    title="Active users"
                    sub="People with access to this organization."
                    pad={false}
                    action={(
                        <button onClick={() => setShowAddUser(true)} className={primaryBtnClass}>
                            <Plus size={14} strokeWidth={2} /> Invite
                        </button>
                    )}
                >
                    {users.map((user, idx) => (
                        <div
                            key={user._id}
                            className={`flex flex-col sm:grid sm:grid-cols-[1fr_180px_90px] gap-3 sm:gap-x-3.5 sm:items-center px-6 py-3.5 ${idx < users.length - 1 ? 'border-b border-grey-light' : ''}`}
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="w-[38px] h-[38px] rounded-full bg-[#f1ede8] text-[#5b4a3f] inline-flex items-center justify-center text-[13px] font-bold font-mono shrink-0 overflow-hidden">
                                    {user.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full rounded-full object-cover" /> : user.name.charAt(0)}
                                </span>
                                <div className="min-w-0">
                                    <div className="text-[14.5px] font-semibold text-ink truncate">{user.name}</div>
                                    <div className="text-[12.5px] text-grey-mid truncate">{user.email}</div>
                                </div>
                            </div>
                            <div>
                                <select
                                    value={user.role}
                                    onChange={(e) => onUpdateUserRole(user._id, e.target.value as UserRole)}
                                    disabled={user._id === currentUser._id}
                                    className="w-full sm:w-auto bg-white border border-ledger hover:border-grey-mid rounded-[9px] px-3 py-1.5 text-xs font-medium text-grey-dark outline-none focus:ring-1 focus:ring-ink cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    <option value="Admin">Admin</option>
                                    <option value="Finance Team">Finance Team</option>
                                    <option value="Pastorate">Pastorate</option>
                                    <option value="Guest">Guest</option>
                                </select>
                            </div>
                            <div className="sm:flex sm:justify-end">
                                <DotBadge tone="sage">Active</DotBadge>
                            </div>
                        </div>
                    ))}
                </SectionCard>

                {/* Pending Invitations */}
                {pendingInvitations.length > 0 && (
                    <SectionCard
                        icon={Mail}
                        title="Pending invitations"
                        sub="Awaiting acceptance — these users haven't signed up yet."
                        pad={false}
                    >
                        {pendingInvitations.map((invitation, idx) => (
                            <div
                                key={invitation._id}
                                className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-3.5 ${idx < pendingInvitations.length - 1 ? 'border-b border-grey-light' : ''}`}
                            >
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold text-ink break-all">{invitation.email}</div>
                                    <div className="text-xs text-grey-mid mt-0.5 flex items-center gap-2">
                                        <span>{invitation.role}</span>
                                        <span className="inline-flex items-center gap-1 text-[#a9743f]">
                                            <Clock size={11} strokeWidth={2} /> {formatExpiryDate(invitation.expiresAt)}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={() => handleCopyInvite(invitation)}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[9px] border border-ledger bg-white text-[12.5px] font-semibold text-ink hover:border-grey-mid transition-colors"
                                        title="Copy invite message"
                                    >
                                        {copiedInviteId === invitation._id ? (
                                            <><Check size={14} strokeWidth={1.9} className="text-sage" /> Copied!</>
                                        ) : (
                                            <><Copy size={14} strokeWidth={1.9} className="text-grey-mid" /> Copy link</>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => onCancelInvitation(invitation._id)}
                                        className="px-2 py-2 text-[12.5px] font-bold uppercase tracking-[0.04em] text-error hover:opacity-80 transition-opacity"
                                    >
                                        Revoke
                                    </button>
                                </div>
                            </div>
                        ))}
                    </SectionCard>
                )}
            </div>
        )}

        {/* CATEGORIES TAB */}
        {activeTab === 'categories' && (
            <SectionCard
                icon={Tag}
                title="Transaction categories"
                sub="Used to classify income and expenditure across reports."
                className="max-w-3xl"
            >
                    <form onSubmit={handleAddCategory} className="flex gap-2.5 mb-5">
                        <input
                            type="text"
                            value={newCategory}
                            onChange={(e) => setNewCategory(e.target.value)}
                            placeholder="Add a category…"
                            className="flex-1 max-w-xs h-10 px-3.5 bg-white border border-ledger rounded-[10px] text-sm text-ink outline-none focus:ring-1 focus:ring-ink transition-shadow"
                        />
                        <button
                            type="submit"
                            disabled={!newCategory.trim()}
                            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-[10px] bg-ink text-white text-[13.5px] font-semibold hover:bg-charcoal disabled:opacity-50 transition-colors"
                        >
                            <Plus size={15} strokeWidth={2} /> Add
                        </button>
                    </form>

                    <div className="flex flex-wrap gap-2">
                    {categories.map(category => (
                        <span key={category} className="inline-flex items-center gap-2 px-3 py-[7px] bg-[#f3f1ed] border border-ledger rounded-full text-[13px] font-medium text-grey-dark">
                        {category}
                        <button
                            onClick={() => onRemoveCategory(category)}
                            className="text-grey-mid hover:text-error transition-colors inline-flex"
                        >
                            <X size={13} strokeWidth={2} />
                        </button>
                        </span>
                    ))}
                    </div>

                    <div className="mt-6 bg-[#fcf7f0] border border-[#ecd8bd] rounded-[10px] px-3.5 py-[11px] text-xs text-[#7a5a30] leading-relaxed">
                        <strong className="font-bold">Note:</strong> Deleting a category will not remove it from historical transactions, but it will no longer be available for new entries or the AI auto-categorization.
                    </div>
            </SectionCard>
        )}

        {/* BANK CONNECTIONS TAB */}
        {activeTab === 'bank' && (
            <BankConnectionsSettings funds={funds} />
        )}

      </div>

      {/* Invite User Modal */}
      {showAddUser && (
        <div className="fixed inset-0 bg-ink/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-xl shadow-soft-lg border border-ledger animate-enter">
                <div className="px-5 py-4 border-b border-grey-light flex justify-between items-center bg-[#fcfbf9] rounded-t-xl">
                    <h3 className="text-[13.5px] font-bold text-ink uppercase tracking-[0.02em]">
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

                        <div className="p-4 bg-paper border border-ledger rounded-[10px]">
                            <p className="text-[10.5px] font-bold text-grey-mid uppercase tracking-[0.08em] mb-2">Share Instructions</p>
                            <p className="text-xs text-grey-dark leading-relaxed mb-3">
                                Copy the invite message below and send it to the user via email, WhatsApp, or any messenger.
                            </p>
                            <button
                                onClick={async () => {
                                    const copied = await handleCopyNewInvite(inviteSuccess.email, inviteSuccess.role);
                                    if (copied) setCopiedNewInvite(true);
                                }}
                                className={`w-full py-2.5 rounded-[9px] text-sm font-bold uppercase tracking-[0.04em] flex items-center justify-center gap-2 transition-all ${
                                    copiedNewInvite
                                        ? 'bg-sage-light text-sage-dark border border-sage/40'
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
                            <button onClick={handleCloseInviteModal} className={secondaryBtnClass}>
                                Done
                            </button>
                        </div>
                    </div>
                ) : (
                    // Form state
                    <form onSubmit={handleCreateInvitation} className="p-6 space-y-4">
                        <div>
                            <label className={labelClass}>Email Address</label>
                            <input
                                type="email"
                                required
                                value={newInvitation.email}
                                onChange={(e) => setNewInvitation({...newInvitation, email: e.target.value})}
                                placeholder="user@example.com"
                                className={inputClass}
                            />
                            <p className="text-[10.5px] text-grey-mid mt-1">The user will need to sign up with this email address.</p>
                        </div>
                        <div>
                            <label className={labelClass}>Role</label>
                            <select
                                value={newInvitation.role}
                                onChange={(e) => setNewInvitation({...newInvitation, role: e.target.value as UserRole})}
                                className={inputClass}
                            >
                                <option value="Admin">Admin</option>
                                <option value="Finance Team">Finance Team</option>
                                <option value="Pastorate">Pastorate</option>
                                <option value="Guest">Guest</option>
                            </select>
                        </div>
                        <div className="bg-[#fcf7f0] border border-[#ecd8bd] rounded-[10px] px-3.5 py-[11px]">
                            <p className="text-xs text-[#7a5a30] leading-relaxed">
                                The invitation will expire in 30 days. After creating, you'll get a message to share with the user.
                            </p>
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button type="button" onClick={handleCloseInviteModal} className="px-4 py-2 text-xs font-bold uppercase tracking-[0.04em] text-grey-mid hover:bg-paper rounded-[9px] transition-colors">Cancel</button>
                            <button type="submit" className={primaryBtnClass}>
                                <Mail size={14} strokeWidth={1.9} /> Create Invitation
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
            <div className="bg-white w-full max-w-md rounded-xl shadow-soft-lg border border-ledger animate-enter">
                <div className="px-5 py-4 border-b border-grey-light flex justify-between items-center bg-[#fcfbf9] rounded-t-xl">
                    <h3 className="text-[13.5px] font-bold text-ink uppercase tracking-[0.02em]">
                        {editingFund?._id ? 'Edit Fund / Campaign' : 'Create Fund / Campaign'}
                    </h3>
                    <button onClick={() => setShowFundModal(false)} className="text-grey-mid hover:text-grey-dark"><X size={16}/></button>
                </div>
                <form onSubmit={handleSaveFund} className="p-6 space-y-4">
                     {/* Fund Logo Upload */}
                    <div className="flex items-center gap-4">
                        <div
                            className="w-16 h-16 bg-paper border border-ledger border-dashed rounded-[10px] flex items-center justify-center shrink-0 overflow-hidden relative group cursor-pointer"
                            onClick={() => fundLogoInputRef.current?.click()}
                        >
                             {editingFund?.logoUrl ? (
                                <img src={editingFund.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                            ) : (
                                <ImageIcon size={20} className="text-grey-mid" strokeWidth={1.7} />
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
                            <label className={labelClass.replace('mb-1.5', 'mb-0.5')}>Campaign Logo</label>
                            <p className="text-[10.5px] text-grey-mid">Optional. For specific reports.</p>
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>Fund Name *</label>
                        <input
                            type="text"
                            required
                            value={editingFund?.name || ''}
                            onChange={(e) => setEditingFund({...editingFund, name: e.target.value})}
                            className={inputClass}
                        />
                    </div>

                    <div>
                        <label className={labelClass}>Type *</label>
                        <select
                            value={editingFund?.type || FundType.UNRESTRICTED}
                            onChange={(e) => setEditingFund({...editingFund, type: e.target.value as FundType})}
                            className={inputClass}
                        >
                            <option value={FundType.UNRESTRICTED}>Unrestricted (General)</option>
                            <option value={FundType.RESTRICTED}>Restricted (Campaign)</option>
                            <option value={FundType.DESIGNATED}>Designated</option>
                        </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                             <label className={labelClass}>Target Amount (£)</label>
                             <input
                                type="number"
                                value={editingFund?.targetAmount || ''}
                                onChange={(e) => setEditingFund({...editingFund, targetAmount: parseFloat(e.target.value)})}
                                className={`${inputClass} font-mono`}
                                placeholder="Optional"
                             />
                        </div>
                        <div>
                             <label className={labelClass}>Deadline</label>
                             <input
                                type="date"
                                value={editingFund?.deadline || ''}
                                onChange={(e) => setEditingFund({...editingFund, deadline: e.target.value})}
                                className={`${inputClass} font-mono`}
                             />
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>Description</label>
                        <textarea
                            value={editingFund?.description || ''}
                            onChange={(e) => setEditingFund({...editingFund, description: e.target.value})}
                            className={`${inputClass} h-20 resize-none`}
                            placeholder="Purpose of this fund..."
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => setShowFundModal(false)} className="px-4 py-2 text-xs font-bold uppercase tracking-[0.04em] text-grey-mid hover:bg-paper rounded-[9px] transition-colors">Cancel</button>
                        <button type="submit" className={primaryBtnClass}>
                            <Save size={14} strokeWidth={1.9} /> Save Fund
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
