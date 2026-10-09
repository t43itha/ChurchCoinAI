import React, { useState } from 'react';
import { Transaction, Fund, Pledge, ChurchDetails } from '../types';
import { ReportHeader, type ReportTab } from './reports/ReportHeader';
import { MonthlyReport } from './reports/MonthlyReport';
import { AnnualReport } from './reports/AnnualReport';
import { AIReports } from './reports/AIReports';
import { ReportsErrorBoundary } from './reports/ReportsErrorBoundary';

interface ReportsProps {
  transactions: Transaction[];
  funds: Fund[];
  pledges: Pledge[];
  programmes: Array<{ _id: string; name: string }>;
  churchDetails: ChurchDetails;
}

// Reports page shell: the active tab decides which report renders. Each tab
// remounts the error boundary, so a failed report clears when the user switches.
const Reports: React.FC<ReportsProps> = ({ transactions, funds, pledges, programmes, churchDetails }) => {
  const [activeTab, setActiveTab] = useState<ReportTab>('monthly');

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12 animate-enter">
      <ReportsErrorBoundary key={activeTab}>
        {activeTab === 'monthly' && (
          <MonthlyReport
            transactions={transactions}
            programmes={programmes}
            churchDetails={churchDetails}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        )}
        {activeTab === 'annual' && (
          <AnnualReport
            transactions={transactions}
            programmes={programmes}
            churchDetails={churchDetails}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        )}
        {activeTab === 'ai' && (
          <div className="space-y-6">
            <ReportHeader
              eyebrow={`${churchDetails.name} · AI reports`}
              title="AI reports"
              status="Drafts written from your books. Check them before sharing."
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
            <AIReports
              transactions={transactions}
              funds={funds}
              pledges={pledges}
              churchDetails={churchDetails}
            />
          </div>
        )}
      </ReportsErrorBoundary>
    </div>
  );
};

export default Reports;
