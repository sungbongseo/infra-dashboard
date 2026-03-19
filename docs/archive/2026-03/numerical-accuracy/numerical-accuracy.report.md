# Feature Completion Report: Numerical Accuracy (수치 정확성 감사)

> **Summary**: 인프라 대시보드 19건 수치 정확성 감사 발견사항 전체 해결 보고서
>
> **Feature**: numerical-accuracy
> **Created**: 2026-03-19
> **Status**: Completed
> **Match Rate**: 100% (19/19 items resolved)

---

## Executive Summary

### 1.1 Overview

| 항목 | 값 |
|------|-----|
| Feature | numerical-accuracy (수치 정확성 감사 대응) |
| 시작일 | 2026-03-18 |
| 완료일 | 2026-03-19 |
| 소요기간 | 2일 |
| 감사 발견사항 | 19건 (CRITICAL 3, HIGH 5, MEDIUM 7, LOW 4) |

### 1.2 Results

| 지표 | 값 |
|------|-----|
| Match Rate | 100% (19/19) |
| FALSE POSITIVE | 2건 (C-01, C-03) |
| 수정 파일 수 | 12개 |
| 수정 코드 라인 | ~150줄 |
| 이터레이션 | 2회 (37% → 74% → 100%) |
| 빌드 검증 | ✓ 3회 모두 0 errors |

### 1.3 Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | 감사 결과 데이터 소스 혼용, 알림 사각지대, 스케일 불일치 등 19건의 수치 정확성 이슈 발견. 사용자가 부정확한 KPI를 보고 잘못된 의사결정을 내릴 위험 |
| **Solution** | 3단계 이터레이션(P1 HIGH→P2 MEDIUM→P3 LOW)으로 우선순위 기반 체계적 수정. 데이터 소스 명시, 미평가 지표 안내, HHI 스케일 통일, DSO 측정불가 표시, 매출 가중 평균 전환 등 |
| **Function & UX** | KPI 카드에 데이터 출처 명시 → 사용자 신뢰도 향상. AlertPanel "미평가 지표" → 데이터 부재 인식 가능. "⚠️ 기간 필터 미적용" 배지 → 스냅샷 데이터 오해 방지. DSO "측정불가" → 잘못된 999일 표시 제거 |
| **Core Value** | 대시보드의 모든 수치가 엑셀 원본 데이터와 정합성을 유지하고, 데이터 부재/추정치/스냅샷 등 한계를 투명하게 표시하여 의사결정 품질을 보장 |

---

## PDCA Cycle Summary

### Plan
- **감사 문서**: `docs/04-report/numerical-accuracy-audit-2026-03-18.md`
- **목표**: 19건 감사 발견사항 전수 해결
- **범위**: parser, stores, analysis modules, UI components

### Design
- **접근 방식**: 심각도 기반 3-Priority 분류 (P1 HIGH → P2 MEDIUM → P3 LOW)
- **P1**: 데이터 정합성, 알림 사각지대 (4건)
- **P2**: 분석 정확도, UI 표시 (4건)
- **P3**: 코드 품질, 미사용 코드 (3건 + 검증 2건)

### Do

#### Iteration 1 (37% → 74%)

| ID | 수정 | 파일 |
|----|------|------|
| H-01 | 재업로드 확인 다이얼로그 (기존 구현 확인) | FileUploader.tsx |
| H-02 | KPI description에 `[데이터 소스: 조직별손익]` 등 6개 명시 | dashboard/page.tsx |
| H-04 | `SkippedMetric` 타입 + AlertPanel "미평가 지표" 섹션 | alertStore.ts, AlertPanel.tsx |
| H-05 | DataSourceBadge "⚠️ 기간 필터 미적용" + title tooltip | ChartCard.tsx |

#### Iteration 2 (74% → 100%)

| ID | 수정 | 파일 |
|----|------|------|
| H-03 | DSOTrend description에 "⚠️ 추정치" 안내 | DsoTab.tsx |
| M-02 | waterfall `Math.round(v*100)/100` 부동소수점 보정 | itemHierarchy.ts |
| M-03 | costEfficiency 매출 가중 평균 전환 | profitability/page.tsx |
| M-04 | `isSeparatorRow()` 추가로 fill-down 구분자 행 방어 | parser.ts |
| M-05 | `DSO_UNMEASURABLE` + `formatDSO()` → "측정불가" | dso.ts, DsoTab.tsx |
| M-06 | HHI 0-10000 스케일 통일 + UI 임계값/레이블 전환 | profiling.ts, RankingTab.tsx, PersonInsightTab.tsx |
| M-07 | `isSameOrg` 부분 매칭 최소 3자 제한 | orgMapping.ts |
| L-01 | filterStore `selectedPerson`, `searchQuery` 제거 | filterStore.ts |
| L-04 | tooltip formatter 전체 적용 확인 (수정 불필요) | — |

### Check
- **v1**: 37% (2026-03-18)
- **v2**: 74% (Iteration 1 후)
- **v3**: 100% (Iteration 2 후)

### Act
- 총 2회 이터레이션
- FALSE POSITIVE 2건 확인: C-01(303 컬럼), C-03(100 컬럼) — Excel 원본 대조 완료

---

## Per-Item Final Status (19건)

### CRITICAL (3건) — 100%

| ID | 제목 | 상태 |
|----|------|:----:|
| C-01 | 303 orgCustomerProfit 동일 컬럼 매핑 | ✅ FALSE POSITIVE |
| C-02 | 304 hqCustomerItemProfit 품목명 버그 | ✅ Resolved |
| C-03 | 100 customerItemDetail 동일 컬럼 매핑 | ✅ FALSE POSITIVE |

### HIGH (5건) — 100%

| ID | 제목 | 상태 |
|----|------|:----:|
| H-01 | FileUploader 동일 FileType 재업로드 확인 | ✅ Resolved |
| H-02 | Overview KPI 데이터 소스 혼용 | ✅ Resolved |
| H-03 | DSOTrend 스냅샷 미수금 합성 배분 | ✅ Resolved |
| H-04 | alertStore DSO/creditUsageRate 미전달 | ✅ Resolved |
| H-05 | profitability 901 dateRange 필터 미적용 | ✅ Resolved |

### MEDIUM (7건) — 100%

| ID | 제목 | 상태 |
|----|------|:----:|
| M-01 | orgContribPie 음수 공헌이익 필터링 | ✅ Resolved |
| M-02 | itemHierarchy waterfall 반올림 | ✅ Resolved |
| M-03 | costEfficiency 단순 평균 → 가중 평균 | ✅ Resolved |
| M-04 | 303/304 fillDownMultiLevel edge case | ✅ Resolved |
| M-05 | DSO sentinel 999 UI 표시 | ✅ Resolved |
| M-06 | HHI 스케일 불일치 | ✅ Resolved |
| M-07 | isSameOrg fuzzy matching false positive | ✅ Resolved |

### LOW (4건) — 100%

| ID | 제목 | 상태 |
|----|------|:----:|
| L-01 | filterStore 미사용 필드 | ✅ Resolved |
| L-02 | orgMapping 미사용 함수 | ✅ Resolved |
| L-03 | alertStore 알림 히스토리 제한 | ✅ Resolved |
| L-04 | Recharts tooltip formatter 일관성 | ✅ Resolved |

---

## Modified Files (12건)

| 파일 | 수정 내용 |
|------|----------|
| `src/stores/alertStore.ts` | SkippedMetric 타입, skippedMetrics 배열, evaluate 로직 |
| `src/stores/filterStore.ts` | selectedPerson, searchQuery 미사용 필드 제거 |
| `src/components/dashboard/AlertPanel.tsx` | 미평가 지표 섹션 추가 |
| `src/components/dashboard/ChartCard.tsx` | DataSourceBadge "⚠️ 기간 필터 미적용" 강화 |
| `src/app/dashboard/page.tsx` | 6개 KPI description에 데이터 소스 명시 |
| `src/app/dashboard/profitability/page.tsx` | costEfficiency 매출 가중 평균 전환 |
| `src/app/dashboard/receivables/tabs/DsoTab.tsx` | formatDSO 적용, 추정치 안내 |
| `src/app/dashboard/profiles/tabs/RankingTab.tsx` | HHI 0-10000 스케일 UI |
| `src/app/dashboard/receivables/tabs/PersonInsightTab.tsx` | HHI 임계값 2500 전환 |
| `src/lib/analysis/dso.ts` | DSO_UNMEASURABLE, formatDSO() |
| `src/lib/analysis/profiling.ts` | HHI 0-10000 스케일 통일 |
| `src/lib/analysis/itemHierarchy.ts` | waterfall 부동소수점 보정 |
| `src/lib/excel/parser.ts` | isSeparatorRow(), fillDown 구분자 방어 |
| `src/lib/orgMapping.ts` | isSameOrg 3자 최소 길이 제한 |

---

## Quality Evidence

| 검증 | 결과 |
|------|------|
| 빌드 (3회) | ✓ Compiled successfully (0 errors) |
| 정적 페이지 생성 | ✓ 12/12 pages |
| Gap Analysis (3회) | 37% → 74% → 100% |
| FALSE POSITIVE 확인 | 2건 Excel 원본 대조 |

---

## Lessons Learned

1. **감사 발견사항에 FALSE POSITIVE가 포함될 수 있다** — C-01, C-03은 Excel 원본과 대조하여 컬럼 매핑이 정확함을 확인. 코드만 보면 의심스러워도 원본 데이터 검증이 필수
2. **HHI 스케일은 프로젝트 초기에 통일해야 한다** — 0~1 vs 0~10000 혼용으로 UI 표시와 임계값이 불일치. 표준 스케일(0~10000) 채택 후 전체 통일
3. **DSO sentinel 값(999)은 UI 레이어에서 변환해야 한다** — 분석 함수의 sentinel은 유지하되 표시 함수(`formatDSO`)로 "측정불가" 변환
4. **단순 평균 vs 가중 평균** — 비용 비율처럼 규모가 다른 항목의 평균은 반드시 매출 가중 평균 사용
5. **fillDown edge case** — SAP 계층 보고서의 구분자 행(숫자만, 하이픈)을 fill-down에서 제외해야 교차 오염 방지
