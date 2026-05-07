# P1-2 Design — 대분류 × BCG mini-matrix (Nested Matrix Pattern)

> **Parent Plan**: `docs/01-plan/features/portfolio-matrix-v4-world-class.plan.md`
> **Phase**: P1-2 (1주차)
> **Pattern**: McKinsey/BCG nested matrix
> **Predecessor**: P1-1 (anomaly export, commit `b86e5b3`)

## Context

P1-1 완료 후, BCG 매트릭스의 **차원 다양성 부족** 문제 해결 단계. 단일 4-segment BCG는 "내수×제품 적자 -1.1%"는 보여주지만 "어느 대분류(도막재? 발포재? 시공?)가 적자 driver인지" 즉시 안 보임.

200 보고서의 `대분류` 컬럼 활용 → 4 segment × N 대분류 = nested matrix로 드릴다운 제공.

**8 원칙 사전 적용**: 원칙 1·3 (대분류 매핑 안 되는 품목 별도 카운트), 원칙 5 (3-layer pedagogy), 원칙 8 (collapsible default-hidden — 시각적 노이즈 최소화)

## 1. Architecture

```
ItemProfitabilityRecord[] (200)
  ↓ build map
itemCode → 대분류 매핑 (Map<string, string>)
  ↓ attach to entries
BCGMatrixEntry.majorCategory: string  ← 신규 필드
  ↓ aggregate within segment
CategoryStats { majorCategory, count, sales, profit, weightedMargin, quadrantDist }
  ↓ render
SegmentDetail collapsible "대분류별 분포" (mini stacked bar + table)
```

## 2. Data Flow

### 2.1 입력
- **CustomerItemDetailRecord[]** (100, 기존): BCG 매트릭스 source — `품목` 필드 사용
- **ItemProfitabilityRecord[]** (200, 신규 활용): `품목` + `대분류` 필드 사용

### 2.2 itemCode 매칭 전략 (memory 참조)
사용자 memory의 `portfolio_category_issue.md`: "salesList와 200의 품목 식별자 체계가 다름". 100/200의 `품목` 필드 형식이 다를 수 있어 **3-level fallback** 필요:
1. **Exact match** — 100.품목 === 200.품목
2. **Code prefix match** — 100.품목이 `[CODE] NAME` 형식 → CODE만 추출 후 200.품목에서 동일 CODE 검색
3. **Fuzzy contains** — 양방향 substring 매칭 (orgMapping.ts와 동일 패턴)

매칭 안 된 품목 → `majorCategory = "_unmapped"` 별도 카운트 (원칙 1·3)

### 2.3 출력
- BCG entries에 `majorCategory: string` 추가
- 각 SegmentMatrix에 `categoryDistribution: CategoryStats[]` 추가

## 3. Type 변경

```ts
// productPortfolioMatrix.ts — 추가 필드
export interface BCGMatrixEntry {
  // ... 기존 필드
  /** P1-2: 200 보고서 대분류 (매칭 실패 시 "_unmapped") */
  majorCategory: string;
}

/** P1-2: 대분류별 통계 (segment 내 sub-aggregation) */
export interface CategoryStats {
  majorCategory: string;       // "도막재", "발포재", "_unmapped" 등
  itemCount: number;
  totalSales: number;
  totalProfit: number;
  weightedMarginRate: number;  // = totalProfit / totalSales × 100
  /** 사분면 분포 — 각 사분면별 품목 수 */
  quadrantDist: Record<Quadrant, number>;
  /** 가장 큰 사분면 (UI 강조용) */
  dominantQuadrant: Quadrant;
}

export interface SegmentMatrix {
  // ... 기존 필드
  /** P1-2: 대분류별 분포 (entries 사후 집계) */
  categoryDistribution: CategoryStats[];
}

export interface PortfolioMatrixResult {
  // ... 기존
  /** P1-2: 대분류 매핑 통계 */
  categoryMappingStats: {
    totalItems: number;
    mappedItems: number;
    unmappedItems: number;
    mappingRate: number;  // 0-1
  };
}
```

## 4. Algorithm 변경 (productPortfolioMatrix.ts)

### 4.1 신규 시그니처
```ts
export function calcPortfolioMatrix(
  data: CustomerItemDetailRecord[],
  options: PortfolioMatrixOptions = {},
  /** P1-2: 200 itemProfitability 데이터 (옵션) — 대분류 매핑용 */
  itemProfitability?: ItemProfitabilityRecord[],
): PortfolioMatrixResult
```
**하위 호환**: itemProfitability 미전달 시 모든 entries `majorCategory = "_unmapped"`, categoryDistribution 빈 배열.

### 4.2 매핑 빌드 함수 (신규)
```ts
function buildCategoryMap(items: ItemProfitabilityRecord[]): Map<string, string> {
  // itemCode → 대분류
  // 우선순위: exact > prefix > 미매칭은 호출자에서 fallback
}

function lookupCategory(
  itemCode: string,
  map: Map<string, string>,
  itemNamePrefixMap: Map<string, string>,
): string {
  // 3-level fallback: exact → [CODE] 추출 → fuzzy contains
  // 실패 시 "_unmapped" 반환
}
```

### 4.3 entries 생성 시 대분류 attach
```ts
// 기존 segEntries.push() 직전에:
const majorCategory = lookupCategory(agg.itemCode, categoryMap, prefixMap);
segEntries.push({ ..., majorCategory });
```

### 4.4 categoryDistribution 계산 (신규 함수)
```ts
function calcCategoryDistribution(entries: BCGMatrixEntry[]): CategoryStats[] {
  // 1. 대분류별 그룹핑
  // 2. 각 그룹의 totalSales, totalProfit, weightedMargin
  // 3. 사분면 분포 (4 사분면 × count)
  // 4. dominantQuadrant 산출
  // 5. totalSales 내림차순 정렬
}
```

## 5. UI 변경 (PortfolioMatrixTab.tsx)

### 5.1 데이터 흐름
```tsx
// 부모 컴포넌트
const itemProfitability = useDataStore(s => s.itemProfitability); // 신규 selector
const matrixResult = useMemo(
  () => calcPortfolioMatrix(filteredCustomerItemDetail, options, itemProfitability),
  [filteredCustomerItemDetail, options, itemProfitability]
);
```

### 5.2 SegmentDetail 하단 신규 섹션 (collapsible)
```tsx
{matrix.categoryDistribution.length > 0 && (
  <details className="mt-3 border-t pt-2">
    <summary className="text-xs font-semibold cursor-pointer flex items-center gap-1">
      📊 대분류별 사분면 분포 ({matrix.categoryDistribution.length}개)
      <MetricInfo id="bcg_category_distribution" variant="inline" />
    </summary>
    <div className="mt-2 space-y-1.5">
      {matrix.categoryDistribution.map(cat => (
        <CategoryRow key={cat.majorCategory} stats={cat} totalSegmentSales={matrix.totalSales} />
      ))}
    </div>
  </details>
)}
```

### 5.3 CategoryRow 컴포넌트 (신규)
- 좌: 대분류명 + dominantQuadrant 아이콘
- 중: 사분면 분포 stacked horizontal bar (Star/Cash Cow/Question/Dog 비중)
- 우: 매출 비중 % + 가중 영업이익율
- hover: 품목 수 + 절대 금액 tooltip

### 5.4 매핑 stats 표시
overallSummary 데이터 품질 정보 바에 추가:
```tsx
{categoryMappingStats.unmappedItems > 0 && (
  <span className="inline-flex items-center gap-0.5">
    · 대분류 미매칭 {categoryMappingStats.unmappedItems}건
    ({(categoryMappingStats.mappingRate * 100).toFixed(0)}% 매핑)
    <MetricInfo id="bcg_category_mapping" variant="inline" />
  </span>
)}
```

## 6. Glossary 신규 entries (3개)

| ID | 용도 |
|---|---|
| `bcg_category_distribution` | 대분류별 사분면 분포 — 산식 + 해석 + dominantQuadrant 의미 |
| `bcg_category_mapping` | 100↔200 itemCode 매칭 — fallback 단계 + 실패 시 처리 |
| `bcg_dominant_quadrant` | 대분류별 가장 큰 사분면 — Star 우세 vs Dog 우세 의미 |

## 7. Edge cases (8 원칙 #4 — incremental tests)

각 case 1 test:
1. **itemProfitability 미전달** — categoryDistribution 빈 배열, mappingStats.mappingRate=0
2. **모든 품목 매핑** — categoryDistribution 정렬 + 사분면 분포 정확
3. **일부 미매칭** — `_unmapped` 그룹 별도 + mappingStats.unmappedItems 정확
4. **Exact match** — 100.품목 === 200.품목 직접 매칭
5. **[CODE] prefix match** — `[ABC123] 품목명` 형식 → CODE 추출 매칭
6. **Fuzzy contains** — 양방향 substring 매칭
7. **Empty 200 데이터** — categoryMap 빈 Map, 모든 entries `_unmapped`
8. **dominantQuadrant 산출** — tie-breaking (사분면 동수 시 Star > Cash > Question > Dog 우선)

## 8. 구현 순서 (mechanical execution)

1. **Algorithm Phase A** (~80 LOC):
   - Type 추가 (BCGMatrixEntry, CategoryStats, SegmentMatrix, PortfolioMatrixResult)
   - buildCategoryMap + lookupCategory 헬퍼
   - calcPortfolioMatrix 시그니처 확장 (옵션 파라미터)
   - entries에 majorCategory attach
   - calcCategoryDistribution + segment에 attach
   - categoryMappingStats 산출

2. **Tests Phase B** (~80 LOC):
   - 8 단위 테스트 (Edge cases 위 목록)
   - 빌드 통과 + 단위 45 → 53 tests

3. **UI Phase C** (~80 LOC):
   - useDataStore.itemProfitability selector 사용
   - CategoryRow 컴포넌트
   - SegmentDetail collapsible 통합
   - 데이터 품질 바에 mapping stats 추가

4. **Glossary Phase D** (~50 LOC):
   - 3 신규 entries (3-layer)
   - 26 → 29 entries

5. **Verification**:
   - `npm test` (53/53 pass)
   - `npm run build` (0 errors)
   - dev 회귀: collapsible 펼쳐 stacked bar 확인

## 9. LOC 예상

| Phase | LOC |
|---|---|
| Algorithm (types + helpers + integration) | +120 |
| Tests (8 신규) | +80 |
| UI (CategoryRow + collapsible + stats) | +80 |
| Glossary (3 entries) | +50 |
| **Total** | **~330 LOC** |

(Plan 추정 ~120 → 실제 ~330. P1-1 패턴 동일 — 8 원칙 사전 적용 비용 30%+ 추가)

## 10. 위험 + 완화

| 위험 | 완화 |
|---|---|
| itemCode 매칭률 저조 (예: <50%) | 3-level fallback + mappingRate UI 노출, 80%+ 권장 |
| 대분류 16개로 행 너무 많음 | totalSales 내림차순 정렬, top 10만 default 표시 + "더보기" 옵션 |
| `_unmapped` 그룹이 dominant 차지 | UI에서 별도 색상 + "매칭 미흡" warning |
| itemProfitability undefined 시 회귀 | 옵션 파라미터로 하위 호환, categoryDistribution 빈 배열 |
| Stacked bar 4 사분면 색상 충돌 | 기존 QUADRANT_COLORS 재활용 (일관성) |

## 11. Out of scope

- 중분류·소분류 드릴다운 (P3+ 가능)
- 대분류별 임계 모드 변경 (단일 segment 임계 사용)
- 대분류별 Dynamic 화살표 집계 (P2-3 별도)
- 매핑 manual override UI (P3+)

## 12. Verification 명령

```bash
# Algorithm + tests
npm test src/lib/analysis/productPortfolioMatrix.test.ts
# → 45 → 53 tests pass

# Full
npm test           # 521 → 529 tests
npm run build      # 0 errors

# Dev
npm run dev
# /dashboard/profitability → BCG 탭 → segment 카드 클릭 → SegmentDetail
# → "📊 대분류별 사분면 분포" collapsible 펼치기
# → CategoryRow stacked bar + 마진율 + dominantQuadrant 확인
```

---

> **다음**: 본 design 승인 후 `/pdca do P1-2` 시작 (Phase A → B → C → D 순차)
> **참고**: v3 archive `_EVOLUTION.md` 8 원칙 + readiness scan
