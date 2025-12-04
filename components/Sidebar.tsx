import React, { useState } from 'react';
import { LayoutDashboard, Wallet, PieChart, Upload, MessageSquareText, HeartHandshake, Users, LogOut, ChevronUp, UserCircle2, Command, X, Sparkles } from 'lucide-react';
import { AppUser } from '../types';
import { MOCK_USERS } from '../constants';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: AppUser;
  onSwitchUser: (user: AppUser) => void;
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, currentUser, onSwitchUser, isOpen, onClose }) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'transactions', label: 'Transactions', icon: Upload },
    { id: 'funds', label: 'Funds & Balances', icon: Wallet },
    { id: 'donors', label: 'Donors', icon: Users },
    { id: 'campaigns', label: 'Campaigns', icon: HeartHandshake },
    { id: 'reports', label: 'Reports', icon: PieChart },
    { id: 'copilot', label: 'Ask Ward', icon: Sparkles },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-20 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside className={`
        fixed left-0 top-0 h-full w-64 bg-[#FDFCF8] border-r border-slate-200 
        flex flex-col z-30 transition-transform duration-300 ease-in-out shadow-2xl md:shadow-none
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} 
        md:translate-x-0
      `}>
        {/* Brand Header */}
        <div className="p-8 flex items-center justify-between">
          <div className="flex items-center gap-3 text-slate-900">
              <div className="w-8 h-8 bg-slate-800 text-orange-50 flex items-center justify-center rounded-lg shadow-lg shadow-orange-900/5">
                  <Command size={16} />
              </div>
              <div>
                  <h1 className="text-lg font-bold font-display tracking-tight leading-none text-slate-900">ChurchCoin</h1>
                  <p className="text-[10px] font-mono text-slate-400 mt-1 uppercase tracking-wider">Finance OS</p>
              </div>
          </div>
          <button onClick={onClose} className="md:hidden text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 px-4 space-y-1 mt-2 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const isWard = item.id === 'copilot';

            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  onClose();
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative ${
                  isActive
                    ? 'bg-orange-50 text-orange-900 shadow-sm ring-1 ring-orange-100'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-white/80'
                }`}
              >
                <div className="relative">
                    <Icon 
                        size={18} 
                        className={`transition-colors ${isActive ? 'text-orange-600' : isWard ? 'text-violet-500' : 'text-slate-400 group-hover:text-slate-600'}`} 
                        strokeWidth={isActive ? 2.5 : 2}
                    />
                    {isWard && !isActive && (
                        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-violet-500 border-2 border-white"></span>
                        </span>
                    )}
                </div>
                <span className={isActive ? 'font-bold' : 'font-medium'}>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User Section */}
        <div className="p-4 border-t border-slate-100 mx-4 mb-4 mt-auto">
          
          {isUserMenuOpen && (
            <div className="mb-2 bg-white rounded-xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden animate-enter origin-bottom absolute bottom-20 left-4 w-56 z-50">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Switch Profile</p>
              </div>
              {MOCK_USERS.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    onSwitchUser(u);
                    setIsUserMenuOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors ${currentUser.id === u.id ? 'bg-orange-50/50' : ''}`}
                >
                  <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden shrink-0 border border-slate-100">
                    {u.avatarUrl ? (
                      <img src={u.avatarUrl} alt={u.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[9px] font-bold text-slate-600">{u.name.charAt(0)}</span>
                    )}
                  </div>
                  <span className={`text-xs font-medium ${currentUser.id === u.id ? 'text-orange-900' : 'text-slate-700'}`}>{u.name}</span>
                  {currentUser.id === u.id && <div className="ml-auto w-1.5 h-1.5 bg-orange-500 rounded-full"></div>}
                </button>
              ))}
              <div className="border-t border-slate-100 mt-1">
                  <button className="w-full text-left px-4 py-3 flex items-center gap-2 text-rose-600 hover:bg-rose-50 transition-colors">
                      <LogOut size={14} />
                      <span className="text-xs font-bold">Sign Out</span>
                  </button>
              </div>
            </div>
          )}

          <button 
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white transition-all border border-transparent hover:border-slate-200 hover:shadow-sm group bg-slate-50/50"
          >
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-900 border border-slate-200 overflow-hidden shrink-0 shadow-sm">
              {currentUser.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt={currentUser.name} className="w-full h-full object-cover"/>
              ) : (
                  <UserCircle2 size={20} />
              )}
            </div>
            
            <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-bold text-slate-900 truncate font-display">{currentUser.name}</p>
                <p className="text-[10px] text-slate-500 truncate font-mono">{currentUser.role}</p>
            </div>
            <ChevronUp size={14} className={`text-slate-400 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;