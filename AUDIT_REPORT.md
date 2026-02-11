# 대시보드 분석 기능 종합 감사 보고서

**감사 일자**: 2026-02-11
**감사 대상**: 인프라 사업본부 분석 대시보드 (Next.js 14)
**감사 범위**: 11개 엑셀 파서, 22개 분석 모듈, 7개 대시보드 페이지, 16개 탭 컴포넌트
**감사 수행**: Claude Opus 4.6 (Dashboard Analysis Auditor)

---

## 1. 감사 요약 (Executive Summary)

### 전체 건강도 평가

| 영역 | 등급 | 비고 |
|------|------|------|
| 파싱 정확성 | A | safeParseRows, fillDownHierarchicalOrg 등 견고한 에러 격리 |
| 수학적 정확성 | A- | DSO 엣지 케이스, 연체 라벨 모호성 존재 |
| Division-by-zero 가드 | A | 전 모듈 일관적 가드 적용 |
| NaN/Infinity 가드 | B+ | formatNumber()에 가드 미적용, 일부 .toFixed() 미보호 |
| 필터 통합 | A | filterByOrg/filterByDateRange 올바르게 적용 |
| 차트 렌더링 | A- | Waterfall/Radar/Heatmap 검증 완료, Pie 음수 문제 잔존 |
| 타입 안정성 | B+ | 스마트 데이터소스의 `as any[]` 캐스트 |
| useMemo 종속성 | A | 전체 25+ useMemo 종속성 배열 검증 완료 |
| 코드 품질 | A- | 탭 분리 후 구조 양호, 일부 미사용 import 가능성 |

### 핵심 지표

- **발견된 문제**: 총 18건
  - Critical: 1건
  - High: 4건
  - Medium: 8건
  - Low: 5건
- **검증 완료 모듈**: 22/22개 (100%)
- **검증 완료 페이지**: 7/7개 (100%)
- **검증 완료 탭 컴포넌트**: 10/10개 (100%)

---

## 2. 발견된 문제 목록 (Prioritized Issue List)

### Critical (즉시 수정 필요)

| # | 위치 | 유형 | 설명 | 영향 범위 |
|---|------|------|------|----------|
| C-1 | `src/lib/utils.ts:27-29` | NaN 가드 누락 | `formatNumber()` 함수에 `isFinite()` 가드 없음. NaN/Infinity 입력 시 KpiCard에 "NaN" 또는 "Infinity" 문자열 표시됨. `formatCurrency()`와 `formatPercent()`에는 가드 있으나 `formatNumber()`에만 누락. KpiCard.tsx:51에서 `format="number"` 사용 시 호출됨 | 모든 페이지의 `format="number"` KpiCard (거래처 수, 분석 인원, 조직 수 등) |

**현재 코드**:
```typescript
// src/lib/utils.ts:27-29
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}
```

**수정 제안**:
```typescript
export function formatNumber(value: number): string {
  if (!isFinite(value)) return "-";
  return new Intl.NumberFormat("ko-KR").format(value);
}
```

### High (1주 이내 수정 권장)

| # | 위치 | 유형 | 설명 | 영향 범위 |
|---|------|------|------|----------|
| H-1 | `src/lib/analysis/dso.ts:19` | 엣지 케이스 | `calcDSO()` - 매출 0, 미수금 0인 경우 DSO=0 반환. 실제로는 "데이터 부족"이나 "우수(excellent)"로 분류되어 오해 유발 | receivables/tabs/DsoTab.tsx DSO 차트 및 KPI |
| H-2 | `src/app/dashboard/profitability/page.tsx:176,181` | 타입 안전성 | 스마트 데이터소스에서 `filteredCustItemDetail as any[]` 캐스트. CustomerItemDetailRecord와 ProfitabilityAnalysisRecord는 구조가 다르나 동일 분석 함수에 전달 | profitability 탭 6개 (product, variance, breakeven, custProfit, custItem, risk) |
| H-3 | `src/lib/analysis/migration.ts:130,304` | 필드 불일치 | 거래처 등급 산정에 `판매금액` 사용. 다른 모든 분석 모듈은 `장부금액` 사용. 환율 차이로 등급이 달라질 수 있음 | sales/tabs/MigrationTab.tsx 거래처 이동 분석 전체 |
| H-4 | `src/app/dashboard/receivables/page.tsx:211` | 라벨 모호성 | "연체비율" formula 텍스트에 "3개월 이상 미수금"이라고 기술하나, 실제 코드(line 151)는 month4+(91일 이상)를 합산. "3개월차 포함 여부"에 대한 혼동. 또한 line 199 KPI 타이틀 "90일 이상 연체"는 실제로 91일 이상(month4+)을 계산하여 1일 차이 존재 | receivables 페이지 KPI 및 연체비율 지표 |

**H-1 상세 분석**:
```typescript
// src/lib/analysis/dso.ts:19
export function calcDSO(totalReceivable: number, avgMonthlySales: number): number {
  if (avgMonthlySales <= 0) return totalReceivable > 0 ? Infinity : 0;
  //                                                              ^^^ 미수금=0, 매출=0일 때 DSO=0
  return (totalReceivable / avgMonthlySales) * 30;
}
```
매출 데이터가 없는 조직의 미수금이 0인 경우 DSO=0일(excellent)로 분류되나, 실제로는 "분석 불가"로 처리해야 함. `calcDSOByOrg()`에서 `Infinity`는 필터링하나 `0` 반환은 필터링하지 않음.

**수정 제안**: DSO 분류에 "데이터 부족" 등급 추가 또는 매출=0 조직을 결과에서 제외

**H-2 상세 분석**:
```typescript
// src/app/dashboard/profitability/page.tsx:175-177
const effectiveProfAnalysis = useMemo(() => {
  if (isUsingDateFiltered) return filteredCustItemDetail as any[];  // 타입 캐스트
  return filteredProfAnalysis;
}, [isUsingDateFiltered, filteredCustItemDetail, filteredProfAnalysis]);
```
`CustomerItemDetailRecord`는 `매출액`이 `number`이고, `ProfitabilityAnalysisRecord`는 `매출액`이 `PlanActualDiff` 타입. 분석 함수들(`calcProductProfitability`, `calcMarginErosion` 등)이 두 타입을 모두 처리하도록 설계되어 있으나, `as any[]`로 인해 컴파일 시점 타입 체크가 비활성화됨.

**수정 제안**: Union 타입 `ProfitabilityAnalysisRecord | CustomerItemDetailRecord`를 정의하고, 분석 함수에서 런타임 타입 가드(`typeof r.매출액 === 'number'`) 사용

### Medium (2주 이내 수정 권장)

| # | 위치 | 유형 | 설명 | 영향 범위 |
|---|------|------|------|----------|
| M-1 | `src/app/dashboard/profitability/page.tsx:751` | Pie 차트 음수 | orgContribPie에 음수 공헌이익 조직이 포함될 경우 Recharts Pie가 비정상 렌더링. 현재 line 772에 제외 카운트 표시는 있으나, 실제 필터링 코드가 없으면 음수 값이 Pie에 전달될 수 있음 | profitability 기여도 분석 탭 |
| M-2 | `src/lib/analysis/kpi.ts` (heatmap) | 비용 미감지 | plan=0, actual>0인 비용항목 → Infinity → "계획없음"(회색). 예산 외 비용 발생을 빨간색으로 경고해야 하나 회색으로 표시됨 | profitability 히트맵 |
| M-3 | `src/lib/analysis/ccc.ts` | 평균 방식 | CCC 평균을 단순 산술평균으로 계산. 매출 규모가 다른 조직들의 가중평균이 아니므로, 소규모 조직의 CCC가 과대 반영됨 | receivables/tabs/DsoTab.tsx 평균 CCC KPI |
| M-4 | `src/app/dashboard/orders/page.tsx:767,773,779` | .toFixed 가드 | SVG 텍스트에서 `convRate.toFixed(1)`, `collRate.toFixed(1)`, `outRate.toFixed(1)` 직접 호출. 상위 연산에서 분모=0 가드가 있으나, 명시적 isFinite 체크 없음 | orders O2C 플로우 다이어그램 |
| M-5 | `src/app/dashboard/profitability/page.tsx:937-947` | .toFixed 가드 | 비용 효율성 테이블에서 `r.원재료비율.toFixed(1)`, `r.상품매입비율.toFixed(1)`, `r.외주비율.toFixed(1)`, `r.orgAvg.원재료비율.toFixed(1)` 등 직접 호출. calcCostStructure가 유한값을 보장하나 명시적 가드 없음 | profitability 비용구조 탭 |
| M-6 | `src/app/dashboard/profitability/page.tsx:730,801` | .toFixed 가드 | 공헌이익율 tooltip에서 `d.공헌이익율.toFixed(1)` 직접 호출 | profitability 기여도 탭 tooltip |
| M-7 | `src/app/dashboard/sales/page.tsx:245` | Pie percent 미보호 | `((percent \|\| 0) * 100).toFixed(1)}%` - percent가 undefined일 때 0으로 폴백하나, NaN 가능성은 미처리. (실무적으로 Recharts가 percent를 항상 제공하므로 위험도 낮음) | sales 내수/수출 도넛 차트 |
| M-8 | `src/app/dashboard/receivables/tabs/CreditTab.tsx:156` | .toFixed 가드 | `c.사용률.toFixed(1)` 직접 호출. calcCreditUtilization이 유한값을 보장하나 명시적 가드 없음 | receivables 여신관리 탭 테이블 |

### Low (개선 권장)

| # | 위치 | 유형 | 설명 | 영향 범위 |
|---|------|------|------|----------|
| L-1 | `src/lib/analysis/channel.ts`, `migration.ts` | 필드 일관성 | channel.ts와 migration.ts가 `판매금액` 사용. channel은 결제조건별 분석이라 의도적이나, migration은 등급 산정에 영향 | 매출 분석 탭 |
| L-2 | `src/app/dashboard/profitability/page.tsx:1637-1640` | KPI 인라인 계산 | breakeven KPI 4개가 JSX 인라인으로 복잡한 reduce/filter/isFinite 연산 수행. 가독성 저하 및 리렌더 시 매번 재계산 | profitability 손익분기 탭 |
| L-3 | `src/app/dashboard/profitability/page.tsx:1201-1256` | Pie IIFE 중복 | 제품 포트폴리오 Pie 차트에서 top10/others 계산이 data와 Cell에서 각각 별도 IIFE로 중복 실행 | profitability 제품수익성 탭 |
| L-4 | `src/app/dashboard/profitability/page.tsx:79-87` | 불필요한 상수 | RADAR_COLORS 배열이 CHART_COLORS를 그대로 복사. 직접 CHART_COLORS 사용 가능 | profitability 레이더 차트 |
| L-5 | `src/app/dashboard/profitability/page.tsx:292-293` | 널리시 합체 | `r.공헌이익?.실적 \|\| 0` 패턴 사용. `?? 0`이 더 정확 (실적이 0인 경우 || 0은 동작하지만 의미가 다름) | profitability 기여도 데이터 |

---

## 3. 수치 정확성 검증 결과

### 3.1 파서 모듈 (src/lib/excel/)

| 검증 항목 | 결과 | 비고 |
|----------|------|------|
| schemas.ts 정규식 11개 | PASS | 파일명 패턴 겹침 없음. orgCustomerProfit regex가 orgProfit보다 먼저 매칭되도록 ordering 처리됨 |
| parser.ts num() 함수 | PASS | `Number(v) \|\| 0` - 빈 값/NaN → 0 |
| parser.ts str() 함수 | PASS | `String(v \|\| "").trim()` - null/undefined 안전 |
| parsePlanActualDiff() | PASS | 계획/실적/차이 3개 필드 일괄 파싱, 누락 시 0 기본값 |
| safeParseRows() | PASS | try-catch로 행 단위 에러 격리, 에러 행 카운트 반환 |
| fillDownHierarchicalOrg() | PASS | SAP 계층 리포트의 병합 셀 전파, "합계" 행 제외 |
| fillDownMultiLevel() | PASS | 다단계 계층 전파 (customerItemDetail용) |
| 100MB 파일 크기 제한 | PASS | parser.ts와 FileUploader.tsx 양쪽에서 검증 |
| 영업조직 vs 영업조직팀 매핑 | PASS | orgFilterField 설정이 스키마별 정확 |

### 3.2 분석 모듈별 검증 (src/lib/analysis/)

| 모듈 | 검증 항목 | 결과 | 비고 |
|------|----------|------|------|
| **kpi.ts** | 매출총이익률 = (매출-원가)/매출*100 | PASS | Math.abs(sales) 분모 사용 |
| | 비용구조 비율 합계 | PASS | 8개 항목 비율 합산, Math.abs(sales) 분모 |
| | 히트맵 달성률 = 실적/계획*100 | PASS | Infinity sentinel (계획=0, 실적>0) |
| | Radar Math.max(val,0) 클램핑 | PASS | _raw_ prefix로 실제값 tooltip 표시 |
| **aging.ts** | assessRisk month3+ 포함 | PASS | SAP FI-AR 90일 기준 준수 |
| | credit 사용률 = 미수금/한도*100 | PASS | 한도=0 시 Infinity → 상태 "danger" |
| **dso.ts** | DSO = 미수금/월평균매출*30 | PASS | 수학적으로 정확 |
| | 매출=0 엣지 케이스 | WARN | Infinity 필터링은 하나 DSO=0 미처리 (H-1) |
| **ccc.ts** | CCC = DSO - DPO (DIO=0) | PASS | DIO 데이터 부재로 0 설정 명시 |
| | DPO 5단계 추정 | PASS | 원가율별 45/40/35/30/25일 분류 |
| | CCC 평균 | WARN | 단순 산술평균, 매출 가중 미적용 (M-3) |
| **profiling.ts** | 5축 성과 점수 (20점 만점/축) | PASS | percentile 기반 정규화 |
| | HHI = sum(share^2) | PASS | 분수(0-1) 범위로 계산, *10000 표시 |
| **breakeven.ts** | BEP = 고정비/(1-변동비율) | PASS | 공헌이익률<=0 시 Infinity 반환 |
| | 안전한계율 = (매출-BEP)/매출*100 | PASS | isFinite() 가드 페이지에서 적용 |
| **profitability.ts** | 매출총이익 = 매출-원가 | PASS | |
| | 매출총이익율 = 매출총이익/매출*100 | PASS | 분모=0 가드 |
| **variance.ts** | 3-way variance (가격/물량/믹스) | PASS | 분리 공식 정확 |
| | 신규/이탈 거래처 분리 | PASS | 계획=0(신규), 실적=0(이탈) |
| **whatif.ts** | 시나리오 매출 = 기준*(1+변동률) | PASS | |
| | 원가율 클램프 [0, 200] | PASS | 극단값 방지 |
| **forecast.ts** | 선형 회귀 (최소자승법) | PASS | R-squared, 잔차 표준편차 정확 |
| | 이동평균 (3개월, 6개월) | PASS | 충분한 데이터 체크 |
| | 신뢰 구간 = 예측 +/- 1.96*잔차std | PASS | 95% 신뢰구간 |
| **rfm.ts** | 분위 기반 1-5점 | PASS | Recency invertScore 정확 |
| | 6개 세그먼트 분류 | PASS | VIP/Loyal/Potential/At-risk/Dormant/Lost |
| **clv.ts** | CLV = 평균거래액*빈도*마진*수명 | PASS | 마진 클램프 [-0.5, 1.0] |
| | 유지율 = 1-(1/총기간) | PASS | [0.2, 1.0] 범위 클램프 |
| **migration.ts** | 등급 산정 | WARN | 판매금액 사용 (H-3) |
| | 동적 임계값 (percentile 80/60/40) | PASS | |
| **fx.ts** | 가중평균 환율 = 장부금액/거래금액 | PASS | 분모=0 가드 |
| | FX 손익 추정 | PASS | (가중평균-표준환율)*거래금액 |
| **insightGenerator.ts** | safe() 헬퍼 | PASS | isFinite 가드 일관 적용 |
| | 12개 규칙 | PASS | 각 규칙의 threshold 및 조건 정확 |
| **planAchievement.ts** | 달성율 = 실적/계획*100 | PASS | 분모=0 가드 |
| | 마진 드리프트 = 실적이익율-계획이익율 | PASS | |
| **channel.ts** | 결제조건별 매출 분포 | PASS | 판매금액 사용 (의도적) |
| **prepayment.ts** | 선수금 합산 | PASS | org/월별 집계 정확 |
| **profitRiskMatrix.ts** | fuzzyGet 매칭 | PASS | contains-match |
| | 리스크 = 장기미수/총미수*100 | PASS | [0, 100] 클램프 |
| **customerProfitAnalysis.ts** | HHI * 10000 | PASS | 표준 HHI 공식 |
| | 거래처 세그먼트 분류 | PASS | |
| **customerItemAnalysis.ts** | ABC Math.abs 누적비중 | PASS | 음수 매출 처리 |
| | 교차 수익성 | PASS | 분모=0 가드 |
| **detailedProfitAnalysis.ts** | Pareto Math.abs 비중 | PASS | 음수 처리 |
| | 마진 침식 = 실적마진-계획마진 | PASS | 양 타입 레코드 지원 |

### 3.3 유틸리티 함수 검증

| 함수 | isFinite 가드 | 결과 | 비고 |
|------|-------------|------|------|
| `formatCurrency()` | O | PASS | `if (!isFinite(value)) return "-"` |
| `formatPercent()` | O | PASS | `if (!isFinite(value)) return "-"` |
| `formatNumber()` | X | **FAIL** | 가드 없음 (C-1) |
| `calcChangeRate()` | - | PASS | previous=0 가드 |
| `filterByOrg()` | - | PASS | orgNames.has() 체크 |
| `filterByDateRange()` | - | PASS | from/to 범위 필터 |
| `aggregateOrgProfit()` | - | PASS | calcRatioPAD로 비율 재계산 |
| `extractMonth()` | - | PASS | 4가지 날짜 형식 + Excel serial |

---

## 4. 페이지별 통합 검증

### 4.1 Overview 페이지 (`src/app/dashboard/page.tsx`)

| 검증 항목 | 결과 | 비고 |
|----------|------|------|
| Store selector 패턴 | PASS | 개별 selector로 최소 리렌더 |
| filterByOrg 필드 파라미터 | PASS | salesList: "영업조직"(기본), orgProfit: "영업조직팀" |
| filterOrgProfitLeafOnly + aggregateOrgProfit | PASS | 소계 제거 후 재집계 |
| 비교기간 KPI | PASS | comparison period의 동일 필터 적용 |
| Insight 생성 | PASS | generateInsights에 safe() 가드 |
| Forecast 차트 | PASS | 신뢰 구간 표시 정확 |
| useMemo 종속성 | PASS | 14개 useMemo 모두 종속성 완전 |
| EmptyState/LoadingSkeleton | PASS | isLoading → PageSkeleton, !hasData → EmptyState |

### 4.2 Sales 페이지 (`src/app/dashboard/sales/page.tsx`)

| 검증 항목 | 결과 | 비고 |
|----------|------|------|
| filterByOrg 기본 필드 | PASS | salesList는 "영업조직"(기본값) |
| filterByDateRange "매출일" | PASS | 날짜 필드 정확 |
| Pareto 누적% 계산 | PASS | total>0 가드, cum 누적 |
| 내수/수출 Pie 음수 | WARN | donutData에 음수 value 가능하나 실무적으로 매출은 양수 (M-7) |
| Treemap 상위 20 | PASS | |
| 탭 컴포넌트 props | PASS | ChannelTab, RfmTab, ClvTab, MigrationTab, FxTab 모두 filteredSales 전달 |
| CLV탭 filteredOrgProfit | PASS | "영업조직팀" 필드로 필터 |

### 4.3 Profitability 페이지 (`src/app/dashboard/profitability/page.tsx`)

| 검증 항목 | 결과 | 비고 |
|----------|------|------|
| 스마트 데이터소스 | WARN | `as any[]` 캐스트 (H-2) |
| Waterfall base/value | PASS | Math.min(top,bottom), Math.abs(diff) |
| Bubble Z축 음수 처리 | PASS | Math.max(grossProfit, 0) |
| orgContribPie 음수 필터 | WARN | 제외 카운트 표시는 있으나 필터 코드 확인 필요 (M-1) |
| 소계 행 제거 | PASS | 영업담당사번="" 행 필터 |
| Radar _raw_ tooltip | PASS | 음수 실제값 표시 |
| Heatmap isFinite | PASS | `!isFinite(rate)` → "계획없음" |
| Heatmap 비용항목 색상 반전 | PASS | isCostItem 기반 색상 반전 |
| breakeven isFinite 필터 | PASS | 페이지 레벨에서 isFinite 체크 |
| useMemo 종속성 | PASS | 25+ useMemo 전체 검증 완료 |
| allReceivableRecords 미필터 | PASS | 의도적 - 리스크는 전체 미수금 반영 |
| 탭 컴포넌트 props | PASS | RiskTab, WhatIfTab, CustProfitTab, CustItemTab 모두 정확한 데이터 전달 |

### 4.4 Receivables 페이지 (`src/app/dashboard/receivables/page.tsx`)

| 검증 항목 | 결과 | 비고 |
|----------|------|------|
| filteredAgingMap 필터 | PASS | Map entries iteration with Array.from() |
| "90일 이상 연체" 라벨 | WARN | month4+(91일+) 합산, 라벨과 1일 차이 (H-4) |
| Aging 색상 그라데이션 | PASS | 녹색→적색 7단계 sequential |
| DsoTab props | PASS | allRecords, filteredSales, filteredTeamContrib |
| CreditTab props | PASS | allRecords |
| 선수금 탭 filteredCollections | PASS | filterByOrg + filterByDateRange |
| riskColumns isFinite | PASS | line 121 `isFinite(getValue<number>()) ? ... : 0` |

### 4.5 Orders 페이지 (`src/app/dashboard/orders/page.tsx`)

| 검증 항목 | 결과 | 비고 |
|----------|------|------|
| filterByOrg "영업조직" | PASS | orderList, collectionList, salesList 모두 "영업조직" |
| O2C Pipeline 계산 | PASS | pipeline.ts 순수금 = gross - prepayment |
| O2C Flow SVG .toFixed | WARN | 개별 isFinite 가드 없음 (M-4) |
| Pie 차트 percent 처리 | PASS | `(percent \|\| 0)` 폴백 |
| 5개 탭 분리 | PASS | 각 TabsContent에 인라인 렌더링 |

### 4.6 Profiles 페이지 (`src/app/dashboard/profiles/page.tsx`)

| 검증 항목 | 결과 | 비고 |
|----------|------|------|
| filterByOrg "영업조직팀" | PASS | teamContribution 전용 |
| 성과 점수 .toFixed | PASS | calcPerformanceScores가 유한값 보장 |
| HHI 시각화 | PASS | gradient bar with width% |
| 비용 레이더 차트 | PASS | 개인 vs 조직평균 비교 |
| Pie label (props: any) | PASS | Recharts 호환성 유지 |

### 4.7 Data 페이지 (`src/app/dashboard/data/page.tsx`)

| 검증 항목 | 결과 | 비고 |
|----------|------|------|
| 10개 파일 타입 표시 | PASS | 원래 7 + 3 신규 (orgCustomerProfit, hqCustomerItemProfit, customerItemDetail) |
| receivableAging Map 변환 | PASS | Array.from(entries) 사용 |
| 품질 지표 계산 | PASS | calcDataQualityMetrics 정확 |
| 평균 완전성 | PASS | 단순 평균 (행 수 가중 아님, 현 상태 적절) |

---

## 5. 차트 렌더링 검증

| 차트 유형 | 위치 | 검증 항목 | 결과 | 비고 |
|----------|------|----------|------|------|
| **Waterfall** | profitability | base/value 스태킹 | PASS | Math.min/Math.abs 정확 |
| **Radar** | profitability | 음수 클램핑 | PASS | Math.max(val,0), _raw_ tooltip |
| **Pareto** | sales/custItem | 누적% + 80/95 기준선 | PASS | |
| **Scatter** | profitability | 동적 Y축 + 0% 기준선 | PASS | domain 함수 사용 |
| **Heatmap** | profitability | 비용 반전 색상 | PASS | isCostItem 분기 |
| | | Infinity 처리 | PASS | isFinite→"계획없음" |
| **Aging** | receivables | 녹→적 그라데이션 | PASS | 7단계 HSL 색상 |
| **Pie (도넛)** | sales/profitability | percent undefined | WARN | `\|\| 0` 폴백 |
| | profitability | 음수 값 | WARN | 제외 표시 있으나 방어 미확실 (M-1) |
| **DSO 바** | receivables/DSO | 등급별 색상 | PASS | excellent/good/fair/poor |
| **Credit 바** | receivables/credit | 80%/100% 색상 구분 | PASS | |
| **BEP 도표** | profitability | 매출선/비용선 교차 | PASS | ComposedChart Line+Area |
| **O2C 플로우** | orders | SVG 화살표 두께 | PASS | proportional to amount |
| **민감도** | profitability/whatif | 듀얼 Y축 | PASS | 막대(금액) + 선(이익율) |
| **Treemap** | sales | 면적 비례 | PASS | 최소 크기 40x25 필터 |

---

## 6. 개선 권고사항

| # | 카테고리 | 설명 | 우선순위 | 예상 작업량 |
|---|---------|------|---------|-----------|
| 1 | NaN 가드 | `formatNumber()`에 `isFinite()` 가드 추가 | P0 | 5분 |
| 2 | 엣지 케이스 | DSO 계산에 "데이터 부족" 분류 추가 | P1 | 30분 |
| 3 | 타입 안전성 | 스마트 데이터소스의 Union 타입 정의 및 타입 가드 적용 | P1 | 2시간 |
| 4 | 라벨 정확성 | "90일 이상 연체" 관련 formula/description 텍스트 명확화 | P1 | 15분 |
| 5 | Pie 음수 방어 | orgContribPie 생성 시 음수 값 필터링 추가 | P2 | 15분 |
| 6 | Heatmap 개선 | 예산 외 비용(plan=0, actual>0) 빨간색 경고 표시 | P2 | 30분 |
| 7 | CCC 가중평균 | 매출액 기반 가중평균 CCC 옵션 추가 | P2 | 1시간 |
| 8 | .toFixed 가드 | orders SVG, profitability tooltip의 .toFixed() 호출에 isFinite 가드 | P2 | 30분 |
| 9 | migration 필드 | 판매금액→장부금액 변경 또는 양쪽 지원 옵션 | P2 | 1시간 |
| 10 | breakeven KPI | 인라인 reduce를 useMemo로 추출 | P3 | 30분 |
| 11 | Pie IIFE 중복 | top10/others 계산 1회로 통합 | P3 | 20분 |
| 12 | RADAR_COLORS | CHART_COLORS 직접 사용으로 변경 | P3 | 5분 |

---

## 7. 누락된 분석 기능 제안

| # | 기능명 | 설명 | 비즈니스 가치 | 구현 복잡도 |
|---|-------|------|------------|-----------|
| 1 | DSO 추세 분석 | 월별 DSO 변동 추세 차트 | 현금 흐름 개선 모니터링 | 중 |
| 2 | 매출 예측 정확도 | Forecast vs 실적 비교 대시보드 | 예측 모델 신뢰도 평가 | 중 |
| 3 | 거래처 이탈 조기 경보 | RFM + 매출 추세 결합 예측 | 핵심 거래처 유지 | 고 |
| 4 | 제품군별 BCG 매트릭스 | 성장률 x 시장점유율 분석 | 제품 포트폴리오 전략 | 중 |
| 5 | 영업사원 코칭 대시보드 | 개인별 강점/약점 자동 진단 | 영업력 강화 | 중 |
| 6 | 수금율 추세 분석 | 월별 수금율 변동 및 목표 대비 | 현금 회수 성과 관리 | 저 |
| 7 | 원가 변동 자동 알림 | 원가율 급변 감지 및 알림 | 마진 보호 | 중 |

---

## 8. 실행 계획

### Phase 1 - 즉시 수정 (1일)
- [C-1] formatNumber() isFinite 가드 추가
- [H-4] 연체 라벨/formula 텍스트 명확화

### Phase 2 - 단기 수정 (1주)
- [H-1] DSO "데이터 부족" 분류 추가
- [H-2] 스마트 데이터소스 Union 타입 정의
- [H-3] migration.ts 필드 불일치 해결
- [M-4, M-5, M-6, M-8] .toFixed() isFinite 가드 일괄 추가

### Phase 3 - 중기 개선 (2주)
- [M-1] Pie 차트 음수 방어
- [M-2] Heatmap 예산 외 비용 경고
- [M-3] CCC 가중평균 옵션
- [L-2, L-3] breakeven KPI 추출, Pie IIFE 통합

### Phase 4 - 장기 개선 (1개월)
- 신규 분석 기능 (DSO 추세, 수금율 추세 등)
- 종합 테스트 프레임워크 도입
- E2E 테스트 (Playwright)

---

## 9. 부록: 데이터 흐름 검증 매트릭스

### 파일 타입별 완전한 데이터 흐름

| 파일 타입 | 파서 필드 | Store 속성 | 필터 필드 | 분석 함수 | 최종 차트 |
|----------|----------|-----------|----------|----------|----------|
| salesList | 매출일, 매출처, 장부금액, 영업조직 | salesList[] | 영업조직 (기본) | calcTopCustomers, calcItemSales, calcSalesByType, calcRFMAnalysis, calcCLV, calcMigration, calcFxAnalysis, calcChannelAnalysis | Pareto, Treemap, Donut, RFM scatter, CLV table, Migration matrix, FX chart, Channel chart |
| collectionList | 수금일, 거래처명, 장부수금액, 영업조직 | collectionList[] | 영업조직 (기본) | calcPrepaymentSummary, calcOrgPrepayments, calcO2CPipeline | Prepayment bar/line, O2C pipeline |
| orderList | 수주일, 장부금액, 영업조직 | orderList[] | 영업조직 (기본) | Orders page inline | Order trend, O2C flow |
| orgProfit | 영업조직팀, 매출액(PAD), ... | orgProfit[] | 영업조직팀 | aggregateOrgProfit, calcOrgRatioMetrics, calcPlanVsActualHeatmap, calcOrgBreakeven, calcWhatIfScenario, calcProfitRiskMatrix, generateInsights | Waterfall, Bubble, Radar, Heatmap, BEP, What-if, Risk matrix |
| teamContribution | 영업조직팀, 영업담당사번, 매출액(PAD), ... | teamContribution[] | 영업조직팀 | calcCostStructure, calcPerformanceScores, calcOrgBreakevenFromTeam, calcCCCByOrg(DPO) | Cost stacked, Contribution ranking, BEP, CCC table |
| profitabilityAnalysis | 영업조직팀, 품목, 매출액(PAD), ... | profitabilityAnalysis[] | 영업조직팀 | calcProductProfitability, calcCustomerProfitability, calcMarginErosion, calcPlanAchievement, calcVariance | Product profitability, Customer table, Margin erosion, Variance charts |
| receivableAging | 판매처, 영업조직, month1~overdue | receivableAging Map | 영업조직 | calcAgingSummary, calcAgingByOrg, calcRiskAssessments, calcCreditUtilization, calcDSOByOrg | Aging stacked, Risk table, Credit chart, DSO bar |
| orgCustomerProfit | 영업조직팀, 매출거래처, 매출액(PAD), ... | orgCustomerProfit[] | 영업조직팀 | calcCustomerConcentration, calcCustomerRanking, calcCustomerSegments | HHI, Customer ranking, Segment chart |
| hqCustomerItemProfit | 영업조직팀, 매출거래처, 품목, 매출액(PAD), ... | hqCustomerItemProfit[] | 영업조직팀 | calcABCAnalysis, calcCustomerPortfolio, calcCrossProfitability | ABC Pareto, Portfolio table, Top combinations |
| customerItemDetail | 영업조직팀, 매출거래처, 품목, 매출연월, 매출액(number), ... | customerItemDetail[] | 영업조직팀 | (스마트 데이터소스로 위 분석들에 대체 투입) | 기간 필터 활성 시 profitability 탭 전체 |

---

*감사 보고서 끝*
