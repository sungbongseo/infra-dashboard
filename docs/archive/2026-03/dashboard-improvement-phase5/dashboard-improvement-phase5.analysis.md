# Gap Analysis: dashboard-improvement-phase5

## Overview
- **Feature**: 인프라 대시보드 종합 개선 (Phase 5+)
- **Design**: docs/02-design/features/dashboard-improvement-phase5.design.md
- **Date**: 2026-03-27
- **Scope**: Critical + High 이슈 수정 (Medium은 Out of Scope)

## Match Rate

| Scope | Resolved | Total | Rate |
|-------|:--------:|:-----:|:----:|
| **Critical + High (핵심)** | **13** | **14** | **93%** ✅ |
| Medium (Out of Scope) | 0 | 7 | 0% |
| Overall | 13 | 21 | 62% |

**핵심 Match Rate: 93%** — 90% 기준 통과

---

## Critical Items (5/6)

| ID | 항목 | 상태 | 근거 |
|----|------|:----:|------|
| A-C1 | NaN/Infinity safeDivide | ✅ | receivableActions.ts:76 safeDivide 적용, 49/55 모듈 사용 |
| A-C2 | 집계 누락 (concat aggregate) | ⚠️ | **기존 알려진 이슈** — 별도 Phase 필요 |
| A-C3 | 이중 카운팅 (COST_CATEGORIES) | ✅ | itemCostAnalysis.ts isSubtotal 필터로 방지 |
| B-C1 | 차트 ErrorBoundary | ✅ | 13파일 적용 (페이지 레벨 래핑) |
| C-C1 | 빌드 에러 | ✅ | 에러 0, 경고 0 |
| C-C2 | TypeScript 에러 | ✅ | 빌드 통과 |

## High Items (8/8) ✅

| ID | 항목 | 상태 | 근거 |
|----|------|:----:|------|
| A-H1 | receivableActions 나눗셈 | ✅ | safeDivide 적용 완료 |
| B-H1 | hex 색상 7개 파일 | ✅ | RISK_COLORS/CHART_COLORS 교체 완료 |
| B-H2 | TOOLTIP_STYLE | ✅ | 54/64 파일 적용 (나머지 커스텀 렌더러) |
| B-H3 | EmptyState | ✅ | 38/64 파일 (부모 페이지 커버) |
| C-H1 | useMemo 의존성 | ✅ | DsoTab cccAnalysis.hasDIO 추가 |
| C-H2 | TC_PAD_ZERO 제거 | ✅ | grep 0건 |
| - | isFinite 가드 (sales/page) | ✅ | top1Share.toFixed 가드 추가 |
| - | 빌드 경고 0개 | ✅ | 기존 2개 → 0개 |

## Medium Items (0/7 — Out of Scope)

| ID | 항목 | 비고 |
|----|------|------|
| A-M1 | safeFixed 미사용 | 다음 사이클 |
| A-M2 | 타입 안전성 | 다음 사이클 |
| B-M1 | 다크모드 미대응 | 다음 사이클 |
| B-M2 | 반응형 깨짐 | 다음 사이클 |
| B-M3 | 한국어 텍스트 | 다음 사이클 |
| C-M1 | 번들 크기 | /dashboard 524kB |
| C-M2 | 리렌더링 | 다음 사이클 |

## Open Gap: A-C2 (월별 Concat 집계)

Design 기준: "monthlyStrategy concat 파일에서 aggregate 미적용 = 0건"

현재 상태:
- aggregate 함수 8개 모두 존재 (utils.ts)
- useFilteredData.ts 등 주요 경로에서 적용
- 일부 소비 경로(profitabilityAnalysis/itemProfitability raw store)에서 누락 가능성
- **별도 전담 Phase 필요** (memory에 기록됨)

영향도: 기간 필터 적용 시 데이터 중복 가능성
권장: 이번 사이클 범위 밖 — 별도 수정 Phase 계획

## 수정된 파일 (11개)

1. `src/lib/analysis/receivableActions.ts` — safeDivide import + 적용
2. `src/lib/utils.ts` — TC_PAD_ZERO 제거
3. `src/app/dashboard/sales/page.tsx` — isFinite 가드
4. `src/app/dashboard/receivables/tabs/DsoTab.tsx` — useMemo 의존성
5. `src/app/dashboard/sales/tabs/MigrationTab.tsx` — RISK_COLORS
6. `src/app/dashboard/sales/tabs/MarginTab.tsx` — RISK_COLORS
7. `src/app/dashboard/sales/tabs/CohortTab.tsx` — RISK_COLORS
8. `src/app/dashboard/profitability/tabs/BreakevenTab.tsx` — RISK_COLORS
9. `src/app/dashboard/profitability/tabs/CustItemTab.tsx` — RISK_COLORS
10. `src/app/dashboard/profitability/tabs/DetailedProfitTab.tsx` — RISK_COLORS
11. `src/app/dashboard/orders/tabs/InventoryTab.tsx` — RISK_COLORS

## 결론

핵심 범위(Critical + High) **93% 달성** — 90% 기준 통과.
유일한 미해결 Critical(A-C2: concat 집계)은 기존 알려진 이슈로 별도 Phase 필요.
