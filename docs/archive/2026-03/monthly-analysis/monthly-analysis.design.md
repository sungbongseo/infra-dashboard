# 월별 데이터 분석 통합 — Design Document

> **Feature**: monthly-analysis
> **Plan**: docs/01-plan/features/monthly-analysis.plan.md
> **Date**: 2026-03-16
> **Status**: Draft

---

## 1. Implementation Overview

4개 Phase, 총 변경 7파일 + 신규 3파일 + UI 탭 확장 5개 페이지.

```
Phase 1: Foundation (파서+타입+스토어+필터)  → 7 files
Phase 2: Analysis (월별트렌드+재고분석)       → 2 files
Phase 3: UI (차트컴포넌트+페이지탭)           → 6+ files
Phase 4: Verification (하위호환+정합성+빌드)  → 0 files (검증만)
```

---

## 2. Detailed Design

### 2.1 타입 확장 — `src/types/`

#### 2.1.1 기존 타입에 month 추가

모든 P&L 타입에 `month?: string` (YYYYMM) 필드 추가. optional로 하여 하위호환 보장.

**변경 파일**: `src/types/profitability.ts`
```typescript
// 아래 인터페이스에 각각 추가:
// OrgProfitRecord, TeamContributionRecord, ProfitabilityAnalysisRecord,
// OrgCustomerProfitRecord, HqCustomerItemProfitRecord, CustomerItemDetailRecord
month?: string;  // YYYYMM (e.g. "202501") — 월별 시트 파싱 시 자동 주입
```

**변경 파일**: `src/types/itemCost.ts`
```typescript
// ItemCostDetailRecord에 추가
month?: string;
```

**변경 파일**: `src/types/inventory.ts`
```typescript
// InventoryMovementRecord에 추가
month?: string;
```

> 주의: `ItemProfitabilityRecord`(200)에도 month 추가. `profitability.ts` 내 정의.

### 2.2 스키마 — `src/lib/excel/schemas.ts`

변경 없음. `inventoryMovement` 스키마는 이미 존재.

### 2.3 파서 확장 — `src/lib/excel/parser.ts`

#### 핵심 변경: `parseExcelFile()` 다중 시트 순회

```typescript
// 현재 (단일 시트)
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

// 변경 후 (다중 시트 감지)
const monthlySheets = detectMonthlySheets(workbook.SheetNames);

if (monthlySheets.length > 0) {
  // 월별 시트 순회 파싱
  let allRows: unknown[] = [];
  for (const ms of monthlySheets) {
    const sheet = workbook.Sheets[ms.sheetName];
    const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    // 기존 switch 로직으로 파싱
    const sheetParsed = parseSheetData(rawData, schema, warnings, fileName, orgNames);
    // month 필드 주입
    for (const row of sheetParsed.data) {
      (row as any).month = ms.month;
    }
    allRows.push(...sheetParsed.data);
    skippedRows += sheetParsed.skippedRows;
  }
  parsed = allRows;
} else {
  // 기존 단일 시트 로직 (하위호환)
  // ... 현재 코드 그대로
}
```

#### 신규 함수: `detectMonthlySheets()`

```typescript
interface MonthlySheet {
  sheetName: string;
  month: string; // YYYYMM
}

function detectMonthlySheets(sheetNames: string[]): MonthlySheet[] {
  const monthly = sheetNames
    .filter(name => /^\d{6}$/.test(name.trim()))
    .map(name => ({ sheetName: name, month: name.trim() }));
  // 최소 2개 이상의 YYYYMM 시트가 있어야 월별로 판정
  return monthly.length >= 2 ? monthly : [];
}
```

#### 리팩토링: `parseSheetData()` 추출

현재 `parseExcelFile()` 내부의 switch 문을 별도 함수로 추출하여, 단일 시트/다중 시트 모두에서 재사용.

```typescript
interface SheetParseResult {
  data: unknown[];
  skippedRows: number;
}

function parseSheetData(
  rawData: unknown[][],
  schema: FileSchema,
  warnings: string[],
  fileName: string,
  orgNames?: Set<string>
): SheetParseResult {
  // 기존 switch(schema.fileType) 로직을 여기로 이동
  // org filter 로직도 포함
  // return { data: parsed, skippedRows }
}
```

> **하위호환 보장**: `detectMonthlySheets()`가 빈 배열 반환 시 기존 로직 그대로 실행.
> 단일 시트 파일(매출/수금/수주/미수채권/조직)은 시트명이 "Sheet1"이므로 영향 없음.

#### inventoryMovement 파싱 변경

현재 inventoryMovement는 **Map<factory, records[]>** 구조.
월별 시트 파싱 시 각 공장의 14개월 데이터가 하나의 배열로 통합되며, `month` 필드로 구분.

```typescript
// 현재: setInventoryMovement("양산공장", records)  // 단일 시트 records
// 변경: setInventoryMovement("양산공장", allMonthRecords)  // 14개월 통합 records (각 row에 month 필드)
```

### 2.4 유틸리티 — `src/lib/utils.ts`

#### 신규 함수: `filterByMonth()`

```typescript
/**
 * month 필드 기반 필터링. P&L 데이터에 dateRange 적용.
 * month 필드 형식: "YYYYMM" (e.g. "202501")
 * dateRange 형식: { from: "YYYY-MM", to: "YYYY-MM" }
 *
 * month 필드가 없는 행은 통과시킴 (하위호환).
 */
export function filterByMonth<T extends Record<string, any>>(
  data: T[],
  dateRange: { from: string; to: string } | null,
): T[] {
  if (!dateRange || !dateRange.from || !dateRange.to) return data;
  // dateRange는 "YYYY-MM" 형식, month는 "YYYYMM" 형식
  const from = dateRange.from.replace("-", ""); // "202501"
  const to = dateRange.to.replace("-", "");     // "202602"
  return data.filter(row => {
    const m = row.month;
    if (!m) return true; // month 없는 행은 통과 (하위호환)
    return m >= from && m <= to;
  });
}
```

### 2.5 필터 훅 확장 — `src/lib/hooks/useFilteredData.ts`

#### 기존 훅 변경: P&L 데이터에 `filterByMonth` 적용

```typescript
import { filterByMonth } from "@/lib/utils";

// useFilteredOrgProfit 변경
export function useFilteredOrgProfit() {
  const orgProfit = useDataStore((s) => s.orgProfit);
  const { effectiveOrgNames, dateRange } = useFilterContext();

  const filteredOrgProfit = useMemo(() => {
    const orgFiltered = filterByOrg(orgProfit, effectiveOrgNames, "영업조직팀");
    const monthFiltered = filterByMonth(orgFiltered, dateRange); // 추가
    const leafOnly = filterOrgProfitLeafOnly(monthFiltered);
    return aggregateOrgProfit(leafOnly);
  }, [orgProfit, effectiveOrgNames, dateRange]); // dateRange 의존성 추가

  return { filteredOrgProfit, orgProfit };
}
```

동일 패턴으로 아래 훅들도 변경:
- `useFilteredTeamContribution()` — dateRange + filterByMonth 추가
- `useFilteredOrgCustomerProfit()` — dateRange + filterByMonth 추가
- `useFilteredHqCustomerItemProfit()` — dateRange + filterByMonth 추가
- `useFilteredItemCostDetail()` — dateRange + filterByMonth 추가

> `useFilteredCustomerItemDetail()`은 이미 `매출연월` 필드로 dateRange 적용 중 → 변경 없음.

#### 신규 훅: `useFilteredInventory()`

```typescript
export function useFilteredInventory() {
  const inventoryMovement = useDataStore((s) => s.inventoryMovement);
  const { dateRange } = useFilterContext();

  const filteredInventory = useMemo(() => {
    const allRecords: InventoryMovementRecord[] = [];
    Array.from(inventoryMovement.values()).forEach(arr => allRecords.push(...arr));
    return filterByMonth(allRecords, dateRange);
  }, [inventoryMovement, dateRange]);

  return { filteredInventory, inventoryMovement };
}
```

### 2.6 Dexie 스키마 — `src/lib/db.ts`

변경 불필요. 데이터는 기존 `datasets` / `inventoryData` 테이블에 저장.
month 필드는 각 행의 JSON 내부 필드이므로 Dexie 스키마 변경 없음.

### 2.7 스토어 — `src/stores/dataStore.ts`

변경 불필요. 기존 setter 함수들이 any[] 타입을 받으므로 month 필드 포함 데이터 그대로 저장/복원.

### 2.8 FileUploader — `src/components/dashboard/FileUploader.tsx`

변경 불필요. `parseExcelFile()`이 내부적으로 다중 시트를 처리하고 결과를 통합하므로,
FileUploader는 기존과 동일하게 `result.data`를 받아 store에 전달.

---

## 3. 신규 분석 모듈

### 3.1 `src/lib/analysis/monthlyTrend.ts`

```typescript
import type { PlanActualDiff } from "@/types";

export interface MonthlyTrendPoint {
  month: string;         // YYYYMM
  monthLabel: string;    // "25.01" (표시용)
  매출액: number;
  실적매출원가: number;
  매출총이익: number;
  영업이익: number;
  매출총이익율: number;
  영업이익율: number;
}

export interface MoMGrowth {
  month: string;
  매출액증감: number;     // 전월 대비 증감액
  매출액증감율: number;   // 전월 대비 %
  영업이익증감: number;
  영업이익증감율: number;
}

export interface TrendChangeAlert {
  month: string;
  metric: string;
  direction: "up" | "down";
  magnitude: number;    // % 변화
  message: string;
}

/**
 * P&L 데이터를 월별로 집계.
 * 입력: month 필드가 있는 P&L 레코드 배열.
 * PlanActualDiff 구조의 데이터: 실적 값 사용.
 */
export function calcMonthlyTrend<T extends Record<string, any>>(
  data: T[],
  config: {
    salesField: string;       // "매출액"
    costField: string;        // "실적매출원가"
    grossField: string;       // "매출총이익"
    opField: string;          // "영업이익"
    valueAccessor: (field: any) => number;  // (pad) => pad.실적 또는 직접 숫자
  }
): MonthlyTrendPoint[] {
  // month별로 그룹핑 → 합산 → 이익율 계산 → 정렬
}

/**
 * 전월 대비 성장률 계산
 */
export function calcMoMGrowth(trend: MonthlyTrendPoint[]): MoMGrowth[] {
  // trend[i] vs trend[i-1]
}

/**
 * 추세 변화 감지: 3개월 이동평균 대비 ±20% 이상 변화 시 알림
 */
export function detectTrendChange(trend: MonthlyTrendPoint[]): TrendChangeAlert[] {
  // MA(3) 기준 이상 변동 감지
}
```

### 3.2 `src/lib/analysis/inventoryAnalysis.ts`

```typescript
import type { InventoryMovementRecord } from "@/types";

export interface InventoryTurnover {
  factory: string;
  품목: string;
  품목명: string;
  avgInventory: number;    // (기초 + 기말) / 2 의 월평균
  totalOut: number;        // 총 출고 수량
  turnoverRate: number;    // 출고 / 평균재고
  months: number;          // 데이터 월 수
}

export interface MonthlyMovement {
  month: string;
  factory: string;
  입고합계: number;
  출고합계: number;
  기말재고합계: number;
}

export interface SlowMovingItem {
  factory: string;
  품목: string;
  품목명: string;
  기말재고: number;
  zeroOutMonths: number;   // 출고=0인 연속 월 수
  lastOutMonth: string;    // 마지막 출고 월
}

export interface DIOResult {
  factory: string;
  dio: number;             // Days Inventory Outstanding
  avgInventoryValue: number;
  dailyCOGS: number;
}

/**
 * 품목별 재고회전율 계산
 */
export function calcInventoryTurnover(
  data: InventoryMovementRecord[]
): InventoryTurnover[] {}

/**
 * 공장별 월별 입출고 집계
 */
export function calcMonthlyMovement(
  data: InventoryMovementRecord[]
): MonthlyMovement[] {}

/**
 * 장기재고(슬로우무빙) 감지: 출고=0 연속 3개월 이상
 */
export function calcSlowMoving(
  data: InventoryMovementRecord[]
): SlowMovingItem[] {}

/**
 * DIO 계산 (CCC 보완용)
 * DIO = (평균재고 / 일일COGS) × 365
 * 수량 기반이므로 금액 기반 COGS와 직접 비교 불가 → 수량 DIO로 활용
 */
export function calcDIO(
  data: InventoryMovementRecord[]
): DIOResult[] {}
```

---

## 4. UI 설계

### 4.1 공용 컴포넌트: `MonthlyTrendChart.tsx`

```typescript
// src/components/dashboard/MonthlyTrendChart.tsx

interface MonthlyTrendChartProps {
  data: MonthlyTrendPoint[];
  growth?: MoMGrowth[];
  title?: string;
  height?: number;
  // 표시할 메트릭 선택
  metrics?: ("매출액" | "매출총이익" | "영업이익")[];
  showGrowthRate?: boolean;  // MoM % 보조축 표시
}

// 구현:
// - Recharts ComposedChart
// - Bar: 매출액 (primary)
// - Line: 영업이익, 매출총이익
// - 보조축 Line: MoM 성장률 (%)
// - Tooltip: TOOLTIP_STYLE 사용
// - X축: monthLabel ("25.01", "25.02"...)
// - 반응형 ResponsiveContainer
```

### 4.2 페이지 탭 확장

#### Profitability — 손익현황 탭

기존 KPI + 테이블 아래에 `MonthlyTrendChart` 추가.
데이터 소스: `orgProfit` (month 필드 존재 시) 또는 `profitabilityAnalysis` 월별 집계.

```typescript
// profitability/tabs/ 내 기존 탭 컴포넌트에 추가
const monthlyTrend = useMemo(() => {
  if (!data.some(d => d.month)) return null;  // month 없으면 표시 안 함
  return calcMonthlyTrend(data, {
    salesField: "매출액",
    costField: "실적매출원가",
    grossField: "매출총이익",
    opField: "영업이익",
    valueAccessor: (pad) => pad.실적,
  });
}, [data]);

// monthlyTrend가 있으면 차트 렌더
{monthlyTrend && (
  <ChartCard title="월별 손익 추이">
    <MonthlyTrendChart data={monthlyTrend} />
  </ChartCard>
)}
```

#### Profitability — 원가구조 탭

`itemCostDetail` 데이터의 월별 원가 항목 트렌드.
17개 원가 항목 중 상위 5개를 Stacked Area Chart로 표시.

#### Profitability — 팀원별 공헌이익 탭

`teamContribution` 데이터의 월별 공헌이익 추이.
팀원 선택 → 해당 팀원의 월별 매출/공헌이익 라인차트.

#### Overview — KPI sparkline

기존 sparkline 데이터에 월별 P&L 집계 추가.
`orgProfit`에 month가 있으면 월별 매출/영업이익 sparkline 생성.

#### Orders — 재고 분석 탭 (신규)

```
재고 분석 탭 구성:
├─ KPI 카드 (4개)
│  ├─ 총 재고 수량 (3공장 합계)
│  ├─ 평균 재고회전율
│  ├─ 장기재고 품목 수
│  └─ 수량 기반 DIO
├─ 공장별 월별 입출고 트렌드 (BarChart)
├─ 재고회전율 Top/Bottom 10 (테이블)
└─ 장기재고 경고 목록 (테이블)
```

---

## 5. 구현 순서 (의존성 기반)

```
Phase 1: Foundation
  1. types/profitability.ts — month? 추가 (4 interfaces)
  2. types/itemCost.ts — month? 추가 (1 interface)
  3. types/inventory.ts — month? 추가 (1 interface)
  4. lib/utils.ts — filterByMonth() 추가
  5. lib/excel/parser.ts — detectMonthlySheets() + parseSheetData() 추출 + 다중 시트 순회
  6. lib/hooks/useFilteredData.ts — 5개 훅에 filterByMonth 적용 + useFilteredInventory
     ★ 빌드 확인 (npm run build)

Phase 2: Analysis
  7. lib/analysis/monthlyTrend.ts — 월별 집계/MoM/추세 감지
  8. lib/analysis/inventoryAnalysis.ts — 재고회전/입출고/장기재고/DIO
     ★ 빌드 확인

Phase 3: UI
  9. components/dashboard/MonthlyTrendChart.tsx — 공용 월별 차트
  10. profitability 3탭 — 월별 시계열 차트 추가
  11. overview — KPI sparkline 확장
  12. orders — 재고 분석 탭 신규
      ★ 빌드 확인 + 시각 검증

Phase 4: Verification
  13. 하위호환 테스트 (단일시트 파일 정상 동작)
  14. 데이터 정합성 검증 (월별 합산 = 스냅샷)
  15. npm run build 최종 확인
```

---

## 6. 파서 리팩토링 상세

### 6.1 `parseSheetData()` 추출 범위

현재 `parseExcelFile()` 내 switch 문 (line 391~935)을 `parseSheetData()`로 추출.
단, 다음 사항 주의:

1. **rawData validation** (minRows 체크) — parseSheetData 내부로 이동
2. **org filter** — parseSheetData 내부에서 처리 (월별 시트마다 적용)
3. **receivableAging** — 다중 시트 대상 아님 (시트명이 YYYYMM이 아님). parseExcelFile에 남김.
4. **fillDown 계열 함수** — 시트 단위로 독립 실행되므로 parseSheetData 내부 유지

### 6.2 월별 시트 파싱 시 특이사항

| 파일 | 특이사항 |
|------|---------|
| 901 수익성 분석 | fillDownHierarchicalOrg — 시트별 독립 실행 OK |
| 303 조직별손익II | 26~28행/시트 → 14개월 = ~390행. 적은 데이터 |
| 304 본부 거래처 품목 손익 | fillDownMultiLevel — 시트별 독립 실행 OK |
| 303 조직별거래처별 손익 | fillDownMultiLevel — 시트별 독립 실행 OK |
| 401 팀원별 공헌이익 | rawData pre-pass(fill-down) + dedup — 시트별 독립 실행 OK |
| 501 품목별매출원가(상세) | fillDownMultiLevel + HQ filter — 시트별 독립 실행 OK |
| 200 품목별 수익성(회계) | 커스텀 fill-down + KG 소계 병합 — 시트별 독립 실행 OK |
| 수불현황 3개 | 단순 구조, 시트별 독립 실행 OK |

결론: 모든 파서 로직이 **시트 단위 독립 실행 가능**. 시트 간 상태 공유 없음.

### 6.3 customerItemDetail(100) 특이사항

이 파일은 이미 `매출연월` 컬럼에 YYYYMM 날짜를 가지고 있음.
월별 시트 파싱 시: row.month(시트명) 와 row.매출연월(컬럼) 이 공존.
→ **month 필드를 시트명으로 주입하되, 매출연월 컬럼도 유지**. filterByMonth는 month 필드 사용.

---

## 7. 데이터 정합성 검증 방법

### 7.1 월별 합산 검증

```
목표: Σ(월별 시트 실적) ≈ 기존 스냅샷 합계

검증 방법:
1. 901 단일시트 업로드 → profitabilityAnalysis 합계 기록
2. 901 월별시트 업로드 → profitabilityAnalysis 월별 합산 계산
3. 두 값 비교 (±1% 이내 = PASS)
```

### 7.2 하위호환 검증

```
1. 단일시트 파일(매출리스트.xlsx) 업로드 → 기존 동작 확인
2. 월별시트 파일(901.xlsx) 업로드 → 월별 데이터 확인
3. 두 파일 동시 업로드 → 모두 정상 동작
4. IndexedDB 복원 후 데이터 유지 확인
```

---

## 8. 리스크 대응

| 리스크 | 대응 |
|--------|------|
| 파서 리팩토링 중 기존 기능 깨짐 | Phase 1 완료 후 즉시 빌드 확인. parseSheetData 추출은 순수 리팩토링 |
| 월별 시트 헤더 구조가 시트마다 다름 | 첫 번째 시트의 헤더 구조를 기준으로 모든 시트 파싱 (SAP는 동일 구조 보장) |
| IndexedDB 용량 경고 | 실측: 10파일 × 14시트 ≈ 6만 행 × 1KB/행 ≈ 60MB → 브라우저 한도 내 |
| month 필드 미존재 데이터의 filterByMonth 처리 | `!m` 시 `return true`로 하위호환 보장 |

---

## 9. Conventions Checklist

- [x] month 필드: optional (`month?: string`) — 하위호환
- [x] month 형식: `YYYYMM` (6자리 문자열) — 시트명과 동일
- [x] filterByMonth: dateRange `YYYY-MM` → `YYYYMM` 변환
- [x] NaN/Infinity 가드: 기존 패턴 준수
- [x] Zustand 셀렉터: 개별 필드 구독
- [x] Korean UI 텍스트
- [x] CHART_COLORS, TOOLTIP_STYLE 사용
- [x] ErrorBoundary, EmptyState 패턴
- [x] 탭 컴포넌트: tabs/ 서브디렉토리 추출

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-03-16 | Initial design |
