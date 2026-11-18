# Linkt Toll Reimbursement Assistant

A React 19 + TypeScript + Vite app for Australian employees. Upload Linkt toll statements or tax invoices (PDF), and the app:

- extracts every toll transaction
- works out which trips are likely work travel
- highlights claimed tolls on the **original** PDF
- exports manager-ready reimbursement packages: a highlighted PDF, a PDF report, Excel and CSV

All processing happens in your browser. Statements, settings, overrides and the audit trail are stored in IndexedDB and never leave your machine.

## Getting started

```bash
npm install        # also copies pdf.js + Tesseract OCR assets into public/ (no CDN needed)
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```

To try it without a real statement, click **Upload → Try a sample statement**. This loads `public/samples/sample-toll-statement.pdf`, a synthetic document. To regenerate it, run `npm run sample:generate`.

## Single-file HTML version

`npm run build:standalone` builds the whole app into **one HTML file**: `standalone/linkt-toll-reimbursement-assistant.html` (about 12 MB). Everything is inside it: the app, the PDF engine, the OCR engine and its English model, the fonts and the sample statement.

- **Offline:** download it and double-click it to open in Chrome, Edge, Firefox or Safari 16.4+. No server or internet connection is needed.
- **Sharing:** email it, or upload it to any static host (Netlify Drop, GitHub Pages, SharePoint, an S3 bucket) to get a public link.
- **Your data:** each person's statements and settings are saved in their own browser, the same as in the main app.

Differences from the main build:
- **PDF parsing** runs on the page itself rather than in a background worker, because browsers block workers for files opened from disk. This is fine for statements of a few pages.
- **PDF fonts:** pages are drawn with system fonts instead of the bundled standard PDF fonts.
- **Old Safari:** the OCR engine needs WebAssembly SIMD, which Safari only has from version 16.4.

## Importing leave from screenshots

Use **Dashboard → Import leave**, **Calendar → Import leave screenshot**, or **Settings → Leave & holidays → Import from screenshot**. You can drop in, browse for, or paste (Ctrl+V / ⌘V) screenshots of your HR portal, payroll system or calendar.

1. **On-device OCR.** Tesseract.js reads the image in your browser, using a self-hosted engine and English model. The image is upscaled and contrast-boosted first, and dark-mode screenshots are inverted. Words are then regrouped into visual rows by their bounding boxes, so each table row keeps its leave type, dates and status together.
2. **Parsing.** `src/utils/leaveScreenshotParser.ts` turns the text into leave entries:
   - **Dates:** `dd/mm/yyyy`, `12 Aug 2026`, `Aug 12, 2026`, ISO, compact ranges like `12–16 Oct`, and `from … to …` ranges. A missing year is inferred from other dates in the screenshot, or from the statement period.
   - **Leave type:** Annual, Sick, Personal/Carer's, RDO/TOIL, Long Service, Training or Other.
   - **Status:** declined or cancelled leave is unticked by default, and pending leave is flagged.
   - **Part days:** `0.5`, `half day` and hours-based entries are marked as part days.
   - **Other dates ignored:** dates such as "Submitted on …" are skipped.
3. **Review before applying.** Every entry is editable before it's saved. Each row shows how many statement tolls fall on those days and how much would come off the claim. If OCR misreads something, use **View / fix text** to correct the recognised text and re-scan it.
4. **Applying.** Full leave days drop below 50% confidence and are excluded from the claim. Half-day leave caps confidence at 85%, so those tolls stay claimable but are flagged for review. Manual claim decisions on the new leave days are reset by default (you can turn this off), and the import is written to the audit trail.

## Architecture

| Path | Purpose |
| --- | --- |
| `src/types/index.ts` | Domain types (`TollTransaction`, `DailyTripGroup`, `RosterPattern`, `UserSettings`, …) |
| `src/store/useTollStore.ts` | Zustand store persisted to IndexedDB (`idb-keyval`). PDF bytes are kept in a separate store. Includes clear-data and factory-reset actions. |
| `src/hooks/useAnalysis.ts` | Shared, memoised analysis and KPI totals |
| `src/utils/pdfSetup.ts` / `pdfPolyfills.ts` | pdf.js worker setup and runtime polyfills (`Promise.try`, `Promise.withResolvers`, `Uint8Array` hex helpers, `Math.sumPrecise`) |
| `src/utils/pdfExtractor.ts` | Groups text lines by tolerance using `getTextContent()`. Parses toll rows, skips payments (`cr`), surcharges and totals, and records exact `pdfCoords` (`rowTop = baseline − 7.5`, `height = 9.5pt`). |
| `src/utils/tollDetectionEngine.ts` | Trip grouping, commute-window matching, return-trip pairing, rosters (including 9-day fortnights and rotating Saturdays), leave and holidays, 0–100% confidence scoring, learned commute habits |
| `src/utils/australianHolidays.ts` | National, QLD, NSW and VIC public holidays, including substitute days, Easter and the Ekka |
| `src/utils/highlightedPdfExporter.ts` | Renders each original page at 2×, then draws translucent highlights and left-margin checkmarks. Adds a header and a legend footer as extra margin, so they never cover statement content. |
| `src/utils/reportExporter.ts` | PDF claim report (summary, GST, invoice references, signature block), multi-sheet `.xlsx`, and CSV |
| `src/utils/ocr.ts` / `leaveScreenshotParser.ts` | On-device OCR for leave screenshots, plus the leave-text parser |
| `src/components/*` | Header, Dashboard, Transactions, Split (PDF) view, PDF viewer, Calendar, and the Upload, Leave import, Settings, Export, Audit and Reset modals |

## Confidence scoring

| Score | Meaning |
| --- | --- |
| 100% | You manually selected or overrode it |
| 95–99% | Rostered day, and trips match both the morning and evening commute windows (“Likely Office Attendance”). Auto-selected if that option is on. |
| 80–94% | Rostered day with only one commute leg (an un-paired trip) |
| 50–79% | Work day, but travel at an unusual time |
| 0–49% | Outside the roster, or on a leave day or public holiday |

Tolls from tags or plates that you haven't registered lose 25 points, but only once you have registered at least one vehicle or tag.
