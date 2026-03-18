# sales-data-fix Gap Analysis Report

> **Feature**: sales-data-fix
> **Date**: 2026-03-18
> **Match Rate**: 100% (6/6 items implemented)

---

## 1. Plan vs Implementation Comparison

| ID | Requirement | Plan | Implementation | Match |
|----|-------------|------|----------------|:-----:|
| FR-01 | itemProfitability(200) monthlyStrategy: "latest" | Critical | schemas.ts:75 | ✅ |
| FR-02 | profitabilityAnalysis(901) monthlyStrategy: "latest" | Critical | schemas.ts:86 | ✅ |
| FR-03 | orgCustomerProfit(303) monthlyStrategy: "latest" | Critical | schemas.ts:49 | ✅ |
| FR-04 | hqCustomerItemProfit(304) monthlyStrategy: "latest" | Critical | schemas.ts:95 | ✅ |
| FR-05 | customerItemDetail(100) monthlyStrategy: "latest" | Critical | schemas.ts:104 | ✅ |
| FR-06 | itemCostDetail(501) monthlyStrategy: "latest" | Critical | schemas.ts:113 | ✅ |

## 2. Build Verification

- `npm run build`: **0 errors** ✅
- 변경 파일: `src/lib/excel/schemas.ts` (1개)
- 변경 내용: 6개 스키마에 `monthlyStrategy: "latest"` 속성 1줄씩 추가

## 3. Coverage Analysis

### 전체 스키마 monthlyStrategy 현황 (수정 후)

| FileType | 보고서 성격 | monthlyStrategy | 상태 |
|----------|-----------|----------------|------|
| organization | 마스터 | N/A | ✅ 해당없음 |
| salesList | 거래 건별 | "concat" (기본) | ✅ 정상 |
| collectionList | 거래 건별 | "concat" (기본) | ✅ 정상 |
| orderList | 거래 건별 | "concat" (기본) | ✅ 정상 |
| orgCustomerProfit (303) | 누계 | **"latest"** | ✅ 수정됨 |
| orgProfit | 누계 | "latest" | ✅ 기존 |
| teamContribution | 누계 | "latest" | ✅ 기존 |
| itemProfitability (200) | 누계 | **"latest"** | ✅ 수정됨 |
| profitabilityAnalysis (901) | 누계 | **"latest"** | ✅ 수정됨 |
| hqCustomerItemProfit (304) | 누계 | **"latest"** | ✅ 수정됨 |
| customerItemDetail (100) | 누계 | **"latest"** | ✅ 수정됨 |
| itemCostDetail (501) | 누계 | **"latest"** | ✅ 수정됨 |
| inventoryMovement | 이동 기록 | "concat" (기본) | ✅ 정상 |
| receivableAging | 시점 스냅샷 | "concat" (기본) | ✅ 정상 |

## 4. Impact Analysis

### 수정으로 정상화되는 탭

| 페이지 | 영향받는 탭 | 데이터 소스 |
|--------|-----------|------------|
| 매출 분석 | 품목 탭 (품목 요약) | itemProfitability (200) |
| 수익성 분석 | 손익 현황, 조직 수익성 등 18개 탭 | profitabilityAnalysis (901) |
| 수익성 분석 | 거래처 손익, 거래처×품목 | orgCustomerProfit (303), customerItemDetail (100) |
| 수익성 분석 | 상세 수익, 품목원가 | hqCustomerItemProfit (304), itemCostDetail (501) |

### 부작용 없음

- 단일 시트 파일: `monthlySheets.length === 0` → monthlyStrategy 분기 진입 안함
- 거래 건별 파일(salesList 등): 변경 없음
- 기존 orgProfit/teamContribution: 이미 "latest" → 영향 없음

## 5. Root Cause Summary

```
parser.ts:976 → schema.monthlyStrategy || "concat"
                ↓
  6개 누계 보고서에 monthlyStrategy 미설정
                ↓
  기본값 "concat" 적용 → 12개 월별 시트 전부 합산
                ↓
  누계 데이터 × N배 부풀림 (610억 → 천억 단위)
```

## 6. Conclusion

- **Match Rate**: 100% (6/6)
- **빌드**: 성공
- **변경 범위**: schemas.ts 1개 파일, 6줄 추가
- **위험도**: 없음 (기존 로직 변경 없이 속성만 추가)
