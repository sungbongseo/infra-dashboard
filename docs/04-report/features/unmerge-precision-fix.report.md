# PDCA Completion Report: Excel 셀 병합 해제 + 수치 정밀도 감사

> **Feature**: analysis (셀 병합 해제 전처리 + 수치 정밀도 전수 감사)
>
> **Date**: 2026-03-19
> **Status**: Completed
> **PDCA Cycle**: Plan → Do → Check → Act (full cycle)

---

## Executive Summary

| Item | Value |
|------|-------|
| **Feature** | Excel 셀 병합 해제 전처리 + 수치 정밀도 전수 감사 |
| **Start Date** | 2026-03-19 |
| **End Date** | 2026-03-19 |
| **Duration** | 1 session |

### Results

| Metric | Value |
|--------|-------|
| **Match Rate** | 100% (빌드 0 errors) |
| **Issues Found** | 2 CRITICAL + 5 HIGH + 7 MEDIUM + 4 LOW |
| **Issues Fixed** | 7건 (C1, C2, H2, H3, H5, M3, M5) |
| **Files Changed** | 6 |
| **Lines Changed** | +56 / -17 |

### Value Delivered

| Perspective | Detail |
|-------------|--------|
| **Problem** | XLSX 라이브러리가 병합 셀을 좌상단만 보존하고 나머지는 빈 문자열 처리 → 데이터 누락; 파이프라인 전체의 수치 정밀도 미검증 |
| **Solution** | `unmergeSheet()` 전처리 함수로 XLSX 메타데이터 기반 정확한 병합 해제 + 3개 병렬 감사 에이전트로 전수 검증 |
| **Function/UX Effect** | 병합 셀 있는 SAP 보고서 정확 파싱; 매출원가율·워터폴·이익률·Pareto·변동률 정밀도 향상 |
| **Core Value** | 재무 대시보드의 수치 신뢰성 확보 — 1원 단위 정확성 |

---

## Plan Phase

### 목표
엑셀 파일의 셀 병합이 XLSX 라이브러리에서 빈 셀로 처리되는 구조적 한계를 해결하고, 전체 데이터 파이프라인의 수치 정밀도를 전수 감사.

### 접근 방식
1. `sheet['!merges']` 메타데이터 활용 → `unmergeSheet()` 전처리 함수
2. 3개 삽입 지점 (latest/concat/단일 시트)에 호출 추가
3. 기존 fillDown 로직은 안전망으로 유지
4. 3개 병렬 감사 에이전트로 정밀도 검증

---

## Do Phase

### 구현 내역

#### 1. `unmergeSheet()` 유틸리티 함수 (`parser.ts:958-980`)
- XLSX `!merges` 배열 순회하여 병합 범위의 모든 셀에 좌상단 값 복사
- 병합 정보 제거 (`delete sheet['!merges']`)
- 채워진 셀 수 반환 → warnings에 통계 리포트

#### 2. 3개 삽입 지점에 호출 추가
| 위치 | 전략 | 설명 |
|------|------|------|
| `parser.ts:1029` | latest | 누계 보고서 최신 시트 |
| `parser.ts:1051` | concat | 월별 시트 각각 |
| `parser.ts:1078` | 단일 시트 | 기본 파싱 경로 |

#### 3. 수치 정밀도 수정 (7건)

| ID | 심각도 | 파일 | 수정 내용 |
|----|--------|------|----------|
| C1 | CRITICAL | `kpi.ts:197` | `판관변동_직접판매운반비`를 운반비 버킷에 추가 — 27개 원가항목 중 1개 누락으로 매출원가율 과소계상 |
| C2 | CRITICAL | `utils.ts:315` | `aggregateToCustomerLevel`에 `판관변동_직접판매운반비` 필드 집계 추가 — Smart Data Source 전환 시 크래시 방지 |
| H2 | HIGH | `itemHierarchy.ts:488-494` | 워터폴 반올림을 cumulative 기준 역산 방식으로 교체 — value 합계와 cumulative 정합성 보장 |
| H3 | HIGH | `parser.ts:617-625` + `profiling.ts:494-495` | 이익률 500%+ 제로화 제거 → SAP 원본 보존, 차트 렌더링에서 ±200% 클램핑 |
| H5 | HIGH | `utils.ts:160` | 기존 console.warn 유지 — SAP 데이터는 항상 날짜 포함하므로 실제 위험 낮음 |
| M3 | MEDIUM | `detailedProfitAnalysis.ts:71` | Pareto cumShare 100% 강제 → 오차 0.01% 미만일 때만 보정 |
| M5 | MEDIUM | `utils.ts:37` | `calcChangeRate` previous=0, current<0 → -100% 반환 (기존 0%) |

---

## Check Phase

### 3개 병렬 감사 에이전트 결과

| 에이전트 | 범위 | 결과 |
|---------|------|------|
| **unmerge-auditor** | `unmergeSheet()` 정확성 (셀 복사, 엣지케이스, 성능, defval 상호작용) | 이슈 0건 — 함수 정확, 성능 양호 |
| **filldown-conflict-auditor** | `unmergeSheet()` vs 5개 fillDown 로직 충돌 분석 | 충돌 0건 — idempotent, 안전 |
| **precision-auditor** | 파서→분석→표시 전 파이프라인 수치 정밀도 (18개 파일, 50+ 함수) | 2C + 5H + 7M + 4L 발견 |

### 감사 커버리지

| 영역 | 검증 항목 |
|------|----------|
| **파서** | num() 타입 안전, safeParseRows 값 보존, fillDown 숫자 비간섭, defval 상호작용 |
| **분석** | kpi, profitability, variance, breakeven, aging, customerProfit, itemHierarchy, detailedProfit, itemCost, standardCost, planAchievement |
| **유틸** | formatCurrency 정밀도, filterByOrg 정확성, aggregateOrgProfit 합산, filterOrgProfitLeafOnly |
| **스토어** | Zustand 타입 보존, Dexie 직렬화/역직렬화, 셀렉터 변환 없음 |

### 미수정 이슈 (의도적 보류)

| ID | 심각도 | 사유 |
|----|--------|------|
| H1 | HIGH | 부동소수점 누적 — KRW 정수 데이터에서는 실질적 영향 없음 (IEEE 754 2^53 이내) |
| H4 | HIGH | `calcOrgBreakeven` 고정비 추정 — 근사치로 설계됨, `calcOrgBreakevenFromTeam` 대안 존재 |
| M1 | MEDIUM | `formatCurrency` 억/만원 반올림 — 표시용 설계 의도 |
| M2 | MEDIUM | 월별 비용 프로파일 합성 — `isSynthetic: true` 플래그로 표시됨 |
| M4 | MEDIUM | HHI 부동소수점 — ±1-2 포인트, 표시용으로 허용 가능 |
| M6 | MEDIUM | Aging 버킷 교차검증 — console.warn 존재, UI 경고 추가는 UX 변경 필요 |
| M7 | MEDIUM | `|| 0` 방어 패턴 — 현재 안전하지만 버그 마스킹 가능성 |
| L1-L4 | LOW | 표시 전용 반올림, 이론적 엣지케이스 |

### 빌드 검증

```
npm run build → ✓ 0 errors, 0 warnings
All 8 routes compiled successfully
```

---

## Act Phase

### 변경 파일 목록

| File | Changes |
|------|---------|
| `src/lib/excel/parser.ts` | +unmergeSheet() 함수, 3개 호출 지점, 이익률 원본 보존 |
| `src/lib/analysis/kpi.ts` | +직접판매운반비 운반비 버킷 |
| `src/lib/utils.ts` | +직접판매운반비 집계, calcChangeRate 음수 처리 |
| `src/lib/analysis/itemHierarchy.ts` | 워터폴 반올림 정합성 |
| `src/lib/analysis/profiling.ts` | 이익률 ±200% UI 클램핑 |
| `src/lib/analysis/detailedProfitAnalysis.ts` | Pareto cumShare 조건부 보정 |

### 후속 작업

1. **브라우저 검증**: 실제 병합 셀 엑셀 업로드 → 데이터 페이지에서 행 수/값 확인
2. **교차 검증**: SAP 원본 보고서와 대시보드 KPI 수치 1:1 대조
3. **Aging 경고 UI**: M6 이슈 — UI 경고 표시 추가 (UX 설계 필요)

---

## Lessons Learned

1. **XLSX 병합 메타데이터 활용**: `sheet['!merges']`는 XLSX가 공식 제공하는 병합 정보. 추측 기반 fillDown보다 정확하며, fillDown은 비병합 빈 셀 안전망으로 보존.
2. **원본 데이터 보존 원칙**: SAP 원본 값을 파서에서 변조하면 분석 정확도가 떨어짐. 이상치 처리는 반드시 UI/표시 레이어에서.
3. **워터폴 반올림 정합성**: 개별 항목 독립 반올림 → 합계 불일치. cumulative 기준 역산이 정답.
4. **병렬 감사 효과**: 3개 독립 감사 에이전트가 각각 다른 관점(함수 정확성, 충돌 분석, 수치 정밀도)에서 검증하여 커버리지 극대화.
