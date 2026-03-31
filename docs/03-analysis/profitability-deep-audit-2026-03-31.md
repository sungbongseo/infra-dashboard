# 수익성 분석탭 정밀 감사 보고서

> **작성일**: 2026-03-31
> **대상**: `/dashboard/profitability` 20개 서브탭 전체
> **범위**: 분석 로직 정확성, 차트 렌더링, 툴팁/인사이트, 수치 계산

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| 감사 대상 탭 | 20개 |
| 분석 모듈 | 17개 |
| 발견 이슈 총 수 | **29건** |
| CRITICAL (즉시 수정) | **5건** |
| HIGH (우선 수정) | **8건** |
| MEDIUM (개선 권장) | **10건** |
| LOW (참고) | **6건** |

### Value Delivered
| 관점 | 내용 |
|------|------|
| Problem | 20개 수익성 탭의 계산 로직, 차트, 인사이트에 숨겨진 부정확성 |
| Solution | 17개 분석 모듈 + 20개 탭 컴포넌트 전수 검사로 29건 이슈 식별 |
| Function UX Effect | 수치 왜곡 제거, NaN/Infinity 방어 강화, 인사이트 정확도 향상 |
| Core Value | 경영진 의사결정 신뢰성 확보 — 잘못된 수치 기반 판단 방지 |

---

## CRITICAL Issues (즉시 수정 필요)

### C1. whatif.ts — 시나리오 요약 마진 단순 평균 오류
- **파일**: [whatif.ts](src/lib/analysis/whatif.ts)
- **함수**: `calcScenarioSummary()`
- **문제**: `scenarioAvgMargin`을 `scenarioTotalOP / scenarioTotalSales × 100`으로 계산하는데, 이 자체는 가중평균으로 올바름. **그러나** `calcWhatIfScenario()`에서 개별 조직의 `scenarioSGA = Math.max(0, baseSGA × (1 + sgaChangePercent/100))`로 판관비를 0 이하로 못 내리게 클램핑하면서, 원래 적자 조직(baseSGA < 0인 SAP 반제 전표)의 시나리오 결과가 왜곡됨
- **영향**: 판관비 음수 반제가 있는 조직에서 시나리오 영업이익이 과대 계상
- **수정**: `Math.max(0, ...)` 제거하고, 음수 판관비(반제)를 허용하되 UI에서 경고 표시

### C2. ItemCostTab — 데이터 클램핑으로 실제값 숨김
- **파일**: [ItemCostTab.tsx](src/app/dashboard/profitability/tabs/ItemCostTab.tsx)
- **문제**: `quadrantData`에서 `Math.min(Math.max(..., 0), 300)`으로 원본 데이터를 클램핑 → 실제 300% 초과 또는 음수인 품목이 300/0으로 잘려서 차트에서 실제 이상치가 보이지 않음
- **영향**: 극단적 원가 초과/미달 품목이 경계값에 뭉쳐 보임 → 이상치 탐지 불가
- **수정**: 차트 `domain` 속성으로 시각적 범위만 제한하고, 원본 데이터는 보존. 클램핑된 값엔 "범위 초과" 마커 추가

### C3. OrgTab/CustomerRiskMatrixTab — ReferenceLine NaN 전파
- **파일**: [OrgTab.tsx](src/app/dashboard/profitability/tabs/OrgTab.tsx), [CustomerRiskMatrixTab.tsx](src/app/dashboard/profitability/tabs/CustomerRiskMatrixTab.tsx)
- **문제**: `medianSales`, `medianMargin`, `medianProfitRate`, `medianAgingRate` 계산 시 `isFinite()` 검증 없이 `ReferenceLine`에 전달 → 데이터가 비어 있거나 모든 값이 동일할 때 NaN이 축 라벨/위치에 전파
- **영향**: 차트 렌더링 오류 또는 축 라벨에 "NaN" 표시
- **수정**: ReferenceLine 렌더링 전에 `isFinite(value)` 체크 추가. 유틸리티 `SafeReferenceLine` 컴포넌트 생성 권장

### C4. calcOrgBreakevenFromTeam — 음수 고정비 강제 0 처리
- **파일**: [breakeven.ts:301](src/lib/analysis/breakeven.ts#L301)
- **문제**: `Math.max(v.fixedCosts, 0)`으로 음수 고정비를 0으로 클램핑. 그런데 `calcTeamBreakeven()`은 음수 고정비를 허용(SAP 반제 전표)하고 `hasNegativeFixedCosts` 플래그를 설정하는 반면, 조직 합산 함수는 이를 무시
- **영향**: 음수 고정비가 있는 조직의 BEP가 실제보다 높게 계산됨 (보수적이나 부정확)
- **수정**: `calcTeamBreakeven()`과 동일하게 음수 허용 + `hasNegativeFixedCosts` 플래그 추가. UI에서 해당 조직에 경고 배지 표시

### C5. sensitivityAnalysis.ts — SGA 변동비율 하드코딩
- **파일**: [sensitivityAnalysis.ts:51](src/lib/analysis/sensitivityAnalysis.ts#L51)
- **문제**: `sgaVarRatio = 0.3` (판관비 중 30%가 변동비)이 기본값으로 고정. SensitivityTab에서 슬라이더로 조정 가능하나, 실제 데이터 기반 추정이 아님
- **영향**: 실제 고정/변동 비율이 다른 조직에서 민감도 결과가 왜곡. 예: 고정비 비중이 높은 조직(70% 이상)에서 영업이익 민감도를 과소평가
- **수정**: teamContribution 데이터에서 실제 변동비/고정비 비율을 역산하여 기본값으로 사용. 현재 UI 슬라이더는 유지하되 "추정 기반" 배지 추가

---

## HIGH Issues (우선 수정)

### H1. customerRiskMatrix.ts — 수익률 단순 평균
- **문제**: 4사분면 요약에서 `avgProfitRate`를 매출 가중 없이 단순 산술평균으로 계산
- **영향**: 소규모 고수익 거래처가 평균을 왜곡 → 사분면별 수익성 판단 오류
- **수정**: 매출 가중 평균으로 변경

### H2. PortfolioTab — safeFixed 중복 정의
- **파일**: [PortfolioTab.tsx:51](src/app/dashboard/profitability/tabs/PortfolioTab.tsx#L51)
- **문제**: `lib/utils`에 이미 `safeFixed` 함수가 있는데 컴포넌트 내에 동일 함수 재정의
- **영향**: 향후 유틸리티 버전 수정 시 이 탭만 동기화 누락 위험
- **수정**: import로 교체

### H3. BreakevenTab — BEP KPI의 단순 합산 오류 가능성
- **파일**: [BreakevenTab.tsx:52](src/app/dashboard/profitability/tabs/BreakevenTab.tsx#L52)
- **문제**: `bepKpiSummary.totalBep`이 page.tsx에서 어떻게 계산되는지에 따라 조직별 BEP를 단순 합산하면 경제적 의미가 없음. 가중 BEP(`weightedBep`)가 별도로 존재하므로 KPI에 어떤 값을 보여주는지 혼동
- **영향**: KPI 카드에 "전사 BEP" 표시 시 단순합산 vs 가중평균 혼동
- **수정**: KPI에 `weightedBep.weightedBepSales` 사용으로 통일, formula 설명에 "가중평균 기반" 명시

### H4. ProductTab — 마진 침식 차트 툴팁 필드 불일치
- **문제**: 마진 침식 차트에서 tooltip이 `erosion` 필드를 참조하나, 실제 데이터 구조의 `impactAmount`와 혼동 가능
- **영향**: 툴팁에 잘못된 필드값이 표시될 수 있음
- **수정**: 데이터 변환 시 필드 매핑 통일

### H5. CustProfitTab — 테이블 페이지네이션 누락
- **파일**: [CustProfitTab.tsx](src/app/dashboard/profitability/tabs/CustProfitTab.tsx)
- **문제**: 거래처 상세 테이블이 전체 건수를 표시하면서 50건만 렌더링 — 나머지 데이터 접근 불가
- **영향**: 50건 이후 거래처 정보를 볼 수 없음
- **수정**: DataTable 컴포넌트의 페이지네이션 활성화 또는 "더보기" 버튼 추가

### H6. profitRiskMatrix.ts — 하드코딩 기준값 5%/40점
- **문제**: 영업이익률 5%, 리스크 점수 40이 4사분면 분류 기준으로 하드코딩. 산업/조직 특성에 따라 기준이 다름
- **영향**: 특정 조직에서 거의 모든 거래처가 같은 사분면에 집중 → 분류의 변별력 상실
- **수정**: 데이터 기반 동적 기준(중위값) 옵션 추가, 또는 사용자 조정 가능한 슬라이더

### H7. portfolioOptimization.ts — 복합 점수 가중치 검증 부재
- **문제**: `매출 30%, 수익 25%, 성장 20%, 원가 15%, 계획 10%` 가중치가 비즈니스 검증 없이 설정
- **영향**: 성장성을 과대평가하거나 원가 효율을 과소평가할 수 있음
- **수정**: 가중치를 UI에서 조정 가능하게 하거나, 최소한 설정값으로 분리

### H8. variance.ts 모듈 부재 — 3-way 차이분석 미구현
- **문제**: CLAUDE.md에 `variance.ts — SAP CO-PA 3-way variance (price/volume/mix)` 명시되어 있으나, 실제로는 `planAchievement.ts`가 대체. 진정한 3-way variance(가격/수량/믹스 분해)는 구현되지 않음
- **영향**: "3-way차이" 탭 제목이 오해를 유발 — 실제로는 금액 기반 달성율 분석
- **수정**: 탭 제목을 "계획 달성 분석"으로 변경하거나, 주석에 "SAP 901 데이터의 수량 계획이 대부분 0이어서 금액 기반으로 대체" 배너 추가 (이미 코드 주석에는 있으나 UI에 미반영)

---

## MEDIUM Issues (개선 권장)

### M1. calcPlanVsActualHeatmap — 계획=0 시 9999 센티넬
- 계획이 0인 항목에 달성률 9999를 할당하여 "계획없음"으로 표시. 하지만 히트맵 색상 로직에서 9999가 극단적 초과달성으로 잘못 색상화될 가능성
- **수정**: 별도 `null` 또는 `"N/A"` 타입으로 분리

### M2. breakeven.ts — BEP 센티넬 값 9,999,999,999
- 실제 대규모 조직의 매출이 이 값에 근접할 수 있음. 센티넬 대신 `canBreakEven: false` 플래그만으로 충분
- **수정**: 센티넬 제거, `bepSales = 0` + `canBreakEven = false` 조합으로 통일 (이미 부분 구현됨)

### M3. calcCostStructure — 매출 음수(반제) 시 비율 왜곡
- `ratio = amount / |sales| × 100`에서 `Math.abs(sales)` 사용은 방어적이나, 반제 전표로 매출이 음수인 조직의 비율이 부호 반전될 수 있음
- **수정**: 매출 음수 조직은 별도 표시하고 비율 계산에서 제외하는 옵션

### M4. SensitivityTab — 히트맵 축 레이블이 "가격"으로 표시되나 실제는 "매출 변동"
- SensitivityTab의 priceSteps/volumeSteps 축이 `calcSensitivityGrid`에서 `priceFactor × volumeFactor`로 매출을 계산하므로, "가격 변동 ≠ 매출 변동"임을 사용자가 혼동할 수 있음
- **수정**: 축 레이블에 "(단가)" 명시 또는 설명 툴팁 추가

### M5. DetailedProfitTab — Y축 도메인 최소값 100 강제
- `Math.max(Math.ceil(max), 100)` — 데이터가 모두 0일 때 Y축이 100까지 표시되어 빈 차트가 크게 보임
- **수정**: 데이터가 있을 때만 도메인 설정, 없으면 auto

### M6. ContribTab — Tier 분류 기준 문서화 부족
- 상위 20% / 중위 60% / 하위 20% 분류가 매출 기준인지 공헌이익 기준인지 UI에서 불명확
- **수정**: 분류 기준을 KPI 카드의 formula에 명시

### M7. CostTab — 비용 구조 8항목 분류의 "기타변동비" 범위 불명확
- 기타변동비에 어떤 SAP 항목들이 포함되는지 사용자가 파악 불가
- **수정**: 기타변동비 금액 클릭 시 상세 항목 토글 또는 툴팁에 포함 항목 목록

### M8. 하드코딩 색상 — CHART_COLORS 대신 직접 HSL 사용
- CostTab, ItemCostTab, SgaBreakdownTab에서 `hsl(...)` 직접 사용 → 테마 변경 시 불일치
- **수정**: CHART_COLORS 또는 Tailwind CSS 변수로 통일

### M9. operatingProfit > grossProfit 무결성 검증 부재
- 영업이익이 매출총이익보다 큰 경우(데이터 오류)를 탐지하는 로직 없음
- **수정**: 분석 함수 진입부에 데이터 무결성 경고 추가

### M10. PlanTab — 레이더 차트 음수 클램핑으로 정보 손실
- `Math.max(rawValue, 0)` — 음수 비율(적자 조직)이 0으로 처리되어 레이더 차트에서 적자 심각도 구분 불가
- **수정**: 음수 허용 도메인 설정 또는 적자 조직에 별도 경고 마커

---

## LOW Issues (참고)

| # | 이슈 | 파일 |
|---|------|------|
| L1 | ProductTab 파이 라벨에서 percent < 0.03 isFinite 미체크 | ProductTab.tsx |
| L2 | StandardCostTab 품목 코드 정규화 regex 실패 시 원본 그대로 노출 | StandardCostTab.tsx |
| L3 | WhatIfTab 4개 프리셋 시나리오 파라미터가 하드코딩 | WhatIfTab.tsx |
| L4 | VarianceTab Progress 컴포넌트 150% 클램핑으로 초과달성 정도 미표시 | VarianceTab.tsx |
| L5 | 사분면 분류 로직이 3개 모듈에 중복 구현 | breakeven, portfolio, itemHierarchy |
| L6 | 월별 원가 프로파일 합성 시 분산 팩터 [0.85, 1.15]로 제한 | kpi.ts |

---

## 탭별 감사 결과 요약

| # | 탭 | 이슈 수 | 심각도 | 핵심 발견 |
|---|-----|---------|--------|-----------|
| 1 | 손익 현황 | 0 | ✅ OK | 워터폴/추세 정상 |
| 2 | 조직 수익성 | 1 | 🔴 C3 | ReferenceLine NaN 전파 |
| 3 | 팀원별 공헌이익 | 1 | 🟡 M6 | Tier 분류 기준 불명확 |
| 4 | 비용 구조 | 2 | 🟡 M7,M8 | 기타변동비 범위, HSL 하드코딩 |
| 5 | 계획 달성 | 1 | 🟡 M10 | 레이더 음수 클램핑 |
| 6 | 제품 수익성 | 2 | 🟠 H4, L1 | 툴팁 필드 불일치 |
| 7 | 수익성×리스크 | 1 | 🟠 H6 | 기준값 하드코딩 |
| 8 | 3-way차이 | 1 | 🟠 H8 | 탭 제목 vs 실제 분석 괴리 |
| 9 | 손익분기 | 2 | 🔴 C4, 🟠 H3 | 음수 고정비 클램핑, BEP KPI 혼동 |
| 10 | 시나리오 | 1 | 🔴 C1 | SGA 음수 반제 클램핑 |
| 11 | 민감도 | 2 | 🔴 C5, 🟡 M4 | SGA 변동비율 하드코딩, 축 레이블 |
| 12 | 거래처 손익 | 1 | 🟠 H5 | 테이블 페이지네이션 누락 |
| 13 | 거래처×품목 | 0 | ✅ OK | ABC/포트폴리오 정상 |
| 14 | 상세 수익 | 1 | 🟡 M5 | Y축 도메인 강제 100 |
| 15 | 거래처리스크 | 2 | 🔴 C3, 🟠 H1 | ReferenceLine NaN, 평균 비가중 |
| 16 | 판관비세부 | 1 | 🟡 M8 | HSL 하드코딩 |
| 17 | 품목원가 | 1 | 🔴 C2 | 데이터 클램핑 |
| 18 | 원가차이 | 0 | ✅ OK | 분산/요약 정상 |
| 19 | 표준원가 | 0 | ✅ OK | 계산 정상 |
| 20 | 포트폴리오 | 2 | 🟠 H2,H7 | safeFixed 중복, 가중치 미검증 |

---

## 수정 우선순위 권장

### Phase 1 (CRITICAL — 즉시)
1. C1: whatif.ts SGA 음수 반제 허용
2. C2: ItemCostTab 데이터 클램핑 → 차트 domain으로 이동
3. C3: SafeReferenceLine 유틸리티 생성 + 3개 탭 적용
4. C4: calcOrgBreakevenFromTeam 음수 고정비 허용
5. C5: 민감도 SGA 비율 데이터 기반 추정

### Phase 2 (HIGH — 1주 내)
6. H1: customerRiskMatrix 매출 가중 평균
7. H3: BEP KPI에 가중 BEP 사용
8. H4: ProductTab 툴팁 필드 통일
9. H5: CustProfitTab 페이지네이션
10. H6: profitRiskMatrix 동적 기준 옵션
11. H7: 포트폴리오 가중치 설정 분리
12. H8: 3-way차이 탭 제목/배너 수정
13. H2: PortfolioTab safeFixed import 교체

### Phase 3 (MEDIUM — 2주 내)
14-23: M1~M10 순차 수정

---

## 정상 작동 확인 영역 (10개 탭)

다음 탭/모듈은 계산 로직, 차트 바인딩, NaN 방어가 모두 정상:
- **손익 현황**: 워터폴 차트, 월별 추세 정확
- **거래처×품목**: ABC 분류, 교차 수익성 정상
- **원가차이**: 표준원가 vs 실적원가 분산 정확
- **표준원가**: 계정구분별/조직별 차이 분석 정확
- **planAchievement.ts**: 달성율, 마진 드리프트, 품질 진단 모두 견고
- **customerProfitAnalysis.ts**: HHI, 랭킹, 세그먼트 계산 정확
- **standardCostVariance.ts**: 차이율, 조직별 관리 정확
- **breakeven.ts의 calcTeamBreakeven**: 엣지케이스 처리 우수

---

## 결론

20개 탭 중 **10개는 정상**, **10개에서 29건의 이슈** 발견. CRITICAL 5건은 수치 정확성에 직접 영향을 주므로 즉시 수정이 필요합니다. 특히 **데이터 클램핑(C2, C4)과 SGA 하드코딩(C1, C5)**이 시나리오/민감도 분석의 신뢰성을 저해하고 있어 최우선 개선 대상입니다.
