import * as XLSX from 'xlsx';
import { MonthlyReportData, AnnualReportData, ChurchDetails, CategoryGroup } from '../types';

// Generate Monthly Report Excel workbook
export const generateMonthlyReportXLSX = async (
  reportData: MonthlyReportData,
  churchDetails: ChurchDetails
): Promise<Blob> => {
  const workbook = XLSX.utils.book_new();

  // Summary Sheet
  const summaryData = [
    ['RCI Missions Monthly Report'],
    [churchDetails.name],
    [reportData.monthName],
    [''],
    ['Summary'],
    ['Gross Income', reportData.totals.grossIncome],
    ['Total Expenditure', reportData.totals.totalExpenditure],
    ['Net Bankable', reportData.totals.netBankable],
    ['Gift Aid Eligible', reportData.giftAidSummary.eligible],
    ['Gift Aid Claimable', reportData.giftAidSummary.claimable],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);

  // Format currency cells
  const currencyFormat = '£#,##0.00';
  ['B6', 'B7', 'B8', 'B9', 'B10'].forEach(cell => {
    if (summarySheet[cell]) {
      summarySheet[cell].z = currencyFormat;
    }
  });

  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Receipts Sheet
  const receiptsData = [
    ['Receipts (Income)'],
    [''],
    ['Main Category', 'Subcategory', 'Amount'],
  ];
  reportData.receipts.forEach((group: CategoryGroup) => {
    receiptsData.push([group.mainCategory, '', group.total]);
    group.subcategories.forEach(sub => {
      receiptsData.push(['', sub.name, sub.total]);
    });
  });
  receiptsData.push(['', '', '']);
  receiptsData.push(['Total', '', reportData.totals.grossIncome]);

  const receiptsSheet = XLSX.utils.aoa_to_sheet(receiptsData);
  XLSX.utils.book_append_sheet(workbook, receiptsSheet, 'Receipts');

  // Payments Sheet
  const paymentsData = [
    ['Payments (Expenditure)'],
    [''],
    ['Main Category', 'Subcategory', 'Amount'],
  ];
  reportData.payments.forEach((group: CategoryGroup) => {
    paymentsData.push([group.mainCategory, '', group.total]);
    group.subcategories.forEach(sub => {
      paymentsData.push(['', sub.name, sub.total]);
    });
  });
  paymentsData.push(['', '', '']);
  paymentsData.push(['Total', '', reportData.totals.totalExpenditure]);

  const paymentsSheet = XLSX.utils.aoa_to_sheet(paymentsData);
  XLSX.utils.book_append_sheet(workbook, paymentsSheet, 'Payments');

  // Weekly Breakdown Sheet
  const weeklyData = [
    ['Weekly Summary'],
    [''],
    ['Week Ending', 'Receipts', 'Payments', 'Net'],
  ];
  reportData.weeklyBreakdown.forEach(week => {
    weeklyData.push([
      week.weekEnding,
      week.receiptsTotal,
      week.paymentsTotal,
      week.receiptsTotal - week.paymentsTotal,
    ]);
  });
  weeklyData.push(['', '', '', '']);
  weeklyData.push([
    'Total',
    reportData.totals.grossIncome,
    reportData.totals.totalExpenditure,
    reportData.totals.netBankable,
  ]);

  const weeklySheet = XLSX.utils.aoa_to_sheet(weeklyData);
  XLSX.utils.book_append_sheet(workbook, weeklySheet, 'Weekly');

  // Tithes Sheet
  if (reportData.tithes.length > 0) {
    const tithesData = [
      ['Tithes Breakdown'],
      [''],
      ['Donor Name', 'Gift Aid Eligible', 'Amount'],
    ];
    reportData.tithes.forEach(tithe => {
      tithesData.push([
        tithe.donorName,
        tithe.isGiftAidEligible ? 'Yes' : 'No',
        tithe.amount,
      ]);
    });
    tithesData.push(['', '', '']);
    tithesData.push([
      'Total',
      '',
      reportData.tithes.reduce((sum, t) => sum + t.amount, 0),
    ]);

    const tithesSheet = XLSX.utils.aoa_to_sheet(tithesData);
    XLSX.utils.book_append_sheet(workbook, tithesSheet, 'Tithes');
  }

  // Write workbook to blob
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

// Generate Annual Report Excel workbook
export const generateAnnualReportXLSX = async (
  reportData: AnnualReportData,
  churchDetails: ChurchDetails
): Promise<Blob> => {
  const workbook = XLSX.utils.book_new();

  // Summary Sheet
  const summaryData = [
    ['RCI Missions Annual Report'],
    [churchDetails.name],
    [`Financial Year ${reportData.year}`],
    [''],
    ['Summary'],
    ['Total Income', reportData.totals.totalIncome],
    ['Total Expenditure', reportData.totals.totalExpenditure],
    ['Net Movement', reportData.totals.netMovement],
    ['Gift Aid Eligible', reportData.giftAidAnnual.totalEligible],
    ['Gift Aid Claimable', reportData.giftAidAnnual.totalClaimable],
  ];

  if (reportData.yearOverYear) {
    summaryData.push(['']);
    summaryData.push(['Year-over-Year Comparison']);
    summaryData.push(['', `${reportData.year - 1}`, `${reportData.year}`, 'Change']);
    summaryData.push([
      'Income',
      reportData.yearOverYear.previous.income,
      reportData.yearOverYear.current.income,
      `${reportData.yearOverYear.incomeChange.toFixed(1)}%`,
    ]);
    summaryData.push([
      'Expenditure',
      reportData.yearOverYear.previous.expenditure,
      reportData.yearOverYear.current.expenditure,
      `${reportData.yearOverYear.expenditureChange.toFixed(1)}%`,
    ]);
  }

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Income Breakdown Sheet
  const incomeData = [
    ['Income Breakdown'],
    [''],
    ['Main Category', 'Subcategory', 'Amount'],
  ];
  Object.entries(reportData.incomeByMainCategory).forEach(([mainCategory, data]) => {
    incomeData.push([mainCategory, '', data.total]);
    data.subcategories.forEach(sub => {
      incomeData.push(['', sub.name, sub.total]);
    });
  });
  incomeData.push(['', '', '']);
  incomeData.push(['Total', '', reportData.totals.totalIncome]);

  const incomeSheet = XLSX.utils.aoa_to_sheet(incomeData);
  XLSX.utils.book_append_sheet(workbook, incomeSheet, 'Income');

  // Expenditure Breakdown Sheet
  const expenditureData = [
    ['Expenditure Breakdown'],
    [''],
    ['Main Category', 'Subcategory', 'Amount'],
  ];
  Object.entries(reportData.expenditureByMainCategory).forEach(([mainCategory, data]) => {
    expenditureData.push([mainCategory, '', data.total]);
    data.subcategories.forEach(sub => {
      expenditureData.push(['', sub.name, sub.total]);
    });
  });
  expenditureData.push(['', '', '']);
  expenditureData.push(['Total', '', reportData.totals.totalExpenditure]);

  const expenditureSheet = XLSX.utils.aoa_to_sheet(expenditureData);
  XLSX.utils.book_append_sheet(workbook, expenditureSheet, 'Expenditure');

  // Monthly Trend Sheet
  const monthlyData = [
    ['Monthly Trend'],
    [''],
    ['Month', 'Income', 'Expenditure', 'Net'],
  ];
  reportData.monthlyTrend.forEach(month => {
    monthlyData.push([
      month.month,
      month.income,
      month.expenditure,
      month.income - month.expenditure,
    ]);
  });
  monthlyData.push(['', '', '', '']);
  monthlyData.push([
    'Total',
    reportData.totals.totalIncome,
    reportData.totals.totalExpenditure,
    reportData.totals.netMovement,
  ]);

  const monthlySheet = XLSX.utils.aoa_to_sheet(monthlyData);
  XLSX.utils.book_append_sheet(workbook, monthlySheet, 'Monthly Trend');

  // Fund Balances Sheet
  const fundsData = [
    ['Fund Balances (End of Year)'],
    [''],
    ['Fund', 'Type', 'Balance'],
  ];
  reportData.fundBalances.forEach(fund => {
    fundsData.push([fund.fund, fund.type, fund.balance]);
  });
  fundsData.push(['', '', '']);
  fundsData.push([
    'Total',
    '',
    reportData.fundBalances.reduce((sum, f) => sum + f.balance, 0),
  ]);

  const fundsSheet = XLSX.utils.aoa_to_sheet(fundsData);
  XLSX.utils.book_append_sheet(workbook, fundsSheet, 'Fund Balances');

  // Write workbook to blob
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
