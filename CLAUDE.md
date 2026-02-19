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

**Tech Stack**: Next.js 14 (App Router) / React 18 / TypeScript / Zustand / Recharts / Tailwind CSS / Radix UI / Dexie (IndexedDB)

This is a client-side analytics dashboard for 인프라 사업본부 sales data. Users upload Excel files which are parsed in the browser — there is no backend API. Parsed data persists in IndexedDB via Dexie so page refreshes don't require re-uploading files.

### Data Flow

```
Excel files (drag-and-drop) → FileUploader.tsx
  → detectFileType() via regex on filename (lib/excel/schemas.ts)
  → parseExcelFile() with XLSX library (lib/excel/parser.ts)
  → Organization filter applied (orgNames from dataStore)
  → Zustand dataStore updated + Dexie IndexedDB persisted (lib/db.ts)
  → Pages subscribe via useDataStore selectors
  → useMemo calls analysis functions for computed data
  → Recharts renders visualizations
  → alertStore evaluates KPI thresholds → AlertPanel notifications
```

### Zustand Stores (src/stores/)

- **dataStore**: All parsed data (sales, orders, collections, orgProfit, teamContribution, profitabilityAnalysis, receivableAging Map, orgCustomerProfit, hqCustomerItemProfit, customerItemDetail), uploaded file list, org filter (orgNames Set). Primary store with IndexedDB persistence via Dexie.
- **filterStore**: Active filtering state (dateRange, selectedOrgs, selectedPerson, comparisonRange, comparisonPreset). Supports YoY/MoM comparison periods with auto-calculation. Persisted to IndexedDB.
- **uiStore**: Sidebar state, dark mode, active tab.
- **alertStore**: KPI threshold monitoring with alert rules engine. Evaluates collectionRate, operatingProfitRate, salesPlanAchievement against configurable thresholds.

### Key Directories

- `src/app/dashboard/` — Page routes (overview, sales, profitability, receivables, data, orders, profiles)
- `src/components/dashboard/` — Shared: KpiCard (with sparklines), ChartCard, FileUploader, EmptyState, AnalysisTooltip, GlobalFilterBar, DataTable, ErrorBoundary, LoadingSkeleton, ExportButton, AlertPanel
- `src/components/ui/` — Radix UI-based primitives
- `src/lib/excel/` — Excel parsing: `schemas.ts` defines 11 file types with regex patterns; `parser.ts` handles XLSX reading with `safeParseRows()` for row-level error isolation
- `src/lib/analysis/` — Pure computation functions (see Analysis Modules below)
- `src/lib/db.ts` — Dexie IndexedDB persistence for all parsed data and filter state
- `src/lib/orgMapping.ts` — Centralized fuzzy matching for 영업조직 ↔ 영업조직팀 name resolution
- `src/lib/utils.ts` — formatCurrency (억/만원), formatPercent, extractMonth, filterByOrg, filterByDateRange, filterOrgProfitLeafOnly, aggregateOrgProfit, aggregateToCustomerLevel, CHART_COLORS, TOOLTIP_STYLE
- `src/types/` — TypeScript interfaces for all data structures

### Analysis Modules (src/lib/analysis/)

Core analytics (Phase 5):
- `kpi.ts` — 매출/수주/비용구조/레이더(OrgRatioMetric)/히트맵(PlanVsActualHeatmap)
- `aging.ts` — 미수금 aging/risk/credit analysis
- `profiling.ts` — 영업사원 성과 scoring (HHI, PerformanceScore, 5-axis)
- `dso.ts` — DSO (Days Sales Outstanding)
- `ccc.ts` — CCC (Cash Conversion Cycle) with DPO 5-level cost profile estimation
- `pipeline.ts` — O2C (Order-to-Cash) pipeline
- `profitability.ts` — Product-level profitability
- `profitRiskMatrix.ts` — Profitability risk matrix with fuzzy org matching

Advanced analytics (Phase 6):
- `channel.ts` — 결제조건별 매출 분포
- `prepayment.ts` — 선수금 총괄/분석 (with org-level split)
- `variance.ts` — SAP CO-PA 3-way variance (price/volume/mix)
- `breakeven.ts` — CVP break-even analysis
- `forecast.ts` — Sales forecast (moving average + regression)
- `rfm.ts` — RFM customer segmentation
- `clv.ts` — Customer Lifetime Value
- `whatif.ts` — What-if scenario modeling
- `migration.ts` — Customer migration analysis
- `fx.ts` — Foreign exchange analysis
- `insightGenerator.ts` — Executive insight generator (auto-alerts)
- `planAchievement.ts` — Plan achievement analysis
- `customerProfitAnalysis.ts` — 거래처 계층 트리, HHI 집중도, 랭킹, 세그먼트
- `customerItemAnalysis.ts` — 교차 수익성, ABC 분석, 거래처 포트폴리오, 품목×거래처 매트릭스
- `detailedProfitAnalysis.ts` — Pareto 분석, 제품군별 분석, 마진 침식 감지

### 11 Excel File Types (lib/excel/schemas.ts)

Each file type is detected by filename regex. Some use merged headers (rows 0-1). Organization filtering uses different field names per type.

| Type | Filter Field | Notes |
|------|-------------|-------|
| organization | — | Org master data |
| salesList, collectionList, orderList, receivableAging | 영업조직 | |
| orgProfit, teamContribution, profitabilityAnalysis | 영업조직팀 | |
| orgCustomerProfit (303) | 영업조직팀 | Phase 6-C: 조직별 거래처별 손익 |
| hqCustomerItemProfit (304) | 영업조직팀 | Phase 6-C: 본부 거래처 품목 손익 |
| customerItemDetail (100) | 영업조직팀 | Phase 6-C: 거래처별 품목별 손익 |

### Page Pattern

Each dashboard page follows the same pattern:
1. Read data from `useDataStore` with individual selectors (not destructuring entire store)
2. Read filter state from `useFilterStore` (dateRange, selectedOrgs, comparisonRange)
3. Compute `effectiveOrgNames` from selectedOrgs (if any) or fall back to orgNames
4. Filter with `filterByOrg(data, effectiveOrgNames, fieldName)` and `filterByDateRange(data, dateRange, dateField)` via `useMemo`
5. For orgProfit data, apply `filterOrgProfitLeafOnly()` then `aggregateOrgProfit()` to remove subtotals and aggregate by org
6. Compute derived data with analysis functions via `useMemo`
7. Render KpiCards (with `formula` and `benchmark` props) + ChartCards wrapping Recharts components
8. Show `EmptyState` when no data loaded, `LoadingSkeleton` during loading
9. Wrap in `ErrorBoundary` for graceful error handling

### Tab Component Extraction

All pages extract tab content into separate components under `tabs/` subdirectories:
- `sales/tabs/` — ChannelTab, RfmTab, ClvTab, MigrationTab, FxTab
- `profitability/tabs/` — PnlTab, OrgTab, ContribTab, CostTab, PlanTab, ProductTab, VarianceTab, BreakevenTab, RiskTab, WhatIfTab, CustProfitTab, CustItemTab
- `receivables/tabs/` — StatusTab, RiskTab, CreditTab, DsoTab, PrepaymentTab
- `orders/tabs/` — StatusTab, AnalysisTab, OrgTab, PipelineTab, O2CFlowTab
- `profiles/tabs/` — PerformanceTab, RankingTab, CostTab, TrendTab, ProductTab

Tab components receive filtered data as props from the parent page rather than accessing stores directly.

### Page Tab Structure

| Page | Tabs |
|------|------|
| Overview (`/dashboard`) | 핵심 지표, 조직 분석 |
| Sales (`/dashboard/sales`) | 거래처, 품목, 유형별, 채널, RFM, CLV, 거래처 이동, FX (8 tabs) |
| Profitability (`/dashboard/profitability`) | 손익 현황, 조직 수익성, 팀원별 공헌이익, 비용 구조, 계획 달성, 제품 수익성, 수익성×리스크, 계획 달성 분석, 손익분기, 시나리오, 거래처 손익, 거래처×품목 (12 tabs) |
| Receivables (`/dashboard/receivables`) | 미수금 현황, 리스크 관리, 여신 관리, DSO/CCC, 선수금 (5 tabs) |
| Orders (`/dashboard/orders`) | 수주 현황, 수주 분석, 조직 분석, O2C 파이프라인, O2C 플로우 (5 tabs) |
| Profiles (`/dashboard/profiles`) | 종합 성과, 순위/거래처, 비용 효율, 실적 트렌드, 제품 포트폴리오 (5 tabs) |

### Smart Data Source (Profitability)

When dateRange filter is active and `customerItemDetail` data exists, profitability page switches from `profitabilityAnalysis` to `customerItemDetail` as the data source for date-filtered analysis. This enables period-specific P&L analysis that `profitabilityAnalysis` (which is a snapshot report) cannot provide.

### Conventions

- All UI text is in Korean
- Numbers use Korean currency format (억/만원) via `formatCurrency()` in `lib/utils.ts`
- `PlanActualDiff` type (`{ 계획, 실적, 차이 }`) is used throughout for plan-vs-actual fields
- Chart colors: `CHART_COLORS` array in `lib/utils.ts` (7 HSL colors)
- Dark mode toggled via `uiStore.toggleDarkMode()`, uses Tailwind `dark:` classes
- Path alias: `@/*` maps to `src/*`
- `DEFAULT_INFRA_ORG_NAMES` in `dataStore.ts` provides initial org filter
- `extractMonth()` in `lib/utils.ts` handles: YYYY-MM-DD, YYYY/MM/DD, YYYYMMDD, Excel serial numbers
- `TOOLTIP_STYLE` constant for consistent Recharts tooltip styling
- `KpiCard` accepts `formula` (calculation explanation) and `benchmark` (industry reference) string props for tooltip context
- `NaN`/`Infinity` safety: always guard `.toFixed()` calls with `isFinite()` check; use `formatCurrency()`/`formatPercent()` which handle this automatically

### Charting Patterns

- **Waterfall**: Stacked BarChart with invisible `base` bar + colored `value` bar. Use `Math.min(top, bottom)` for base and `Math.abs(diff)` for value to handle negatives.
- **Radar**: Uses `Math.max(val, 0)` to clamp negatives; raw values shown in custom tooltip
- **Pareto**: ComposedChart with Bar (amount) + Line (cumulative %), reference lines at 80%/95%
- **Scatter**: Dynamic Y-axis domain with 0% breakeven ReferenceLine. Include LabelList for org names.
- **Aging colors**: Green-to-red gradient by aging period, not random `CHART_COLORS`
- **Heatmap**: Cost items use inverted color scheme (>100% = red/bad), revenue items use normal (>100% = green/good). Handle Infinity as sentinel value with "계획없음" display.

### SAP Hierarchical Report Handling

- SAP-style Excel reports (e.g., 901 수익성분석) use merged cells where `영업조직팀` only appears on subtotal rows
- `fillDownHierarchicalOrg()` in parser.ts propagates org name from subtotal rows to subsequent detail rows
- Applied to `profitabilityAnalysis` file type; "합계" (grand total) rows are excluded to prevent double-counting

### Known Constraints

- Map iteration: use `Array.from(map.entries())` instead of for-of (downlevelIteration not enabled in tsconfig)
- Organization filtering: `filterByOrg()` accepts field param: "영업조직" (default) or "영업조직팀"
- Profitability page: fuzzyGet in profitRiskMatrix uses contains-matching for org name lookups (영업조직팀 ↔ 영업조직)
- Recharts Pie label: typed as `(props: any)` to avoid PieLabelRenderProps incompatibility
- Upload validation: 100MB file size limit
- `profitabilityAnalysis` fallback: if org filter leaves zero-valued data → use full dataset with warning
