import React, { useEffect, useState } from 'react';
import { UserButton } from '@clerk/clerk-react';
import { Link, NavLink } from 'react-router-dom';
import { LayoutDashboard, Wallet, PieChart, Upload, HeartHandshake, Users, X, Sparkles, Settings as SettingsIcon, Hourglass } from 'lucide-react';
import { clerkAppearance } from '@/lib/clerkAppearance';
import type { PlanTier } from '@/lib/onboardingIntent';
import { getPlanName } from '@/lib/plans';
import { getTrialProgress } from '@/lib/trial';

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
  access: {
    state: string;
    expiresAt: number | null;
    plan: PlanTier | null;
  };
}

const Sidebar: React.FC<SidebarProps> = ({ currentUser, isOpen, onClose, access }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (access.state !== 'active_trial') return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [access.state]);

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
  const trialProgress =
    access.state === 'active_trial' && access.expiresAt
      ? getTrialProgress(access.expiresAt, now)
      : null;
  const trialPlanName = getPlanName(access.plan);

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
        <nav className="min-h-0 flex-1 px-[18px] space-y-[3px] overflow-y-auto">
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
        <div className="px-[18px] pt-[18px] pb-5 border-t border-ledger mt-auto space-y-4">
          {trialProgress && (
            <section
              className="rounded-[12px] border border-[#dfd3c5] bg-[#fffdf9] p-3.5 shadow-hard-sm"
              aria-label="Free trial status"
            >
              <div className="flex items-start gap-2.5">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-[#e4d0b5] bg-white text-amber">
                  <Hourglass size={15} strokeWidth={2.1} />
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="truncate text-[13px] font-bold text-ink">
                    {trialPlanName ? `${trialPlanName} trial` : 'ChurchCoin trial'}
                  </p>
                  <p className="mt-0.5 text-[10.5px] leading-[1.35] text-grey-mid">
                    Full access for 14 days. No card required.
                  </p>
                </div>
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#ebe8e3]" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-amber transition-[width] duration-300"
                  style={{ width: `${trialProgress.progressPercent}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-[10.5px] font-semibold text-grey-dark">
                <span>Day {trialProgress.dayNumber} of 14</span>
                <span className="text-grey-mid">
                  {trialProgress.daysLeft === 0
                    ? 'Ends today'
                    : `${trialProgress.daysLeft} ${trialProgress.daysLeft === 1 ? 'day' : 'days'} left`}
                </span>
              </div>

              {currentUser.role === 'Admin' ? (
                <Link
                  to="/settings?tab=billing"
                  onClick={onClose}
                  className="mt-3 flex min-h-9 w-full items-center justify-center rounded-[9px] bg-ink px-3 text-[11px] font-bold uppercase tracking-[0.05em] text-white transition-colors hover:bg-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
                >
                  Upgrade now
                </Link>
              ) : (
                <p className="mt-3 border-t border-[#ece2d6] pt-2.5 text-[10.5px] leading-[1.4] text-grey-mid">
                  Ask an organisation admin to upgrade.
                </p>
              )}
            </section>
          )}

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
