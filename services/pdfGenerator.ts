import { Donor, Pledge, Fund, ChurchDetails } from "../types";

export const generateScheduleHTML = (donor: Donor, pledges: Pledge[], funds: Fund[], churchDetails: ChurchDetails) => {
  const activePledges = pledges.filter(p => p.status === 'Active');
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  
  // Calculate totals
  const totalMonthly = activePledges.reduce((sum, p) => {
    if (p.frequency === 'Monthly') return sum + p.amount;
    if (p.frequency === 'Weekly') return sum + (p.amount * 4.33);
    if (p.frequency === 'Annual') return sum + (p.amount / 12);
    return sum;
  }, 0);

  const totalAnnual = totalMonthly * 12;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Giving Schedule - ${donor.name}</title>
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
          <h1>${churchDetails.name}</h1>
          <p>Finance & Stewardship</p>
        </div>
        <div class="meta">
          <p>Date: ${today}</p>
          <p>Ref: SCH-${donor.id.toUpperCase()}</p>
          <p>Charity No: ${churchDetails.charityNumber || 'N/A'}</p>
        </div>
      </div>

      <div class="recipient">
        <strong>${donor.name}</strong>
        <div>${donor.address ? donor.address.replace(/\n/g, '<br>') : 'Address on file'}</div>
      </div>

      <div class="document-title">Confirmed Giving Schedule</div>

      <table>
        <thead>
          <tr>
            <th width="40%">Fund / Designation</th>
            <th width="20%">Frequency</th>
            <th width="20%">Start Date</th>
            <th width="20%" style="text-align: right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${activePledges.map(p => {
            const fund = funds.find(f => f.id === p.fundId);
            return `
              <tr>
                <td>
                  <div class="fund-name">${fund?.name || 'Unknown Fund'}</div>
                  <div class="fund-desc">${fund?.type || 'General'}</div>
                </td>
                <td>${p.frequency}</td>
                <td>${new Date(p.startDate).toLocaleDateString()}</td>
                <td class="amount">£${p.amount.toFixed(2)}</td>
              </tr>
            `;
          }).join('')}
          ${activePledges.length === 0 ? '<tr><td colspan="4" style="text-align:center; color:#999; padding: 30px;">No active pledges found.</td></tr>' : ''}
        </tbody>
      </table>

      <div class="totals">
        <div class="total-item">
          <div class="total-label">Monthly Projection</div>
          <div class="total-value">£${totalMonthly.toFixed(2)}</div>
        </div>
        <div class="total-item">
          <div class="total-label">Annual Projection</div>
          <div class="total-value">£${totalAnnual.toFixed(2)}</div>
        </div>
      </div>

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
          <p>${churchDetails.name} • ${churchDetails.address || 'Address Not Set'} • ${churchDetails.email || 'No Email'}</p>
        </div>
        <div class="signature-line">
          Authorized Signature
        </div>
      </div>

    </body>
    </html>
  `;
  
  return html;
};