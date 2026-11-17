# Linkt Toll Reimbursement Assistant

A React 19 + TypeScript + Vite app for Australian employees. Upload Linkt toll statements or tax invoices (PDF), and the app:

- extracts every toll transaction
- works out which trips are likely work travel
- highlights claimed tolls on the **original** PDF
- exports manager-ready reimbursement packages: a highlighted PDF, a PDF report, Excel and CSV

All processing happens in your browser. Statements, settings, overrides and the audit trail are stored in IndexedDB and never leave your machine.

## Getting started

```bash
npm install        # also copies pdf.js fonts/cmaps/wasm into public/pdfjs
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```

To try it without a real statement, click **Upload → Try a sample statement**. This loads `public/samples/sample-toll-statement.pdf`, a synthetic document. To regenerate it, run `npm run sample:generate`.

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
| `src/components/*` | Header, Dashboard, Transactions, Split (PDF) view, PDF viewer, Calendar, and the Upload, Settings, Export, Audit and Reset modals |

## Confidence scoring

| Score | Meaning |
| --- | --- |
| 100% | You manually selected or overrode it |
| 95–99% | Rostered day, and trips match both the morning and evening commute windows (“Likely Office Attendance”). Auto-selected if that option is on. |
| 80–94% | Rostered day with only one commute leg (an un-paired trip) |
| 50–79% | Work day, but travel at an unusual time |
| 0–49% | Outside the roster, or on a leave day or public holiday |

Tolls from tags or plates that you haven't registered lose 25 points, but only once you have registered at least one vehicle or tag.
