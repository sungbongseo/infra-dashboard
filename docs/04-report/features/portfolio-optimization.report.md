# PDCA Completion Report: 품목 포트폴리오 최적화 분석

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | 품목 포트폴리오 최적화 분석 (단종/집중 의사결정) |
| 시작일 | 2026-03-19 |
| 완료일 | 2026-03-19 |
| 소요 기간 | 1 session |

### Results

| 지표 | 값 |
|------|-----|
| Match Rate | 92% → 100% (1회 iteration) |
| 신규 파일 | 2개 |
| 수정 파일 | 1개 |
| 총 코드 | 680줄 |

### 1.3 Value Delivered

| 관점 | Before | After |
|------|--------|-------|
| **Problem** | 698개 품목 중 단종/집중 의사결정 근거 없음. 개별 분석(Pareto, Profit Matrix)은 단편적 관점만 제공 | 5축 복합 스코어링으로 전 품목 자동 분류, 4-Action 전략 즉시 제공 |
| **Solution** | 수동 Excel 비교, 감에 의존한 포트폴리오 판단 | 매출(30%)+수익성(25%)+성장성(20%)+원가효율(15%)+계획달성(10%) 복합 점수 자동 산정 |
| **Function UX Effect** | 개별 탭에서 품목 하나씩 확인 | KPI 4개 + 전략 Scatter + TOP 10 테이블 2개 + 대분류 Bar 차트를 한 탭에서 조회 |
| **Core Value** | 의사결정 지연, 저수익 품목 방치 | FOCUS/MAINTAIN/OPTIMIZE/DISCONTINUE 즉시 식별 → 단종 시 절감액 자동 산출 |

---

## 2. Plan Phase

### 2.1 Requirements

- 200.품목별수익성분석(회계) 데이터의 698개 품목에 대한 복합 포트폴리오 최적화 분석
- 5축 스코어링: 매출 규모, 수익성, 성장성, 원가 효율, 계획 달성
- 4-Action 전략 분류: FOCUS / MAINTAIN / OPTIMIZE / DISCONTINUE
- 기존 분석 함수 재활용: calcProfitMatrix, calcMarginErosion

### 2.2 Scope

| 항목 | 범위 |
|------|------|
| 분석 모듈 | `portfolioOptimization.ts` — 복합 스코어링 엔진 |
| UI 탭 | `PortfolioTab.tsx` — 수익성분석 페이지 내 포트폴리오 탭 |
| 페이지 통합 | `profitability/page.tsx` — 탭 등록 + 데이터 전달 |

---

## 3. Implementation

### 3.1 Files Created/Modified

| File | Action | Lines | Description |
|------|--------|------:|-------------|
| `src/lib/analysis/portfolioOptimization.ts` | 신규 | 330 | 5축 복합 스코어링, 4-Action 분류, 대분류 요약 |
| `src/app/dashboard/profitability/tabs/PortfolioTab.tsx` | 신규 | 350 | KPI 4개, Scatter, 테이블 2개, Bar 차트, 마진 침식 경고 |
| `src/app/dashboard/profitability/page.tsx` | 수정 | +15 | 탭 등록, import, TabsContent 추가 |

### 3.2 Key Technical Decisions

| 결정 | 이유 |
|------|------|
| percentileRank midrank 방식 | 동일값이 많은 SAP 데이터에서 정확한 백분위 산출 |
| safeDivide() 헬퍼 | NaN/Infinity 방지 — 매출 0인 품목 안전 처리 |
| 최근 3개월 vs 이전 기간 (월평균 보정) | 기간 길이가 다를 때 공정한 성장률 비교 |
| calcProfitMatrix quadrant 참조 | 4사분면 분류를 보조 지표로 활용 (star/cashcow/question/dog) |
| calcMarginErosion 참조 | 계획 대비 5%p 이상 마진 하락 품목 경고 표시 |

### 3.3 Analysis Module Architecture

```
calcPortfolioOptimization(ItemProfitabilityRecord[])
  ├─ calcProfitMatrix() → quadrantMap (4사분면 참조)
  ├─ calcMarginErosion() → erosionMap (마진 침식 참조)
  ├─ 품목+조직 집계 (agg Map)
  ├─ calcGrowthByItem() → 최근3개월 vs 이전 월평균 성장률
  ├─ 5축 raw 값 계산 (safeDivide 적용)
  ├─ percentileRank (midrank) × 가중치 → 복합점수
  ├─ 전략 분류 (FOCUS/MAINTAIN/OPTIMIZE/DISCONTINUE)
  └─ 출력: items, summary, topFocus, topDiscontinue, categorySummary
```

### 3.4 UI Components

| 컴포넌트 | 내용 |
|----------|------|
| KPI Cards (4개) | FOCUS/MAINTAIN/OPTIMIZE/DISCONTINUE 품목 수 + 비율 + 절감액 |
| 전략 Scatter | X=매출, Y=영업이익률, 색상=전략, 크기=복합점수, 툴팁=quadrant+erosion |
| 집중 추천 TOP 10 | 품목/대분류/조직/매출/이익률/복합점수/전략 — 정렬 가능 |
| 단종 후보 TOP 10 | 동일 컬럼, 마진 침식 AlertTriangle 경고 아이콘 |
| 대분류별 분포 Bar | Stacked horizontal bar — 전략별 품목 수 |
| 마진 침식 배너 | 5%p 이상 침식 품목 수 경고 |
| 산출기준 설명 | 5축 가중치 + 분류 기준 안내 |

---

## 4. Check Phase (Gap Analysis)

### 4.1 Initial Analysis: 92%

| Gap | 영향도 |
|-----|--------|
| 기존 분석 함수 4개 미참조 (calcProfitMatrix, calcParetoAnalysis, calcProductContributionRanking, calcMarginErosion) | Low |
| 테이블에 조직/액션 컬럼 누락 | Low |
| 성장률 "3개월 vs 3개월" → half-split | Low |

### 4.2 Iteration 1: 92% → 100%

| 수정 항목 | 변경 내용 |
|----------|----------|
| calcProfitMatrix 참조 | quadrant 보조 지표로 PortfolioItem에 매핑 |
| calcMarginErosion 참조 | marginErosion 필드 + UI 경고 배너/아이콘 |
| 테이블 컬럼 보강 | 조직 + 전략(ActionBadge) 컬럼 추가 |
| percentileRank 정확도 | midrank 방식 (below + 0.5*equal) |
| NaN/Infinity 안전성 | safeDivide(), safeFixed() 헬퍼 추가 |
| 성장률 계산 | 최근 3개월 vs 이전 기간 월평균 보정 |
| Summary 보강 | focusCount(매출합), erosionWarningCount 추가 |

### 4.3 Final Match Rate: 100%

| Category | Score |
|----------|:-----:|
| Design Match | 100% |
| Architecture Compliance | 100% |
| Convention Compliance | 100% |
| **Overall** | **100%** |

---

## 5. Build Verification

```
✓ npm run build — 0 errors
✓ Static pages: 12/12 generated
✓ profitability page: 68.7 kB → 575 kB First Load JS
```

---

## 6. Conventions Compliance

| Convention | Status |
|-----------|:------:|
| Korean UI text | ✅ |
| formatCurrency (억/만원) | ✅ |
| TOOLTIP_STYLE | ✅ |
| CHART_COLORS / ACTION_COLORS | ✅ |
| Array.from() for Map iteration | ✅ |
| Recharts tooltip `(v: any, name: any)` | ✅ |
| ErrorBoundary wrapping | ✅ |
| LazyTabContent wrapping | ✅ |
| isFinite() guard on toFixed() | ✅ |
| Immutable patterns (no mutation) | ✅ |
| Tab component extraction pattern | ✅ |
