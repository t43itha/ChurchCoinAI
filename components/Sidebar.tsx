import { can, type UserRole } from '../lib/permissions';
import React, { useEffect, useState } from 'react';
import { UserButton } from '@clerk/clerk-react';
import { Link, NavLink } from 'react-router-dom';
import { ArrowLeftRight, HandCoins, HeartHandshake, Hourglass, LayoutDashboard, LifeBuoy, PieChart, Plus, Settings as SettingsIcon, Sparkles, Users, Wallet, X, type LucideIcon } from 'lucide-react';
import {
  clerkUserButtonAppearance,
  clerkUserProfileAppearance,
} from '@/lib/clerkAppearance';
import type { PlanTier } from '@/lib/onboardingIntent';
import { getPlanName } from '@/lib/plans';
import { getTrialProgress } from '@/lib/trial';
import { btnMd, btnPrimary, eyebrow } from './wizard/ui';
import { canAddNew } from './app/newChooserRows';

// Type for Convex user from database
interface ConvexUser {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
}

interface SidebarProps {
  currentUser: ConvexUser;
  isOpen: boolean;
  onClose: () => void;
  onNew: () => void;
  onOpenSupport: () => void;
  access: {
    state: string;
    expiresAt: number | null;
    plan: PlanTier | null;
  };
}

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  hidden?: boolean;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

const Sidebar: React.FC<SidebarProps> = ({ currentUser, isOpen, onClose, onNew, onOpenSupport, access }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (access.state !== 'active_trial') return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [access.state]);

  const role = currentUser.role;
  const canViewDonors = can(role, "donors.read");
  const canViewSettings = can(role, "settings.view");

  const groups: NavGroup[] = [
    {
      items: [{ path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
    },
    {
      label: 'Money',
      items: [
        { path: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
        { path: '/funds', label: 'Funds', icon: Wallet },
        { path: '/loans', label: 'Loans', icon: HandCoins, hidden: !can(role, "ledger.read") },
      ],
    },
    {
      label: 'People',
      items: [
        { path: '/donors', label: 'Donors', icon: Users, hidden: !canViewDonors },
        { path: '/campaigns', label: 'Campaigns', icon: HeartHandshake },
      ],
    },
    {
      label: 'Insight',
      items: [
        { path: '/reports', label: 'Reports', icon: PieChart, hidden: !can(role, "reports.read") },
        { path: '/copilot', label: 'Ask Ward', icon: Sparkles },
      ],
    },
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
          className="fixed inset-0 bg-ink/50 backdrop-blur-xs z-20 md:hidden"
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
        <div className="relative px-[18px] pt-[26px] pb-4 flex flex-col items-center">
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

        {canAddNew(role) && (
          <div className="px-[18px]">
            <button
              type="button"
              onClick={() => {
                onClose();
                onNew();
              }}
              className={`${btnPrimary} ${btnMd}`}
            >
              <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
              New
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="min-h-0 flex-1 overflow-y-auto px-[18px] pb-2">
          {groups.map((group) => {
            const items = group.items.filter((item) => !item.hidden);
            if (items.length === 0) return null;
            return (
              <div key={group.label ?? 'main'} className="mt-2 first:mt-4">
                {group.label && <p className={`${eyebrow} px-3 pb-1.5 pt-3`}>{group.label}</p>}
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <SidebarLink key={item.path} item={item} onClose={onClose} />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer: settings and help, then the user */}
        <div className="px-[18px] pt-[14px] pb-5 border-t border-ledger ledger-space-y-4">
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

              {can(role, "billing.manage") ? (
                <Link
                  to="/settings?tab=billing"
                  onClick={onClose}
                  className="mt-3 flex min-h-9 w-full items-center justify-center rounded-[9px] bg-ink px-3 text-[11px] font-bold uppercase tracking-[0.05em] text-white transition-colors hover:bg-charcoal focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
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

          {canViewSettings && (
            <NavLink
              to="/settings"
              onClick={onClose}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors ${
                  isActive ? 'bg-grey-light font-semibold text-ink' : 'font-medium text-grey-dark hover:bg-grey-light hover:text-ink'
                }`
              }
            >
              <SettingsIcon size={18} strokeWidth={2} className="text-grey-mid" aria-hidden="true" />
              Settings
            </NavLink>
          )}

          <button
            type="button"
            onClick={() => {
              onOpenSupport();
              onClose();
            }}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-grey-dark transition-colors hover:bg-grey-light hover:text-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
          >
            <LifeBuoy size={18} strokeWidth={2} className="text-grey-mid" aria-hidden="true" />
            <span className="flex-1">Help & feedback</span>
          </button>

          <div className="flex items-center gap-3 px-1">
            <UserButton
              afterSignOutUrl="/"
              appearance={clerkUserButtonAppearance}
              userProfileProps={{ appearance: clerkUserProfileAppearance }}
            />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold text-ink truncate">{currentUser.name}</p>
              <p className="text-xs text-grey-mid truncate">{role}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

function SidebarLink({ item, onClose }: { item: NavItem; onClose: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      onClick={onClose}
      className={({ isActive }) =>
        `flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm transition-colors ${
          isActive ? 'bg-grey-light font-semibold text-ink' : 'font-medium text-grey-dark hover:bg-grey-light hover:text-ink'
        }`
      }
    >
      <Icon size={18} strokeWidth={2} className="shrink-0 text-grey-mid" aria-hidden="true" />
      <span>{item.label}</span>
    </NavLink>
  );
}

export default Sidebar;
