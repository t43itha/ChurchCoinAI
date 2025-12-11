
import { Donor, Pledge, Fund, ChurchDetails, Transaction } from "../types";

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
  transactions?: Transaction[]
) => {
  const todayFormatted = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const todayShort = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');

  // Filter transactions for this donor and sort by date (newest first)
  const donorTransactions = (transactions || [])
    .filter(t => t.type === 'Income')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Calculate transaction totals
  const totalGiven = donorTransactions.reduce((sum, t) => sum + t.amount, 0);

  // Calculate total pledged (from all pledges, not just active)
  const totalPledged = pledges.reduce((sum, p) => sum + p.amount, 0);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Giving Schedule - ${escapeHtml(donor.name)}</title>
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
          <p>Ref: SCH-${escapeHtml((donor._id || donor.id || '').slice(-6).toUpperCase())}</p>
          <p>Period: 01-01-2025 – ${todayShort}</p>
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
            const fund = funds.find(f => f._id === t.fundId || f.id === t.fundId);
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

      <div class="gift-aid-box">
        <h4>Gift Aid Declaration Status</h4>
        <p>
          ${donor.isGiftAidActive 
            ? "<strong>Active:</strong> This schedule is covered by your active Gift Aid declaration. We will claim 25p for every £1 given." 
            : "<strong>Not Active:</strong> We do not currently hold an active Gift Aid declaration for these donations."}
        </p>
      </div>

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
