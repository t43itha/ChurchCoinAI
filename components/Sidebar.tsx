import React from 'react';
import { LayoutDashboard, Wallet, PieChart, Upload, MessageSquareText, HeartHandshake, Users } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'transactions', label: 'Transactions', icon: Upload },
    { id: 'funds', label: 'Funds & Balances', icon: Wallet },
    { id: 'donors', label: 'Donors & Giving', icon: Users },
    { id: 'campaigns', label: 'Campaigns & Pledges', icon: HeartHandshake },
    { id: 'reports', label: 'Reports', icon: PieChart },
    { id: 'copilot', label: 'AI Co-Pilot', icon: MessageSquareText },
  ];

  return (
    <div className="w-64 bg-slate-900 text-white min-h-screen flex flex-col fixed left-0 top-0 h-full z-10 shadow-xl">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-2xl font-bold text-emerald-400 font-serif tracking-tight">ChurchCoin</h1>
        <p className="text-xs text-slate-400 mt-1">Church Finance Manager</p>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon size={20} />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="p-4 border-t border-slate-800">
        <div className="bg-slate-800 rounded-lg p-3 text-xs text-slate-400">
          <p className="font-semibold text-slate-200 mb-1">Status</p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            System Online
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            Gemini Connected
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;