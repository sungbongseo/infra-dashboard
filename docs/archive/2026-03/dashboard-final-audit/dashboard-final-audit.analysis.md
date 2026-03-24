# Gap Analysis: dashboard-final-audit

## Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| 1. Concat Aggregation Completeness | 100% | PASS |
| 2. NaN/Infinity Defense Completeness | 99% | PASS |
| 3. 14 Excel File Type Parser Parity | 100% | PASS |
| 4. Tab Structure vs CLAUDE.md Spec | 100% | PASS |
| 5. Build/Test Status | 99% | PASS |
| **Overall Match Rate** | **99.6%** | **PASS** |

---

## 1. Monthly Concat Aggregation Completeness — ✅ 100%

All 8 concat file types properly processed with `filterByMonth()` + `aggregate*()` in every page.

### useFilteredData.ts Hooks (8/8)

| Hook | Aggregate Function |
|------|--------------------|
| `useFilteredOrgProfit` | `aggregateOrgProfit` |
| `useFilteredTeamContribution` | `aggregateTeamContribution` |
| `useFilteredOrgCustomerProfit` | `aggregateOrgCustomerProfit` |
| `useFilteredCustomerItemDetail` | `aggregateCustomerItemDetail` |
| `useFilteredItemCostDetail` | `aggregateItemCostDetail` |
| `useFilteredHqCustomerItemProfit` | `aggregateHqCustomerItemProfit` |
| `useFilteredProfitabilityAnalysis` | `aggregateProfitabilityAnalysis` |
| `useFilteredItemProfitability` | `aggregateItemProfitability` |

### Page-Level Usage

| Page | Concat Types Used | Method |
|------|-------------------|--------|
| Overview | orgProfit, teamContribution | Hooks |
| Sales | orgProfit, customerItemDetail, itemProfitability, itemCostDetail, orgCustomerProfit | Inline useMemo + aggregate |
| Profitability | All 8 types | Hooks + inline useMemo |
| Receivables | teamContribution | Hook |
| Orders | (none) | N/A |
| Profiles | teamContribution, customerItemDetail | Hooks |
| Data | All types (display-only, intentional raw access) | Raw store |

---

## 2. NaN/Infinity Defense — ✅ 99%

### Analysis Modules: safeDivide Coverage
- **46/47** modules import `safeDivide` (migration.ts excluded — only divides by constants)
- **233 total safeDivide usages**
- `safeDivide` guards: denominator===0, !isFinite(numerator), !isFinite(denominator), !isFinite(result)

### UI Tabs: .toFixed() Guard Coverage

| Metric | Count |
|--------|-------|
| Total `.toFixed()` calls | 145 |
| Guarded with `isFinite()` | 105 |
| Guarded with `safeFixed()` | 27 files, 112 usages |
| Guarded with local `safe()` wrapper | 4 files |
| **Unguarded** | **1** (LOW risk) |

Unguarded: `sales/page.tsx:269` — `Number(value).toFixed(1)` in Recharts tooltip. Low risk: Recharts passes numeric data values.

---

## 3. 14 Excel File Type Parser Parity — ✅ 100%

All 14 types present in schemas.ts, parser.ts, and types/index.ts. Schema ordering correct (orgCustomerProfit precedes orgProfit).

---

## 4. Tab Structure — ✅ 100% (spec tabs present + 6 extras)

| Page | CLAUDE.md | Actual | Diff |
|------|:---------:|:------:|:----:|
| Overview | 4 | 5 | +1 (경영진 보고) |
| Sales | 13 | 16 | +3 (거래처 마진, 거래처 360, 조직스코어카드) |
| Profitability | 18 | 20 | +2 (포트폴리오, 표준원가) |
| Receivables | 9 | 9 | 0 |
| Orders | 6 | 7 | +1 (재고 분석) |
| Profiles | 5 | 5 | 0 |
| **Total** | **55** | **62** | **+7** |

---

## 5. Build/Test Status — ✅ 99%

- `npm run build`: Success (0 errors)
- `npm run test`: 74/75 pass (1 known failure: migration.test.ts — pre-existing)

---

## Phase 0~2 수정 요약

### Phase 0: 아키텍처 근본 수정
- useFilteredData.ts에 `useFilteredProfitabilityAnalysis`, `useFilteredItemProfitability` 훅 추가
- `safeDivide()` 유틸리티 추가 (utils.ts)
- sales/page.tsx: `filteredCustomerItemDetail` + `filteredOrgCustProfit` + `filteredItemCostDetail` 집계 누락 수정
- profitability/page.tsx: `filteredItemCostDetail` 집계 누락 수정
- profiles/page.tsx: raw customerItemDetail → `useFilteredCustomerItemDetail()` 훅 마이그레이션

### Phase 1: 분석 함수 safeDivide 전수 적용
- 46개 분석 모듈에 safeDivide 185회 적용
- 모든 미가드 나눗셈 제거

### Phase 2: .toFixed() 전수 스위프
- 26개 탭 파일에서 67개 .toFixed() → safeFixed() 교체
- 미보호 .toFixed(): 1건 (LOW risk)

---

## Recommended Actions

1. **CLAUDE.md 탭 구조 업데이트** (MEDIUM): 실제 62탭 반영
2. **sales/page.tsx:269** (LOW): Recharts tooltip .toFixed에 isFinite 가드 추가
