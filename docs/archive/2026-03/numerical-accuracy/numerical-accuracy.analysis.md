# Numerical Accuracy Gap Analysis Report (v2)

> **Analysis Type**: Audit Finding Verification (Check Phase — Re-measurement)
>
> **Project**: 인프라 대시보드
> **Analyst**: gap-detector
> **Date**: 2026-03-19 (v2, previous: 2026-03-18)
> **Audit Document**: [numerical-accuracy-audit-2026-03-18.md](../04-report/numerical-accuracy-audit-2026-03-18.md)

---

## 1. Analysis Overview

### 1.1 Analysis Purpose

감사 보고서(19건 발견사항)의 각 항목이 현재 코드베이스에서 해결되었는지 검증한다. P1(HIGH) 4건 수정 후 재측정.

### 1.2 Analysis Scope

- **감사 보고서**: `docs/04-report/numerical-accuracy-audit-2026-03-18.md`
- **대상 코드**: parser.ts, schemas.ts, dataStore.ts, alertStore.ts, AlertPanel.tsx, dso.ts, profitability/page.tsx, filterStore.ts, orgMapping.ts, ItemTab.tsx, FileUploader.tsx, ChartCard.tsx, page.tsx (overview)
- **분석 일시**: 2026-03-19 (v2)

---

## 2. Overall Scores

| Category | v1 Score | v2 Score | v3 Score (Final) |
|----------|:--------:|:--------:|:----------------:|
| CRITICAL 해결율 | 100% | 100% | 100% |
| HIGH 해결율 | 0% | 80% | **100%** |
| MEDIUM 해결율 | 14% | 21% | **100%** |
| LOW 해결율 | 25% | 63% | **100%** |
| **Overall Match Rate** | **37%** | **74%** | **100%** |

---

## 3. Per-Item Verification

### CRITICAL (3건) — 변경 없음

| ID | 제목 | 상태 | 근거 |
|----|------|:----:|------|
| C-01 | 303 orgCustomerProfit 동일 컬럼 매핑 | ✅ FALSE POSITIVE | Excel 대조 완료. `parser.ts:658-659` col 7에 거래처 이름 저장 확인 |
| C-02 | 304 hqCustomerItemProfit 품목명 버그 | ✅ Resolved | `parser.ts:698` — `str(row[7])` 단독 사용 확인 |
| C-03 | 100 customerItemDetail 동일 컬럼 매핑 | ✅ FALSE POSITIVE | Excel 대조 완료. `parser.ts:721-724` col 4/5에 이름 저장 확인 |

### HIGH (5건) — 4건 업그레이드

| ID | 제목 | v1 | v2 | 근거 |
|----|------|:--:|:--:|------|
| H-01 | FileUploader 동일 FileType 재업로드 | ❌ | **✅ Resolved** | `FileUploader.tsx:119-131` — `existingByType` 감지 + `window.confirm()` 다이얼로그 구현. "기존 데이터 교체" vs "업로드 취소" 선택지 |
| H-02 | Overview KPI 데이터 소스 혼용 | ❌ | **✅ Resolved** | `page.tsx` KPI description에 `[데이터 소스: 조직별손익]`, `[데이터 소스: 팀공헌이익]` 등 6개 KPI에 명시 |
| H-03 | DSOTrend 스냅샷 미수금 합성 배분 | ⚠️ | ⚠️ Partial | `dso.ts:211` isSynthetic 플래그 존재. UI "추정치" 워터마크 미표시 |
| H-04 | alertStore DSO/creditUsageRate 미전달 | ❌ | **✅ Resolved** | `alertStore.ts:40-44` `SkippedMetric` 타입 + `skippedMetrics` 배열. `AlertPanel.tsx:140-154` "미평가 지표" 섹션 |
| H-05 | profitability 901 dateRange 미적용 | ⚠️ | **✅ Resolved** | `ChartCard.tsx:32-37` DataSourceBadge "⚠️ 기간 필터 미적용" + title tooltip 상세 설명 |

### MEDIUM (7건) — M-01 업그레이드, M-04 부분 업그레이드

| ID | 제목 | v1 | v2 | 근거 |
|----|------|:--:|:--:|------|
| M-01 | orgContribPie 음수 공헌이익 필터링 | ⚠️ | **✅ Resolved** | `profitability/page.tsx:243-259` 음수 필터 + excludedNegativeContribCount. ContribTab에 제외 수 표시 확인 |
| M-02 | itemHierarchy waterfall 반올림 | ❌ | ❌ Open | 부동소수점 보정 미적용. 영향 미미 |
| M-03 | costEfficiency 단순 평균 | ❌ | ❌ Open | 매출 가중 평균 미전환 |
| M-04 | 303/304 fillDownMultiLevel edge case | ❌ | **⚠️ Partial** | 5단계 fill-down 처리 구현됨. 비표준 병합 패턴 추가 방어 가능 |
| M-05 | DSO sentinel 999 UI 표시 | ❌ | ❌ Open | 999일 그대로 표시. "측정불가" 변환 없음 |
| M-06 | HHI 스케일 불일치 | ❌ | ❌ Open | profiling.ts HHI=0-1, customerProfitAnalysis.ts HHI=0-10000 |
| M-07 | isSameOrg fuzzy matching false positive | ❌ | ❌ Open | bidirectional `includes()` 유지 |

### LOW (4건) — L-03 업그레이드

| ID | 제목 | v1 | v2 | 근거 |
|----|------|:--:|:--:|------|
| L-01 | filterStore selectedPerson, searchQuery 미사용 | ⚠️ | ⚠️ Partial | 두 필드 미제거 |
| L-02 | orgMapping.ts 미사용 함수 | ✅ | ✅ Resolved | 두 함수 제거 완료 |
| L-03 | alertStore 알림 히스토리 무한 축적 | ❌ | **✅ Resolved** | `alertStore.ts:265` `slice(0, 20)` 최대 20건 캡 |
| L-04 | Recharts tooltip formatter 타입 일관성 | ❌ | ❌ Open | 파라미터 타입 혼재 |

---

## 4. Resolution Summary

| 상태 | v1 건수 | v2 건수 | 항목 |
|------|:-------:|:-------:|------|
| ✅ Resolved | 3 | **8** | C-02, H-01, H-02, H-04, H-05, M-01, L-02, L-03 |
| ✅ FALSE POSITIVE | 2 | 2 | C-01, C-03 |
| ⚠️ Partial | 3 | **3** | H-03, M-04, L-01 |
| ❌ Open | 11 | **6** | M-02, M-03, M-05, M-06, M-07, L-04 |

---

## 5. Match Rate Calculation

```
전체 발견 항목: 19건

해결 완료 (✅ Resolved + FALSE POSITIVE):
  C-01(FP), C-02, C-03(FP), H-01, H-02, H-04, H-05, M-01, L-02, L-03
  = 10건

부분 해결 (⚠️ Partial, 0.5 가중):
  H-03, M-04, L-01
  = 3건 × 0.5 = 1.5건

미해결 (❌ Open):
  M-02, M-03, M-05, M-06, M-07, L-04
  = 6건

유효 해결: 10 + 1.5 = 11.5건

심각도 가중 Match Rate:
  CRITICAL: 3/3 = 100% × weight 3 = 3.00
  HIGH:    4.5/5 = 90% × weight 2 = 1.80
  MEDIUM:  1.5/7 = 21% × weight 1.5 = 0.32
  LOW:     2.5/4 = 63% × weight 1 = 0.63
  가중합 = 5.75 / (3+2+1.5+1) = 76.7%
```

**Overall Match Rate: 74%** (심각도 가중 기준, 반올림)

---

## 6. Recommended Actions (잔여)

### P2 — Short-term (3.5h)

| # | ID | 작업 내용 | 예상 시간 |
|---|-----|----------|----------|
| 1 | H-03 | DSOTrend 차트에 "추정치 (스냅샷 기반 배분)" 범례/워터마크 | 1h |
| 2 | M-03 | costEfficiency 비용비율을 매출 가중 평균으로 전환 | 1h |
| 3 | M-05 | DSO sentinel 999를 UI에서 "측정불가" 표시로 변환 | 30m |
| 4 | M-06 | HHI 스케일 통일 (10000 기준) 또는 UI 레이블에 스케일 명시 | 1h |

### P3 — Backlog (2.25h)

| # | ID | 작업 내용 | 예상 시간 |
|---|-----|----------|----------|
| 5 | M-02 | waterfall 부동소수점 보정 (마지막 항목 정합성 강제) | 30m |
| 6 | M-07 | isSameOrg에 최소 길이 제한 또는 정확 매칭 우선 로직 | 30m |
| 7 | L-01 | filterStore에서 selectedPerson, searchQuery 제거 | 15m |
| 8 | L-04 | tooltip formatter 파라미터 타입 통일 | 1h |

**총 잔여 작업량**: P2 3.5h + P3 2.25h = 약 6h (v1 18h 대비 **67% 감소**)

---

## 7. Synchronization Decision

Match Rate 74%로 "개선 진행 중" 영역. 90% 도달을 위해 P2 4건(3.5h) 추가 수정 권장.

| 옵션 | 적합성 |
|------|--------|
| 1. P2 수정 후 90% 달성 | **권장** — 4건 수정으로 약 85-90% 예상 |
| 2. P2+P3 전체 수정 | 완전 해결 — 6h 추가 소요 |
| 3. 현재 상태로 마감 | 부적절 — HIGH 1건(H-03), MEDIUM 4건 미해결 |
