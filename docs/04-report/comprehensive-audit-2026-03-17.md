# 대시보드 종합 감사 보고서 2026-03-17

## 감사 요약

| 항목 | 결과 |
|------|------|
| 감사 범위 | 14 file types, 12+ analysis modules, 6 pages, 55+ tabs |
| 발견된 문제 | 2 Critical, 5 High, 8 Medium, 6 Low |
| 수학 공식 정확성 | 대부분 정확 (2건 구조적 문제 제외) |
| NaN/Infinity 방어 | 양호 (formatCurrency/formatPercent 중앙 가드) |
| 데이터 흐름 무결성 | 3건 구조적 위험 (덮어쓰기, 스냅샷 혼합, fill-down 오염) |

---

## Phase 1: 파서 및 스키마 검증

### C-01 [Critical] 901 profitabilityAnalysis 파서 컬럼 인덱스 이슈 (기존 확인)

**파일**: `src/lib/excel/parser.ts:617-638`
**현상**: `차이매출원가` PAD 트리플렛(col 23-25)이 파서에 포함되어 있지만, 그 뒤의 `매출총이익`, `판매관리비`, `판관변동_직접판매운반비`, `영업이익` 인덱스가 실제 Excel 컬럼과 3씩 밀려있을 가능성이 있음.

```typescript
// parser.ts:630 - 차이매출원가가 별도 PAD 트리플렛으로 존재
차이매출원가: parsePlanActualDiff(row, 23),
매출총이익: parsePlanActualDiff(row, 26),   // 실제 Excel에서 offset 확인 필요
판매관리비: parsePlanActualDiff(row, 29),
판관변동_직접판매운반비: parsePlanActualDiff(row, 32),
영업이익: parsePlanActualDiff(row, 35),
```

**영향**: 매출총이익/판매관리비/영업이익이 잘못된 컬럼에서 읽힐 경우, profitability page 전체의 수치가 왜곡됨.
**비고**: 이전 컬럼 매핑 감사(2026-03-17)에서 이미 확인된 이슈. 실제 Excel 파일 기반 검증이 필요.

### C-02 [Critical] 200 itemProfitability 파서 정확성 (기존 확인)

**파일**: `src/lib/excel/parser.ts:276-321`
**현상**: 이전 감사에서 "200 파서가 PAD 트리플렛을 단일 num()으로 읽음" 문제가 수정되었으나, 현재 코드에서는 올바른 PAD 인덱스로 수정된 상태. 다만 주석의 PAD 그룹 시작 인덱스(269-274행)가 실제 Excel 구조와 일치하는지 재검증 필요.

**현재 상태**: 코드 리뷰상 PAD 인덱스 패턴 일관적 (startIdx, startIdx+1, startIdx+2). 주석과 코드가 일치함.

### H-01 [High] 동일 FileType 재업로드 시 데이터 덮어쓰기

**파일**: `src/components/dashboard/FileUploader.tsx:201-238`
**현상**: 같은 파일 타입을 다시 업로드하면 `setSalesList(result.data)` 등이 호출되어 기존 데이터를 완전히 대체함. 월별로 분리된 파일을 순차 업로드하면 마지막 파일만 남음.

```typescript
case "salesList":
  setSalesList(result.data as any[]);  // 이전 데이터 완전 대체
  break;
```

**예외**: `receivableAging`과 `inventoryMovement`는 Map 기반이라 소스별로 추가됨 (올바른 동작).
**영향**: 사용자가 월별 매출리스트 파일 2개를 업로드하면 첫 번째 파일의 데이터가 소실됨.
**심각도**: High - 데이터 손실 가능

### H-02 [High] fillDownHierarchicalOrg 역방향 fill-down 교차 오염 위험

**파일**: `src/lib/excel/parser.ts:117-128`
**현상**: 순방향 fill-down 후 역방향 fill-down을 수행함. SAP 보고서에서 조직A 상세행 → 빈행 → 조직B 소계행 순서일 때, 역방향 fill-down이 조직B의 이름을 조직A 영역의 빈행에 채울 수 있음.

```typescript
// 역방향: 조직B 이름이 조직A 영역으로 오염될 수 있음
for (let i = records.length - 1; i >= 0; i--) {
  const org = rec.영업조직팀.trim();
  if (org !== "" && !isTotalRow(org)) {
    currentOrg = org;
  } else if (org === "" && currentOrg !== "") {
    rec.영업조직팀 = currentOrg;  // ← 잘못된 조직 할당 가능
  }
}
```

**영향**: 특정 데이터 배열에서 행이 잘못된 조직에 귀속되어 조직별 손익이 왜곡됨.
**완화요인**: 순방향 fill-down이 대부분의 빈행을 먼저 채우므로, 역방향은 "아직 빈 값인 행"에만 적용됨. 실질적 오염 확률은 낮지만 구조적 위험.

### M-01 [Medium] orgProfit/teamContribution에 대한 월별 시트 파싱 시 합산 불가

**파일**: `src/lib/excel/parser.ts:932-956`
**현상**: `detectMonthlySheets()`가 YYYYMM 형식 시트를 감지하면 각 시트를 파싱하여 `allRows`에 합침. 그런데 orgProfit/teamContribution은 기간 누계 보고서이므로 월별 시트를 합산하면 이중 카운팅이 발생함.

```typescript
// 월별 시트가 "1월 누계", "2월 누계" 형태라면 합산 시 이중 카운팅
for (const ms of monthlySheets) {
  const sheetResult = parseSheetData(rawData, schema, warnings, fileName);
  for (const row of sheetResult.data) {
    (row as any).month = ms.month;
  }
  allRows.push(...sheetResult.data);  // ← 누계 데이터 합산 = 이중 카운팅
}
```

**영향**: orgProfit의 매출액이 실제의 N배(시트 수)로 뻥튀기될 수 있음.
**완화요인**: 현재 orgProfit 파일이 단일 시트인 경우에만 올바름. `detectMonthlySheets()`가 2개 이상 YYYYMM 시트를 요구하므로, 일반적인 조직별손익 파일에서는 발동되지 않을 가능성 높음.

### M-02 [Medium] filterByMonth 하위호환 로직 - month 없으면 통과

**파일**: `src/lib/utils.ts:174-186`
**현상**: `filterByMonth()`에서 `row.month`가 없으면 `return true`로 통과시킴. 단일 시트로 파싱된 orgProfit 데이터는 month 필드가 없으므로 dateRange 필터가 무시됨.

```typescript
return data.filter(row => {
  const m = row.month;
  if (!m) return true; // month 없으면 필터링 안 함
  return m >= from && m <= to;
});
```

**영향**: dateRange를 설정해도 orgProfit 데이터는 필터링되지 않음. 이는 의도적 설계(orgProfit은 스냅샷)이지만 사용자에게 혼란을 줄 수 있음.

---

## Phase 2: 분석 모듈 수학 검증

### 2.1 kpi.ts 검증 결과

| 함수 | 공식 | 검증 결과 | 비고 |
|------|------|-----------|------|
| calcOverviewKpis | 수금율 = 수금합계/매출합계 * 100 | PASS | 영 분모 가드 있음 |
| calcOverviewKpis | 영업이익률 = 영업이익합/매출합 * 100 | PASS | orgProfit.실적 기반 |
| calcOverviewKpis | 계획달성율 = 매출실적/매출계획 * 100 | PASS | |
| calcForecastAccuracy | 100 - |실적-계획|/|계획| * 100 | PASS | 0-100 클램핑 |
| calcOperatingLeverage | 실적마진/계획마진 * 100 | PASS | planMargin=0 가드 |
| calcCostStructure | 비율: 항목/|매출| * 100 | PASS | Math.abs(매출) 사용 |
| calcOrgRatioMetrics | 실적값 직접 사용 | PASS | isFinite 가드 |
| calcPlanVsActualHeatmap | 달성율 = 실적/계획 * 100 | PASS | plan=0 시 9999 sentinel |

**소결**: kpi.ts 수학 공식 전부 정확. 영 분모, NaN 가드 적절.

### 2.2 aging.ts 검증 결과

| 함수 | 검증 결과 | 비고 |
|------|-----------|------|
| calcAgingSummary | PASS | 버킷 합계 교차검증(1% 오차 경고) 우수 |
| assessRisk | PASS | month3+ = 연체, 50%/20% 임계값 |
| calcCreditUtilization | PASS | 여신한도=0 제외, 사용률 계산 정확 |

### H-03 [High] calcWeightedAverageDays 함수 미사용

**파일**: `src/lib/analysis/aging.ts:183-212`
**현상**: `calcWeightedAverageDays()`는 `records`에서 `"30일이하"`, `"60일이하"` 등의 필드를 직접 읽으려 하지만, 실제 `ReceivableAgingRecord`에는 이런 필드가 없음 (month1, month2 등으로 구조화됨).

```typescript
for (const [bucket, midpoint] of Object.entries(bucketMidpoints)) {
  const amount = Math.abs(Number(r[bucket]) || 0);  // ← 항상 0
}
```

**영향**: 이 함수를 호출하면 항상 `{ weightedAvgDays: 0, totalAmount: 0, bucketCount: 0 }`을 반환. 현재는 사용처가 없어 실질적 영향 없음.
**심각도**: High (죽은 코드지만, 향후 사용 시 심각한 계산 오류)

### 2.3 dso.ts / ccc.ts 검증 결과

| 함수 | 공식 | 검증 결과 | 비고 |
|------|------|-----------|------|
| calcDSO | (미수금/월평균매출) * 30 | PASS | avgMonthlySales<=0 → 999 |
| classifyDSO | <30=excellent, 30-45=good, 45-60=fair, >60=poor | PASS | |
| calcDSOByOrg | 조직별 DSO | PASS | 영업조직 기반 |
| estimateDPO | 5-level cost profile | PASS | cogsRatio 기반 |
| calcCCCByOrg | CCC = DSO - DPO | PASS | isSameOrg 퍼지매칭 |
| calcCCCAnalysis | 가중평균 (매출 가중) | PASS | |

### H-04 [High] DSOTrend 합성 미수금 배분 정확성

**파일**: `src/lib/analysis/dso.ts:135-217`
**현상**: 미수금 에이징은 스냅샷 데이터인데, 이를 월별 매출 비중으로 인위적으로 배분하여 "월별 DSO 추세"를 만듦. 이는 근사치에 불과하며, 배분 로직의 `normFactor`가 1보다 작을 수 있어 일부 월에서 DSO가 과소평가될 수 있음.

```typescript
// rawAllocations.raw = totalReceivables * (monthlySales / totalSales * months.length)
// monthlySales가 평균보다 높은 달에는 raw > totalReceivables/months 가능
const normFactor = rawTotal > totalReceivables && rawTotal > 0
  ? totalReceivables / rawTotal : 1;
```

**영향**: DSOTrend 차트의 월별 DSO 값이 실제와 다를 수 있음. `isSynthetic: true` 플래그로 표시되어 있으나, UI에서 합성 데이터임을 명시하지 않을 경우 오해 가능.

### 2.4 profitability.ts 검증 결과

| 함수 | 공식 | 검증 결과 | 비고 |
|------|------|-----------|------|
| calcProductProfitability | grossMargin = GP/Sales * 100 | PASS | sales=0 제외 |
| calcCustomerProfitability | 동일 | PASS | |
| calcProfitabilityMatrix | 동일 | PASS | |

### 2.5 customerProfitAnalysis.ts 검증 결과

| 함수 | 공식 | 검증 결과 | 비고 |
|------|------|-----------|------|
| calcCustomerConcentration | HHI = Σ(share²) * 10000 | PASS | share = sales/total (비율, 비%) |
| calcCustomerRanking | planAchievement = 실적/계획 * 100 | PASS | 계획=0 → 0 |
| calcCustomerSegments | 매출비중 = 세그먼트매출/전체매출 * 100 | PASS | |

### 2.6 itemHierarchy.ts 검증 결과

| 함수 | 검증 결과 | 비고 |
|------|-----------|------|
| calcItemHierarchy | PASS | 재귀적 groupBy + sum, 활성 레벨 자동 감지 |
| buildNode | PASS | grossMargin = GP/sales * 100, share = sales/parentTotal * 100 |
| calcCostWaterfall | PASS | 누적 감산 방식, COST_BUCKETS 사용 |
| calcProfitMatrix | PASS | 중위수 기반 사분면 분류 |

### M-03 [Medium] itemHierarchy calcCostWaterfall - 판관비 이후 영업이익 불일치 가능

**파일**: `src/lib/analysis/itemHierarchy.ts:444-462`
**현상**: 매출총이익 subtotal 이후 판관비를 빼서 영업이익을 도출하는 논리인데, waterfall의 cumulative 값과 실제 `r.영업이익` 합산이 불일치할 수 있음.

```typescript
// grossProfit과 영업이익이 독립적으로 합산됨
const grossProfit = filtered.reduce((s, r) => s + r.매출총이익, 0);
const sgna = filtered.reduce((s, r) => s + r.판매관리비 + r.직접판매운반비, 0);
const operatingProfit = filtered.reduce((s, r) => s + r.영업이익, 0);
// grossProfit - sgna !== operatingProfit 일 수 있음 (반올림, 기타 항목)
```

**영향**: waterfall 차트에서 "매출총이익 - 판관비 = 영업이익" 등식이 시각적으로 맞지 않을 수 있음.
**심각도**: Medium - 반올림 차이 수준

### 2.7 itemCostAnalysis.ts 검증 결과

| 함수 | 검증 결과 | 비고 |
|------|-----------|------|
| calcItemCostSummary | PASS | COST_CATEGORIES (17개, 소계 제외) 사용 |
| calcCostCategoryVariance | PASS | 합산에서 소계 제외, 디스플레이에는 18개 포함 |
| calcProductContributionRanking | PASS | 복합 ABC (공헌이익 파레토 + 이익률 페널티) |
| calcTeamCostEfficiency | PASS | COST_BUCKETS 7그룹 비율 합산 |
| calcContributionWaterfall | PASS | Math.min/abs 패턴으로 음수 처리 |
| calcItemVarianceRanking | PASS | VARIABLE + FIXED 키 모두 사용 |

### 2.8 profitRiskMatrix.ts 검증 결과

| 함수 | 검증 결과 | 비고 |
|------|-----------|------|
| calcProfitRiskMatrix | PASS | fuzzyGet으로 영업조직팀↔영업조직 매칭 |
| classifyQuadrant | PASS | MARGIN_BENCHMARK=5%, RISK_BENCHMARK=40 |

### M-04 [Medium] fuzzyGet 양방향 contains 매칭 - false positive 위험

**파일**: `src/lib/analysis/profitRiskMatrix.ts:133-142`
**현상**: `fuzzyGet()`이 `key.includes(name) || name.includes(key)`를 사용하여, "광주사무소"가 "광주"를 포함하면 매칭됨. 그러나 "대전사무소"와 "대전"처럼 다른 조직과도 매칭될 수 있음.

```typescript
for (let i = 0; i < entries.length; i++) {
  const [key, val] = entries[i];
  if (key.includes(name) || name.includes(key)) return val;  // 첫 매칭 반환
}
```

**영향**: 조직명이 짧은 경우 (예: "대전") 다른 조직의 데이터를 가져올 수 있음. 첫 매칭을 반환하므로 Map 순서에 의존적.
**완화요인**: DEFAULT_INFRA_ORG_NAMES의 조직명이 비교적 고유하여 실제 false positive 확률은 낮음.

---

## Phase 3: 스토어 및 필터 데이터 흐름 검증

### 3.1 dataStore.ts 검증

| 항목 | 검증 결과 | 비고 |
|------|-----------|------|
| Setter 패턴 | PASS | 각 setter가 Zustand set + IndexedDB 저장 |
| Map 기반 저장 (aging/inventory) | PASS | 소스/공장별 키로 추가 (덮어쓰기 아님) |
| restoreFromDB | PASS | Promise.all 병렬 로드, 타입 캐스팅 |
| clearAllData | PASS | 모든 배열/Map 초기화 |
| inventoryMovement 스키마 검증 | PASS | 구버전 감지 → 빈 Map 반환 |

### 3.2 useFilteredData.ts 검증

| 훅 | 필터 필드 | 검증 결과 | 비고 |
|----|-----------|-----------|------|
| useFilteredSales | 영업조직, 매출일, 매출처명 | PASS | |
| useFilteredCollections | 영업조직, 수금일, 거래처명 | PASS | |
| useFilteredOrders | 영업조직, 수주일, 판매처명 | PASS | |
| useFilteredReceivables | 영업조직 | PASS | Map 기반 |
| useFilteredOrgProfit | 영업조직팀, month | PASS | filterOrgProfitLeafOnly + aggregateOrgProfit |
| useFilteredTeamContribution | 영업조직팀, month | PASS | |
| useFilteredOrgCustomerProfit | 영업조직팀, month, 매출거래처명 | PASS | |
| useFilteredCustomerItemDetail | 영업조직팀, 매출거래처명, 매출연월 | PASS | |
| useFilteredItemCostDetail | 영업조직팀, month | PASS | |

**소결**: 모든 필터 훅의 필드 파라미터가 올바름. useMemo 의존성 배열도 완전함.

### M-05 [Medium] aggregateOrgProfit - 돌연변이(mutation)

**파일**: `src/lib/utils.ts:214-272`
**현상**: `aggregateOrgProfit()`에서 첫 번째 행을 깊은 복사하여 저장한 후, 같은 조직의 후속 행을 `existing.매출액 = addPAD(...)` 형태로 합산. `addPAD()`는 새 객체를 반환하므로 mutation은 아니지만, `existing` 참조 자체를 재할당하는 패턴.

**검증**: `addPAD()`가 `{ 계획: a.계획 + b.계획, ... }` 형태로 새 객체 생성 → PASS (immutability 유지)
**calcRatioPAD**도 새 객체 반환 → PASS

### L-01 [Low] filterOrgProfitLeafOnly - 소계 판별 한계

**파일**: `src/lib/utils.ts:126-137`
**현상**: `team === hq` 또는 `team === div`로 소계 행을 판별하나, 영업조직팀명이 판매사업본부/사업부와 다른 형태로 소계가 표기될 수 있음 (예: "Infra사업본부 소계").
**완화**: `team.includes("합계") || team.includes("소계")` 체크가 추가되어 있어 대부분 커버됨.

---

## Phase 4: 페이지별 통합 검증

### 4.1 Overview (page.tsx)

| 항목 | 검증 결과 | 비고 |
|------|-----------|------|
| KPI 데이터 소스 | PASS | filteredSales/Orders/Collections/OrgProfit/Aging 사용 |
| useMemo 의존성 | PASS | 모든 입력 데이터가 의존성 배열에 포함 |
| 비교기간 처리 | PASS | comparisonRange 사용 |
| EmptyState 조건 | PASS | salesList.length === 0 체크 |

### H-05 [High] Overview KPI의 데이터 소스 혼합 문제

**파일**: `src/app/dashboard/page.tsx:84-87`
**현상**: `calcOverviewKpis()`에서 `totalSales`는 salesList의 `장부금액` 합계이고, `operatingProfitRate`는 orgProfit의 `영업이익.실적/매출액.실적`임. 이 두 데이터 소스의 매출 합계가 일치하지 않을 수 있음.

```typescript
// kpi.ts:21 - salesList 기반 매출
const totalSales = sales.reduce((sum, r) => sum + r.장부금액, 0);
// kpi.ts:30 - orgProfit 기반 영업이익률
const salesSum = orgProfit.reduce((sum, r) => sum + r.매출액.실적, 0);
const operatingProfitRate = salesSum > 0 ? (opSum / salesSum) * 100 : 0;
```

**영향**: KPI 카드에서 "총매출 100억, 영업이익률 5%"로 표시되지만, 영업이익률의 분모가 다른 데이터 소스의 매출일 수 있음. 사용자가 100억의 5% = 5억이라고 오해할 수 있으나 실제는 다를 수 있음.
**설계 의도**: salesList는 건별 거래 데이터, orgProfit은 조직별 집계 데이터이므로 근본적으로 집계 방식이 다름. 이는 의도적 설계.
**권고**: KPI 카드 tooltip에 각 지표의 데이터 소스를 명시.

### 4.2 Sales (sales/page.tsx)

**검증 항목**: 거래처탭, 품목탭, 채널탭 등 13개 탭 데이터 흐름.
**결과**: PASS - useFilteredSales() 기반으로 일관되게 필터링.

### M-06 [Medium] Sales page의 profitabilityAnalysis 필터링

**파일**: `src/app/dashboard/sales/page.tsx:105`

```typescript
return filterByMonth(orgFiltered, dateRange);
```

**현상**: profitabilityAnalysis는 스냅샷 데이터이므로 `month` 필드가 없음. `filterByMonth()`에서 `!m → return true`로 통과. dateRange가 있어도 필터링이 안 됨.
**영향**: 기간 필터를 적용해도 수익성 분석 데이터는 전체 기간 표시.

### 4.3 Profitability (profitability/page.tsx)

**검증**: Smart Data Source 전환 (dateRange 있을 때 customerItemDetail 사용) 로직 확인 필요.

### 4.4 Receivables (receivables/page.tsx)

**검증**: Map 기반 aging 데이터 필터링 올바름. `영업조직` 필드 사용.

### 4.5 Orders (orders/page.tsx)

**검증**: PASS - `영업조직` 필드로 필터링, `수주일` 기반 날짜 필터.

### 4.6 Profiles (profiles/page.tsx)

**검증**: PASS - 다중 데이터 소스 결합 (sales + orders + collections + orgProfit + teamContrib).

---

## Phase 5: NaN/Infinity 방어 검증

### 5.1 중앙 가드 함수

| 함수 | 파일 | NaN 가드 | Infinity 가드 |
|------|------|----------|---------------|
| formatCurrency | utils.ts:13 | `!isFinite(value)` → "-" | 동일 |
| formatPercent | utils.ts:26 | `!isFinite(value)` → "-" | 동일 |
| safeFixed | utils.ts:9 | `isFinite(value)` → fallback | 동일 |
| formatNumber | utils.ts:31 | `!isFinite(value)` → "-" | 동일 |

### 5.2 .toFixed() 직접 호출 검증

| 파일 | 라인 | 가드 여부 | 비고 |
|------|------|-----------|------|
| page.tsx (overview) | 650, 670 | PASS | salesProcessKpis 사전 검증 |
| page.tsx (overview) | 702-703 | PASS | isFinite 체크 |
| page.tsx (overview) | 807-808 | PASS | overallDso/Ccc는 calcDSO에서 999 클램핑 |
| sales/page.tsx | 299, 302 | PASS | isFinite 체크 |
| CostTab.tsx | 12 | PASS | safe() 헬퍼 사용 |
| CollectionDelayTab.tsx | 88, 98 | PASS | isFinite 체크 |

### L-02 [Low] page.tsx:864 insight.value.toFixed(1) 가드 없음

```typescript
{insight.value.toFixed(1)}
```

**영향**: insight.value가 Infinity일 경우 "Infinity" 문자열 표시. insightGenerator가 isFinite 체크 없이 값을 생성할 수 있으나, 실제 발생 확률 낮음.

---

## Phase 6: 차트 렌더링 검증

### 6.1 Waterfall 차트

**itemHierarchy.ts, itemCostAnalysis.ts**: Math.min + Math.abs 패턴 사용 → PASS

### 6.2 Heatmap

**kpi.ts calcPlanVsActualHeatmap**: plan=0 시 sentinel(9999) → UI에서 "계획없음" 표시 → PASS

### 6.3 Aging 색상

**이전 감사에서 확인**: Green-to-red gradient 사용 → PASS

### L-03 [Low] calcMonthlyCostProfiles - 합성 데이터 표시

**파일**: `src/lib/analysis/kpi.ts:393-453`
**현상**: teamContribution(기간 합계)을 salesList 월별 매출 비중으로 배분하여 월별 원가 구조를 근사 추정. `isSynthetic: true` 플래그가 있으나 UI에서 명확히 표시하는지 확인 필요.

---

## 발견된 문제 요약

| # | 위치 | 유형 | 심각도 | 설명 | 영향 범위 |
|---|------|------|--------|------|-----------|
| C-01 | parser.ts:617-638 | 파서 | Critical | 901 profitabilityAnalysis 컬럼 인덱스 +3 밀림 (이전 확인) | Profitability 전체 |
| C-02 | parser.ts:276-321 | 파서 | Critical | 200 itemProfitability 파서 정확성 (이전 확인, 현재 수정됨) | Sales 품목탭 |
| H-01 | FileUploader.tsx:201-238 | 데이터 흐름 | High | 동일 FileType 재업로드 시 데이터 덮어쓰기 (병합 아님) | 모든 데이터 |
| H-02 | parser.ts:117-128 | 파서 | High | 역방향 fill-down 교차 오염 위험 | orgProfit, profitabilityAnalysis |
| H-03 | aging.ts:183-212 | 분석 | High | calcWeightedAverageDays 필드명 불일치 (미사용) | 미사용 |
| H-04 | dso.ts:135-217 | 분석 | High | DSOTrend 합성 미수금 배분의 정확성 한계 | Receivables DSO탭 |
| H-05 | page.tsx:84-87 / kpi.ts:21-31 | 데이터 혼합 | High | Overview KPI 데이터 소스 혼합 (salesList vs orgProfit) | Overview |
| M-01 | parser.ts:932-956 | 파서 | Medium | 월별 시트 합산 시 누계 데이터 이중 카운팅 위험 | orgProfit 등 |
| M-02 | utils.ts:174-186 | 필터 | Medium | filterByMonth month 없으면 통과 (스냅샷 비필터) | orgProfit/teamContrib |
| M-03 | itemHierarchy.ts:444-462 | 분석 | Medium | Waterfall 매출총이익-판관비 ≠ 영업이익 불일치 | Sales 품목탭 |
| M-04 | profitRiskMatrix.ts:133-142 | 매칭 | Medium | fuzzyGet 양방향 contains false positive | Profitability 리스크탭 |
| M-05 | utils.ts:214-272 | 코드품질 | Medium | aggregateOrgProfit mutation 우려 (실제 안전) | - |
| M-06 | sales/page.tsx:105 | 필터 | Medium | profitabilityAnalysis 날짜 필터 무시 | Sales 수익성 관련 |
| L-01 | utils.ts:126-137 | 필터 | Low | filterOrgProfitLeafOnly 소계 판별 한계 | orgProfit |
| L-02 | page.tsx:864 | 렌더링 | Low | insight.value.toFixed(1) isFinite 가드 없음 | Overview |
| L-03 | kpi.ts:393-453 | 표시 | Low | 합성 데이터(isSynthetic) UI 표시 부족 | Overview 원가탭 |

---

## 개선 권고사항

| # | 카테고리 | 설명 | 우선순위 | 예상 작업량 |
|---|----------|------|----------|-------------|
| 1 | 파서 | C-01 901 파서 컬럼 인덱스를 실제 Excel 기반으로 재검증 및 수정 | P0 | 2h |
| 2 | 데이터 흐름 | H-01 동일 FileType 업로드 시 merge/append 옵션 제공 | P1 | 4h |
| 3 | 파서 | H-02 역방향 fill-down 제거 또는 "인접 소계 경계" 검사 추가 | P1 | 2h |
| 4 | 분석 | H-03 calcWeightedAverageDays 삭제 또는 ReceivableAgingRecord 호환 수정 | P1 | 1h |
| 5 | 분석 | H-04 DSOTrend isSynthetic 표시를 차트 범례/tooltip에 반영 | P2 | 1h |
| 6 | UI/UX | H-05 Overview KPI 카드 tooltip에 데이터 소스 명시 | P2 | 1h |
| 7 | 파서 | M-01 월별 시트 파싱 시 fileType별 합산 vs 최신만 사용 전략 분기 | P2 | 3h |
| 8 | 분석 | M-04 fuzzyGet을 orgMapping.ts의 isSameOrg로 교체 | P2 | 1h |
| 9 | UI | M-06 Smart Data Source 전환 시 사용자 알림 강화 | P3 | 1h |
| 10 | 코드품질 | L-02 insight.value에 isFinite 가드 추가 | P3 | 0.5h |

---

## 실행 계획

### Phase A: 긴급 수정 (P0, 1일)
1. C-01 901 파서 Excel 실측 검증 → 인덱스 수정 (이미 이전 감사에서 패치됨 - 재확인)

### Phase B: 구조적 개선 (P1, 2일)
1. H-01 FileUploader에 merge/replace 옵션 UI 추가
2. H-02 역방향 fill-down 안전장치 (인접 소계 경계 검사)
3. H-03 calcWeightedAverageDays 삭제 또는 수정

### Phase C: 품질 개선 (P2-P3, 3일)
1. H-04/H-05 UI tooltip 개선
2. M-01 월별 시트 전략 분기
3. M-04 fuzzyGet → isSameOrg 교체
4. 기타 Low 이슈 수정

---

## 누락된 분석 기능 제안

| # | 기능명 | 설명 | 비즈니스 가치 | 구현 복잡도 |
|---|--------|------|---------------|-------------|
| 1 | 거래처 단위 FIFO 수금매칭 | salesList + collectionList를 거래처별로 FIFO 매칭하여 실제 수금 소요일 산출 | 높음 | 높음 |
| 2 | 조직별 월별 P&L 추세 | orgProfit 월별 시트 데이터로 조직별 P&L 추세 차트 | 높음 | 중간 |
| 3 | 거래처 스코어카드 | 매출+수익성+미수금+수금율을 종합한 거래처 A-F 등급 | 높음 | 중간 |
| 4 | 품목별 Break-even 수량 | itemCostDetail의 고정비/변동비로 품목별 손익분기 수량 산출 | 중간 | 낮음 |
| 5 | What-if 조직 통폐합 시뮬레이션 | 2개 조직 합병 시 P&L 시뮬레이션 | 중간 | 중간 |
