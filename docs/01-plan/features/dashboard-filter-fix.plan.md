# Plan: 대시보드 필터 정합성 + 데이터 무결성 수정

> **Feature**: dashboard-filter-fix
> **Created**: 2026-03-19
> **Status**: Draft
> **Priority**: CRITICAL

---

## Executive Summary

| Perspective | Detail |
|-------------|--------|
| **Problem** | 매출분석 OrgScorecard 탭 전체 0 표시(PlanActualDiff→Number 변환 오류), 미필터 collectionList/orderList/flatAging 누수, orgProfit 소계 이중카운팅, 타 조직 품목 노출 |
| **Solution** | 2 CRITICAL + 2 HIGH + 3 MEDIUM 총 7건 수정: PlanActualDiff 접근 수정, 미필터 데이터 필터 적용, leafOnly 추가, GlobalFilterBar 조직 선택 UX 개선 |
| **Function/UX Effect** | OrgScorecard 정상 렌더링, Customer360 조직 정합성 확보, CLV 정확도 향상, 사용자 조직만 표시 |
| **Core Value** | 재무 대시보드의 조직별 데이터 격리 및 수치 정확성 보장 |

---

## Background

### 감사 결과 (2개 병렬 에이전트)

| ID | 심각도 | 위치 | 문제 |
|----|--------|------|------|
| C1 | CRITICAL | `crossAnalysis.ts:149-150` | `calcOrgScorecards`에서 `Number(op.매출액)` → PlanActualDiff 객체를 Number 변환 → NaN → 0. OrgScorecard 탭 전체 0 표시 |
| C2 | CRITICAL | `sales/page.tsx:412-413,428` | `collectionList`, `orderList`를 OrgScorecardTab, Customer360Tab에 **미필터** 전달 |
| H1 | HIGH | `sales/page.tsx:78-81` | `filteredOrgProfit`에 `filterOrgProfitLeafOnly()` + `aggregateOrgProfit()` 미적용 → CLV 소계 이중카운팅 |
| H2 | HIGH | `sales/page.tsx:113-117` | `flatAging`에 조직 필터 미적용 → Customer360에 전체 조직 미수금 표시 |
| M1 | MEDIUM | `profitability/page.tsx:144-145` | `filteredOrgCustProfit`, `filteredHqCustItemProfit` 월 필터 누락 |
| M2 | MEDIUM | `profitability/page.tsx:117-123` | `filteredTeamContribution` 월 필터 누락 |
| M3 | MEDIUM | `profitability/page.tsx:428-431` | `filteredItemCostDetail` 월 필터 누락 |

### 조직 필터 이슈
- `DEFAULT_INFRA_ORG_NAMES`에 10개 팀 전체 포함 → 사용자가 맡지 않는 팀 품목도 표시
- 조직 필터 체인 자체는 정상 (parse-time + render-time 이중 필터)
- **해결**: GlobalFilterBar에서 조직 선택 시 즉시 반영되는 UX. 사용자가 자기 조직만 선택하면 됨

---

## Implementation Plan

### Phase 1: CRITICAL 수정 (C1, C2)

#### C1: calcOrgScorecards PlanActualDiff 접근 수정
**파일**: `src/lib/analysis/crossAnalysis.ts`
```
변경: Number(op.매출액) → op.매출액.실적
변경: Number(op.영업이익) → op.영업이익.실적
```

#### C2: sales/page.tsx 미필터 데이터 필터 적용
**파일**: `src/app/dashboard/sales/page.tsx`
```
변경: collectionList → filteredCollections (useFilteredCollections 훅 사용)
변경: orderList → filteredOrders (useFilteredOrders 훅 사용)
```

### Phase 2: HIGH 수정 (H1, H2)

#### H1: filteredOrgProfit에 leafOnly + aggregate 적용
**파일**: `src/app/dashboard/sales/page.tsx`
```
변경: filterByOrg(orgProfit, ...)
    → aggregateOrgProfit(filterOrgProfitLeafOnly(filterByOrg(orgProfit, ...)))
```

#### H2: flatAging에 조직 필터 적용
**파일**: `src/app/dashboard/sales/page.tsx`
```
변경: Array.from(receivableAging.values()).forEach(...)
    → useFilteredReceivables() 훅 사용 또는 filterByOrg 적용
```

### Phase 3: MEDIUM 수정 (M1, M2, M3)

#### M1-M3: profitability 페이지 월 필터 적용
**파일**: `src/app/dashboard/profitability/page.tsx`
- `filteredOrgCustProfit`: filterByMonth 추가
- `filteredHqCustItemProfit`: filterByMonth 추가
- `filteredTeamContribution`: filterByMonth 추가
- `filteredItemCostDetail`: filterByMonth 추가

> 참고: monthlyStrategy:"latest"로 단일 월 데이터만 파싱되므로 실제 영향은 낮으나, 다중 파일 업로드 시 방어

---

## Critical Files

| File | Changes |
|------|---------|
| `src/lib/analysis/crossAnalysis.ts` | C1: PlanActualDiff.실적 접근 수정 |
| `src/app/dashboard/sales/page.tsx` | C2: 미필터→필터, H1: leafOnly, H2: flatAging 필터 |
| `src/app/dashboard/profitability/page.tsx` | M1-M3: 월 필터 추가 |

## Verification

1. `npm run build` — 0 errors
2. OrgScorecard 탭 — 매출/수익성/효율성 점수가 0이 아닌 실제 값 표시
3. Customer360 탭 — 선택한 조직의 수금/수주/미수금만 표시
4. CLV 탭 — 소계 이중카운팅 없이 정확한 수익률
5. GlobalFilterBar 조직 선택 → 품목탭에 선택 조직 품목만 표시
