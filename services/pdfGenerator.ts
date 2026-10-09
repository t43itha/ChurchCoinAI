
import { Donor, Pledge, Fund, ChurchDetails, Transaction, MonthlyReportData, AnnualReportData, CategoryGroup, LoanReportRow } from "../types";
import { filterIncomeAndExpenditure, type TransferSummary } from "../lib/reportableTransactions";
import type { ProgrammeIncome } from "../lib/programmeIncome";
import { percentChange } from "../lib/reportSummary";
import { sumMoney } from "../convex/lib/money";
import { isGiftAidEnabled } from "../lib/giftAid";
import {
  comparisonLabel,
  fundCellValues,
  formatPercentChange,
  inProgressLine,
  formatUkDate,
  priorTotalFor,
  splitFundRows,
} from "./reportFormatting";

// Escape HTML entities to prevent injection when rendering user-supplied data
const escapeHtml = (value?: string) =>
  (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const safeUrl = (url?: string) => {
  if (!url) return "";
  if (
    /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(url) &&
    url.length <= 700_000
  ) {
    return url;
  }
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) ? url : "";
  } catch {
    return "";
  }
};

export const generateScheduleHTML = (
  donor: Donor,
  pledges: Pledge[],
  funds: Fund[],
  churchDetails: ChurchDetails,
  logoOverride?: string,
  transactions?: Transaction[],
  periodStart?: string,
  periodEnd?: string,
  reportType?: 'all' | 'tithes' | 'campaign',
  campaignName?: string
) => {
  const todayFormatted = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // Format period display
  const formatPeriodDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  };

  const periodDisplay = periodStart && periodEnd
    ? `${formatPeriodDate(periodStart)} – ${formatPeriodDate(periodEnd)}`
    : 'All Time';

  // Filter transactions for this donor and sort by date (newest first)
  const donorTransactions = filterIncomeAndExpenditure(transactions || [])
    .filter(t => t.type === 'Income')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Calculate transaction totals
  const totalGiven = donorTransactions.reduce((sum, t) => sum + t.amount, 0);

  // Calculate total pledged (from all pledges, not just active)
  const totalPledged = pledges.reduce((sum, p) => sum + p.amount, 0);

  const pdfFilename = buildDonorSchedulePdfFilename({
    donorName: donor.name,
    reportType: reportType ?? 'all',
    periodStart,
    periodEnd,
    campaignName,
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${pdfFilename}</title>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
      <style>
        @page {
          size: A4;
          margin: 20mm;
        }
        body {
          font-family: 'Inter', sans-serif;
          color: #292524;
          line-height: 1.5;
          margin: 0;
          padding: 0;
          background: #fff;
          -webkit-print-color-adjust: exact;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #292524;
          padding-bottom: 20px;
          margin-bottom: 40px;
        }
        .brand {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
        }
        .logo {
            height: 60px;
            width: auto;
            margin-bottom: 15px;
            object-fit: contain;
        }
        .brand h1 {
          font-family: 'DM Sans', sans-serif;
          font-size: 24px;
          margin: 0;
          letter-spacing: -0.02em;
          text-transform: uppercase;
        }
        .brand p {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          margin: 4px 0 0 0;
          color: #78716c;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .meta {
          text-align: right;
          font-size: 11px;
          color: #57534e;
          padding-top: 5px;
        }
        .recipient {
          margin-bottom: 60px;
          font-size: 14px;
        }
        .recipient strong {
          font-family: 'DM Sans', sans-serif;
          font-size: 18px;
          display: block;
          margin-bottom: 8px;
        }
        .recipient div {
          color: #57534e;
          max-width: 250px;
        }

        .document-title {
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          border-bottom: 1px solid #e7e5e4;
          padding-bottom: 8px;
          margin-bottom: 20px;
          color: #78716c;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 40px;
        }
        th {
          text-align: left;
          font-family: 'DM Sans', sans-serif;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #78716c;
          border-bottom: 1px solid #292524;
          padding: 12px 8px;
        }
        td {
          padding: 16px 8px;
          border-bottom: 1px solid #e7e5e4;
          font-size: 13px;
        }
        .amount {
          font-family: 'JetBrains Mono', monospace;
          text-align: right;
          font-weight: 500;
        }
        .fund-name {
          font-weight: 600;
          color: #292524;
        }
        .fund-desc {
          font-size: 11px;
          color: #78716c;
          margin-top: 2px;
        }
        
        .totals {
          display: flex;
          justify-content: flex-end;
          gap: 40px;
          margin-bottom: 60px;
        }
        .total-item {
          text-align: right;
        }
        .total-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #78716c;
          margin-bottom: 4px;
        }
        .total-value {
          font-family: 'JetBrains Mono', monospace;
          font-size: 18px;
          font-weight: 600;
          color: #292524;
        }

        .footer {
          margin-top: 80px;
          border-top: 1px solid #e7e5e4;
          padding-top: 30px;
          font-size: 12px;
          color: #57534e;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }
        
        .gift-aid-box {
          background-color: #fafaf9;
          border: 1px solid #e7e5e4;
          padding: 20px;
          border-radius: 4px;
          margin-bottom: 40px;
        }
        .gift-aid-box h4 {
          margin: 0 0 8px 0;
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .gift-aid-box p {
          margin: 0;
          font-size: 12px;
          color: #57534e;
        }

        .signature-line {
          border-top: 1px solid #292524;
          width: 200px;
          padding-top: 8px;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
      </style>
    </head>
    <body>
      
      <div class="header">
        <div class="brand">
          ${(() => {
            const logo = safeUrl(logoOverride || churchDetails.logoUrl);
            return logo ? `<img src="${logo}" class="logo" />` : '';
          })()}
          <div>
            <h1>${escapeHtml(churchDetails.name)}</h1>
            <p>Finance & Stewardship</p>
          </div>
        </div>
        <div class="meta">
          <p>Date: ${todayFormatted}</p>
          <p>Ref: SCH-${escapeHtml((donor._id || '').slice(-6).toUpperCase())}</p>
          <p>Period: ${periodDisplay}</p>
          <p>Charity No: ${escapeHtml(churchDetails.charityNumber || 'N/A')}</p>
        </div>
      </div>

      <div class="recipient">
        <strong>${escapeHtml(donor.name)}</strong>
        <div>${donor.address ? escapeHtml(donor.address).replace(/\n/g, '<br>') : 'Address on file'}</div>
      </div>

      <div class="document-title">Giving Statement</div>

      ${donorTransactions.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th width="20%">Date</th>
            <th width="40%">Description</th>
            <th width="20%">Fund</th>
            <th width="20%" style="text-align: right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${donorTransactions.map(t => {
            const fund = funds.find(f => f._id === t.fundId);
            return `
              <tr>
                <td>${new Date(t.date).toLocaleDateString('en-GB')}</td>
                <td>${escapeHtml(t.description || 'Donation')}</td>
                <td><span class="fund-desc">${escapeHtml(fund?.name || 'General')}</span></td>
                <td class="amount">£${t.amount.toFixed(2)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <div class="totals">
        ${totalPledged > 0 ? `
        <div class="total-item">
          <div class="total-label">Amount Pledged</div>
          <div class="total-value">£${totalPledged.toFixed(2)}</div>
        </div>
        ` : ''}
        <div class="total-item">
          <div class="total-label">Total Given</div>
          <div class="total-value">£${totalGiven.toFixed(2)}</div>
        </div>
        <div class="total-item">
          <div class="total-label">Transactions</div>
          <div class="total-value">${donorTransactions.length}</div>
        </div>
      </div>
      ` : `
      <div class="totals">
        ${totalPledged > 0 ? `
        <div class="total-item">
          <div class="total-label">Amount Pledged</div>
          <div class="total-value">£${totalPledged.toFixed(2)}</div>
        </div>
        ` : ''}
        <div class="total-item">
          <div class="total-label">Total Given</div>
          <div class="total-value">£0.00</div>
        </div>
      </div>
      <p style="text-align:center; color:#999; padding: 30px;">No transactions found.</p>
      `}

      ${isGiftAidEnabled(churchDetails) ? `
      <div class="gift-aid-box">
        <h4>Gift Aid Declaration Status</h4>
        <p>
          ${donor.isGiftAidActive 
            ? "<strong>Active:</strong> This schedule is covered by your active Gift Aid declaration. We will claim 25p for every £1 given." 
            : "<strong>Not Active:</strong> We do not currently hold an active Gift Aid declaration for these donations."}
        </p>
      </div>
      ` : ''}

      <div class="footer">
        <div>
          <p>Thank you for your partnership and generosity.</p>
        </div>
      </div>

    </body>
    </html>
  `;
  
  return html;
};

export function sanitizePdfFilenamePart(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function buildPeriodLabelForPdfFilename(start?: string, end?: string) {
  if (!start || !end) return 'All_Time';
  const startYear = start.slice(0, 4);
  const isFullYear = start.endsWith('-01-01') && end.endsWith('-12-31') && end.startsWith(startYear);
  if (isFullYear) return startYear;
  return `${start}_to_${end}`;
}

export function buildDonorSchedulePdfFilename(args: {
  donorName: string;
  reportType: 'all' | 'tithes' | 'campaign';
  periodStart?: string;
  periodEnd?: string;
  campaignName?: string;
}) {
  const donorPart = sanitizePdfFilenamePart(args.donorName);
  const reportPart =
    args.reportType === 'campaign' && args.campaignName
      ? sanitizePdfFilenamePart(args.campaignName)
      : args.reportType === 'tithes'
        ? 'Tithes'
        : 'All_Schedules';
  const periodPart = sanitizePdfFilenamePart(buildPeriodLabelForPdfFilename(args.periodStart, args.periodEnd));
  return `${donorPart}_${reportPart}_${periodPart}`;
}

// Format currency for PDF display
const formatCurrency = (amount: number) => `£${amount.toFixed(2)}`;
const formatSignedCurrency = (amount: number) =>
  `${amount < 0 ? "−" : ""}£${Math.abs(amount).toFixed(2)}`;

// SORP "Transfers between funds" line. Omitted when nothing moved between funds.
export const transfersSectionHTML = (transfers: TransferSummary) => {
  if (transfers.funds.length === 0) return "";
  return `
      <div class="section-title">Transfers between funds</div>
      <table>
        <thead>
          <tr>
            <th>Fund</th>
            <th class="right">In</th>
            <th class="right">Out</th>
            <th class="right">Net</th>
          </tr>
        </thead>
        <tbody>
          ${transfers.funds.map((fund) => `
            <tr>
              <td>${escapeHtml(fund.fund)}</td>
              <td class="amount">${formatCurrency(fund.in)}</td>
              <td class="amount">${formatCurrency(fund.out)}</td>
              <td class="amount">${formatSignedCurrency(fund.net)}</td>
            </tr>
          `).join("")}
          ${transfers.unmatched !== 0 ? `
            <tr>
              <td colspan="3">Unmatched (a transfer with one side recorded)</td>
              <td class="amount">${formatSignedCurrency(transfers.unmatched)}</td>
            </tr>
          ` : ""}
          <tr class="total-row">
            <td colspan="3">Total</td>
            <td class="amount">${formatSignedCurrency(transfers.unmatched)}</td>
          </tr>
        </tbody>
      </table>
  `;
};

// Omitted when no giving in the period was tagged to a programme.
export const programmeIncomeSectionHTML = (programmes: ProgrammeIncome[]) => {
  if (programmes.length === 0) return "";
  return `
      <div class="section-title">Income by programme</div>
      <table>
        <thead>
          <tr>
            <th>Programme</th>
            <th class="right">Entries</th>
            <th class="right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${programmes.map((programme) => `
            <tr>
              <td>${escapeHtml(programme.name)}</td>
              <td class="amount">${programme.count}</td>
              <td class="amount">${formatCurrency(programme.total)}</td>
            </tr>
          `).join("")}
          <tr class="total-row">
            <td colspan="2">Total</td>
            <td class="amount">${formatCurrency(sumMoney(programmes, (programme) => programme.total))}</td>
          </tr>
        </tbody>
      </table>
  `;
};

// Common PDF styles for reports
const getReportStyles = () => `
  @page {
    size: A4;
    margin: 15mm;
  }
  body {
    font-family: 'Inter', sans-serif;
    color: #292524;
    line-height: 1.5;
    margin: 0;
    padding: 0;
    background: #fff;
    -webkit-print-color-adjust: exact;
    font-size: 11px;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #292524;
    padding-bottom: 15px;
    margin-bottom: 25px;
  }
  .brand h1 {
    font-family: 'DM Sans', sans-serif;
    font-size: 20px;
    margin: 0;
    letter-spacing: -0.02em;
    text-transform: uppercase;
  }
  .brand p {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    margin: 4px 0 0 0;
    color: #78716c;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .meta {
    text-align: right;
    font-size: 10px;
    color: #57534e;
  }
  .document-title {
    font-family: 'DM Sans', sans-serif;
    font-size: 16px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #e7e5e4;
    padding-bottom: 8px;
    margin-bottom: 20px;
    color: #292524;
  }
  .summary-cards {
    display: flex;
    gap: 15px;
    margin-bottom: 25px;
  }
  .summary-card {
    flex: 1;
    border: 1px solid #e7e5e4;
    padding: 12px;
    border-radius: 4px;
  }
  .summary-card .label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #78716c;
    margin-bottom: 4px;
  }
  .summary-card .value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 16px;
    font-weight: 600;
  }
  .summary-card .value.positive { color: #779E7E; }
  .summary-card .value.negative { color: #E57373; }
  .summary-card .vs { font-size: 9px; color: #78716c; margin-top: 4px; }
  .section-title {
    font-family: 'DM Sans', sans-serif;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #292524;
    margin: 20px 0 10px 0;
    padding-bottom: 5px;
    border-bottom: 1px solid #e7e5e4;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
    font-size: 10px;
  }
  th {
    text-align: left;
    font-family: 'DM Sans', sans-serif;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #78716c;
    border-bottom: 1px solid #292524;
    padding: 8px 6px;
  }
  th.right { text-align: right; }
  td {
    padding: 8px 6px;
    border-bottom: 1px solid #e7e5e4;
  }
  td.right { text-align: right; }
  .amount {
    font-family: 'JetBrains Mono', monospace;
    text-align: right;
  }
  .main-category {
    background-color: #f5f5f4;
    font-weight: 600;
  }
  .subcategory td {
    padding-left: 20px;
    color: #57534e;
  }
  .total-row {
    background-color: #f5f5f4;
    font-weight: 600;
  }
  .total-row td {
    border-top: 2px solid #292524;
  }
  .footer {
    margin-top: 30px;
    border-top: 1px solid #e7e5e4;
    padding-top: 15px;
    font-size: 9px;
    color: #78716c;
    display: flex;
    justify-content: space-between;
  }
  .page-break { page-break-before: always; }
  .two-column { display: flex; gap: 20px; }
  .two-column > div { flex: 1; }
`;

type ComparisonColumn = { label: string; groups: CategoryGroup[]; total: number };

// Receipts or payments by main category, largest first, with subcategories.
// With a comparison, a Change column shows each category against the same
// category in that period; the prior value column is added when showPrior is set.
const categoryTableHTML = (opts: {
  currentLabel: string;
  groups: CategoryGroup[];
  total: number;
  totalLabel: string;
  comparison: ComparisonColumn | null;
  showPrior: boolean;
}) => {
  const { comparison, showPrior } = opts;
  const priorColumn = comparison !== null && showPrior;
  const blank = `<td></td>`.repeat((priorColumn ? 1 : 0) + (comparison ? 1 : 0));
  const comparisonCells = (current: number, prior: number) =>
    comparison
      ? `${priorColumn ? `<td class="amount">${formatCurrency(prior)}</td>` : ""}<td class="amount">${formatPercentChange(current, prior)}</td>`
      : "";

  return `
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th class="right">${escapeHtml(opts.currentLabel)}</th>
            ${priorColumn ? `<th class="right">${escapeHtml(comparison.label)}</th>` : ""}
            ${comparison ? `<th class="right">Change</th>` : ""}
          </tr>
        </thead>
        <tbody>
          ${opts.groups.map((group) => {
            const prior = comparison ? priorTotalFor(comparison.groups, group.mainCategory) : 0;
            return `
              <tr class="main-category">
                <td>${escapeHtml(group.mainCategory)}</td>
                <td class="amount">${formatCurrency(group.total)}</td>
                ${comparisonCells(group.total, prior)}
              </tr>
              ${group.subcategories.map((sub) => `
                <tr class="subcategory">
                  <td>${escapeHtml(sub.name)}</td>
                  <td class="amount">${formatCurrency(sub.total)}</td>
                  ${blank}
                </tr>
              `).join("")}
            `;
          }).join("")}
          <tr class="total-row">
            <td>${escapeHtml(opts.totalLabel)}</td>
            <td class="amount">${formatCurrency(opts.total)}</td>
            ${comparison ? comparisonCells(opts.total, comparison.total) : ""}
          </tr>
        </tbody>
      </table>
  `;
};

// Fund values as right-aligned money cells, after the name cell.
const fundRowCells = (values: number[]) =>
  values.map((value) => `<td class="amount">${formatSignedCurrency(value)}</td>`).join("");

// Omitted when the period has no loans.
export const loansSectionHTML = (loans: LoanReportRow[]) => {
  if (loans.length === 0) return "";
  return `
      <div class="section-title">Loans</div>
      <table>
        <thead>
          <tr>
            <th>Lender</th>
            <th class="right">Borrowed</th>
            <th class="right">Repaid</th>
            <th class="right">Outstanding</th>
            <th>Due</th>
          </tr>
        </thead>
        <tbody>
          ${loans.map((loan) => `
            <tr>
              <td>${escapeHtml(loan.lender)}</td>
              <td class="amount">${formatCurrency(loan.borrowed)}</td>
              <td class="amount">${formatCurrency(loan.repaid)}</td>
              <td class="amount">${formatCurrency(loan.outstanding)}</td>
              <td>${loan.dueDate ? formatUkDate(loan.dueDate) : "—"}</td>
            </tr>
          `).join("")}
          <tr class="total-row">
            <td>Total</td>
            <td class="amount">${formatCurrency(sumMoney(loans, (loan) => loan.borrowed))}</td>
            <td class="amount">${formatCurrency(sumMoney(loans, (loan) => loan.repaid))}</td>
            <td class="amount">${formatCurrency(sumMoney(loans, (loan) => loan.outstanding))}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
  `;
};

// Generate Monthly Report HTML for PDF export
export const generateMonthlyReportHTML = (
  reportData: MonthlyReportData,
  churchDetails: ChurchDetails,
  programmeIncome: ProgrammeIncome[] = []
) => {
  const giftAidEnabled = isGiftAidEnabled(churchDetails);
  const todayFormatted = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const { previousMonth } = reportData.comparison;
  const { totals, fundStatement } = reportData;
  const { showOther } = splitFundRows(fundStatement);
  const progress = inProgressLine(reportData.period);
  const givers = reportData.titheGivers.givers;
  const vsPrevious = (current: number, previous: number) =>
    percentChange(current, previous) === null
      ? ""
      : `<div class="vs">vs ${escapeHtml(comparisonLabel(reportData.comparison.previousMonth))}: ${formatPercentChange(current, previous)}</div>`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Monthly Report - ${escapeHtml(reportData.monthName)}</title>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
      <style>${getReportStyles()}</style>
    </head>
    <body>
      <div class="header">
        <div class="brand">
          <h1>${escapeHtml(churchDetails.name)}</h1>
          <p>Monthly Financial Report</p>
        </div>
        <div class="meta">
          <p>Report Date: ${todayFormatted}</p>
          <p>Period: ${escapeHtml(reportData.period.label)}</p>
          ${progress ? `<p>${escapeHtml(progress)}</p>` : ''}
          ${churchDetails.charityNumber ? `<p>Charity No: ${escapeHtml(churchDetails.charityNumber)}</p>` : ''}
        </div>
      </div>

      <div class="document-title">RCI Missions Monthly Accounts</div>

      <div class="summary-cards">
        <div class="summary-card">
          <div class="label">Income</div>
          <div class="value positive">${formatCurrency(totals.grossIncome)}</div>
          ${vsPrevious(totals.grossIncome, previousMonth.totals.income)}
        </div>
        <div class="summary-card">
          <div class="label">Spending</div>
          <div class="value">${formatCurrency(totals.totalExpenditure)}</div>
          ${vsPrevious(totals.totalExpenditure, previousMonth.totals.expenditure)}
        </div>
        <div class="summary-card">
          <div class="label">${totals.netBankable >= 0 ? 'Surplus' : 'Deficit'}</div>
          <div class="value ${totals.netBankable >= 0 ? 'positive' : 'negative'}">${formatSignedCurrency(totals.netBankable)}</div>
        </div>
        <div class="summary-card">
          <div class="label">Held across funds</div>
          <div class="value">${formatSignedCurrency(fundStatement.total.closing)}</div>
        </div>
      </div>

      <div class="two-column">
        <div>
          <div class="section-title">Receipts (Income)</div>
          ${categoryTableHTML({
            currentLabel: "Amount",
            groups: reportData.receipts,
            total: totals.grossIncome,
            totalLabel: "Total Receipts",
            comparison: { label: comparisonLabel(previousMonth), groups: previousMonth.receipts, total: previousMonth.totals.income },
            showPrior: false,
          })}
        </div>

        <div>
          <div class="section-title">Payments (Expenditure)</div>
          ${categoryTableHTML({
            currentLabel: "Amount",
            groups: reportData.payments,
            total: totals.totalExpenditure,
            totalLabel: "Total Payments",
            comparison: { label: comparisonLabel(previousMonth), groups: previousMonth.payments, total: previousMonth.totals.expenditure },
            showPrior: false,
          })}
        </div>
      </div>

      <div class="section-title">Fund position at ${formatUkDate(reportData.period.throughDate)}</div>
      <table>
        <thead>
          <tr>
            <th>Fund</th>
            <th>Type</th>
            <th class="right">Opening</th>
            <th class="right">In</th>
            <th class="right">Out</th>
            <th class="right">Transfers</th>
            ${showOther ? '<th class="right">Other</th>' : ''}
            <th class="right">Closing</th>
          </tr>
        </thead>
        <tbody>
          ${fundStatement.rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.fund)}</td>
              <td>${escapeHtml(row.type)}</td>
              ${fundRowCells(fundCellValues(row, showOther))}
            </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="2">All funds</td>
            ${fundRowCells(fundCellValues(fundStatement.total, showOther))}
          </tr>
        </tbody>
      </table>

      <div class="section-title">Weekly Summary</div>
      <table>
        <thead>
          <tr>
            <th>Week Ending</th>
            <th class="right">Receipts</th>
            <th class="right">Payments</th>
            <th class="right">Net</th>
          </tr>
        </thead>
        <tbody>
          ${reportData.weeklyBreakdown.map(week => `
            <tr>
              <td>${new Date(week.weekEnding).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
              <td class="amount">${formatCurrency(week.receiptsTotal)}</td>
              <td class="amount">${formatCurrency(week.paymentsTotal)}</td>
              <td class="amount">${formatSignedCurrency(week.receiptsTotal - week.paymentsTotal)}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td>Total</td>
            <td class="amount">${formatCurrency(totals.grossIncome)}</td>
            <td class="amount">${formatCurrency(totals.totalExpenditure)}</td>
            <td class="amount">${formatSignedCurrency(totals.netBankable)}</td>
          </tr>
        </tbody>
      </table>

      <div class="section-title">Mission Tithe (10% of General Fund Donations)</div>
      <table>
        <thead>
          <tr>
            <th>Week Ending</th>
            <th class="right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${reportData.missionTithe.weeklyBreakdown.map(week => `
            <tr>
              <td>${new Date(week.weekEnding).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
              <td class="amount">${formatCurrency(week.total)}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td>Total</td>
            <td class="amount">${formatCurrency(reportData.missionTithe.total)}</td>
          </tr>
          <tr class="total-row">
            <td><strong>Mission Tithe to Pay</strong></td>
            <td class="amount" style="font-weight: 700;">${formatCurrency(reportData.missionTithe.titheToPay)}</td>
          </tr>
        </tbody>
      </table>

      ${givers.length > 0 ? `
        <div class="section-title">Tithes by Giver</div>
        <table>
          <thead>
            <tr>
              <th>Giver</th>
              <th class="right">Gifts</th>
              ${giftAidEnabled ? '<th>Gift Aid</th>' : ''}
              <th class="right">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${givers.map(giver => `
              <tr>
                <td>${escapeHtml(giver.donor)}</td>
                <td class="amount">${giver.gifts}</td>
                ${giftAidEnabled ? `<td>${giver.giftAidEligible ? 'Yes' : '-'}</td>` : ''}
                <td class="amount">${formatCurrency(giver.total)}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td colspan="${giftAidEnabled ? 3 : 2}">Total Tithes</td>
              <td class="amount">${formatCurrency(sumMoney(givers, (giver) => giver.total))}</td>
            </tr>
          </tbody>
        </table>
      ` : ''}

      ${giftAidEnabled ? `
      <div class="section-title">Gift Aid Summary</div>
      <table>
        <tbody>
          <tr>
            <td>Total Gift Aid Eligible Donations</td>
            <td class="amount">${formatCurrency(reportData.giftAidSummary.eligible)}</td>
          </tr>
          <tr>
            <td>Claimable from HMRC (25%)</td>
            <td class="amount" style="font-weight: 600;">${formatCurrency(reportData.giftAidSummary.claimable)}</td>
          </tr>
        </tbody>
      </table>
      ` : ''}

      ${transfersSectionHTML(reportData.transfers)}
      ${programmeIncomeSectionHTML(programmeIncome)}
      ${loansSectionHTML(reportData.loans)}

      <div class="footer">
        <div>
          <p><strong>${escapeHtml(churchDetails.name)}</strong></p>
          ${churchDetails.charityNumber ? `<p>Registered Charity No: ${escapeHtml(churchDetails.charityNumber)}</p>` : ''}
        </div>
        <div style="text-align: right;">
          <p>RCI Missions Monthly Accounts</p>
          <p>${escapeHtml(reportData.period.label)}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return html;
};

// Generate Annual Report HTML for PDF export
export const generateAnnualReportHTML = (
  reportData: AnnualReportData,
  churchDetails: ChurchDetails,
  programmeIncome: ProgrammeIncome[] = []
) => {
  const giftAidEnabled = isGiftAidEnabled(churchDetails);
  const todayFormatted = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const { period, prior, totals, fundStatement, reserveCover: reserve, giving, missionTithe } = reportData;
  const { showOther, unrestricted, restricted } = splitFundRows(fundStatement);
  const trend = reportData.monthlyTrend.filter((month) => !month.isFuture);
  const hasPriorTrend = trend.some((month) => month.priorIncome !== undefined);
  const fundRow = (name: string, values: number[]) =>
    `<tr><td>${escapeHtml(name)}</td>${fundRowCells(values)}</tr>`;
  const fundHeadings = ['Opening', 'Income', 'Spending', 'Transfers', ...(showOther ? ['Other'] : []), 'Closing'];

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Annual Report - ${escapeHtml(period.label)}</title>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
      <style>${getReportStyles()}</style>
    </head>
    <body>
      <div class="header">
        <div class="brand">
          <h1>${escapeHtml(churchDetails.name)}</h1>
          <p>Annual Financial Report</p>
        </div>
        <div class="meta">
          <p>Report Date: ${todayFormatted}</p>
          <p>Financial year: ${escapeHtml(period.label)}</p>
          ${period.isComplete ? '' : `<p>In progress: ${formatUkDate(period.startDate)} – ${formatUkDate(period.throughDate)}</p>`}
          ${churchDetails.charityNumber ? `<p>Charity No: ${escapeHtml(churchDetails.charityNumber)}</p>` : ''}
        </div>
      </div>

      <div class="document-title">RCI Missions Annual Report</div>

      <div class="summary-cards">
        <div class="summary-card">
          <div class="label">Income</div>
          <div class="value positive">${formatCurrency(totals.totalIncome)}</div>
        </div>
        <div class="summary-card">
          <div class="label">Spending</div>
          <div class="value">${formatCurrency(totals.totalExpenditure)}</div>
        </div>
        <div class="summary-card">
          <div class="label">${totals.netMovement >= 0 ? 'Surplus' : 'Deficit'}</div>
          <div class="value ${totals.netMovement >= 0 ? 'positive' : 'negative'}">${formatSignedCurrency(totals.netMovement)}</div>
        </div>
        <div class="summary-card">
          <div class="label">Reserve cover</div>
          <div class="value">${reserve.months === null ? '—' : `${reserve.months.toFixed(1)} months`}</div>
        </div>
      </div>

      <div class="two-column">
        <div>
          <div class="section-title">Income</div>
          ${categoryTableHTML({
            currentLabel: period.label,
            groups: reportData.receipts,
            total: totals.totalIncome,
            totalLabel: "Total Income",
            comparison: prior ? { label: prior.label, groups: prior.receipts, total: prior.totals.income } : null,
            showPrior: true,
          })}
        </div>

        <div>
          <div class="section-title">Expenditure</div>
          ${categoryTableHTML({
            currentLabel: period.label,
            groups: reportData.payments,
            total: totals.totalExpenditure,
            totalLabel: "Total Expenditure",
            comparison: prior ? { label: prior.label, groups: prior.payments, total: prior.totals.expenditure } : null,
            showPrior: true,
          })}
        </div>
      </div>

      ${trend.length > 0 ? `
      <div class="section-title">Monthly Trend</div>
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th class="right">Income</th>
            <th class="right">Spending</th>
            <th class="right">Net</th>
            <th class="right">Last year income</th>
          </tr>
        </thead>
        <tbody>
          ${trend.map((month) => `
            <tr>
              <td>${escapeHtml(month.label)}${month.isPartial ? ' (part)' : ''}</td>
              <td class="amount">${formatCurrency(month.income)}</td>
              <td class="amount">${formatCurrency(month.expenditure)}</td>
              <td class="amount">${formatSignedCurrency(month.net)}</td>
              <td class="amount">${month.priorIncome === undefined ? '—' : formatCurrency(month.priorIncome)}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td>Total</td>
            <td class="amount">${formatCurrency(totals.totalIncome)}</td>
            <td class="amount">${formatCurrency(totals.totalExpenditure)}</td>
            <td class="amount">${formatSignedCurrency(totals.netMovement)}</td>
            <td class="amount">${hasPriorTrend ? formatCurrency(sumMoney(trend, (month) => month.priorIncome ?? 0)) : '—'}</td>
          </tr>
        </tbody>
      </table>
      ` : ''}

      <div class="section-title">Statement of Funds</div>
      <table>
        <thead>
          <tr>
            <th>Fund</th>
            ${fundHeadings.map((heading) => `<th class="right">${heading}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${unrestricted.map((row) => fundRow(row.fund, fundCellValues(row, showOther))).join('')}
          <tr class="main-category">
            <td>Subtotal: unrestricted funds</td>
            ${fundRowCells(fundCellValues(fundStatement.unrestricted, showOther))}
          </tr>
          ${restricted.map((row) => fundRow(row.fund, fundCellValues(row, showOther))).join('')}
          <tr class="main-category">
            <td>Subtotal: restricted funds</td>
            ${fundRowCells(fundCellValues(fundStatement.restricted, showOther))}
          </tr>
          <tr class="total-row">
            <td>All funds</td>
            ${fundRowCells(fundCellValues(fundStatement.total, showOther))}
          </tr>
        </tbody>
      </table>

      ${prior ? `
        <div class="section-title">Comparison with ${escapeHtml(prior.label)}</div>
        <table>
          <thead>
            <tr>
              <th></th>
              <th class="right">${escapeHtml(prior.label)}</th>
              <th class="right">${escapeHtml(period.label)}</th>
              <th class="right">Change</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Income</td>
              <td class="amount">${formatCurrency(prior.totals.income)}</td>
              <td class="amount">${formatCurrency(totals.totalIncome)}</td>
              <td class="amount">${formatPercentChange(totals.totalIncome, prior.totals.income)}</td>
            </tr>
            <tr>
              <td>Spending</td>
              <td class="amount">${formatCurrency(prior.totals.expenditure)}</td>
              <td class="amount">${formatCurrency(totals.totalExpenditure)}</td>
              <td class="amount">${formatPercentChange(totals.totalExpenditure, prior.totals.expenditure)}</td>
            </tr>
            <tr>
              <td>Surplus / Deficit</td>
              <td class="amount">${formatSignedCurrency(prior.totals.net)}</td>
              <td class="amount">${formatSignedCurrency(totals.netMovement)}</td>
              <td class="amount">—</td>
            </tr>
          </tbody>
        </table>
      ` : ''}

      ${giftAidEnabled ? `
      <div class="section-title">Gift Aid Annual Summary</div>
      <table>
        <tbody>
          <tr>
            <td>Total Gift Aid Eligible Donations</td>
            <td class="amount">${formatCurrency(reportData.giftAidAnnual.totalEligible)}</td>
          </tr>
          <tr>
            <td>Claimable from HMRC (25%)</td>
            <td class="amount" style="font-weight: 600;">${formatCurrency(reportData.giftAidAnnual.totalClaimable)}</td>
          </tr>
        </tbody>
      </table>
      ` : ''}

      <div class="section-title">Mission Tithe and Giving</div>
      <table>
        <tbody>
          <tr>
            <td>Income eligible for mission tithe</td>
            <td class="amount">${formatCurrency(missionTithe.eligible)}</td>
          </tr>
          <tr>
            <td>Mission tithe due (10%)</td>
            <td class="amount" style="font-weight: 600;">${formatCurrency(missionTithe.due)}</td>
          </tr>
          <tr>
            <td>Givers</td>
            <td class="amount">${giving.donorCount}</td>
          </tr>
          <tr>
            <td>Regular givers</td>
            <td class="amount">${giving.regularGivers}</td>
          </tr>
          <tr>
            <td>Gifts</td>
            <td class="amount">${giving.giftCount}</td>
          </tr>
        </tbody>
      </table>

      ${transfersSectionHTML(reportData.transfers)}
      ${programmeIncomeSectionHTML(programmeIncome)}
      ${loansSectionHTML(reportData.loans)}

      <div class="footer">
        <div>
          <p><strong>${escapeHtml(churchDetails.name)}</strong></p>
          ${churchDetails.charityNumber ? `<p>Registered Charity No: ${escapeHtml(churchDetails.charityNumber)}</p>` : ''}
        </div>
        <div style="text-align: right;">
          <p>RCI Missions Annual Report</p>
          <p>Financial Year ${escapeHtml(period.label)}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return html;
};
