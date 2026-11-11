import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DailyReportPeriod } from '../types';

export interface DailyReportPdfData {
  institutionName: string;
  branch: string;
  section: string;
  date: string;
  totalReportedSessions: number;
  generatedAt: string;
  periods: DailyReportPeriod[];
}

export function createDailyReportPdf(report: DailyReportPdfData): { doc: jsPDF; filename: string } {
  // Use landscape if any period has a long absentee list (> 18 roll numbers) so roll numbers wrap cleanly
  const hasLongAbsenteeList = report.periods.some((p) => p.absentCount > 18);
  const doc = new jsPDF({
    orientation: hasLongAbsenteeList ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const generatedTimestamp = new Date(report.generatedAt || Date.now()).toLocaleString();

  // Header Banner
  doc.setFillColor(15, 23, 42); // Slate-900 Navy
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('CLASSYNC — DAILY ATTENDANCE REPORT', 14, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const instLines = doc.splitTextToSize(
    report.institutionName ||
      'Gayatri Vidya Parishad Institute of Higher Learning and Research, North Campus, Kommadi, Visakhapatnam, Andhra Pradesh',
    pageWidth - 28
  );
  doc.text(instLines, 14, 17);

  // Metadata Box
  doc.setTextColor(15, 23, 42);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, 33, pageWidth - 28, 18, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(`Branch: ${report.branch}`, 18, 40);
  doc.text(`Section: ${report.section}`, 85, 40);
  doc.text(`Report Date: ${report.date}`, 130, 40);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Reported Sessions: ${report.totalReportedSessions}`, 18, 46.5);
  doc.text(`Generated At: ${generatedTimestamp}`, 85, 46.5);

  // Chronological Period Table
  const tableRows = report.periods.map((p, idx) => [
    String(p.serialNumber || idx + 1),
    `${p.startTime} - ${p.endTime}`,
    p.periodNumber ? `${p.subjectName} (P${p.periodNumber})` : p.subjectName,
    String(p.absentCount),
    p.absentCount === 0 ? 'NIL (All Present)' : p.absentShortRollsText || p.absentShortRolls.join(', '),
  ]);

  autoTable(doc, {
    startY: 56,
    head: [['S.No', 'Time Range', 'Subject / Period', 'Absentees', 'Absent Class Roll Numbers']],
    body: tableRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 3.5,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      1: { cellWidth: 28, font: 'courier' },
      2: { cellWidth: hasLongAbsenteeList ? 55 : 42, fontStyle: 'bold' },
      3: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
      4: { cellWidth: 'auto', font: 'courier', fontSize: 8.5 },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `CLASSYNC Official Attendance Record · ${report.branch} - Section ${report.section} · ${report.date}`,
      14,
      pageHeight - 8
    );
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 32, pageHeight - 8);
  }

  const safeBranch = report.branch.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `CLASSYNC_Attendance_${safeBranch}_Sec${report.section}_${report.date}.pdf`;

  return { doc, filename };
}

export function downloadDailyReportPdf(report: DailyReportPdfData): string {
  const { doc, filename } = createDailyReportPdf(report);
  doc.save(filename);
  return filename;
}

export async function shareOrDownloadDailyReportPdf(
  report: DailyReportPdfData
): Promise<{ method: 'WEB_SHARE' | 'DOWNLOAD'; message: string }> {
  const { doc, filename } = createDailyReportPdf(report);
  const blob = doc.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    await navigator.share({
      title: `CLASSYNC Daily Attendance — ${report.branch} Sec ${report.section} (${report.date})`,
      text: `Daily attendance report for ${report.branch} Section ${report.section} on ${report.date} (${report.totalReportedSessions} session(s)).`,
      files: [file],
    });
    return {
      method: 'WEB_SHARE',
      message: 'Attendance report shared via native system share dialog.',
    };
  }

  // Fallback to downloading PDF
  doc.save(filename);
  return {
    method: 'DOWNLOAD',
    message: `Browser native file sharing is not supported on this device; downloaded ${filename} instead.`,
  };
}
