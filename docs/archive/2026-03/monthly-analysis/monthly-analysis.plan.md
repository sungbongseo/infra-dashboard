# 월별 데이터 분석 통합 (Monthly Analysis Integration) Planning Document

> **Summary**: 10개 엑셀 파일의 월별 시트(14개월)를 통합 파싱하여, 기존 스냅샷 분석을 월별 트렌드/비교 분석으로 확장하고 수불현황 신규 통합
>
> **Project**: 인프라 대시보드
> **Version**: 1.0
> **Author**: Claude + User
> **Date**: 2026-03-16
> **Status**: Draft
> **Method**: Plan Plus (Brainstorming-Enhanced PDCA)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 10개 P&L/원가/재고 파일이 기간 합산 스냅샷이라 월별 트렌드 분석 불가. 마진 침식, 원가 변동, 재고 효율성의 시간축 분석이 누락됨 |
| **Solution** | 파서를 확장하여 14개 월별 시트(202501~202602)를 통합 파싱, 각 행에 month 필드를 주입하여 기존 분석 함수와 자연스럽게 연결 |
| **Function/UX Effect** | 기존 탭에 월별 시계열 차트 추가, GlobalFilterBar의 dateRange로 P&L 데이터도 월별 필터링, 수불현황 신규 재고 분석 탭 |
| **Core Value** | 스냅샷→시계열 전환으로 "지금 얼마"에서 "어떻게 변하고 있나"로 의사결정 품질 도약. 이탈 예측·코호트·시계열 분해 등 기존 고급 모듈 즉시 활용 가능 |

---

## 1. User Intent Discovery

### 1.1 Core Problem

현재 대시보드의 10개 파일(901, 304, 303, 501, 200, 401, 303II, 수불현황×3)은 **기간 합산 스냅샷**으로만 존재하여:
- 월별 손익 트렌드를 볼 수 없음
- 마진 침식이나 원가 상승을 조기 감지할 수 없음
- 기존 고급 분석 모듈(cohortAnalysis, churnPrediction, timeSeriesDecomposition, anomalyDetection)이 이 데이터와 연결 불가
- 수불현황(재고) 데이터는 대시보드에 아예 미통합

사용자가 10개 파일을 SAP에서 월별 시트(14개: 202501~202602)로 재추출하여 업로드자료에 반영 완료.

### 1.2 Target Users

| User Type | Usage Context | Key Need |
|-----------|---------------|----------|
| 경영진/임원 | 월별 경영 리뷰, 의사결정 | 손익 트렌드 한눈에, 위험 신호 조기 감지, 조직 간 성과 비교 |
| 영업팀장/매니저 | 팀원 관리, 거래처 관리 | 팀원별 월별 실적 추이, 거래처 변화 감지, 목표 달성률 추적 |

### 1.3 Success Criteria

- [ ] 10개 파일의 14개 월별 시트가 모두 정상 파싱되어 Zustand/Dexie에 저장
- [ ] 기존 탭들에서 월별 시계열 차트가 표시됨 (최소 5개 페이지)
- [ ] GlobalFilterBar의 dateRange로 P&L 데이터도 월별 필터링 가능
- [ ] 수불현황 3개 공장이 신규 재고 분석 탭으로 통합
- [ ] 단일 시트 파일(매출/수금/수주/미수채권 등)은 기존 로직 그대로 동작 (하위호환)
- [ ] 빌드 성공, 기존 기능 정상 동작

### 1.4 Constraints

| Constraint | Details | Impact |
|------------|---------|--------|
| IndexedDB 용량 | 14개월 데이터 통합 시 데이터 14배 증가 (901: 11K→~40K행) | Medium — 브라우저 IndexedDB 한도 내 |
| 파싱 시간 | 10개 파일 × 14시트 = 140 시트 파싱 | Medium — 프로그레스바로 UX 보완 |
| 하위호환 | 단일시트 파일과 월별시트 파일 공존 | High — 파서 분기 필수 |
| 시트명 포맷 | YYYYMM (6자리 숫자) 고정 | Low — 일관된 포맷 확인 완료 |

---

## 2. Alternatives Explored

### 2.1 Approach A: 통합 월별 스토어 — Selected

| Aspect | Details |
|--------|---------|
| **Summary** | 모든 월별 시트를 순회하여 각 행에 month 필드 추가, 단일 배열로 Zustand에 통합 저장 |
| **Pros** | 기존 분석 함수 변경 최소, dateRange 필터와 자연스럽게 통합, 행 단위 필터링 가능 |
| **Cons** | 데이터 용량 14배 증가, 초기 파싱 시간 증가 |
| **Effort** | Medium |
| **Best For** | 기존 아키텍처를 최대한 유지하면서 월별 분석을 추가하려는 경우 |

### 2.2 Approach B: 월별 Map 분리 저장

| Aspect | Details |
|--------|---------|
| **Summary** | 각 월을 별도 Map 키로 저장, 필요한 월만 선택적 로드 |
| **Pros** | 메모리 효율적, 월별 데이터 격리 명확 |
| **Cons** | 기존 분석 함수 대부분 수정 필요, receivableAging과 다른 Map 구조라 혼란, 크로스-월 비교 어려움 |
| **Effort** | High |
| **Best For** | 초대형 데이터셋에서 메모리가 제한적인 경우 |

### 2.3 Approach C: 하이브리드 (통합 + 레이지 로드)

| Aspect | Details |
|--------|---------|
| **Summary** | 통합 스토어 방식이지만 IndexedDB에는 월별 분리 저장, 페이지 진입 시 필요 월만 로드 |
| **Pros** | 메모리 효율 + 기존 패턴 유지 |
| **Cons** | Dexie 스키마 복잡도 증가, 비동기 로딩 로직 추가, 개발 범위 가장 큼 |
| **Effort** | High |
| **Best For** | 데이터가 수십만 행 이상으로 확장될 가능성이 있는 경우 |

### 2.3 Decision Rationale

**Selected**: Approach A (통합 월별 스토어)
**Reason**: 기존 아키텍처(Zustand 단일 배열 + useMemo 분석)와 완전히 호환. 14개월 × 최대 4,500행 ≈ 6만 행 수준은 브라우저 IndexedDB/메모리에서 충분히 처리 가능. 기존 40+ 분석 함수의 변경 최소화가 가장 큰 이점.

---

## 3. YAGNI Review

### 3.1 Included (v1 Must-Have)

- [ ] 파서 확장: 10개 파일의 월별 시트 통합 파싱 (detectMonthlySheets + 순회 파싱)
- [ ] 월별 필터링: filterByMonth() + dateRange 통합 (P&L 데이터에 dateRange 적용)
- [ ] 기존 탭 월별 전환: 5개 페이지에 월별 시계열 차트 추가
- [ ] 수불현황 신규 통합: 파서 + 스토어 + 재고 분석 + UI 탭

### 3.2 Deferred (v2+ Maybe)

| Feature | Reason for Deferral | Revisit When |
|---------|---------------------|--------------|
| 월별 시트 자동 감지 UI (업로드 시 "14개 시트 감지됨" 표시) | 기능엔 영향 없음, UX 개선 | v2 UX 개선 시 |
| 월별 데이터 다운로드/내보내기 | 기존 ExportButton으로 커버 가능 | 요청 시 |
| 월별 비교 전용 탭 (2개월 나란히 비교) | 기존 comparisonRange로 부분 커버 | v2 |
| 예측 모듈 자동 연결 (forecast.ts에 월별 P&L 입력) | 현재 salesList 기반으로 동작 중 | 월별 파싱 안정화 후 |

### 3.3 Removed (Won't Do)

| Feature | Reason for Removal |
|---------|-------------------|
| 실시간 월별 데이터 동기화 | 클라이언트 전용 앱, 백엔드 없음 |
| 월별 시트 자동 생성 (SAP 연동) | SAP 연동 불가, 수동 업로드 모델 |

---

## 4. Scope

### 4.1 In Scope

- [ ] `parser.ts` — 다중 시트 순회 + month 필드 주입
- [ ] `schemas.ts` — inventoryMovement 스키마 추가
- [ ] `db.ts` — Dexie 스키마 업그레이드 (inventoryMovement 테이블 + month 인덱스)
- [ ] `dataStore.ts` — inventoryMovement 필드/액션 추가
- [ ] `types/index.ts` — InventoryMovement 타입 + 기존 타입에 month? 추가
- [ ] `utils.ts` — filterByMonth() 유틸 함수
- [ ] `useFilteredData.ts` — useFilteredInventory() 훅 + P&L 월별 필터 로직
- [ ] `monthlyTrend.ts` (신규) — 월별 집계/MoM/YoY/추세 변화 감지
- [ ] `inventoryAnalysis.ts` (신규) — 재고회전율/월별 입출고/장기재고/DIO
- [ ] `MonthlyTrendChart.tsx` (신규) — 공용 월별 라인차트 컴포넌트
- [ ] 5개 페이지 탭 확장 (Profitability 3탭, Overview 1탭, Orders 1탭)

### 4.2 Out of Scope

- 월별 비교 전용 탭 — (v2 deferred)
- forecast.ts 자동 연결 — (안정화 후)
- 업로드 UI 월별 시트 감지 표시 — (v2 UX)
- 기존 단일시트 파일 변경 (매출/수금/수주/미수채권/조직) — 변경 없음

---

## 5. Requirements

### 5.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 14개 월별 시트(YYYYMM)를 자동 감지하여 순회 파싱, 각 행에 month 필드 추가 | High | Pending |
| FR-02 | 단일 시트 파일은 기존 로직 그대로 동작 (하위호환) | High | Pending |
| FR-03 | 수불현황 3개 파일 파싱 (품목, 규격, 기초/입고/출고/기말, 공장명, month) | High | Pending |
| FR-04 | filterByMonth()로 P&L 데이터에 dateRange 필터 적용 | High | Pending |
| FR-05 | 월별 트렌드 분석: 월별 집계, MoM 성장률, 추세 변화 감지 | High | Pending |
| FR-06 | Profitability 손익현황 탭에 월별 매출/영업이익 라인차트 | High | Pending |
| FR-07 | Profitability 원가구조 탭에 월별 원가항목 트렌드 | Medium | Pending |
| FR-08 | Profitability 팀원별 공헌이익 탭에 월별 추이 | Medium | Pending |
| FR-09 | Overview KPI sparkline에 월별 P&L 데이터 반영 | Medium | Pending |
| FR-10 | Orders 페이지에 재고 분석 탭 신규 추가 (공장별/품목별) | High | Pending |
| FR-11 | 재고회전율, 월별 입출고 트렌드, 장기재고 감지, DIO 계산 | High | Pending |
| FR-12 | Dexie 스키마 업그레이드 (inventoryMovement 테이블 + 기존 테이블 month) | High | Pending |

### 5.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 10개 파일 × 14시트 파싱 < 30초 | console.time 측정 |
| Performance | 월별 필터 전환 시 UI 응답 < 500ms | 체감 측정 |
| 하위호환 | 단일시트 파일 업로드 시 기존 동작 100% 유지 | 수동 테스트 |
| 데이터 정합성 | 월별 합산 = 기존 스냅샷 합계와 일치 | 교차 검증 |
| 빌드 | next build 0 errors, 0 type errors | npm run build |

---

## 6. Success Criteria

### 6.1 Definition of Done

- [ ] 10개 파일 월별 파싱 완료 (총 140 시트)
- [ ] 수불현황 3개 파일 신규 통합
- [ ] 기존 단일시트 파일 하위호환 확인
- [ ] 5개 페이지에 월별 시계열 차트 동작
- [ ] dateRange 필터로 P&L 데이터 월별 필터링 동작
- [ ] npm run build 성공 (0 errors)

### 6.2 Quality Criteria

- [ ] TypeScript 타입 오류 0개
- [ ] ESLint 오류 0개
- [ ] NaN/Infinity 가드 적용 (기존 패턴 준수)
- [ ] 기존 페이지 정상 동작 확인

---

## 7. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| IndexedDB 용량 초과 | High | Low | 월별 데이터 합산 시 ~6만 행, 일반 브라우저 한도(수GB) 내. 모니터링 로그 추가 |
| 파싱 시간 증가로 UX 저하 | Medium | Medium | 파일별 프로그레스 표시, Web Worker 검토(v2) |
| 월별 합산 ≠ 기존 스냅샷 | High | Medium | 첫 파싱 시 교차 검증 로직, 불일치 시 경고 표시 |
| 시트명 포맷 불일치 | Medium | Low | YYYYMM 외 포맷 감지 시 단일시트 폴백 |
| 기존 분석 함수 month 필드 무시 | Low | Low | month 필드는 optional(?), 기존 함수는 영향 없음 |
| 수불현황 컬럼 구조 변형 | Medium | Low | 엄격한 스키마 검증 + safeParseRows 적용 |

---

## 8. Architecture Considerations

### 8.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | Simple structure | Static sites | |
| **Dynamic** | Feature-based modules, BaaS | Web apps with backend | ✅ |
| **Enterprise** | Strict layer separation, microservices | High-traffic systems | |

### 8.2 Key Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 월별 데이터 저장 방식 | 통합 배열 / Map 분리 / 하이브리드 | 통합 배열 | 기존 분석 함수 호환, 변경 최소화 |
| month 필드 주입 시점 | 파서에서 / 스토어에서 / 훅에서 | 파서에서 | 데이터 원천에서 주입이 가장 깔끔 |
| 수불현황 페이지 위치 | Orders 탭 / 신규 페이지 / Profitability | Orders 탭 | 수주→재고 흐름이 자연스러움 |
| 월별 차트 컴포넌트 | 페이지별 인라인 / 공용 컴포넌트 | 공용 MonthlyTrendChart | DRY 원칙, 5개 페이지에서 재사용 |

### 8.3 Component Overview

```
[변경 파일 — 7개]
lib/excel/parser.ts        ← 다중 시트 순회 + month 주입
lib/excel/schemas.ts       ← inventoryMovement 스키마
lib/db.ts                  ← Dexie 스키마 v+1
stores/dataStore.ts        ← inventoryMovement 필드/액션
lib/hooks/useFilteredData.ts ← filterByMonth + useFilteredInventory
lib/utils.ts               ← filterByMonth()
types/index.ts             ← InventoryMovement 타입

[신규 파일 — 3개]
lib/analysis/monthlyTrend.ts       ← 월별 집계/MoM/YoY/추세
lib/analysis/inventoryAnalysis.ts  ← 재고회전/입출고/DIO
components/dashboard/MonthlyTrendChart.tsx ← 공용 월별 차트

[UI 탭 확장 — 5개 페이지]
dashboard/profitability/   ← 손익현황/원가구조/팀원공헌 3탭에 월별 차트
dashboard/(overview)/      ← KPI sparkline 데이터 확장
dashboard/orders/          ← 재고 분석 탭 신규
```

### 8.4 Data Flow

```
[월별 시트 파싱 플로우]
Excel 업로드 (e.g. 901.xlsx, 14 sheets)
  │
  ├─ detectFileType() → 'profitabilityAnalysis'
  │
  ├─ detectMonthlySheets(workbook)
  │   └─ sheets.filter(s => /^\d{6}$/.test(s))
  │   └─ returns ['202501','202502',...,'202602']
  │
  ├─ IF monthlySheets.length > 0:
  │   for each sheet:
  │     parseSheet(sheet, schema)
  │     rows.forEach(r => r.month = sheetName)
  │     allRows.push(...rows)
  │
  ├─ ELSE: (single sheet, 하위호환)
  │   parseSheet(sheets[0], schema)
  │
  └─ return allRows → Zustand store → Dexie

[월별 필터링 플로우]
Page Component
  │
  ├─ useFilterStore() → { dateRange }
  ├─ useDataStore() → profitabilityAnalysis[]
  │   (각 행에 month 필드 존재)
  │
  ├─ useMemo: filterByMonth(data, dateRange)
  │   └─ month 필드로 YYYYMM 범위 필터
  │   └─ dateRange 없으면 전체 데이터
  │
  ├─ useMemo: 기존 analysis(필터된 데이터)
  │   └─ 기존 함수 그대로 동작 (입력만 변경)
  │
  ├─ useMemo: monthlyTrend(전체 데이터)
  │   └─ 월별 집계 + MoM + YoY
  │
  └─ Render:
      ├─ 기존 KPI/테이블 (필터된 데이터)
      └─ MonthlyTrendChart (월별 집계)

[수불현황 신규 플로우]
수불현황_*.xlsx (14 sheets each)
  │
  ├─ detectFileType() → 'inventoryMovement'
  │   regex: /수불현황/
  │
  ├─ 파싱: 공장명 = filename에서 추출
  │   각 행: { 품목, 규격, 기초, 입고,
  │           출고, 기말, month, factory }
  │
  ├─ dataStore.inventoryMovement[]
  │
  ├─ inventoryAnalysis.ts:
  │   ├─ 재고회전율 = 출고/평균재고
  │   ├─ 월별 입출고 트렌드
  │   ├─ 장기재고 감지 (출고=0 연속)
  │   └─ DIO 계산 → CCC 보완
  │
  └─ Orders 페이지 재고분석 탭
      └─ 공장별/품목별 대시보드
```

---

## 9. Convention Prerequisites

### 9.1 Applicable Conventions

- [x] 기존 파서 패턴 준수 (safeParseRows, schema 기반)
- [x] Zustand 셀렉터 패턴 (개별 셀렉터, store 전체 구독 금지)
- [x] Korean UI 텍스트, formatCurrency(억/만원)
- [x] NaN/Infinity 가드 (isFinite 체크, formatCurrency/formatPercent 사용)
- [x] ErrorBoundary 래핑, EmptyState/LoadingSkeleton 패턴
- [x] 탭 컴포넌트는 tabs/ 서브디렉토리에 추출, 부모에서 props 전달
- [x] CHART_COLORS, TOOLTIP_STYLE 등 공용 상수 사용

---

## 10. Implementation Phases

### Phase 1: 파서 & 인프라 확장 (Foundation)
1. [ ] `types/index.ts` — InventoryMovement 타입 + 기존 타입 month? 추가
2. [ ] `schemas.ts` — inventoryMovement 스키마 + regex 추가
3. [ ] `parser.ts` — detectMonthlySheets() + 다중 시트 순회 + month 주입
4. [ ] `db.ts` — Dexie 스키마 업그레이드
5. [ ] `dataStore.ts` — inventoryMovement 필드/액션
6. [ ] `utils.ts` — filterByMonth()
7. [ ] `useFilteredData.ts` — P&L 월별 필터 + useFilteredInventory()

### Phase 2: 분석 모듈 (Analysis)
8. [ ] `monthlyTrend.ts` — 월별 집계/MoM/YoY/추세 변화 감지
9. [ ] `inventoryAnalysis.ts` — 재고회전율/입출고/장기재고/DIO

### Phase 3: UI 통합 (Visualization)
10. [ ] `MonthlyTrendChart.tsx` — 공용 월별 라인차트
11. [ ] Profitability 3탭 확장 (손익현황/원가구조/팀원공헌)
12. [ ] Overview KPI sparkline 확장
13. [ ] Orders 재고 분석 탭 신규

### Phase 4: 검증 & 안정화
14. [ ] 하위호환 테스트 (단일시트 파일)
15. [ ] 데이터 정합성 교차 검증
16. [ ] npm run build 성공 확인

---

## 11. Next Steps

1. [ ] Write design document (`/pdca design monthly-analysis`)
2. [ ] Start implementation (`/pdca do monthly-analysis`)
3. [ ] Gap analysis (`/pdca analyze monthly-analysis`)

---

## Appendix: Brainstorming Log

> Key decisions from Plan Plus Phases 1-4.

| Phase | Question | Answer | Decision |
|-------|----------|--------|----------|
| Intent Q1 | 핵심 목적 | 종합 (트렌드+비교+신규) | 트렌드 분석 + 월별 비교 + 수불현황 통합 |
| Intent Q2 | 타겟 사용자 | 경영진 + 영업팀 모두 | 이원화: 요약뷰(경영진) + 상세뷰(영업팀) |
| Intent Q3 | 성공 기준 | 전부 다 | 파싱→필터→차트→신규 전체 구현 |
| Alternatives | A vs B vs C | A: 통합 월별 스토어 | 기존 아키텍처 호환, 변경 최소화 |
| YAGNI | 4개 기능 | 4개 전부 포함 | 모두 v1 필수로 판단 |
| Design 4-1 | 아키텍처 5계층 | 승인 | Parser→Store→Filter→Analysis→UI |
| Design 4-2 | 모듈 구성 10개 | 승인 | 변경 7개 + 신규 3개 |
| Design 4-3 | 데이터 플로우 3가지 | 승인 | 월별파싱/필터링/수불현황 플로우 |

---

## Appendix: 월별 시트 현황 (탐색 결과)

| 파일 | 시트 수 | 월 범위 | 행/시트 | 대시보드 타입 |
|------|---------|---------|---------|--------------|
| 901 수익성 분석 | 14 | 202501-202602 | 1,817~4,513 | profitabilityAnalysis |
| 304 본부 거래처 품목 손익 | 14 | 202501-202602 | 1,585~3,803 | hqCustomerItemProfit |
| 303 조직별거래처별 손익 | 14 | 202501-202602 | 666~1,553 | orgCustomerProfit |
| 501 품목별매출원가(상세) | 14 | 202501-202602 | 656~1,017 | itemCostDetail |
| 200 품목별 수익성(회계) | 14 | 202501-202602 | 852~1,784 | itemProfitability |
| 401 팀원별 공헌이익 | 14 | 202501-202602 | 70~97 | teamContribution |
| 303 조직별손익II | 14 | 202501-202602 | 26~28 | orgProfit |
| 수불현황_양산 | 14 | 202501-202602 | 222~246 | inventoryMovement (신규) |
| 수불현황_옥천 | 14 | 202501-202602 | 167~212 | inventoryMovement (신규) |
| 수불현황_울산 | 14 | 202501-202602 | 211~254 | inventoryMovement (신규) |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-16 | Initial draft (Plan Plus) | Claude + User |
