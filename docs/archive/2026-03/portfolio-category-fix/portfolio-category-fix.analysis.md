# Gap Analysis: 대분류별 포트폴리오 분포 누락 수정

> 분석 일시: 2026-03-30
> 대상: portfolioOptimization.ts, PortfolioTab.tsx

## 1. 설계 의도

"대분류별 포트폴리오 분포" 차트에서 **모든 대분류**가 표시되어야 한다. 매출 0인 품목만 있는 대분류도 DISCONTINUE로 분류하여 차트에 포함.

## 2. 근본 원인

`portfolioOptimization.ts` line 195의 `filter((it) => it.sales !== 0)`이 매출 0인 품목을 모두 제거. 특정 대분류의 모든 품목이 매출 0이면 해당 대분류 전체가 categorySummary에서 누락.

## 3. 수정 내용

### portfolioOptimization.ts — 2-Pass 처리
- 매출 0 품목을 `zeroSalesItems`로 별도 보존
- zero-sales 품목을 `DISCONTINUE`로 분류하여 `allPortfolioItems`에 합산
- `summary`, `categorySummary`, `topDiscontinue`는 전체 품목(`allPortfolioItems`) 기반
- `items` (scatter chart용)는 기존대로 매출 있는 품목만 유지

### PortfolioTab.tsx — 3개 수정
1. EmptyState 조건: `items.length === 0 && categorySummary.length === 0`으로 변경
2. KPI 비율 분모: `items.length` → `totalItems` (전체 품목 수)로 변경
3. 차트 description: 총 품목 수와 대분류 수 동적 표시

## 4. 검증 항목 (12개)

| # | 항목 | 결과 |
|---|------|------|
| 1 | 매출 0 품목 보존 (zeroSalesItems) | ✅ Pass |
| 2 | DISCONTINUE 분류 | ✅ Pass |
| 3 | allPortfolioItems 합산 | ✅ Pass |
| 4 | categorySummary 완전성 | ✅ Pass |
| 5 | summary 정확성 | ✅ Pass |
| 6 | topDiscontinue 포함 | ✅ Pass |
| 7 | discontinueSavings (allAggItems 조회) | ✅ Pass |
| 8 | items 반환 (scatter chart 회귀 방지) | ✅ Pass |
| 9 | Edge case (all zero sales) | ✅ Pass (수정 완료) |
| 10 | 차트 description 동적 표시 | ✅ Pass |
| 11 | 기존 스코어링 무결성 | ✅ Pass |
| 12 | KPI 비율 분모 일관성 | ✅ Pass (수정 완료) |

## 5. Match Rate

**100/100** (초기 93 → 2개 갭 수정 후 100)

## 6. 빌드 검증

`npm run build` ✅ 성공 (TypeScript/ESLint 에러 없음)
