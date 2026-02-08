# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
npm run dev        # 개발 서버 (Next.js hot reload)
npm run build      # 프로덕션 빌드
npm start          # 프로덕션 서버
npm run lint       # ESLint (next lint)
```

No test framework is configured. Deployed on Vercel.

## Architecture

**Tech Stack**: Next.js 14 (App Router) / React 18 / TypeScript / Zustand / Recharts / Tailwind CSS / Radix UI

This is a client-side analytics dashboard for 인프라 사업본부 sales data. Users upload Excel files which are parsed in the browser — there is no backend API.

### Data Flow

```
Excel files (drag-and-drop) → FileUploader.tsx
  → detectFileType() via regex on filename (lib/excel/schemas.ts)
  → parseExcelFile() with XLSX library (lib/excel/parser.ts)
  → Organization filter applied (orgNames from dataStore)
  → Zustand dataStore updated
  → Pages subscribe via useDataStore selectors
  → useMemo calls analysis functions for computed data
  → Recharts renders visualizations
```

### Zustand Stores (src/stores/)

- **dataStore**: All parsed data (sales, orders, collections, orgProfit, teamContribution, profitabilityAnalysis, receivableAging Map), uploaded file list, org filter (orgNames Set). This is the primary store.
- **filterStore**: Active filtering state (dateRange, selectedOrgs, selectedUsers). Used by GlobalFilterBar and integrated across pages.
- **uiStore**: Sidebar state, dark mode, active tab.

### Key Directories

- `src/app/dashboard/` — Page routes (overview, sales, profitability, receivables, data, orders, profiles)
- `src/components/dashboard/` — Shared dashboard components (KpiCard, ChartCard, FileUploader, EmptyState, AnalysisTooltip, GlobalFilterBar, DataTable, ErrorBoundary, LoadingSkeleton, ExportButton)
- `src/components/ui/` — Radix UI-based primitives (button, card, select, tabs, etc.)
- `src/lib/excel/` — Excel parsing: `schemas.ts` defines 8 file types with regex patterns and header configs; `parser.ts` handles XLSX reading and per-type row parsing with error handling
- `src/lib/analysis/` — Pure computation functions:
  - `kpi.ts` — 매출/수주/비용구조/레이더(OrgRatioMetric)/히트맵(PlanVsActualHeatmap) calculations
  - `aging.ts` — 미수금 aging/risk/credit analysis
  - `profiling.ts` — 영업사원 성과 scoring (HHI, PerformanceScore, 5-axis analysis)
  - `dso.ts` — DSO (Days Sales Outstanding) calculations
  - `ccc.ts` — CCC (Cash Conversion Cycle) calculations
  - `pipeline.ts` — O2C (Order-to-Cash) pipeline analysis
  - `profitability.ts` — Product-level profitability analysis
  - `profitRiskMatrix.ts` — Profitability risk matrix with fuzzy matching
- `src/types/` — TypeScript interfaces for all data structures

### 8 Excel File Types (lib/excel/schemas.ts)

Each file type is detected by filename regex. Some use merged headers (rows 0-1). Organization filtering uses different field names per type (`영업조직` or `영업조직팀`).

| Type | Filter Field |
|------|-------------|
| organization | — |
| salesList, collectionList, orderList, receivableAging | 영업조직 |
| orgProfit, teamContribution, profitabilityAnalysis | 영업조직팀 |

Note: `customerLedger` was removed in Phase 5-E as it was unused.

### Page Pattern

Each dashboard page follows the same pattern:
1. Read data from `useDataStore` with selectors
2. Read filter state from `useFilterStore` (dateRange, selectedOrgs, selectedUsers)
3. Filter with `filterByOrg(data, orgNames, fieldName)` and `filterByDateRange(data, dateRange, dateField)` via `useMemo`
4. Compute derived data with analysis functions via `useMemo`
5. Render KpiCards + ChartCards wrapping Recharts components
6. Show `EmptyState` when no data loaded, `LoadingSkeleton` during loading
7. Wrap in `ErrorBoundary` for graceful error handling

### Conventions

- All UI text is in Korean
- Numbers use Korean currency format (억/만원) via `formatCurrency()` in `lib/utils.ts`
- `PlanActualDiff` type (`{ 계획, 실적, 차이 }`) is used throughout for plan-vs-actual fields
- Chart colors: `CHART_COLORS` array in `lib/utils.ts` (7 HSL colors)
- Dark mode toggled via `uiStore.toggleDarkMode()`, uses Tailwind `dark:` classes
- Path alias: `@/*` maps to `src/*`
- `DEFAULT_INFRA_ORG_NAMES` in `dataStore.ts` provides initial org filter
- `extractMonth()` in `lib/utils.ts` handles: YYYY-MM-DD, YYYY/MM/DD, YYYYMMDD, Excel serial numbers
- Recharts waterfall charts use stacked bars with transparent "base" + colored "value" segments
- `Math.min(top, bottom)` for waterfall base to handle negative values correctly
- `TOOLTIP_STYLE` constant for consistent Recharts tooltip styling

### Charting Patterns

- **Waterfall**: Stacked BarChart with invisible `base` bar + colored `value` bar (profitability page). Use `Math.min(top, bottom)` for base and `Math.abs(diff)` for value to handle negatives.
- **Radar**: Uses `Math.max(val, 0)` to clamp negatives; raw values shown in custom tooltip
- **Pareto**: ComposedChart with Bar (amount) + Line (cumulative %), reference lines at 80%/95%
- **Scatter**: Dynamic Y-axis domain with 0% breakeven ReferenceLine. Include LabelList for org names on data points.
- **Aging colors**: Green-to-red gradient by aging period, not random `CHART_COLORS`
- **Heatmap**: Cost items use inverted color scheme (>100% = red/bad), revenue items use normal (>100% = green/good). Handle Infinity as sentinel value with "계획없음" display.

### Data Quality & Error Handling

- `safeParseRows()` in parser.ts for row-level error isolation in wide Excel types
- Upload validation: 100MB file size limit, type detection, row count verification
- Parser warnings displayed in FileUploader with amber alert styling
- `profitabilityAnalysis` fallback: if org filter leaves zero-valued data → use full dataset with warning
- Recharts Pie label: typed as `(props: any)` to avoid PieLabelRenderProps incompatibility

### SAP Hierarchical Report Handling

- SAP-style Excel reports (e.g., 901 수익성분석) use merged cells where `영업조직팀` only appears on subtotal rows
- `fillDownHierarchicalOrg()` in parser.ts propagates org name from subtotal rows to subsequent detail rows
- Applied to `profitabilityAnalysis` file type; "합계" (grand total) rows are excluded to prevent double-counting
- Without fill-down, org filter would remove all detail rows (empty org), leaving only subtotal rows with zero 실적 values

### Known Constraints

- Map iteration: use `Array.from(map.entries())` instead of for-of (downlevelIteration not enabled in tsconfig)
- Organization filtering: `filterByOrg()` accepts field param: "영업조직" (default) or "영업조직팀"
- Profitability page: fuzzyGet in profitRiskMatrix uses contains-matching for org name lookups (영업조직팀 ↔ 영업조직)

### Development Status

All Phase 5 improvements are complete (5-A through 5-F):
- **5-A**: Critical bug fixes (waterfall, radar, extractMonth, share validation)
- **5-B**: GlobalFilterBar, DataTable, ErrorBoundary, Export functionality
- **5-C**: DSO/CCC metrics, O2C pipeline, profitability activation, enhanced KPIs
- **5-D**: filterStore integration (6 pages), loading skeletons, responsive charts, TOOLTIP_STYLE
- **5-E**: Parser error handling, upload validation (100MB), warnings display, customerLedger removed
- **5-F**: Profitability page deep audit (30 issues: 4 Critical, 6 High, 10 Medium fixed)

See `PHASE5_분석보완계획.md` for the detailed issue list and implementation history.
