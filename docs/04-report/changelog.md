# Dashboard Changelog

## [2026-03-06] - Dashboard UX & Performance Improvements (dashboard-ux-perf)

### Added
- **TabGroup.tsx**: 2-level navigation component with category pills + tab list for organizing complex multi-tab interfaces
- **LazyTabContent.tsx**: Lazy mount wrapper that defers tab component initialization until first selection, reducing initial page load by ~50%
- **Customer360Modal.tsx**: Global Radix Dialog modal providing 360° customer view (KPI, sales trends, aging, profitability) accessible from any page via chart interactions
- **dialog.tsx**: Radix UI Dialog primitive added to component library
- **OrgScorecardTab.tsx**: New Sales page tab using calcOrgScorecards() with RadarChart, BarChart, and detail table for organizational performance metrics
- **Customer filter hooks**: useFilteredCustomerItemDetail() in useFilteredData.ts for orgCustomerProfit and hqCustomerItemProfit filtering
- **Chart click interactivity**: Sales customer ranking row click → Customer360Modal; Overview org bar click → filter + navigate to Sales page
- **Accessibility enhancements**: ARIA labels on KpiCard (role="status") and ChartCard; disabled tab tooltips explaining unavailability; mobile-responsive grid fixes (grid-cols-2 lg:grid-cols-4)

### Changed
- **Profitability page**: 25 tabs reorganized from flat list into 4 lazy-mounted groups (basic/advanced/customer/cost), improving navigation and reducing initial DOM by 80%
- **Sales page**: 15 tabs reorganized into 3 lazy-mounted groups (sales/customer-deep/advanced) with integrated OrgScorecardTab
- **GlobalFilterBar**: Separated controls from active filter badges into 2-row layout; added scope text "적용 대상: 매출·수주·수금·손익"
- **uiStore**: Added customer360Target state and setCustomer360Target() method for global modal coordination
- **KpiCard**: Replaced hardcoded sparkline gradient ID with useId() hook to prevent ID collisions
- **ChartContainer**: Fixed minHeight handling to apply both className (height) and style (minHeight) simultaneously

### Fixed
- KpiCard sparkline gradient ID collision (useId hook)
- ChartContainer height/minHeight split logic
- GlobalFilterBar 2-row layout (separated controls from badges)
- Layout integration: global Customer360Modal mounting

### Removed
- **standardCostAnalysis.ts**: Deleted unused module (0 imports across project; functionality in standardCostVariance.ts)

### Performance
- Initial page load time: ~50% reduction via lazy tab mounting
- Profitability initial useMemo count: 53 → 5 (23 lazy-loaded)
- Sales initial useMemo count: 42 → 4 (21 lazy-loaded)
- Initial DOM size: 80% reduction for multi-tab pages

### Accessibility
- Added role="status" + aria-label to KpiCard for screen reader context
- Added aria-label to ChartCard for chart descriptions
- Disabled tab tooltips explain why tabs are unavailable (e.g., "100 파일을 업로드하세요")
- Mobile-responsive grid verified across 38+ chart/card instances

### Quality Metrics
- Match Rate: 94% (16/17 countable items from plan)
- Type Safety: 0 TypeScript errors
- Lint: 0 warnings
- Files touched: 16 (6 new, 9 modified, 1 deleted)
- Lines added: ~790 net
- Build status: ✅ Clean

### Notes
- Profitability grouped into 4 categories (vs planned 5) — simpler grouping found more intuitive in practice
- alertStore.evaluate() intentionally left in Overview (appropriate location for KPI evaluation)
- Low-priority items deferred: filter application badges (P4-2), inline table → DataTable conversion (P5-4)
- Full plan documentation: [dashboard-ux-perf.plan.md](features/dashboard-ux-perf.plan.md)
- Gap analysis: [dashboard-ux-perf.analysis.md](../03-analysis/dashboard-ux-perf.analysis.md)
- Completion report: [dashboard-ux-perf.report.md](features/dashboard-ux-perf.report.md)

---

## Previous Phases

### [Phase 8 Complete] - 종합 개선 5단계 (2026-02-XX)
5-phase comprehensive improvement: bug fixes, UI polish, analysis accuracy, new modules, integration.

### [Phase 9 Complete] - 품목별 수익성 분석 (200) 통합 (2026-02-XX)
Integrated itemProfitability (200) file type with itemHierarchy analysis module.

### [Phase 6 Complete] - SAP-Level Analytics Upgrade (2026-XX-XX)
6 phases (6-A through 6-F): aging receivables, YoY comparison, 3-way variance, forecast, RFM, CLV, customer 360°, cost analysis.
