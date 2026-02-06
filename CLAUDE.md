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

- **dataStore**: All parsed data (sales, orders, collections, orgProfit, teamContribution, profitabilityAnalysis, receivableAging Map, customerLedger), uploaded file list, org filter (orgNames Set). This is the primary store.
- **filterStore**: Defined but currently unused in pages.
- **uiStore**: Sidebar state, dark mode, active tab.

### Key Directories

- `src/app/dashboard/` — Page routes (overview, sales, profitability, receivables, data, orders, profiles)
- `src/components/dashboard/` — Shared dashboard components (KpiCard, ChartCard, FileUploader, EmptyState, AnalysisTooltip)
- `src/components/ui/` — Radix UI-based primitives (button, card, select, tabs, etc.)
- `src/lib/excel/` — Excel parsing: `schemas.ts` defines 9 file types with regex patterns and header configs; `parser.ts` handles XLSX reading and per-type row parsing
- `src/lib/analysis/` — Pure computation functions:
  - `kpi.ts` — 매출/수주/비용구조/레이더(OrgRatioMetric)/히트맵(PlanVsActualHeatmap) calculations
  - `aging.ts` — 미수금 aging/risk/credit analysis
  - `profiling.ts` — 영업사원 성과 scoring (HHI, PerformanceScore, 5-axis analysis)
- `src/types/` — TypeScript interfaces for all data structures

### 9 Excel File Types (lib/excel/schemas.ts)

Each file type is detected by filename regex. Some use merged headers (rows 0-1). Organization filtering uses different field names per type (`영업조직` or `영업조직팀`).

| Type | Filter Field |
|------|-------------|
| organization | — |
| salesList, collectionList, orderList, receivableAging | 영업조직 |
| orgProfit, teamContribution, profitabilityAnalysis | 영업조직팀 |
| customerLedger | — |

### Page Pattern

Each dashboard page follows the same pattern:
1. Read data from `useDataStore` with selectors
2. Filter with `filterByOrg(data, orgNames)` via `useMemo`
3. Compute derived data with analysis functions via `useMemo`
4. Render KpiCards + ChartCards wrapping Recharts components
5. Show `EmptyState` when no data loaded

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

### Charting Patterns

- **Waterfall**: Stacked BarChart with invisible `base` bar + colored `value` bar (profitability page)
- **Radar**: Uses `Math.max(val, 0)` to clamp negatives; raw values shown in custom tooltip
- **Pareto**: ComposedChart with Bar (amount) + Line (cumulative %), reference lines at 80%/95%
- **Scatter**: Dynamic Y-axis domain with 0% breakeven ReferenceLine
- **Aging colors**: Green-to-red gradient by aging period, not random `CHART_COLORS`

### Unused Data Types

- `ProfitabilityAnalysisRecord` and `CustomerLedgerRecord` are parsed by `parser.ts` but not yet displayed in any page. Intended for Phase 5-C cross-dataset analysis.

### Development Status

Phase 5-A (critical bug fixes) is complete. Remaining phases:
- **5-B**: GlobalFilterBar, filterStore integration, DataTable, ErrorBoundary, Export
- **5-C**: Activate unused data types, cross-dataset analysis, DSO/CCC metrics
- **5-D**: UX/visualization (responsive, loading skeletons, accessibility)
- **5-E**: Data quality (parser error handling, upload validation)

See `PHASE5_분석보완계획.md` for the full issue list with severity ratings.
