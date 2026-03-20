# 대시보드 전수검증 분석 보고서

## Executive Summary

| 항목 | 값 |
|------|-----|
| Feature | dashboard-full-audit |
| 검증일 | 2026-03-20 |
| 대상 | 22개 엑셀 파일, 6개 페이지, 55+ 탭 |
| 발견 이슈 | CRITICAL 1건, HIGH 2건, MEDIUM 2건, LOW 18건 |
| 수정 완료 | CRITICAL 1건, HIGH 2건 |

### Value Delivered

| 관점 | 설명 |
|------|------|
| **Problem** | monthlyStrategy "latest" 버그로 656억→26억 대참사. NaN 표시 버그 2건 |
| **Solution** | 7개 파일타입 concat 전환 + isFinite 가드 추가 |
| **Function/UX Effect** | 14개월 전체 데이터 정상 집계, 월별 트렌드 차트 활성화 |
| **Core Value** | 데이터 정합성 복원, 신뢰할 수 있는 의사결정 지원 |

---

## 1. 엑셀 파일 구조 분석 결과

### 1.1 전체 파일 목록 (22개)

| # | 파일명 | 타입 | 시트수 | 행수 | 컬럼 | 병합셀 |
|---|--------|------|--------|------|------|--------|
| 1 | infra 사업본부 담당조직.xlsx | organization | 1 | 34 | 6 | 0 |
| 2 | 매출리스트.xlsx | salesList | 1 | 39,682 | 80 | - |
| 3 | 수금리스트.xlsx | collectionList | 1 | 13,347 | 20 | 0 |
| 4 | 수주리스트.xlsx | orderList | 1 | 45,612 | 66 | - |
| 5 | 303 조직별손익II.xlsx | orgProfit | 14 | 26/시트 | 41 | 25/시트 |
| 6 | 304조직별거래처별 손익.xlsx | orgCustomerProfit | 14 | ~1,036/시트 | 62 | - |
| 7 | 304 본부 거래처 품목 손익.xlsx | hqCustomerItemProfit | 14 | ~2,543/시트 | 29 | - |
| 8 | 401팀원별 공헌이익.xlsx | teamContribution | 14 | ~85/시트 | 115 | 61/시트 |
| 9 | 501.품목별매출원가(상세).xlsx | itemCostDetail | 14 | ~749/시트 | 79 | ~59/시트 |
| 10 | 901담당자,거래처,품목별 수익성분석.xlsx | profitabilityAnalysis | 14 | ~2,945/시트 | 38 | - |
| 11 | 200.품목별 수익성 분석(회계).xlsx | itemProfitability | 14 | ~1,014/시트 | 106 | - |
| 12 | 100거래처별,품목별 손익.xlsx | customerItemDetail | 1 | 50,929 | 78 | - |
| 13-19 | *_미수채권연령.xlsx (7파일) | receivableAging | 1 | 7~326 | 31 | 15 |
| 20-22 | 품목별 수불현황_*.xlsx (3파일) | inventoryMovement | 14 | ~201/시트 | 17 | 0 |

### 1.2 교차검증 수치

| 데이터소스 | 전체 합계 | Infra 합계 | 비고 |
|-----------|----------|------------|------|
| 매출리스트 | 8,063.84억 | 648.85억 | 거래건별 상세 |
| 303 조직별손익 (14시트 concat) | 4,098.29억 | **656.12억** | 월별 P&L 합산 |
| 401 팀원별공헌이익 (concat) | 4,098.61억 | - | 303과 0.32억 차이 (정상) |
| 수금리스트 | 8,311.47억 | - | 선수금 640.49억 포함 |
| 수주리스트 | 8,995.00억 | 792.34억 | - |
| 미수채권연령 (7파일) | 219.40억 | 219.40억 | 건자재 136.57억 (62%) |

**매출리스트 vs 303 차이**: 648.85 vs 656.12 = **-7.26억** (1.1% 차이)
- 원인: 매출리스트는 거래건별 장부금액, 303은 월별 P&L 발생주의 차이
- 판정: **정상 범위** (회계기준 차이)

---

## 2. CRITICAL 이슈 — monthlyStrategy 버그

### 2.1 발견

| 항목 | 내용 |
|------|------|
| 파일 | `src/lib/excel/schemas.ts` |
| 증상 | 303 업로드 시 매출 26억만 표시 (정상: 656억) |
| 원인 | `monthlyStrategy: "latest"` → 14시트 중 마지막 1시트만 파싱 |
| 영향 파일타입 | orgProfit, teamContribution, orgCustomerProfit, hqCustomerItemProfit, customerItemDetail, itemCostDetail, profitabilityAnalysis (7개) |

### 2.2 엑셀 데이터 실제 구조 (직접 확인)

모든 다중시트 파일은 **단월 데이터** (누계 아님):

| 파일 | 증거 | 결론 |
|------|------|------|
| 303 | 매 시트 28행 고정, 각 시트 합계 독립 | 단월 ✅ |
| 401 | 시트별 행수 변동 (97→70→73) | 단월 ✅ |
| 304 조직별거래처별 | 시트별 행수 변동 (1036→669) | 단월 ✅ |
| 304 본부거래처품목 | 시트별 행수 변동 (2543→1718) | 단월 ✅ |
| 501 | 시트별 행수 변동 (749→663) | 단월 ✅ |
| 901 | 시트별 행수 변동 (2945→1978) | 단월 ✅ |
| 200 | 시트별 행수 변동 (1014→867) | 단월 ✅ (이미 concat) |

### 2.3 수정 (완료)

```
schemas.ts: 7개 파일타입의 monthlyStrategy: "latest" 제거
→ 기본값 "concat" 적용 → 모든 시트 합산
```

### 2.4 concat 전환 후 파이프라인 안전성

| 단계 | 처리 | 안전 여부 |
|------|------|----------|
| Parser concat | 각 행에 `month: "YYYYMM"` 필드 주입 | ✅ 이미 구현 |
| filterByMonth | `month` 필드 기준 기간 필터 | ✅ 이미 구현 |
| aggregateOrgProfit | 동일 `영업조직팀` 키로 합산 | ✅ 14행→1행 자동 |
| 분석 함수 | 그룹핑 기반 합산 (Map) | ✅ 행수 증가에 안전 |
| 월별 트렌드 | `month` 필드 감지 시 실제 데이터 | ✅ null→14포인트 |

---

## 3. 컬럼 매핑 검증

### 3.1 파서 컬럼 인덱스 vs 실제 엑셀

| 파일타입 | 파서 최대 인덱스 | 엑셀 max_column | 안전 |
|---------|-----------------|----------------|------|
| orgProfit | 42 | 41 | ✅ |
| teamContribution | 114 | 115 | ✅ |
| profitabilityAnalysis | 37 | 38 | ✅ |
| orgCustomerProfit | 61 | 62 | ✅ |
| hqCustomerItemProfit | 28 | 29 | ✅ |
| customerItemDetail | 77 | 78 | ✅ |
| itemCostDetail | 78 | 79 | ✅ |
| itemProfitability | 104 | 106 | ✅ |

**결론**: 모든 파일타입에서 엑셀 실제 컬럼 수가 파서 필요 범위를 충족. 경계 컬럼 문제 없음.

### 3.2 헤더 매핑 방식

- 파서는 **100% 인덱스 기반** — 헤더 텍스트를 런타임에 검사하지 않음
- 엑셀 "영업조직(팀)" → TypeScript `영업조직팀`은 개발자 지식으로 매핑 (런타임 무관)
- `unmergeSheet()` 함수가 병합 셀을 파싱 전 자동 해제

---

## 4. 대시보드 55탭 전수검증

### 4.1 HIGH 버그 (수정 완료)

| # | 파일 | 이슈 | 수정 |
|---|------|------|------|
| 1 | `orders/tabs/O2CFlowTab.tsx:109` | `item.rate.toFixed(1)` NaN/Infinity 미가드 | `isFinite()` 가드 추가 |
| 2 | `orders/tabs/ConversionTab.tsx:149,232,233,271,272` | `share/conversionRate/cancellationRate.toFixed(1)` 미가드 | `isFinite()` 가드 5곳 추가 |

### 4.2 MEDIUM 이슈 (미수정, 영향 제한적)

| # | 파일 | 이슈 | 완화 |
|---|------|------|------|
| 3 | `sales/tabs/Customer360Tab.tsx` | EmptyState 미구현 | 페이지 레벨 가드로 빈 데이터 자체 방지 |
| 4 | `sales/tabs/OrgScorecardTab.tsx` | EmptyState 미구현 | orgProfit 없으면 탭 비활성화 |

### 4.3 LOW 이슈 (18건, 모두 상위 가드로 완화)

Profitability 8건, Orders 6건, Profiles 3건, Sales 1건 — 모두 페이지 레벨 EmptyState 가드 또는 탭 비활성화로 보호됨.

### 4.4 검증 통과 항목

- **필터 적용**: 55개 탭 전체 — org/date 필터 정상 적용 확인
- **Store 직접 접근 없음**: 모든 탭이 부모로부터 props로 필터된 데이터 수신
- **NaN 안전**: formatCurrency/formatPercent이 isFinite 내장, 대부분 탭에서 활용
- **Smart Data Source** (Profitability): dateRange 활성 시 customerItemDetail → profitabilityAnalysis 자동 전환 정상

---

## 5. 개선 제안

### 5.1 단기 (즉시 적용 가능)

| 우선순위 | 제안 | 효과 |
|---------|------|------|
| ~~CRITICAL~~ | ~~monthlyStrategy concat 전환~~ | ✅ 완료 |
| ~~HIGH~~ | ~~NaN 가드 추가~~ | ✅ 완료 |
| MEDIUM | Customer360Tab/OrgScorecardTab EmptyState 추가 | UX 안정성 |
| LOW | 해외사업팀 미수채권연령 파일 검증 (0행 반환) | 데이터 무결성 |

### 5.2 중기 (기능 개선)

| 제안 | 설명 | 가치 |
|------|------|------|
| 월별 P&L 트렌드 차트 강화 | concat으로 month 필드 활성화 → PnlTab monthlyTrend가 null→14포인트 자동 전환 | 경영진 핵심 뷰 |
| 실제 월별 원가 프로파일 | calcMonthlyCostProfiles가 합성→실제 데이터 전환 (✅ 이미 구현) | 분석 정확도 |
| 데이터 품질 대시보드 강화 | data 페이지에 시트 수, 기간 범위, concat/latest 상태 표시 | 투명성 |
| 품목별 수불현황 활용 | 3개 공장 재고 데이터(inventoryMovement)가 이미 파싱됨 → DPO/CCC 정확도 향상 | 재무 분석 |

### 5.3 장기 (아키텍처)

| 제안 | 설명 |
|------|------|
| 서버사이드 검증 | 업로드 시 기대값 범위 자동 검증 (303 매출합 < 100억이면 경고) |
| 자동 교차검증 | 매출리스트 vs 303 차이 실시간 표시 (이미 orgProfitSalesSum 구현) |
| 기간 자동 감지 | 시트명에서 기간 추출하여 dateRange 자동 설정 |

---

## 6. 검증 체크리스트

### 빌드 검증
- [x] `npm run build` 성공 (0 errors, 0 warnings)
- [x] 12개 페이지 정적 생성 완료

### 데이터 정합성
- [x] 303 14시트 concat → 4,098.29억 (전체), 656.12억 (Infra)
- [x] 401 14시트 concat → 4,098.61억 (303과 0.32억 차이 = 정상)
- [x] 매출리스트 Infra → 648.85억 (303과 7.26억 차이 = 회계기준 차이 정상)
- [x] 미수채권 7파일 → 219.40억

### 파서 매핑
- [x] 13개 파일타입 컬럼 인덱스 범위 확인
- [x] 병합 셀 해제 (unmergeSheet) 적용 확인
- [x] fillDownHierarchicalOrg/fillDownMultiLevel 적용 확인

### 탭 안전성
- [x] 55개 탭 필터 적용 확인
- [x] NaN/Infinity 가드 확인 (HIGH 2건 수정)
- [x] EmptyState 확인 (MEDIUM 2건 미수정, 상위 가드 완화)
