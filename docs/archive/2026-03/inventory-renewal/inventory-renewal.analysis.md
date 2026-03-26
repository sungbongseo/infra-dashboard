# Gap Analysis: inventory-renewal

## Overall Match Rate: 99%

| Category | Score | Status |
|----------|:-----:|:------:|
| Analysis Functions (8/8) | 100% | ✅ |
| UI Sections (8/8) | 100% | ✅ |
| Data Safety (safeDivide 18회) | 100% | ✅ |
| Empty Data Handling | 100% | ✅ |
| Props Plumbing | 100% | ✅ |
| Naming Fidelity | 95% | ✅ |

## 구현 완료 함수

| # | 함수 | 위치 | 상태 |
|---|------|------|:----:|
| 1 | calcInventoryABC | inventoryAnalysis.ts:438 | ✅ |
| 2 | calcCategoryInventory | inventoryAnalysis.ts:465 | ✅ |
| 3 | calcCustomerInventory | inventoryAnalysis.ts:505 | ✅ |
| 4 | calcStockoutEstimate | inventoryAnalysis.ts:539 | ✅ |
| 5 | calcSalesInventoryMatrix | inventoryAnalysis.ts:578 | ✅ |
| 6 | calcInventoryValue | inventoryAnalysis.ts:646 | ✅ |
| 7 | calcInventoryForecast | inventoryAnalysis.ts:711 | ✅ |
| 8 | calcItemGroupInventory | inventoryAnalysis.ts:786 | ✅ |

## UI 섹션 (8/8)

| # | 섹션 | 차트 | 테이블 |
|---|------|------|--------|
| 1 | ABC 파레토 | ComposedChart (Bar+Line) | ABC 요약 카드 |
| 2 | 카테고리별 | BarChart | DataTable |
| 3 | 주거래처별 | BarChart (Top 10) | DataTable |
| 4 | 소진일 경고 | — | DataTable (risk 배지) |
| 5 | 매출×재고 매트릭스 | ScatterChart (4분면) | DataTable |
| 6 | 원가 연계 금액 | BarChart + ABC 카드 | DataTable |
| 7 | 수요 예측 | — | DataTable (coverage 배지) |
| 8 | 품목그룹별 | BarChart | DataTable |

## 계획 대비 추가 구현 (6건)

- 품목계정그룹 level 옵션 (calcCategoryInventory)
- ABC/사분면/금액 요약 카드
- 수요 예측 추세 판단 (increasing/stable/decreasing)
- 품목그룹 과잉재고 카운팅

## 미구현: 없음
