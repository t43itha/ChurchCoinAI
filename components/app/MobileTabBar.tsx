import { NavLink } from "react-router-dom";
import { ArrowLeftRight, LayoutDashboard, PieChart, Plus, Users, type LucideIcon } from "lucide-react";
import { can, type UserRole } from "../../lib/permissions";
import { canAddNew } from "./newChooserRows";

// Bottom offset that puts a fixed element just above this bar on phones. The bar is 60px of
// tabs, a 1px rule and the safe-area padding (or 8px), plus 12px of air. Keep in step with the nav below.
export const tabBarClearance = "bottom-[calc(4.5rem+1px+max(0.5rem,env(safe-area-inset-bottom)))]";

// Phone navigation: Home · Money · + New · People · Reports. Settings and Ask Ward
// are in the menu drawer. Roles that cannot add entries get the four tabs without the New slot.
export default function MobileTabBar({ role, onNew }: { role: UserRole; onNew: () => void }) {
  const peopleTo = can(role, "donors.read") ? "/donors" : "/campaigns";
  const reportsTo = can(role, "reports.read") ? "/reports" : "/copilot";

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 flex items-stretch border-t border-ledger bg-white/95 px-1 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xs md:hidden"
    >
      <TabLink to="/dashboard" label="Home" icon={LayoutDashboard} />
      <TabLink to="/transactions" label="Money" icon={ArrowLeftRight} />
      {canAddNew(role) && (
        <div className="flex min-w-0 flex-1 flex-col items-center justify-end">
          <button
            type="button"
            onClick={onNew}
            aria-label="New entry"
            className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white shadow-[0_8px_18px_-10px_rgba(28,25,23,0.6)] transition-transform active:scale-95"
          >
            <Plus size={24} aria-hidden="true" />
          </button>
          <span className="pb-0.5 pt-1 text-[11px] font-semibold text-grey-mid" aria-hidden="true">
            New
          </span>
        </div>
      )}
      <TabLink to={peopleTo} label="People" icon={Users} />
      <TabLink to={reportsTo} label="Reports" icon={PieChart} />
    </nav>
  );
}

function TabLink({ to, label, icon: Icon }: { to: string; label: string; icon: LucideIcon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors ${
          isActive ? "text-ink" : "text-grey-mid"
        }`
      }
    >
      <Icon size={20} aria-hidden="true" />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}
