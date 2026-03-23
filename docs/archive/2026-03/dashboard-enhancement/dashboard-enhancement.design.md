# Dashboard Enhancement Design

> **Feature**: dashboard-enhancement
> **Plan Reference**: [dashboard-enhancement.plan.md](../../01-plan/features/dashboard-enhancement.plan.md)
> **Created**: 2026-03-23
> **Status**: Draft
> **Target**: PC only (모바일/태블릿 제외)

---

## Scope Change from Plan

- ~~P2: 반응형 UI~~ → **삭제** (PC 전용, 모바일/태블릿 미사용)
- P2를 **엑셀 파서 정밀화**로 교체 (감사 결과 Critical 3건 + High 4건 발견)

## Revised Phase Structure

| Phase | 내용 | 우선순위 |
|-------|------|---------|
| P1 | 성능 최적화 — LazyTab + 메모이제이션 | HIGH |
| P2 | 엑셀 파서 정밀화 — Critical/High 데이터 정확성 | CRITICAL |
| P3 | 에러 가시화 + 타입 안전성 | MEDIUM |
| P4 | 미활용 모듈 활성화 | LOW-MEDIUM |

---

## Phase 1: 성능 최적화 (LazyTab + 메모이제이션)

### D1-1. LazyTabContent 래퍼 컴포넌트

**신규 파일**: `src/components/dashboard/LazyTabContent.tsx`

```tsx
import { Suspense, ComponentType } from 'react';
import { LoadingSkeleton } from './LoadingSkeleton';

interface LazyTabContentProps {
  component: ComponentType<any>;
  [key: string]: any;
}

export function LazyTabContent({ component: Component, ...props }: LazyTabContentProps) {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <Component {...props} />
    </Suspense>
  );
}
```

### D1-2. 페이지별 React.lazy 전환

**변경 파일 5개**: 각 페이지의 정적 import를 `React.lazy()`로 교체

| 페이지 | 파일 | 탭 수 | 변경 방식 |
|--------|------|-------|----------|
| Sales | `sales/page.tsx` | 16 | `const CustomerTab = lazy(() => import('./tabs/CustomerTab'))` |
| Profitability | `profitability/page.tsx` | 19 | 동일 패턴 |
| Receivables | `receivables/page.tsx` | 9 | 동일 패턴 |
| Orders | `orders/page.tsx` | 7 | 동일 패턴 |
| Profiles | `profiles/page.tsx` | 5 | 동일 패턴 |

**TabsContent 렌더링 변경**:
```tsx
// Before
<TabsContent value="customer"><CustomerTab data={filtered} /></TabsContent>

// After
<TabsContent value="customer">
  <LazyTabContent component={CustomerTab} data={filtered} />
</TabsContent>
```

**주의사항**:
- Overview 페이지는 탭이 4개뿐이고 항상 사용되므로 lazy 적용하지 않음
- `'use client'` 지시문은 이미 각 페이지에 있으므로 추가 불필요

### D1-3. useCallback 메모이제이션

**변경 파일**: `src/components/dashboard/GlobalFilterBar.tsx`

| 함수 | 현재 | 변경 |
|------|------|------|
| `handleOrgToggle` | 매 렌더 재생성 | `useCallback((...) => {...}, [selectedOrgs])` |
| `handleCustToggle` | 매 렌더 재생성 | `useCallback((...) => {...}, [selectedCustomers])` |
| `handleSelectAllOrgs` | 매 렌더 재생성 | `useCallback((...) => {...}, [orgNames])` |
| `handleSelectAllCusts` | 매 렌더 재생성 | `useCallback((...) => {...}, [customers])` |

---

## Phase 2: 엑셀 파서 정밀화 (CRITICAL)

감사 결과 15건 중 Critical 3건 + High 4건을 우선 해결합니다.

### D2-1. [CRITICAL] Aging 합계 행 필드 교차 검증

**파일**: `src/lib/excel/parser.ts` (line 372-376)

**현재 문제**: 합계 행의 거래금액/장부금액이 교차되어 있음
```typescript
// 현재: sub-header 순서가 다름
합계: { 출고금액: row[27], 장부금액: row[29], 거래금액: row[28] }
```

**조치**:
1. 실제 SAP 엑셀 파일의 합계 행 헤더를 확인하여 정확한 순서 결정
2. 검증 로직 추가: 개별 month 합산 vs 합계 행 비교
```typescript
// 검증: 개별 월별 합계와 총합 비교
const calculatedTotal = months.reduce((sum, m) => sum + m.장부금액, 0);
const reportedTotal = totalRow.장부금액;
if (Math.abs(calculatedTotal - reportedTotal) > 1) {
  warnings.push(`[receivableAging] 장부금액 합계 불일치: 계산=${calculatedTotal}, 보고=${reportedTotal}`);
}
```

### D2-2. [CRITICAL] 타입 안전성: `as any` 대체

**파일**: `src/lib/excel/parser.ts` (9곳), `src/components/dashboard/FileUploader.tsx` (15곳)

**parser.ts 변경 방식**:
```typescript
// Before
(merged as any)[key]

// After: 타입 가드 함수 사용
function getField(obj: Record<string, unknown>, key: string): unknown {
  if (!(key in obj)) {
    return undefined;
  }
  return obj[key];
}
```

**FileUploader.tsx 변경 방식**:
```typescript
// Before
setSalesList(result.data as any[]);

// After: result.data는 이미 parser에서 타입이 결정됨
// fileType으로 분기하고 있으므로 제네릭 불필요
// 단, 타입 단언은 유지하되 `as SalesRecord[]`로 구체화
setSalesList(result.data as SalesRecord[]);
```

### D2-3. [CRITICAL] num() 함수: 0 vs 누락 구분

**파일**: `src/lib/excel/parser.ts` (line 27-31)

**현재**: 모든 비정상 값을 0으로 변환
```typescript
function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}
```

**변경**: 기존 `num()` 유지 + 진단용 `numOrNull()` 추가
```typescript
// 기존 유지 (하위 호환)
function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// 신규: 금액/수량 등 0이 의미 있는 필드용
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
```

**적용 범위**: 당장 전면 교체하지 않고, aging/profitability 등 0 값이 "데이터 없음"과 혼동되는 핵심 필드에만 적용. 대부분의 파서 코드는 기존 `num()` 유지.

### D2-4. [HIGH] 빈 파일/컬럼 검증 강화

**파일**: `src/lib/excel/parser.ts`

```typescript
// 데이터 행 수 검증 (skipRows 고려)
const dataRows = rawData.length - skipRows;
if (dataRows < 1) {
  throw new Error(`${schema.displayName}: 헤더만 있고 데이터 행이 없습니다`);
}

// 컬럼 수 검증
const expectedMinCols = getExpectedMinCols(schema.fileType);
const actualCols = rawData[skipRows]?.length ?? 0;
if (actualCols < expectedMinCols) {
  warnings.push(`[${schema.fileType}] 예상 컬럼 ${expectedMinCols}개, 실제 ${actualCols}개 — 데이터 누락 가능`);
}
```

**`getExpectedMinCols()` 매핑**:
| fileType | 최소 컬럼 수 | 근거 |
|----------|-------------|------|
| salesList | 78 | row[77]까지 접근 |
| orderList | 55 | row[54]까지 접근 |
| collectionList | 43 | row[42]까지 접근 |
| receivableAging | 30 | row[29]까지 접근 |
| orgProfit | 25 | row[24]까지 접근 |
| itemCostDetail | 78 | row[77]까지 접근 |
| itemProfitability | 20 | row[19]까지 접근 |

### D2-5. [HIGH] 머지 셀 빈 원본 경고

**파일**: `src/lib/excel/parser.ts` (`unmergeSheet` 함수)

```typescript
// 현재: 빈 원본 셀 silent skip
if (!originCell) continue;

// 변경: 경고 추가
if (!originCell) {
  emptyMergeCount++;
  continue;
}

// 함수 끝에:
if (emptyMergeCount > 0) {
  warnings.push(`[unmerge] ${emptyMergeCount}개 머지 영역의 원본 셀이 비어있어 해제 실패`);
}
```

### D2-6. [HIGH] 월 형식 시맨틱 검증

**파일**: `src/lib/excel/parser.ts` (`detectMonthlySheets`)

```typescript
// 추가: YYYYMM 범위 검증
.filter(name => {
  const s = name.trim();
  if (!/^\d{6}$/.test(s)) return false;
  const month = parseInt(s.slice(4, 6), 10);
  return month >= 1 && month <= 12;
})
```

### D2-7. [HIGH] fillDown 빈 영업조직팀 진단

**파일**: `src/lib/excel/parser.ts`

현재 10% 초과 시에만 경고하지만, 실제 빈 행 수를 반환하여 FileUploader에서 표시:
```typescript
// fillDownHierarchicalOrg 반환값 확장
interface FillDownResult {
  data: any[];
  emptyOrgCount: number;
  totalRows: number;
}
```

---

## Phase 3: 에러 가시화 + 데이터 품질

### D3-1. IndexedDB 에러 Toast 알림

**변경 파일**: `src/stores/dataStore.ts`

현재 19개 `console.error` → `alertStore.addAlert()` 또는 toast 전환:
```typescript
// Before
} catch (e) { console.error("Failed to save to IndexedDB:", e); }

// After
} catch (e) {
  console.error("IndexedDB save failed:", e);
  // 사용자에게 1회만 알림 (중복 방지)
  if (!dbErrorNotified) {
    dbErrorNotified = true;
    // toast 또는 alertStore 사용
  }
}
```

**설계 결정**: 모든 19개 에러마다 toast를 띄우면 과도하므로, **세션당 1회** "IndexedDB 저장 실패 — 새로고침 시 데이터가 사라질 수 있습니다" 경고.

### D3-2. 파서 경고 통합 패널

**변경 파일**: `src/components/dashboard/FileUploader.tsx`

현재 warnings가 파일 카드 아래에 일부만 표시. 확장:

```typescript
// 파일 업로드 완료 후 경고 요약
{warnings.length > 0 && (
  <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200">
    <h4 className="font-medium text-amber-800 dark:text-amber-200">
      데이터 품질 알림 ({warnings.length}건)
    </h4>
    <ul className="mt-1 text-sm text-amber-700 dark:text-amber-300">
      {warnings.map((w, i) => <li key={i}>{w}</li>)}
    </ul>
  </div>
)}
```

### D3-3. FileUploader 타입 단언 구체화

**변경 파일**: `src/components/dashboard/FileUploader.tsx`

15개 `as any[]` → 구체적 타입 단언:

| 현재 | 변경 |
|------|------|
| `result.data as any[]` (salesList) | `result.data as SalesRecord[]` |
| `result.data as any[]` (orderList) | `result.data as OrderRecord[]` |
| `result.data as any[]` (collectionList) | `result.data as CollectionRecord[]` |
| `result.data as any[]` (orgProfit) | `result.data as OrgProfitRecord[]` |
| `result.data as any[]` (profitabilityAnalysis) | `result.data as ProfitabilityRecord[]` |
| 기타 10개 | 해당 타입으로 변환 |

### D3-4. 불필요한 console 정리

**대상**: production 코드의 44개 console.error/warn

| 분류 | 건수 | 조치 |
|------|------|------|
| IndexedDB 에러 | 19 | D3-1에서 toast 전환 |
| 파서 경고 | 15 | D3-2에서 UI 전환, console.warn 제거 |
| 분석 모듈 | 6 | 실행 경로에 따라 유지 또는 제거 |
| 기타 | 4 | 제거 |

---

## Phase 4: 미활용 모듈 활성화

### D4-1. salesProcess.ts 탭 연결

**현재**: Overview에 KpiCard 3개만 사용, 전용 탭 없음
**변경**: Sales 페이지 내 기존 OrgScorecardTab에 Win Rate / Sales Velocity KPI 통합
- 신규 탭 생성하지 않고 기존 탭에 추가 KPI 섹션 배치
- `calcWinRate()`, `calcSalesVelocity()` 결과를 OrgScorecardTab props로 전달

### D4-2. crossAnalysis.ts `calcOrgScorecard()` 활성화

**현재**: 함수 존재하지만 미사용
**변경**: OrgScorecardTab에서 호출하여 조직별 종합 스코어카드 렌더링

---

## 구현 순서 (의존성 기반)

```
P2 (엑셀 파서 정밀화) → P3 (에러 가시화) → P1 (성능 최적화) → P4 (모듈 활성화)
```

**근거**:
- P2가 먼저: 데이터 정확성이 모든 분석의 기반. 파서 수정 후 다른 작업 진행
- P3이 다음: 에러 가시화로 P2 수정 검증 가능
- P1은 P2/P3과 독립적이지만, 파서 변경 후 진행이 안전
- P4는 기능 추가이므로 마지막

## 변경 파일 요약

| Phase | 파일 | 변경 유형 |
|-------|------|----------|
| P1 | `src/components/dashboard/LazyTabContent.tsx` | NEW |
| P1 | `src/app/dashboard/sales/page.tsx` | MODIFY |
| P1 | `src/app/dashboard/profitability/page.tsx` | MODIFY |
| P1 | `src/app/dashboard/receivables/page.tsx` | MODIFY |
| P1 | `src/app/dashboard/orders/page.tsx` | MODIFY |
| P1 | `src/app/dashboard/profiles/page.tsx` | MODIFY |
| P1 | `src/components/dashboard/GlobalFilterBar.tsx` | MODIFY |
| P2 | `src/lib/excel/parser.ts` | MODIFY (핵심) |
| P2 | `src/lib/excel/schemas.ts` | MODIFY (검증 추가) |
| P3 | `src/stores/dataStore.ts` | MODIFY |
| P3 | `src/components/dashboard/FileUploader.tsx` | MODIFY |
| P4 | `src/app/dashboard/sales/tabs/OrgScorecardTab.tsx` | MODIFY |
| P4 | `src/app/dashboard/sales/page.tsx` | MODIFY (props 추가) |

**합계**: 1 NEW + 12 MODIFY = 13파일, ~800줄 예상

---

## 검증 기준

- [ ] `npm run build` 0 errors, 0 warnings
- [ ] Aging 합계 필드 순서 실제 SAP 파일로 검증
- [ ] `as any` 카운트: parser.ts 9→0, FileUploader.tsx 15→0
- [ ] console.error/warn: 44→0 (toast/UI로 전환)
- [ ] 빈 파일 업로드 시 명확한 에러 메시지
- [ ] 월 형식 `202213` 같은 잘못된 시트 필터링 확인

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-23 | Design document created (P2 반응형→엑셀 정밀화 교체) |
