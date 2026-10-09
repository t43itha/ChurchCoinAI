// Export handlers for the monthly and annual reports. The PDF and Excel
// generators load on demand so the Reports page stays light.
import { useCallback, useState } from "react";
import type { AnnualReportData, ChurchDetails, MonthlyReportData } from "../../types";
import type { ProgrammeIncome } from "../../lib/programmeIncome";

type ExportKind = "pdf" | "excel";

// Runs one export at a time and reports which kind is busy.
export function useReportExport() {
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const run = useCallback(async (kind: ExportKind, action: () => Promise<void>) => {
    setBusy(kind);
    try {
      await action();
    } catch (error) {
      console.error(`${kind === "pdf" ? "PDF" : "Excel"} export failed:`, error);
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, run };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function savePdf(html: string, filename: string) {
  const { ensureHtmlTitleForPdf, renderPdfBlobFromHtml, savePdfBlob } = await import("../../services/pdfExport");
  const htmlWithTitle = ensureHtmlTitleForPdf(html, filename);
  const blob = await renderPdfBlobFromHtml({ html: htmlWithTitle });
  await savePdfBlob({ blob, filename });
}

export async function exportMonthlyPdf(
  data: MonthlyReportData,
  churchDetails: ChurchDetails,
  programmeIncome: ProgrammeIncome[]
) {
  const { generateMonthlyReportHTML, sanitizePdfFilenamePart } = await import("../../services/pdfGenerator");
  const html = generateMonthlyReportHTML(data, churchDetails, programmeIncome);
  const churchPart = sanitizePdfFilenamePart(churchDetails.name || "Church");
  await savePdf(html, `${churchPart}_Monthly_Report_${sanitizePdfFilenamePart(data.monthName)}`);
}

export async function exportMonthlyExcel(
  data: MonthlyReportData,
  churchDetails: ChurchDetails,
  programmeIncome: ProgrammeIncome[]
) {
  const { generateMonthlyReportXLSX } = await import("../../services/excelGenerator");
  const blob = await generateMonthlyReportXLSX(data, churchDetails, programmeIncome);
  downloadBlob(blob, `Monthly-Report-${data.monthName.replace(" ", "-")}.xlsx`);
}

export async function exportAnnualPdf(
  data: AnnualReportData,
  churchDetails: ChurchDetails,
  programmeIncome: ProgrammeIncome[]
) {
  const { generateAnnualReportHTML, sanitizePdfFilenamePart } = await import("../../services/pdfGenerator");
  const html = generateAnnualReportHTML(data, churchDetails, programmeIncome);
  const churchPart = sanitizePdfFilenamePart(churchDetails.name || "Church");
  await savePdf(html, `${churchPart}_Annual_Report_${sanitizePdfFilenamePart(data.period.label)}`);
}

export async function exportAnnualExcel(
  data: AnnualReportData,
  churchDetails: ChurchDetails,
  programmeIncome: ProgrammeIncome[]
) {
  const { generateAnnualReportXLSX } = await import("../../services/excelGenerator");
  const { sanitizePdfFilenamePart } = await import("../../services/pdfGenerator");
  const blob = await generateAnnualReportXLSX(data, churchDetails, programmeIncome);
  downloadBlob(blob, `Annual-Report-${sanitizePdfFilenamePart(data.period.label)}.xlsx`);
}
