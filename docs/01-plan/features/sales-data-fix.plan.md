# sales-data-fix Planning Document

> **Summary**: 누계 보고서(200/901/303/304/100/501) monthlyStrategy 누락으로 인한 매출 데이터 N배 부풀림 수정
>
> **Project**: 인프라 대시보드
> **Author**: Claude
> **Date**: 2026-03-18
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 6개 누계(YTD) SAP 보고서에 `monthlyStrategy: "latest"` 미설정 → 월별 시트 전체 합산(concat)으로 매출 데이터가 최대 12배 부풀림 (610억 실적 → 대분류당 천억 표시) |
| **Solution** | schemas.ts에서 6개 누계 보고서에 `monthlyStrategy: "latest"` 추가 — 최신 월 시트만 파싱하도록 변경 |
| **Function/UX Effect** | 매출 분석 탭 품목 요약, 수익성 분석 18개 서브탭의 금액이 실제 데이터와 일치하게 됨 |
| **Core Value** | 대시보드 숫자 신뢰성 회복 — 경영진 보고 시 정확한 매출/손익 수치 제공 |

---

## 1. Overview

### 1.1 Purpose

월별 시트가 포함된 엑셀 파일에서 누계(YTD) 보고서가 거래 건별 데이터처럼 합산(concat)되어 매출 실적이 최대 12배 부풀려지는 치명적 버그 수정.

### 1.2 Background

- 사용자 신고: 연간 610억 매출인데 대분류(방수시트) 하나가 6,311억 표시
- 원인: `parseExcelFile()` (parser.ts:976)에서 `schema.monthlyStrategy || "concat"` 기본값 적용
- orgProfit/teamContribution은 이미 `"latest"` 설정되어 정상 동작
- 나머지 6개 누계 보고서(200/901/303/304/100/501)는 미설정 상태

### 1.3 Related Documents

- 이전 수정: `docs/archive/2026-03/data-accuracy-fix/` (monthlyStrategy 도입)
- 스키마 정의: `src/lib/excel/schemas.ts`
- 파서 로직: `src/lib/excel/parser.ts` (lines 974-1021)

---

## 2. Scope

### 2.1 In Scope

- [x] schemas.ts: 6개 누계 보고서에 `monthlyStrategy: "latest"` 추가
- [x] 빌드 검증 (`npm run build`)
- [x] 영향받는 탭 목록 확인 및 문서화

### 2.2 Out of Scope

- salesList/collectionList/orderList: 거래 건별 데이터 → "concat" 정상
- inventoryMovement: 수불현황 → 성격 확인 필요하나 별도 이슈
- UI 변경 없음 (데이터 레이어만 수정)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | itemProfitability(200)에 monthlyStrategy: "latest" 추가 | Critical | Pending |
| FR-02 | profitabilityAnalysis(901)에 monthlyStrategy: "latest" 추가 | Critical | Pending |
| FR-03 | orgCustomerProfit(303)에 monthlyStrategy: "latest" 추가 | Critical | Pending |
| FR-04 | hqCustomerItemProfit(304)에 monthlyStrategy: "latest" 추가 | Critical | Pending |
| FR-05 | customerItemDetail(100)에 monthlyStrategy: "latest" 추가 | Critical | Pending |
| FR-06 | itemCostDetail(501)에 monthlyStrategy: "latest" 추가 | Critical | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 정확성 | 매출 합계가 실제 엑셀 데이터와 1% 이내 일치 | 대시보드 vs 엑셀 수동 비교 |
| 호환성 | 단일 시트 파일은 기존과 동일하게 동작 | 기존 파일 재업로드 |
| 빌드 | TypeScript 빌드 에러 0건 | `npm run build` |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [x] 6개 스키마에 monthlyStrategy: "latest" 추가
- [x] `npm run build` 성공 (0 errors)
- [x] 변경 파일: schemas.ts 1개만

### 4.2 Quality Criteria

- [x] 방수시트 매출이 천억→수십억 수준으로 정상화
- [x] 기존 orgProfit/teamContribution 동작에 영향 없음

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| inventoryMovement도 누계일 수 있음 | Medium | Low | 수불현황은 보통 독립 거래 기록이나, 추후 확인 |
| 단일 시트 파일은 monthlyStrategy 무관 | None | N/A | `monthlySheets.length > 0` 조건에서만 분기 |
| receivableAging도 누계일 수 있음 | Low | Low | 미수채권은 시점 스냅샷으로 별도 처리 |

---

## 6. Architecture Considerations

### 6.1 변경 범위

**파일 1개** (`src/lib/excel/schemas.ts`) — 6개 스키마 객체에 속성 1줄씩 추가

```typescript
// 각 누계 보고서 스키마에 추가:
monthlyStrategy: "latest",
```

### 6.2 데이터 흐름 영향

```
schemas.ts (monthlyStrategy: "latest" 추가)
  → parser.ts:976 (기존 로직 그대로 사용)
  → strategy === "latest" 분기 → 최신 월 시트만 파싱
  → Zustand store에 정확한 데이터 저장
  → 모든 분석 탭에서 정확한 수치 표시
```

---

## 8. Next Steps

1. [x] Design 문서 작성 (단순 수정이므로 Plan과 통합 가능)
2. [x] 구현 (schemas.ts 수정)
3. [x] 빌드 검증

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-18 | Initial draft | Claude |
