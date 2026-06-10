import React from 'react';
import { UserButton } from '@clerk/clerk-react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Wallet, PieChart, Upload, HeartHandshake, Users, X, Sparkles, Settings as SettingsIcon } from 'lucide-react';
import { clerkAppearance } from '@/lib/clerkAppearance';

// Type for Convex user from database
interface ConvexUser {
  _id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Finance Team' | 'Pastorate' | 'Guest';
  avatarUrl?: string;
}

interface SidebarProps {
  currentUser: ConvexUser;
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentUser, isOpen, onClose }) => {

  // Permission Logic
  const canViewDonors = ['Admin', 'Finance Team', 'Pastorate'].includes(currentUser.role);
  const canViewSettings = ['Admin', 'Finance Team'].includes(currentUser.role);

  const menuItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/transactions', label: 'Transactions', icon: Upload },
    { path: '/funds', label: 'Funds & Balances', icon: Wallet },
    { path: '/donors', label: 'Donors', icon: Users, hidden: !canViewDonors },
    { path: '/campaigns', label: 'Campaigns', icon: HeartHandshake },
    { path: '/reports', label: 'Reports', icon: PieChart },
    { path: '/settings', label: 'Settings', icon: SettingsIcon, hidden: !canViewSettings },
    { path: '/copilot', label: 'Ask Ward', icon: Sparkles },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-ink/50 backdrop-blur-sm z-20 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside className={`
        fixed left-0 top-0 h-full w-[248px] bg-white border-r border-ledger
        flex flex-col z-30 transition-transform duration-300 ease-in-out shadow-2xl md:shadow-none
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
      `}>
        {/* Brand Header */}
        <div className="px-[18px] pt-[30px] pb-[26px] flex flex-col items-center">
          <img
            src="/churchcoin-logo.png"
            alt="ChurchCoin Finance Platform"
            className="w-[132px] h-auto"
          />
          <button
            onClick={onClose}
            className="md:hidden absolute right-4 top-6 text-grey-mid hover:text-ink"
            aria-label="Close navigation menu"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 px-[18px] space-y-[3px] overflow-y-auto">
          {menuItems.filter(item => !item.hidden).map((item) => {
            const Icon = item.icon;
            const isWard = item.path === '/copilot';

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  `w-full flex items-center gap-[13px] px-3.5 py-[11px] rounded-[11px] text-[14.5px] font-medium transition-all duration-200 group relative ${
                    isActive
                      ? 'bg-amber-light text-amber border border-transparent'
                      : 'text-stone-600 hover:text-ink hover:bg-grey-light'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="relative">
                      <Icon
                        size={18}
                        className={`transition-colors ${isActive ? 'text-amber' : isWard ? 'text-sage' : 'text-grey-mid group-hover:text-ink'}`}
                        strokeWidth={isActive ? 2.5 : 2}
                      />
                      {isWard && !isActive && (
                        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sage opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sage border-2 border-white"></span>
                        </span>
                      )}
                    </div>
                    <span className={isActive ? 'font-semibold' : 'font-medium'}>{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User Section */}
        <div className="px-[18px] pt-[22px] pb-5 border-t border-ledger mx-[18px] mt-auto">
          <div className="flex items-center gap-3">
            <UserButton
              afterSignOutUrl="/"
              appearance={clerkAppearance}
            />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold text-ink truncate">{currentUser.name}</p>
              <p className="text-xs text-grey-mid truncate">{currentUser.role}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
