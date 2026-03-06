# Plan: 품목별 수불현황 파서 수정 + 수량 기반 재고 분석

## Executive Summary

| Item | Detail |
|------|--------|
| Feature | 품목별 수불현황 파서 버그 수정 + DIO 제거 + 수량 기반 재고 분석 |
| Created | 2026-03-06 |
| Estimated Files | ~15 |
| Estimated Lines | -200 (제거) / +250 (추가) |

### Value Delivered

| Perspective | Detail |
|-------------|--------|
| Problem | 파서 컬럼 매핑 불일치로 DIO=0 고정, 금액 데이터 부재로 금액 기반 DIO 계산 불가, 툴팁 수식 난해 |
| Solution | 실제 Excel 구조(17컬럼, 수량만) 반영 파서 전면 수정, DIO 삭제 후 수량 기반 재고 인사이트 전환 |
| Function UX Effect | 재고회전율/보유일수/사장재고 등 실질적 재고 인사이트 제공, 한글 수식+예시로 이해도 향상 |
| Core Value | 잘못된 데이터(DIO=0) 제거하고, 가용 데이터(수량)로 실제 의사결정에 도움되는 분석 제공 |

---

## 1. User Intent Discovery

### Core Problem
- 수불현황 3개 파일 업로드 후에도 DIO가 0일로 표시
- 툴팁 계산식에 특수기호가 많아 이해 불가
- 데이터가 의미 없는 건지, 다른 데이터가 필요한 건지 불명확

### Root Cause (Phase 0 탐색 결과)
1. **파서 컬럼 매핑 완전 불일치**: 실제 Excel은 17컬럼(No부터 시작)인데 파서는 16컬럼(품목계정그룹부터) 가정
   - `row[0]`을 `품목계정그룹`으로 읽지만 실제는 `No`(일련번호 1,2,3...) → "제품" 필터 0건
2. **금액 데이터 부재**: Excel에 기초/입고/출고/기말 수량만 있고 금액 컬럼 자체가 없음
   - DIO = (평균재고금액 / 출고금액) × 365 → 금액 없이 계산 불가

### Target User
- 인프라 사업본부 관리자 — 재고 상태와 현금흐름을 파악하고자 함

### Success Criteria
- 수불현황 업로드 시 데이터가 정상 파싱되어 품질지표에 표시
- DIO=0 혼란 제거 (DIO 카드 자체 삭제)
- 수량 기반 재고회전율, 보유일수, 사장재고 인사이트 제공
- 툴팁 계산식이 한글+예시로 바로 이해 가능

---

## 2. Alternatives Explored

| Approach | Description | Verdict |
|----------|-------------|---------|
| A. 수량 기반 DIO 전환 | 금액 대신 수량으로 DIO 계산 | 단위 혼합(BAG/KG/DM) 문제로 기각 |
| B. 단가 매핑으로 금액 추정 | 매출/원가 데이터에서 단가 추출 → 수량×단가 | 매핑 실패 위험, 복잡도 높아 기각 |
| C. DIO 포기 + 수량 인사이트 | 수량 기반 회전율/보유일수/사장재고 분석 | **채택** |

---

## 3. YAGNI Review

### In Scope (1차)
- [x] 파서 컬럼 매핑 버그 수정 (타입 + 파서 전면 수정)
- [x] DIO 제거 + CCC 공식 복원 (DSO - DPO)
- [x] 수량 기반 재고 현황 섹션 (DSO/CCC 탭 하단)
- [x] 툴팁 계산식 한글화 + 예시 (DSO/CCC/DPO 포함)
- [x] 기존 품목탭/수익성탭 재고 오버레이 수량 기반 전환

### Out of Scope (향후)
- [ ] 금액 기반 DIO (별도 금액 데이터 확보 시)
- [ ] 공장별 분리 재고 분석 대시보드
- [ ] 재고 예측/최적 발주량 분석
- [ ] 원자재→완제품 BOM 연계 분석

---

## 4. Implementation Plan

### Step 1: 타입 + 파서 수정 (3파일)

**`src/types/inventory.ts`** — 실제 Excel 17컬럼 구조 반영:
```typescript
export interface InventoryMovementRecord {
  factory: string;           // 파일명에서 추출
  no: number;                // 일련번호
  품목: string;              // 품목코드
  품목명: string;
  규격: string;
  세부규격: string;
  품목그룹: string;
  품목계정그룹: string;       // 제품, 원재료, 부재료, 상품, 재공품, 저장품
  자재유형: string;
  주거래처: string;
  대분류: string;
  중분류: string;
  소분류: string;
  단위: string;              // BAG, KG, DM 등
  기초: number;              // 기초 수량
  입고: number;              // 입고 수량
  출고: number;              // 출고 수량
  기말: number;              // 기말 수량
}
```
- 기존 `기초수량/기초금액/입고수량/입고금액/출고수량/출고금액/기말수량/기말금액/비고` 16필드 → 위 구조로 전면 교체

**`src/lib/excel/parser.ts`** — 컬럼 인덱스 수정:
```
row[0]=No, row[1]=품목, row[2]=품목명, ..., row[6]=품목계정그룹, ...,
row[13]=기초, row[14]=입고, row[15]=출고, row[16]=기말
```

**`src/lib/excel/schemas.ts`** — 변경 없음 (패턴/헤더 OK)

### Step 2: DIO 제거 + CCC 복원 (4파일)

**삭제**: `src/lib/analysis/dio.ts`

**`src/lib/analysis/ccc.ts`**:
- `dio: number` 필드 제거 (CCCMetric)
- `avgDIO: number` 제거 (CCCAnalysis)
- `calcCCCByOrg` 시그니처에서 `dio?` 파라미터 제거
- CCC 공식: `dm.dso + effectiveDIO - dpo` → `dm.dso - dpo` 복원

**`src/app/dashboard/receivables/tabs/DsoTab.tsx`**:
- `inventoryData` prop 제거
- DIO KpiCard 제거
- CCC 공식 표시에서 DIO 참조 제거
- DIO 컬럼 CCC 테이블에서 제거
- info 배너에서 DIO 언급 제거

**`src/app/dashboard/receivables/page.tsx`**:
- `inventoryMovement` store selector 제거
- DsoTab에 `inventoryData` prop 전달 제거

### Step 3: 수량 기반 재고 분석 함수 (1파일 신규)

**`src/lib/analysis/inventoryAnalysis.ts`** (신규):
```typescript
// 품목별 재고 분석 결과
interface ItemInventoryAnalysis {
  품목: string;
  품목명: string;
  품목계정그룹: string;
  단위: string;
  기초: number;
  입고: number;
  출고: number;
  기말: number;
  회전율: number;     // 출고 / ((기초+기말)/2), 높을수록 좋음
  보유일수: number;   // ((기초+기말)/2) / 출고 × 365
  입출비율: number;   // 입고 / 출고, 1 초과=재고 증가 추세
}

// 품목계정그룹별 요약
interface GroupInventorySummary {
  group: string;        // 제품, 원재료, 부재료 등
  itemCount: number;
  totalOpening: number;
  totalIncoming: number;
  totalOutgoing: number;
  totalClosing: number;
  avgTurnover: number;
}

// 전사 KPI
interface InventoryKPI {
  totalItems: number;         // 분석 품목 수
  avgTurnoverRate: number;    // 제품 평균 회전율
  deadStockCount: number;     // 사장재고 (기말>0 & 출고=0)
  overstockItems: number;     // 과잉재고 (입출비율 > 1.5)
}

function calcItemInventory(data: Map<string, InventoryMovementRecord[]>): ItemInventoryAnalysis[]
function calcGroupSummary(items: ItemInventoryAnalysis[]): GroupInventorySummary[]
function calcInventoryKPI(items: ItemInventoryAnalysis[]): InventoryKPI
```

### Step 4: DsoTab 재고 현황 섹션 UI (1파일)

**`src/app/dashboard/receivables/tabs/DsoTab.tsx`**:
- Props에 `inventoryData: Map<string, InventoryMovementRecord[]>` 다시 추가 (재고 섹션용)
- CCC 공식에서는 제외, 별도 섹션으로 표시
- 재고 현황 섹션 구성:
  1. **KPI 카드 3개**: 분석 품목 수 / 평균 재고회전율 / 사장재고 품목 수
  2. **품목별 재고 테이블** (Top 20, 보유일수 내림차순): 품목명, 단위, 기초, 입고, 출고, 기말, 회전율, 보유일수
  3. **품목계정그룹별 바 차트**: 그룹별 입고/출고 비교
- 조건부 렌더링: `inventoryData.size > 0` 일 때만 표시

### Step 5: 기존 오버레이 수량 전환 (4파일)

**`src/lib/analysis/itemHierarchy.ts`**:
- `ItemInventoryInfo` 인터페이스: `ending: number` (기말금액→기말수량), `turnover: number` (금액→수량 기반)
- `buildItemInventoryMap()`: 기초금액/기말금액 → 기초/기말 수량으로 수정

**`src/app/dashboard/sales/tabs/ItemTab.tsx`**:
- 재고금액 컬럼 → 기말수량 컬럼 (단위 표시)
- 회전율은 수량 기반 그대로 유지

**`src/lib/analysis/profitability.ts`**:
- `calcInventoryAdjustedMargin()` 삭제
- `calcProductInventoryAdjusted()` 삭제
- `ProductInventoryAdjusted` 인터페이스 삭제

**`src/app/dashboard/profitability/tabs/ProductTab.tsx`**:
- `inventoryAdjusted` prop 삭제
- 재고조정 마진 테이블 섹션 삭제

**`src/app/dashboard/profitability/page.tsx`**:
- `inventoryMovement` selector 삭제
- `inventoryAdjusted` useMemo 삭제
- ProductTab에 `inventoryAdjusted` prop 전달 삭제

### Step 6: 툴팁 계산식 한글화 (1파일)

**`src/app/dashboard/receivables/tabs/DsoTab.tsx`** — 기존 formula prop 수정:
- DSO: `"DSO = 미수채권 잔액 ÷ 일평균 매출액 (예: 50억 ÷ 0.5억 = 100일)"`
- DPO: `"DPO = 매입채무 ÷ 일평균 매입액 (예: 30억 ÷ 0.3억 = 100일)"`
- CCC: `"CCC = DSO - DPO (예: 100일 - 60일 = 40일, 짧을수록 현금 회수 빠름)"`
- 재고회전율: `"재고회전율 = 출고수량 ÷ 평균재고수량 (예: 10,980 ÷ 385 = 28.5회, 높을수록 좋음)"`
- 보유일수: `"재고보유일수 = 365 ÷ 재고회전율 (예: 365 ÷ 28.5 = 12.8일)"`

---

## 5. File Change Summary (~15파일)

| # | File | Action | Step |
|---|------|--------|------|
| 1 | `src/types/inventory.ts` | 전면 수정 (17컬럼 구조) | 1 |
| 2 | `src/lib/excel/parser.ts` | 컬럼 인덱스 수정 | 1 |
| 3 | `src/lib/analysis/dio.ts` | **삭제** | 2 |
| 4 | `src/lib/analysis/ccc.ts` | DIO 제거, CCC=DSO-DPO 복원 | 2 |
| 5 | `src/app/dashboard/receivables/tabs/DsoTab.tsx` | DIO 제거 + 재고 섹션 추가 + 툴팁 한글화 | 2,4,6 |
| 6 | `src/app/dashboard/receivables/page.tsx` | prop 정리 | 2 |
| 7 | `src/lib/analysis/inventoryAnalysis.ts` | **신규** (수량 기반 분석) | 3 |
| 8 | `src/lib/analysis/itemHierarchy.ts` | 금액→수량 전환 | 5 |
| 9 | `src/app/dashboard/sales/tabs/ItemTab.tsx` | 금액→수량 컬럼 | 5 |
| 10 | `src/app/dashboard/sales/page.tsx` | (변경 최소) | 5 |
| 11 | `src/lib/analysis/profitability.ts` | 재고조정마진 함수 삭제 | 5 |
| 12 | `src/app/dashboard/profitability/tabs/ProductTab.tsx` | 재고조정마진 섹션 삭제 | 5 |
| 13 | `src/app/dashboard/profitability/page.tsx` | inventory 관련 코드 삭제 | 5 |
| 14 | `src/lib/db.ts` | (변경 없음, 구조는 호환) | - |
| 15 | `src/stores/dataStore.ts` | (변경 없음, Map 구조 유지) | - |

---

## 6. Verification Checklist

- [ ] 수불현황 3개 파일 업로드 → data 페이지 품질지표 정상 표시
- [ ] 품목계정그룹 분포: 제품/원재료/부재료/상품/재공품/저장품 표시
- [ ] DSO/CCC 탭: DIO 카드 없음, CCC = DSO - DPO
- [ ] DSO/CCC 탭 하단: 재고 현황 섹션 (KPI + 테이블 + 차트)
- [ ] 수불현황 미업로드 시: 재고 섹션 숨김, 기존 UI 동일
- [ ] 품목탭: 수량 기반 재고 컬럼 정상 표시
- [ ] 수익성 탭: 재고조정 마진 테이블 없음
- [ ] 툴팁: 한글 수식 + 실제 숫자 예시
- [ ] `npm run build` 성공
- [ ] `npm run lint` 경고 없음

---

## 7. Brainstorming Log

| Phase | Key Decision | Rationale |
|-------|-------------|-----------|
| Phase 0 | 파서 컬럼 매핑 버그 + 금액 부재 발견 | 실제 Excel 17컬럼 vs 파서 16컬럼, 금액 컬럼 자체 없음 |
| Phase 1 | DIO 포기, 다른 인사이트 제공 | 금액 없이 DIO 무의미, 수량으로 가치 있는 분석 가능 |
| Phase 2 | DSO/CCC 탭에 재고 섹션 추가 | 기존 탭 내 자연스러운 연결, 최소 UI 변경 |
| Phase 3 | 4개 항목 모두 MVP 포함 | 파서 수정/DIO 제거/재고 섹션/툴팁 모두 필수 |
| Phase 4 | 재고조정 마진 제거 동의 | 금액 없이 보유비용 계산 무의미 |
