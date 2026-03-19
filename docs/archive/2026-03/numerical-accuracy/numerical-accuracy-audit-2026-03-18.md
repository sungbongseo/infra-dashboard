# 인프라 대시보드 수치 정확성 감사 보고서

> 감사일: 2026-03-18
> 감사 범위: 13 Excel 파일 타입, 40+ 분석 모듈, 6 페이지 55+ 탭
> 감사 방법: 소스코드 정적 분석 (Excel → Parser → Store → Analysis → Page → Chart)

---

## 감사 요약

| 구분 | 수량 |
|------|------|
| 검증 파일 | 파서(1) + 스키마(1) + 스토어(3) + 분석모듈(30+) + 페이지(6) |
| 발견 이슈 | **1 Critical(수정완료), 2 False Positive, 5 High, 7 Medium, 4 Low** (총 19건→실제 17건) |
| 수학 공식 검증 | 전체 PASS (kpi, aging, dso, ccc, profitability, rfm, clv, breakeven, profiling) |
| NaN/Infinity 가드 | PASS (formatCurrency/formatPercent 중앙 가드 + 모듈별 개별 가드) |
| useFilteredData hooks | 9개 전수 검증 PASS |
| ErrorBoundary | 전체 탭 래핑 확인 |

---

## 발견된 이슈 목록

### CRITICAL (수치 오류 — 사용자에게 잘못된 숫자 표시)

> **2026-03-18 Excel 대조 검증 결과**: C-01, C-03은 FALSE POSITIVE로 판정. 실제 Excel col에 거래처/품목 **이름**이 들어있어 동일 컬럼 매핑이 정상 동작. C-02만 실제 버그 (품목계정그룹을 품목명으로 읽는 문제) → **수정 완료**.

---

#### ~~C-01: 303 orgCustomerProfit 파서 — 매출거래처/매출거래처명 동일 컬럼 매핑~~ (FALSE POSITIVE)

- **상태**: ✅ 정상 동작 확인 (2026-03-18 Excel 대조)
- **파일**: `src/lib/excel/parser.ts:658-659`
- **실제 확인**: "304조직별거래처별 손익.xlsx" col 7(판매거래처)에 거래처 **이름**(피아이첨단소재(주), (주)맥스원아시아 등)이 저장됨. 별도 코드 컬럼 없음.
- **결론**: `매출거래처`/`매출거래처명` 모두 동일 이름 컬럼을 읽는 것이 정상. SAP 보고서 구조상 거래처코드 열이 별도 존재하지 않음.

---

#### C-02: 304 hqCustomerItemProfit 파서 — 품목명이 품목계정그룹을 읽는 버그 (**수정 완료**)

- **파일**: `src/lib/excel/parser.ts:698`
- **심각도**: CRITICAL → **수정 완료**
- **카테고리**: (A) Parser Accuracy
- **수정 전**:
```typescript
품목명: str(row[5]) || str(row[7]),  // row[5]는 품목계정그룹("제품"), NOT 품목명!
```
- **수정 후**:
```typescript
품목명: str(row[7]),  // row[7]이 실제 품목명
```
- **문제**: col 5는 "품목계정그룹"(값: "제품", "반제품" 등)인데 품목명으로 읽혀, 실제 품목명("R-DMF", "HP-100" 등) 대신 "제품"이 표시됨
- **영향 탭**: 수익성 > 거래처x품목(CustItemTab), 상세 수익(DetailedProfitTab)
- **비고**: `매출거래처`/`매출거래처명`은 col 4에서 거래처 **이름**을 정상적으로 읽고 있어 수정 불요

---

#### ~~C-03: 100 customerItemDetail 파서 — 매출거래처/매출거래처명, 품목/품목명 동일 컬럼 매핑~~ (FALSE POSITIVE)

- **상태**: ✅ 정상 동작 확인 (2026-03-18 Excel 대조)
- **파일**: `src/lib/excel/parser.ts:721-724`
- **실제 확인**: "100거래처별,품목별 손익.xlsx" col 4(매출거래처)에 거래처 **이름**((재)서암문화재단, 피아이첨단소재(주) 등), col 5(품목)에 품목 **이름**(R-DMF 등)이 저장됨.
- **결론**: SAP 100 보고서에 별도 코드/이름 컬럼이 없으며, 단일 컬럼에 이름이 포함됨. 동일 컬럼 매핑이 정상.

---

### HIGH (계산 정확성 또는 데이터 무결성 문제)

---

#### H-01: FileUploader 동일 FileType 재업로드 시 데이터 덮어쓰기

- **파일**: `src/stores/dataStore.ts` (모든 non-Map setter)
- **심각도**: HIGH
- **카테고리**: (D) Data Integrity
- **현재 코드**: `setSalesList(data)`, `setOrgProfit(data)` 등 — 모두 REPLACE
- **문제**: 사용자가 1월 매출리스트 업로드 후 2월 매출리스트를 업로드하면 1월 데이터가 완전히 소실됨. `receivableAging`과 `inventoryMovement`만 Map 기반 additive storage.
- **올바른 로직**: 동일 타입 재업로드 시 append/merge 또는 사용자에게 "기존 데이터를 대체합니다" 확인 다이얼로그
- **영향 탭**: 전체 대시보드 (모든 파일 타입에 해당)

---

#### H-02: Overview KPI 데이터 소스 혼용

- **파일**: `src/lib/analysis/kpi.ts` (calcOverviewKpis)
- **심각도**: HIGH
- **카테고리**: (B) Analysis Accuracy
- **현재 코드**: `totalSales`는 salesList.장부금액 합계, `operatingProfitRate`는 orgProfit.영업이익율.실적
- **문제**: 두 데이터 소스의 집계 기준이 다름. salesList는 건별 거래 데이터, orgProfit는 조직 누계 보고서. 사용자가 "매출 100억, 영업이익률 5%"를 보면 영업이익 5억으로 오해할 수 있으나, 실제로는 별개 데이터에서 산출된 독립 지표.
- **올바른 로직**: KPI 카드 tooltip에 데이터 소스 명시 (현재 formula prop으로 일부 표시되고 있으나 "매출리스트 기반" vs "조직별손익 기반" 명확 구분 필요)
- **영향 탭**: Overview > 핵심 지표

---

#### H-03: DSOTrend 스냅샷 미수금 → 월별 합성 배분의 구조적 한계

- **파일**: `src/lib/analysis/dso.ts:135-217`
- **심각도**: HIGH
- **카테고리**: (B) Analysis Accuracy
- **현재 코드**:
```typescript
const raw = avgMonthlySales > 0
  ? totalReceivables * (monthlySales / totalSales * months.length)
  : totalReceivables / months.length;
```
- **문제**: 미수채권연령은 단일 시점 스냅샷인데, 이를 월별 매출 비중으로 비례 배분하여 DSO 추세를 생성. 실제 월별 미수금 변동과 무관한 합성 데이터. 매출 비중이 높은 월에 미수금도 높다는 가정이 항상 성립하지 않음.
- **올바른 로직**: `isSynthetic: true` 플래그로 표시하고 있으나, UI에서 이를 적절히 고지해야 함
- **영향 탭**: Receivables > DSO/CCC 탭의 DSO 추세 차트

---

#### H-04: alertStore evaluate() — dso/creditUsageRate 선택적 파라미터 미전달 가능성

- **파일**: `src/stores/alertStore.ts:164`, `src/app/dashboard/page.tsx:359-363`
- **심각도**: HIGH
- **카테고리**: (C) UI Display
- **현재 코드**:
```typescript
evaluate({
  collectionRate: kpis.collectionRate,
  operatingProfitRate: kpis.operatingProfitRate,
  salesPlanAchievement: kpis.salesPlanAchievement,
}, overallDso, overallCreditUsageRate);
```
- **문제**: `overallDso`와 `overallCreditUsageRate`는 미수금/매출 데이터가 모두 있을 때만 값이 존재. 미수금 데이터가 없으면 `undefined`로 전달되어 DSO 초과(rule-dso) 및 여신사용률 초과(rule-credit-usage) 알림이 절대 트리거되지 않음. 이는 의도된 동작일 수 있으나, 사용자가 "알림이 없다 = 안전하다"로 오해할 수 있음.
- **올바른 로직**: DSO/여신 데이터 미업로드 시 해당 규칙 상태를 "데이터 없음"으로 명시 표시
- **영향 탭**: Overview 전체 (AlertPanel)

---

#### H-05: profitability 페이지 — profitabilityAnalysis(901)에 dateRange 필터 미적용

- **파일**: `src/app/dashboard/profitability/page.tsx:126-136`
- **심각도**: HIGH
- **카테고리**: (C) UI Display
- **현재 코드**:
```typescript
const filtered = filterByOrg(profitabilityAnalysis, effectiveOrgNames, "영업조직팀");
// dateRange 필터 없음 — 901은 스냅샷 보고서
```
- **문제**: 901 수익성분석은 누계 스냅샷이므로 dateRange 필터가 적용되지 않음. 그러나 customerItemDetail(100)이 있으면 Smart Data Source로 전환되어 기간 필터 적용됨. **100 데이터가 없는 상태**에서 사용자가 dateRange를 설정하면, 매출(salesList)은 기간 필터링되지만 수익성(901)은 전체 기간 데이터 — 두 수치의 기간이 불일치.
- **올바른 로직**: 901 사용 시 "기간 필터 미적용" 배지/경고 표시 (일부 탭에 `isDateFiltered` 경고 존재하나 불완전)
- **영향 탭**: 수익성 > 손익현황(PnlTab), 조직수익성(OrgTab), 비용구조(CostTab), 계획달성(PlanTab)

---

### MEDIUM (잠재적 수치 영향 또는 표시 불일치)

---

#### M-01: orgContribPie에서 음수 공헌이익 조직 필터링

- **파일**: `src/app/dashboard/profitability/page.tsx:251`
- **심각도**: MEDIUM
- **카테고리**: (C) UI Display
- **현재 코드**: `all.filter((d) => d.value > 0)` — 음수 공헌이익 조직 제외
- **문제**: Pie 차트에서 음수값을 제거하는 것은 올바르나, `excludedNegativeContribCount`로 제외된 수를 표시하는 UI가 존재하는지 확인 필요. 제외된 조직의 손실 규모가 크면 전체 그림이 왜곡될 수 있음.
- **영향 탭**: 수익성 > 팀원별 공헌이익(ContribTab) 파이차트

---

#### M-02: itemHierarchy waterfall — grossProfit - sgna != operatingProfit (반올림)

- **파일**: `src/lib/analysis/itemHierarchy.ts` (calcCostWaterfall)
- **심각도**: MEDIUM
- **카테고리**: (B) Analysis Accuracy
- **문제**: 워터폴 차트에서 매출총이익에서 판관비를 빼면 영업이익과 정확히 일치해야 하나, 부동소수점 연산으로 미세한 차이 발생 가능. 시각적으로 워터폴의 마지막 막대(영업이익)가 수학적으로 예상되는 높이와 약간 다를 수 있음.
- **영향 탭**: 매출 > 품목(ItemTab) 워터폴 차트

---

#### M-03: costEfficiency 비용비율 — 단순 평균 (가중 평균 아님)

- **파일**: `src/app/dashboard/profitability/page.tsx:288-299`
- **심각도**: MEDIUM
- **카테고리**: (B) Analysis Accuracy
- **현재 코드**:
```typescript
entry.원재료비율 += r.원재료비율;
// ... 나중에 entry.count로 나눔 (단순 평균)
```
- **문제**: 조직별 비용 효율 비교 시 각 팀원의 원재료비율을 단순 평균하면, 매출 규모가 큰 팀원과 작은 팀원이 동등한 가중치를 가짐. 매출 가중 평균이 더 정확.
- **영향 탭**: 수익성 > 비용 구조(CostTab) 레이더 차트

---

#### M-04: 303/304/100 fillDownMultiLevel — 소계행이 명시적으로 필터되지 않는 경우

- **파일**: `src/lib/excel/parser.ts:681-687`
- **심각도**: MEDIUM
- **카테고리**: (A) Parser Accuracy
- **문제**: fillDownMultiLevel은 isTotalRow 감지 시 필드를 리셋하지만, "소계" 텍스트가 아닌 빈 행이나 구분자 행이 있을 경우 이전 값이 잘못 전파될 수 있음. safeParseRows의 SKIP_ROW 메커니즘이 1차 방어이나, 303/304의 특수 구조에서 edge case 가능.
- **영향 탭**: 303/304 데이터 사용하는 모든 탭

---

#### M-05: DSO 계산 시 avgMonthlySales <= 0이면 999 반환

- **파일**: `src/lib/analysis/dso.ts:34-37`
- **심각도**: MEDIUM
- **카테고리**: (B) Analysis Accuracy
- **현재 코드**: `return avgMonthlySales <= 0 ? 999 : (totalReceivables / avgMonthlySales) * 30;`
- **문제**: sentinel 값 999가 차트에 그대로 표시되면 "999일" 이 실제 DSO인 것처럼 보일 수 있음. `isFinite` 체크로 걸러지긴 하나, `calcDSOByOrg`에서 `dso < 999` 조건이 없으면 순위 정렬에 포함됨.
- **영향 탭**: Receivables > DSO/CCC 탭

---

#### M-06: HHI 스케일 불일치 — profiling.ts vs customerProfitAnalysis.ts

- **파일**: `src/lib/analysis/profiling.ts` vs `src/lib/analysis/customerProfitAnalysis.ts`
- **심각도**: MEDIUM
- **카테고리**: (B) Analysis Accuracy
- **profiling.ts**: `HHI = sum(share^2)` where share = decimal 0-1 → HHI 범위 0-1
- **customerProfitAnalysis.ts**: `HHI = sum(share^2) * 10000` → HHI 범위 0-10000
- **문제**: 동일 지표명(HHI)이 두 모듈에서 다른 스케일로 사용. profiling.ts의 HHI는 0-1 범위(예: 0.15), customerProfitAnalysis.ts는 0-10000(예: 1500). UI에서 혼동될 수 있음.
- **영향 탭**: Profiles > 종합성과(radarChart) vs 수익성 > 거래처 손익(CustProfitTab)

---

#### M-07: isSameOrg fuzzy matching — 짧은 이름 false positive

- **파일**: `src/lib/orgMapping.ts`
- **심각도**: MEDIUM
- **카테고리**: (B) Analysis Accuracy
- **현재 코드**: bidirectional `includes()` matching
- **문제**: "EC" 팀이 "EC사업팀"과 매칭되는 것은 올바르나, 우연히 다른 팀명에 "EC"가 포함되면 false positive. 현재 인프라 사업본부의 조직명이 충분히 고유하므로 실제 위험은 낮지만, 새로운 조직이 추가되면 문제 가능.
- **영향 탭**: CCC 계산(ccc.ts), 수익성x리스크(profitRiskMatrix.ts), 모든 cross-data 매칭

---

### LOW (코드 품질, 성능, 마이너 이슈)

---

#### L-01: filterStore — selectedPerson, searchQuery 미사용

- **파일**: `src/stores/filterStore.ts:9,14`
- **심각도**: LOW
- **카테고리**: Dead Code
- **문제**: `selectedPerson`과 `searchQuery`가 필터 상태에 정의되어 있으나 어떤 페이지에서도 사용되지 않음. 불필요한 상태가 IndexedDB persistence에도 포함되지 않으므로 성능 영향은 없으나 코드 혼란 유발.

---

#### L-02: orgMapping.ts — fuzzyMatchOrg, filterByOrgFuzzy 미사용

- **파일**: `src/lib/orgMapping.ts`
- **심각도**: LOW
- **카테고리**: Dead Code
- **문제**: `isSameOrg`만 실제 사용되고, `fuzzyMatchOrg`, `filterByOrgFuzzy`는 0 usage.

---

#### L-03: alertStore 알림 히스토리 — 무한 축적 방지 미비

- **파일**: `src/stores/alertStore.ts:239`
- **심각도**: LOW
- **카테고리**: Performance
- **현재 코드**: `updated.slice(0, 20)` — 최근 20건 유지
- **문제**: 20건 제한은 합리적. 하지만 evaluate가 호출될 때마다 (kpis 변경 시마다) 알림 히스토리에 추가되므로, 필터 조작이 빈번하면 히스토리가 빠르게 순환됨. 동일 규칙 중복 추가 방지 로직 없음.

---

#### L-04: Recharts tooltip formatter 타입 일관성

- **파일**: 전체 페이지
- **심각도**: LOW
- **카테고리**: Code Quality
- **문제**: 대부분의 tooltip formatter가 `(v: any, name: any)`로 타입되어 있으나, 일부 탭에서 Recharts의 formatter를 사용하지 않아 기본 숫자 표시(예: 1234567890)가 나타남.

---

## 수치 정확성 검증 결과

| 분석 모듈 | 검증 항목 | 결과 | 비고 |
|-----------|----------|------|------|
| kpi.ts | 매출/수금율/영업이익률 공식 | PASS | collectionRate = collection/sales*100 |
| kpi.ts | 비용구조 Math.abs 분모 | PASS | SAP 음수 원가 허용 |
| aging.ts | 버킷 합계 교차검증 | PASS | 1% 허용 오차 경고 |
| aging.ts | assessRisk 90일 기준 | PASS | SAP FI-AR 표준 준수 |
| dso.ts | DSO = (미수금/월평균매출)x30 | PASS | sentinel 999 주의(M-05) |
| ccc.ts | CCC = DSO - DPO | PASS | DIO 미포함 (데이터 없음) |
| profitability.ts | 제로 분모 가드 | PASS | sales !== 0 체크 |
| profitRiskMatrix.ts | 리스크 점수 0-100 클램프 | PASS | Math.min/max |
| profiling.ts | HHI decimal 계산 | PASS | 스케일 불일치 주의(M-06) |
| breakeven.ts | BEP = 고정비/공헌이익률 | PASS | sentinel 9,999,999,999 |
| rfm.ts | quintile 소표본 처리 | PASS | n<5 → 3-tier |
| clv.ts | margin clamp -50~100% | PASS | |
| customerProfitAnalysis.ts | HHI 10000 스케일 | PASS | 산업 표준 |
| customerItemAnalysis.ts | ABC 음수 분리 | PASS | |
| detailedProfitAnalysis.ts | Pareto 부동소수점 보정 | PASS | 마지막 항목 100% |
| itemCostAnalysis.ts | COST_CATEGORIES 17개 소계 제외 | PASS | |
| forecast.ts | OLS 회귀 + 95% CI | PASS | |
| pipeline.ts | O2C net = gross - prepayment | PASS | |
| formatCurrency | 억/만 변환 + isFinite 가드 | PASS | |
| formatPercent | isFinite 가드 | PASS | |
| extractMonth | 5가지 포맷 | PASS | |
| filterByOrg | field param 매핑 | PASS | 9 hooks 전수 검증 |
| aggregateOrgProfit | immutable deep-copy | PASS | addPAD 새 객체 반환 |

---

## 파서별 컬럼 매핑 검증

| 파일 타입 | 컬럼 매핑 | 결과 | 비고 |
|-----------|----------|------|------|
| salesList | 표준 필드 | PASS | |
| collectionList | 표준 필드 | PASS | |
| orderList | 표준 필드 | PASS | |
| orgProfit | PAD triads | PASS | |
| teamContribution | PAD triads + 중복 제거 | PASS | |
| profitabilityAnalysis (901) | PAD triads col 5-35 | PASS | C-01 이전 감사에서 수정 완료 |
| orgCustomerProfit (304거래처) | PAD triads | PASS | C-01 FALSE POSITIVE: col7에 이름 저장 확인 |
| hqCustomerItemProfit (304본부) | PAD triads | **FIXED** | C-02: 품목명이 품목계정그룹 읽던 버그 수정 |
| customerItemDetail (100) | PAD triads | PASS | C-03 FALSE POSITIVE: col4/5에 이름 저장 확인 |
| itemProfitability (200) | 실적 col 읽기 | PASS | |
| itemCostDetail (501) | PAD triads | PASS (이전 감사에서 확인) |
| receivableAging | nested 구조 | PASS | |
| inventoryMovement | Map 기반 | PASS | |

---

## 페이지별 통합 검증

### Overview (4 tabs)
- **핵심 지표**: H-02 (데이터 소스 혼용), H-04 (알림 미전달)
- **조직 분석**: PASS
- **재무 건전성**: PASS (DSO/CCC inverted color 확인됨)
- **벤치마크/보고서**: PASS

### Sales (15 tabs)
- **거래처**: PASS (C-01 FALSE POSITIVE 확인 — col7에 이름 저장)
- **품목**: M-02 (워터폴 반올림)
- **유형별/채널/품목군**: PASS
- **고객 분석 (RFM, CLV, 이동, 코호트)**: PASS
- **고급 분석 (FX, 이상치, 이탈, 시계열)**: PASS

### Profitability (19 tabs)
- **손익 현황**: H-05 (901 dateRange 미적용)
- **조직 수익성**: H-05 영향
- **팀원별 공헌이익**: M-01 (음수 필터), M-03 (단순 평균)
- **비용 구조**: M-03 영향
- **계획 달성**: PASS (planAchievement 공식 검증 완료)
- **제품 수익성**: PASS
- **수익성x리스크**: M-07 (fuzzy matching)
- **3-way 차이**: PASS
- **손익분기**: PASS
- **시나리오/민감도**: PASS
- **거래처 손익**: PASS (C-01 FALSE POSITIVE)
- **거래처x품목**: C-02 수정완료 (품목명 필드)
- **상세 수익**: PASS (C-03 FALSE POSITIVE)
- **품목원가/원가차이/표준원가**: PASS
- **거래처 리스크/판관비 세부**: PASS

### Receivables (9 tabs)
- **미수금 현황**: PASS
- **리스크 관리**: PASS
- **여신 관리**: PASS
- **DSO/CCC**: H-03 (합성 추세), M-05 (sentinel 999)
- **채권 상세/장기 미수**: PASS
- **선수금**: PASS
- **담당자 인사이트**: PASS
- **수금지연**: PASS

### Orders (6 tabs)
- PASS (전체 검증 완료)

### Profiles (5 tabs)
- M-06 (HHI 스케일) 주의, 그 외 PASS

---

## 개선 권고사항 (우선순위 순)

| # | 카테고리 | 설명 | 우선순위 | 예상 작업량 |
|---|---------|------|---------|-----------|
| 1 | Parser | ~~C-01/C-03 FALSE POSITIVE~~. C-02 수정완료: 304 품목명이 품목계정그룹 읽던 버그 | **완료** | — |
| 2 | Store | H-01: 동일 FileType 재업로드 시 merge/append 옵션 또는 경고 다이얼로그 추가 | P1 | 4h |
| 3 | UI | H-02: Overview KPI 카드에 데이터 소스 명시 (tooltip 강화) | P1 | 1h |
| 4 | UI | H-05: 901 사용 시 "기간 필터 미적용" 배지를 모든 영향 탭에 통일 적용 | P1 | 2h |
| 5 | Analysis | H-03: DSOTrend 차트에 "추정치" 범례/워터마크 강화 | P2 | 1h |
| 6 | UI | H-04: 알림 규칙 중 데이터 미업로드 상태를 명시 표시 | P2 | 2h |
| 7 | Analysis | M-03: 비용비율 가중평균 전환 | P2 | 1h |
| 8 | Analysis | M-06: HHI 스케일 통일 또는 UI 레이블에 스케일 명시 | P2 | 1h |
| 9 | Parser | M-04: 303/304 fillDownMultiLevel edge case 방어 강화 | P3 | 2h |
| 10 | Analysis | M-05: DSO sentinel 999 → UI에서 "측정불가" 표시 | P3 | 1h |
| 11 | Cleanup | L-01/L-02: 미사용 코드 제거 | P3 | 30m |

---

## 이전 감사 대비 변경 사항

### 해결된 이슈 (이전 감사에서 발견 → 현재 확인)
- **C-01(이전)**: 901 profitabilityAnalysis 파서 col indices +3 shift → **수정 완료** (col 23→차이매출원가, 26→매출총이익, 29→판매관리비, 32→직접판매운반비, 35→영업이익)
- **C-02(이전)**: 200 itemProfitability 파서 PAD 잘못 읽기 → **수정 완료** (정확한 실적 열 읽기)
- **H-03(이전)**: calcWeightedAverageDays dead code → **삭제 완료**

### 신규 이슈 (이번 감사에서 최초 발견)
- C-02: 304 hqCustomerItemProfit 품목명이 품목계정그룹(row[5]) 읽던 버그 → **수정 완료**
- C-01/C-03: Excel 대조 결과 FALSE POSITIVE (거래처/품목 컬럼에 이름 저장 확인)
- M-03: 비용비율 단순 평균 (**신규**)

### 기존 이슈 (변경 없음, 미해결)
- H-01: FileUploader 덮어쓰기 (개선 미적용)
- H-02/H-05: 데이터 소스 혼용/dateRange 미적용 (부분 개선)
- M-07: isSameOrg false positive 위험 (현재 위험도 낮음)

---

## 결론

전체적으로 분석 함수의 수학적 정확성은 높은 수준. NaN/Infinity 가드, 제로 분모 보호, 에러 경계 등 방어적 코딩이 잘 적용되어 있음.

**CRITICAL 이슈 해결 완료**: Excel 파일 대조 결과, C-01/C-03은 FALSE POSITIVE(SAP 보고서에 거래처/품목 이름이 저장됨). C-02(304 품목명이 품목계정그룹 읽는 버그)만 실제 버그로 수정 완료.

남은 이슈는 주로 데이터 무결성(H-01: 재업로드 덮어쓰기)과 UX(H-02/H-05: 데이터 소스 혼용 표시, 기간 필터 미적용 경고)에 관한 것으로, 사용자 의사결정에 미치는 영향도가 높으므로 우선 개선 권장.
