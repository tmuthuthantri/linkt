import { jsPDF, GState } from 'jspdf';
import type { AnalysedTransaction, ClaimStatus, HighlightStyle, StatementDocument, UserSettings } from '../types';
import { openPdf } from './pdfSetup';
import { loadPdfBytes } from '../store/useTollStore';
import { fmtDate, money, round2 } from './format';

export interface HighlightExportOptions {
  statements: StatementDocument[];
  transactions: AnalysedTransaction[];
  settings: UserSettings;
  style: HighlightStyle;
  onlyClaimed: boolean;
  includeHeader: boolean;
  onProgress?: (done: number, total: number) => void;
}

const HEADER_H = 34;
const FOOTER_H = 24;
const RENDER_SCALE = 2; // 2x high-DPI raster of the original page

type RGB = [number, number, number];
const FILL: Record<HighlightStyle, Record<ClaimStatus, { rgb: RGB; opacity: number }>> = {
  emerald: {
    included: { rgb: [16, 185, 129], opacity: 0.24 },
    review: { rgb: [245, 158, 11], opacity: 0.22 },
    excluded: { rgb: [100, 116, 139], opacity: 0.16 },
  },
  yellow: {
    included: { rgb: [250, 204, 21], opacity: 0.32 },
    review: { rgb: [251, 146, 60], opacity: 0.22 },
    excluded: { rgb: [100, 116, 139], opacity: 0.16 },
  },
  margin: {
    included: { rgb: [5, 150, 105], opacity: 0.95 },
    review: { rgb: [217, 119, 6], opacity: 0.9 },
    excluded: { rgb: [100, 116, 139], opacity: 0.7 },
  },
};

function drawCheck(doc: jsPDF, cx: number, cy: number, rgb: RGB) {
  const r = 3.2;
  doc.setGState(new GState({ opacity: 1 }));
  doc.setFillColor(...rgb);
  doc.circle(cx, cy, r, 'F');
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.75);
  doc.setLineCap('round');
  doc.setLineJoin('round');
  doc.lines(
    [
      [0.9, 0.95],
      [1.7, -2.0],
    ],
    cx - 1.35,
    cy + 0.05,
    [1, 1],
    'S',
    false,
  );
}

/**
 * Burns highlights into a copy of each original statement PDF. Every page is
 * rendered from the ORIGINAL document at 2x, highlights are drawn as
 * translucent vector fills (so figures stay legible) and checkmarks sit in the
 * left margin only — never over the dollar amount column.
 */
export async function exportHighlightedPdf(opts: HighlightExportOptions): Promise<Blob> {
  const { statements, transactions, settings, style, onlyClaimed, includeHeader } = opts;
  let doc: jsPDF | null = null;
  const loaded: { stmt: StatementDocument; pdf: Awaited<ReturnType<typeof openPdf>> }[] = [];
  let totalPages = 0;
  for (const stmt of statements) {
    const bytes = await loadPdfBytes(stmt.id);
    if (!bytes) throw new Error(`Original PDF for ${stmt.fileName} is missing — please re-upload it.`);
    const pdf = await openPdf(bytes);
    loaded.push({ stmt, pdf });
    totalPages += pdf.numPages;
  }

  const claimAll = transactions.filter((t) => t.status === 'included');
  const grandTotal = round2(claimAll.reduce((s, t) => s + t.amount, 0));
  const hdr = includeHeader ? HEADER_H : 0;
  const ftr = includeHeader ? FOOTER_H : 0;
  let pageCounter = 0;

  for (const { stmt, pdf } of loaded) {
    const stmtTx = transactions.filter((t) => t.statementId === stmt.id && t.pdfCoords);
    const stmtClaim = stmtTx.filter((t) => t.status === 'included');
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const vp1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;

      const W = vp1.width;
      const H = vp1.height + hdr + ftr;
      const orientation = W > H ? 'l' : 'p';
      if (!doc) doc = new jsPDF({ unit: 'pt', format: [W, H], orientation, compress: true });
      else doc.addPage([W, H], orientation);
      pageCounter++;

      doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, hdr, W, vp1.height, undefined, 'FAST');

      // Highlights
      const pageTx = stmtTx.filter((t) => t.pdfCoords!.page === p && (!onlyClaimed || t.status === 'included'));
      for (const t of pageTx) {
        const c = t.pdfCoords!;
        const y = c.y + hdr;
        const f = FILL[style][t.status];
        if (style === 'margin') {
          doc.setGState(new GState({ opacity: f.opacity }));
          doc.setFillColor(...f.rgb);
          doc.rect(Math.max(1.5, c.x - 4.5), y, 2, c.height, 'F');
        } else {
          doc.setGState(new GState({ opacity: f.opacity }));
          doc.setFillColor(...f.rgb);
          doc.rect(c.x - 2, y, c.width + 4, c.height, 'F');
        }
        if (t.status === 'included') {
          const cx = Math.max(3.6, c.x - (style === 'margin' ? 10.5 : 7.5));
          drawCheck(doc, cx, y + c.height / 2, style === 'yellow' ? [161, 98, 7] : [5, 150, 105]);
        }
      }
      doc.setGState(new GState({ opacity: 1 }));

      if (includeHeader) {
        const pageClaim = stmtClaim.filter((t) => t.pdfCoords!.page === p);
        // Header band
        doc.setFillColor(248, 250, 252);
        doc.rect(0, 0, W, HEADER_H, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.6);
        doc.line(0, HEADER_H, W, HEADER_H);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text('Toll reimbursement claim — highlighted statement', 14, 14);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        doc.setTextColor(71, 85, 105);
        const who = [settings.profile.employeeName, settings.profile.employeeId && `ID ${settings.profile.employeeId}`, settings.profile.costCenter && `CC ${settings.profile.costCenter}`].filter(Boolean).join(' · ');
        doc.text(`${stmt.fileName}${stmt.invoiceRef ? ` · Invoice ${stmt.invoiceRef}` : ''}${who ? ` · ${who}` : ''}`, 14, 25);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(4, 120, 87);
        doc.text(`This page: ${pageClaim.length} claimed · ${money(pageClaim.reduce((s, t) => s + t.amount, 0))}`, W - 14, 14, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.setFontSize(7.2);
        doc.text(`Total claim: ${claimAll.length} tolls · ${money(grandTotal, true)} (GST ${money(round2(grandTotal / 11))})`, W - 14, 25, { align: 'right' });

        // Footer legend
        const fy = H - FOOTER_H;
        doc.setFillColor(248, 250, 252);
        doc.rect(0, fy, W, FOOTER_H, 'F');
        doc.line(0, fy, W, fy);
        const ly = fy + 12;
        const legend: [ClaimStatus, string][] = onlyClaimed ? [['included', 'Claimed for reimbursement']] : [['included', 'Claimed'], ['review', 'Requires review'], ['excluded', 'Excluded / personal']];
        let lx = 14;
        doc.setFontSize(7);
        for (const [st, label] of legend) {
          const f = FILL[style][st];
          doc.setGState(new GState({ opacity: style === 'margin' ? f.opacity : Math.min(1, f.opacity * 2) }));
          doc.setFillColor(...f.rgb);
          doc.rect(lx, ly - 5.5, style === 'margin' ? 2.5 : 14, 7, 'F');
          doc.setGState(new GState({ opacity: 1 }));
          doc.setTextColor(51, 65, 85);
          doc.text(label, lx + (style === 'margin' ? 6 : 18), ly);
          lx += doc.getTextWidth(label) + 34;
        }
        drawCheck(doc, lx + 3, ly - 2.2, [5, 150, 105]);
        doc.setTextColor(51, 65, 85);
        doc.text('= included in claim (left margin)', lx + 9, ly);
        doc.setTextColor(100, 116, 139);
        doc.text(`Generated ${fmtDate(new Date().toISOString().slice(0, 10), 'd MMM yyyy')} · Page ${pageCounter} of ${totalPages}`, W - 14, ly, { align: 'right' });
      }
      opts.onProgress?.(pageCounter, totalPages);
      page.cleanup?.();
    }
    await pdf.destroy();
  }

  if (!doc) throw new Error('No pages to export');
  doc.setProperties({ title: 'Highlighted toll statement', subject: 'Toll reimbursement claim', creator: 'Linkt Toll Reimbursement Assistant' });
  return doc.output('blob');
}
