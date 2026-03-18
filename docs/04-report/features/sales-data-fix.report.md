# sales-data-fix Completion Report

> **Feature**: sales-data-fix — 누계 보고서 monthlyStrategy 누락 수정
> **Date**: 2026-03-18
> **Status**: Completed

---

## Executive Summary

| Item | Detail |
|------|--------|
| **Feature** | sales-data-fix |
| **Duration** | 2026-03-18 (same day) |
| **Match Rate** | 100% (6/6) |
| **Files Changed** | 1 (schemas.ts) |
| **Lines Added** | 6 |

### Value Delivered

| Perspective | Result |
|-------------|--------|
| **Problem** | 6개 누계(YTD) SAP 보고서(200/901/303/304/100/501)에 `monthlyStrategy: "latest"` 미설정 → 월별 시트 전체 합산으로 매출 데이터 최대 12배 부풀림. 방수시트 단독 6,311억 표시 (실제 전체 610억) |
| **Solution** | `schemas.ts`에서 6개 누계 보고서 스키마에 `monthlyStrategy: "latest"` 추가. 기존 파서 로직(parser.ts:976-996) 그대로 활용하여 최신 월 시트만 파싱 |
| **Function/UX Effect** | 매출 분석 품목 탭 + 수익성 분석 18개 서브탭의 금액이 실제 엑셀 데이터와 일치하게 정상화 |
| **Core Value** | 대시보드 숫자 신뢰성 회복 — 경영진 보고에 사용 가능한 정확한 매출/손익 수치 |

---

## 1. Background

### 1.1 Problem Discovery

사용자가 매출 분석 탭에서 품목별 실적 매출 숫자 이상 발견:
- 연간 총매출 610억인데 **방수시트 단독 6,311억**, 우레탄 5,168억 표시
- 대분류당 천억 단위 매출 — 명백한 데이터 중복

### 1.2 Root Cause

```
parser.ts:976 → schema.monthlyStrategy || "concat" (기본값)
  ↓
6개 누계 보고서에 monthlyStrategy 미설정
  ↓
12개 월별 시트(202401~202412) 전부 합산
  ↓
각 시트가 YTD 누계 → 동일 데이터 N번 중복 합산
  ↓
실적 × N배 부풀림
```

### 1.3 Prior Art

- `data-accuracy-fix` (2026-03-17): monthlyStrategy 메커니즘 도입, orgProfit/teamContribution에만 적용
- 나머지 6개 누계 보고서에는 적용 누락

---

## 2. Implementation

### 2.1 Changes

**File**: `src/lib/excel/schemas.ts` (1개)

| Schema | FileType | Line | Change |
|--------|----------|------|--------|
| orgCustomerProfit | 303 조직별 거래처별 손익 | :49 | + `monthlyStrategy: "latest"` |
| itemProfitability | 200 품목별 수익성 | :75 | + `monthlyStrategy: "latest"` |
| profitabilityAnalysis | 901 수익성분석 | :86 | + `monthlyStrategy: "latest"` |
| hqCustomerItemProfit | 304 본부 거래처 품목 손익 | :95 | + `monthlyStrategy: "latest"` |
| customerItemDetail | 100 거래처별 품목별 손익 | :104 | + `monthlyStrategy: "latest"` |
| itemCostDetail | 501 품목별 매출원가 상세 | :113 | + `monthlyStrategy: "latest"` |

### 2.2 Not Changed (Correct As-Is)

| Schema | Reason |
|--------|--------|
| salesList / collectionList / orderList | 거래 건별 데이터 → "concat" 정상 |
| orgProfit / teamContribution | 이미 "latest" 설정됨 |
| organization | 마스터 데이터, 월별 시트 해당 없음 |
| receivableAging | 시점 스냅샷 |
| inventoryMovement | 이동 기록 |

---

## 3. Verification

| Check | Result |
|-------|--------|
| `npm run build` | 0 errors ✅ |
| Match Rate | 100% (6/6 requirements) |
| monthlyStrategy 총 설정 수 | 8개 (기존 2 + 신규 6) |
| 부작용 | 없음 (단일 시트 파일 영향 없음) |

---

## 4. Lessons Learned

| Learning | Detail |
|----------|--------|
| **일관성 원칙** | 같은 성격의 보고서(누계)는 동일한 설정이 필요. orgProfit에만 적용하고 나머지를 빠뜨린 것이 원인 |
| **스키마 리뷰** | 새 monthlyStrategy 기능 도입 시 전체 스키마를 점검하여 누락 방지 필요 |
| **증상 패턴** | "숫자가 N배" → 월별 시트 중복 합산을 먼저 의심 |
