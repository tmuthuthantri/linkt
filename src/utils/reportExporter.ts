import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { AnalysedTransaction, DailyTripGroup, StatementDocument, UserSettings } from '../types';
import { fmtDate, money, round2 } from './format';

export interface ReportInput {
  transactions: AnalysedTransaction[];
  days: DailyTripGroup[];
  statements: StatementDocument[];
  settings: UserSettings;
  submissionNotes: string;
}

export function claimSummary(input: ReportInput) {
  const claimed = input.transactions.filter((t) => t.status === 'included');
  const total = round2(claimed.reduce((s, t) => s + t.amount, 0));
  const gst = round2(total / 11);
  const dates = claimed.map((t) => t.date).sort();
  const claimDays = new Set(claimed.map((t) => t.date));
  const invoices = new Map<string, { count: number; amount: number; account: string }>();
  for (const t of claimed) {
    const k = t.invoiceRef || 'Unreferenced';
    const v = invoices.get(k) ?? { count: 0, amount: 0, account: t.accountNumber };
    v.count++;
    v.amount = round2(v.amount + t.amount);
    invoices.set(k, v);
  }
  return {
    claimed,
    total,
    gst,
    exGst: round2(total - gst),
    periodStart: dates[0] ?? null,
    periodEnd: dates[dates.length - 1] ?? null,
    claimDays: claimDays.size,
    officeDays: input.days.filter((d) => d.likelyOfficeAttendance && d.claimedCount > 0).length,
    avgPerDay: claimDays.size ? round2(total / claimDays.size) : 0,
    manualCount: claimed.filter((t) => t.manual).length,
    invoices,
    statementTotal: round2(input.transactions.reduce((s, t) => s + t.amount, 0)),
  };
}

const vehicleOf = (t: AnalysedTransaction) => [t.tagNumber, t.vehicleRego].filter(Boolean).join(' / ') || '—';

export function exportPdfReport(input: ReportInput): Blob {
  const s = claimSummary(input);
  const p = input.settings.profile;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;

  // Title band
  doc.setFillColor(30, 64, 175);
  doc.rect(0, 0, W, 74, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('Toll Expense Reimbursement Claim', M, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(
    `Claim period ${s.periodStart ? fmtDate(s.periodStart, 'd MMM yyyy') : '—'} to ${s.periodEnd ? fmtDate(s.periodEnd, 'd MMM yyyy') : '—'}  ·  Prepared ${fmtDate(new Date().toISOString().slice(0, 10), 'd MMM yyyy')}`,
    M,
    54,
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(money(s.total, true), W - M, 38, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`incl. GST ${money(s.gst)}`, W - M, 54, { align: 'right' });

  doc.setTextColor(15, 23, 42);
  const half = (W - M * 2 - 16) / 2;
  autoTable(doc, {
    startY: 92,
    margin: { left: M, right: W - M - half },
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    head: [['Employee', '']],
    tableWidth: half,
    headStyles: { fontStyle: 'bold', textColor: [30, 64, 175] },
    columnStyles: { 0: { textColor: [100, 116, 139], cellWidth: 80 } },
    body: [
      ['Name', p.employeeName || '—'],
      ['Employee ID', p.employeeId || '—'],
      ['Email', p.email || '—'],
      ['Department', p.department || '—'],
      ['Cost centre', p.costCenter || '—'],
      ['Company', p.company || '—'],
    ],
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leftEnd = (doc as any).lastAutoTable.finalY as number;
  autoTable(doc, {
    startY: 92,
    margin: { left: M + half + 16, right: M },
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    head: [['Approving manager', '']],
    tableWidth: half,
    headStyles: { fontStyle: 'bold', textColor: [30, 64, 175] },
    columnStyles: { 0: { textColor: [100, 116, 139], cellWidth: 80 } },
    body: [
      ['Name', p.managerName || '—'],
      ['Title', p.managerTitle || '—'],
      ['Email', p.managerEmail || '—'],
      ['Holiday region', input.settings.holidayRegion],
    ],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const last = () => (doc as any).lastAutoTable.finalY as number;

  const headerEnd = Math.max(leftEnd, last());
  autoTable(doc, {
    startY: headerEnd + 18,
    margin: { left: M, right: M },
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 4 },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    head: [['Summary', 'Value', 'GST breakdown', 'AUD']],
    body: [
      ['Tolls claimed', String(s.claimed.length), 'Total claimed (incl. GST)', money(s.total)],
      ['Days with claimed travel', String(s.claimDays), 'GST component (1/11th)', money(s.gst)],
      ['Likely office-attendance days', String(s.officeDays), 'Amount excl. GST', money(s.exGst)],
      ['Average per claimed day', money(s.avgPerDay), 'Statement total (all tolls)', money(s.statementTotal)],
      ['Manually confirmed items', String(s.manualCount), 'Not claimed (personal / excluded)', money(round2(s.statementTotal - s.total))],
    ],
    columnStyles: { 1: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } },
  });

  autoTable(doc, {
    startY: last() + 14,
    margin: { left: M, right: M },
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 3.5 },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    head: [['Tax invoice / statement reference', 'Account number', 'Tolls claimed', 'Amount (AUD)', 'GST']],
    body: [...s.invoices.entries()].map(([ref, v]) => [ref, v.account || '—', String(v.count), money(v.amount), money(round2(v.amount / 11))]),
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
  });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Claimed toll transactions', M, last() + 24);
  autoTable(doc, {
    startY: last() + 30,
    margin: { left: M, right: M },
    theme: 'striped',
    styles: { fontSize: 7.2, cellPadding: 2.6, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    head: [['Date', 'Time', 'Toll point', 'Tag / vehicle', 'Invoice', 'Basis', 'Amount', 'GST']],
    body: s.claimed.map((t) => [
      fmtDate(t.date, 'EEE dd/MM/yyyy'),
      t.time,
      t.tollPoint + (t.notes ? `\nNote: ${t.notes}` : ''),
      vehicleOf(t),
      t.invoiceRef || '—',
      t.manual ? 'Employee confirmed' : `${t.summary} (${t.confidence}%)`,
      money(t.amount),
      money(t.gst),
    ]),
    foot: [['', '', '', '', '', 'Total', money(s.total), money(s.gst)]],
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    showFoot: 'lastPage',
    columnStyles: { 0: { cellWidth: 62 }, 1: { cellWidth: 40 }, 3: { cellWidth: 58 }, 4: { cellWidth: 84 }, 6: { halign: 'right', cellWidth: 44 }, 7: { halign: 'right', cellWidth: 36 } },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.setFont('helvetica', 'normal');
      doc.text(`${p.employeeName || 'Employee'} · Toll reimbursement claim · ${money(s.total, true)}`, M, h - 18);
      doc.text(`Page ${doc.getNumberOfPages()}`, W - M, h - 18, { align: 'right' });
      doc.setTextColor(15, 23, 42);
    },
  });

  // Notes + declaration + approval block
  let y = last() + 24;
  const H = doc.internal.pageSize.getHeight();
  const notesLines = doc.splitTextToSize(input.submissionNotes.trim() || 'No additional notes.', W - M * 2 - 16);
  const needed = 60 + notesLines.length * 11 + 200;
  if (y + needed > H - 40) {
    doc.addPage();
    y = 56;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Employee submission notes', M, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(M, y + 8, W - M * 2, notesLines.length * 11 + 14, 4, 4, 'S');
  doc.text(notesLines, M + 8, y + 22);
  y += notesLines.length * 11 + 40;

  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const decl = doc.splitTextToSize(
    'Employee declaration: I certify that the toll expenses listed above were incurred while travelling for work purposes, have not been claimed previously, and are supported by the attached Linkt tax invoices / statements. Amounts are in Australian dollars and include GST (1/11th of the toll amount).',
    W - M * 2,
  );
  doc.text(decl, M, y);
  y += decl.length * 10 + 18;
  doc.setTextColor(15, 23, 42);

  const colW = (W - M * 2 - 24) / 2;
  const block = (x: number, title: string, name: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(title, x, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Name: ${name || '______________________________'}`, x, y + 18);
    doc.line(x, y + 50, x + colW, y + 50);
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Signature', x, y + 60);
    doc.line(x + colW * 0.62, y + 50, x + colW, y + 50);
    doc.text('Date', x + colW * 0.62, y + 60);
    doc.setTextColor(15, 23, 42);
  };
  doc.setDrawColor(148, 163, 184);
  block(M, 'Submitted by (employee)', p.employeeName);
  block(M + colW + 24, 'Manager review & approval', p.managerName);
  y += 80;
  doc.setFontSize(8.5);
  doc.text('Approval decision:   [  ] Approved in full     [  ] Approved in part: $__________     [  ] Declined', M, y);
  doc.text('Manager comments: ______________________________________________________________________', M, y + 18);

  doc.setProperties({ title: 'Toll reimbursement claim', creator: 'Linkt Toll Reimbursement Assistant' });
  return doc.output('blob');
}

function txnRow(t: AnalysedTransaction) {
  return {
    Date: t.date,
    Day: fmtDate(t.date, 'EEEE'),
    Time: t.time,
    'Toll point': t.tollPoint,
    Road: t.road,
    Direction: t.direction,
    'Tag number': t.tagNumber ?? '',
    'Vehicle rego': t.vehicleRego ?? '',
    'Transaction type': t.transactionType,
    'Amount (AUD inc GST)': t.amount,
    'GST (AUD)': t.gst,
    'Amount ex GST': round2(t.amount - t.gst),
    'Invoice / statement ref': t.invoiceRef,
    'Account number': t.accountNumber,
    Status: t.status === 'included' ? 'Claimed' : t.status === 'review' ? 'Requires review' : 'Excluded',
    'Decision source': t.manual ? 'Manual' : 'AI recommendation',
    'Confidence %': t.confidence,
    'Day type': t.dayLabel,
    'Trip role': t.tripRole,
    Notes: t.notes,
    'AI reasoning': t.reasons.join(' '),
  };
}

export function exportExcel(input: ReportInput): Blob {
  const s = claimSummary(input);
  const p = input.settings.profile;
  const wb = XLSX.utils.book_new();

  const summary: (string | number)[][] = [
    ['Toll Expense Reimbursement Claim'],
    [],
    ['Employee', p.employeeName],
    ['Employee ID', p.employeeId],
    ['Email', p.email],
    ['Department', p.department],
    ['Cost centre', p.costCenter],
    ['Company', p.company],
    ['Manager', p.managerName],
    ['Manager email', p.managerEmail],
    [],
    ['Claim period start', s.periodStart ?? ''],
    ['Claim period end', s.periodEnd ?? ''],
    ['Tolls claimed', s.claimed.length],
    ['Days with claimed travel', s.claimDays],
    ['Likely office-attendance days', s.officeDays],
    ['Total claimed (AUD inc GST)', s.total],
    ['GST component (1/11th)', s.gst],
    ['Amount ex GST', s.exGst],
    ['Average per claimed day', s.avgPerDay],
    ['Statement total (all tolls)', s.statementTotal],
    [],
    ['Submission notes', input.submissionNotes],
    ['Generated', new Date().toISOString()],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summary);
  ws1['!cols'] = [{ wch: 32 }, { wch: 48 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

  const claimRows = s.claimed.map(txnRow);
  const ws2 = XLSX.utils.json_to_sheet(claimRows);
  XLSX.utils.sheet_add_aoa(ws2, [['TOTAL', '', '', '', '', '', '', '', '', s.total, s.gst, s.exGst]], { origin: -1 });
  ws2['!cols'] = [10, 10, 9, 36, 26, 14, 14, 12, 16, 12, 10, 12, 22, 16, 14, 16, 12, 34, 10, 30, 60].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws2, 'Claim Items');

  const daily = input.days
    .filter((d) => d.claimedCount > 0)
    .map((d) => ({
      Date: d.date,
      Day: fmtDate(d.date, 'EEEE'),
      'Day type': d.dayLabel,
      'Likely office attendance': d.likelyOfficeAttendance ? 'Yes' : 'No',
      'Tolls claimed': d.claimedCount,
      'Claimed (AUD)': d.claimedTotal,
      'GST (AUD)': round2(d.claimedTotal / 11),
      'All tolls that day (AUD)': d.total,
    }));
  const ws3 = XLSX.utils.json_to_sheet(daily);
  ws3['!cols'] = [12, 12, 40, 22, 12, 14, 10, 20].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws3, 'Daily Summary');

  const ws4 = XLSX.utils.json_to_sheet(input.transactions.map(txnRow));
  ws4['!cols'] = [10, 10, 9, 36, 26, 14, 14, 12, 16, 12, 10, 12, 22, 16, 14, 16, 12, 34, 10, 30, 60].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws4, 'All Transactions');

  const ws5 = XLSX.utils.json_to_sheet(
    input.statements.map((d) => ({
      'File name': d.fileName,
      'Invoice / statement ref': d.invoiceRef,
      'Account number': d.accountNumber,
      'Period start': d.periodStart ?? '',
      'Period end': d.periodEnd ?? '',
      Pages: d.pageCount,
      'Toll transactions': d.transactionCount,
      'Non-toll lines excluded': d.excludedLineCount,
      Uploaded: d.uploadedAt,
    })),
  );
  XLSX.utils.book_append_sheet(wb, ws5, 'Statements');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  return [headers.map(csvCell).join(','), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(','))].join('\r\n');
}

export function exportCsv(input: ReportInput, scope: 'claimed' | 'all' = 'claimed'): Blob {
  const list = scope === 'claimed' ? input.transactions.filter((t) => t.status === 'included') : input.transactions;
  // BOM so Excel opens UTF-8 correctly
  return new Blob(['﻿' + toCsv(list.map(txnRow))], { type: 'text/csv;charset=utf-8' });
}
