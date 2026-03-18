# Design: data-accuracy-fix — 엑셀 데이터 정합성 3단계 개선

> Plan 참조: `docs/01-plan/features/data-accuracy-fix.plan.md`
> 감사 보고서: `docs/04-report/comprehensive-audit-2026-03-17.md`

---

## 1. Phase A: 긴급 수정 (parser.ts)

### A-1: KG-row 머지 개선 (C-1)

**현재 코드** (`parser.ts:793-804`):
```typescript
// non-KG 행을 삭제하고 KG 행만 보존 → 데이터 손실
if (nextItemOrig === "" && nextUnit === "KG" && curUnit !== "KG") {
  mergedIP.push({ ...next });  // KG 행만 보존
  i++;                          // non-KG 행 삭제
  continue;
}
```

**설계 변경**:
- non-KG 행 삭제 대신, 두 행의 수치를 **병합** (KG 행 우선, 빈 값은 non-KG에서 보충)
- 병합 발생 시 `warnings`에 로그 추가
- KG 행만 있는 경우는 그대로 유지

```typescript
// 설계: KG 행 우선 병합, non-KG 보충
if (nextItemOrig === "" && nextUnit === "KG" && curUnit !== "KG") {
  // KG 행 기반으로 병합 — 숫자 필드는 KG 우선, 0이면 non-KG 보충
  const merged = { ...next };
  // 텍스트 필드는 cur(non-KG)에서 가져옴 (품목명 등)
  if (!merged.품목 || merged.품목.trim() === "") merged.품목 = cur.품목;
  // 매출액 등 핵심 수치: KG 값이 0이면 non-KG 값 사용
  for (const key of ["매출수량", "매출액", "매출총이익", "영업이익", "실적매출원가"]) {
    if (merged[key] === 0 && cur[key] !== 0) merged[key] = cur[key];
  }
  // 계획 필드도 동일 처리
  for (const key of ["매출수량_계획", "매출액_계획", "매출총이익_계획", "영업이익_계획"]) {
    if ((merged[key] ?? 0) === 0 && (cur[key] ?? 0) !== 0) merged[key] = cur[key];
  }
  warnings.push(`[itemProfitability] ${cur.품목}: KG/non-KG 행 병합`);
  mergedIP.push(merged);
  i++;
  continue;
}
```

**영향 범위**: `parser.ts` itemProfitability case만. 다른 파일 타입 무관.

---

### A-2: 901 파서 컬럼 매핑 검증 (C-2)

**현재 코드** (`parser.ts:617-635`):
```typescript
제품내수매출: parsePlanActualDiff(row, 5),   // PAD 5,6,7
제품수출매출: parsePlanActualDiff(row, 8),   // PAD 8,9,10
매출수량: parsePlanActualDiff(row, 11),      // PAD 11,12,13
환산수량: parsePlanActualDiff(row, 14),      // PAD 14,15,16
매출액: parsePlanActualDiff(row, 17),        // PAD 17,18,19
실적매출원가: parsePlanActualDiff(row, 20),  // PAD 20,21,22
차이매출원가: parsePlanActualDiff(row, 23),  // PAD 23,24,25
매출총이익: parsePlanActualDiff(row, 26),    // PAD 26,27,28
판매관리비: parsePlanActualDiff(row, 29),    // PAD 29,30,31
판관변동_직접판매운반비: parsePlanActualDiff(row, 32), // PAD 32,33,34
영업이익: parsePlanActualDiff(row, 35),      // PAD 35,36,37
```

**검증 방법**: Node.js 스크립트로 901 엑셀 파일의 Row 0 (카테고리명)과 Row 1 (계획/실적/차이)을 읽어 실제 컬럼 인덱스 확인.

```javascript
// 검증 스크립트 (Do 단계에서 실행)
const XLSX = require('xlsx');
const wb = XLSX.readFile('업로드자료/901담당자,거래처,품목별 수익성 분석.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
console.log('Row 0 (headers):', data[0]);
console.log('Row 1 (sub-headers):', data[1]);
// col 5부터 3칸 단위로 카테고리 확인
for (let i = 5; i <= 37; i += 3) {
  console.log(`PAD(${i}): ${data[0][i]} / ${data[1][i]}-${data[1][i+1]}-${data[1][i+2]}`);
}
```

**변경 전략**:
- 검증 결과 인덱스가 맞으면 → 주석 보강만
- 인덱스가 밀려있으면 → 실측 기반으로 수정 + 영향받는 분석함수 확인

---

### A-3: 거래처코드/거래처명 분리 (H-5)

**현재 코드**:
```typescript
// orgCustomerProfit (parser.ts:647-648)
매출거래처: str(row[7]),      // 코드와 이름 모두 col 7
매출거래처명: str(row[7]),

// hqCustomerItemProfit (parser.ts:684-685)
매출거래처: str(row[4]),      // 코드와 이름 모두 col 4
매출거래처명: str(row[4]),
```

**검증 방법**: 엑셀 Row 0 헤더에서 거래처코드/거래처명 각각의 컬럼 위치 확인.

**변경 설계**:
```typescript
// orgCustomerProfit — 검증 후 실제 컬럼 기반 수정
매출거래처: str(row[COL_CODE]),    // 실측된 거래처 코드 컬럼
매출거래처명: str(row[COL_NAME]),  // 실측된 거래처명 컬럼

// hqCustomerItemProfit 동일
```

**주의**: 304 파일의 헤더 구조에 따라 코드/이름이 같은 컬럼일 수도 있음 (SAP에서 코드+이름이 "[코드] 이름" 형태로 합쳐서 내보내는 경우). 실측 후 판단.

---

## 2. Phase B: 구조적 개선

### B-1: FileUploader merge/replace 옵션 (H-1)

**현재 코드** (`FileUploader.tsx`):
```typescript
case "salesList":
  setSalesList(result.data as any[]);  // 완전 대체
  break;
```

**설계 변경**:
1. 동일 FileType 파일 이미 존재하는지 `uploadedFiles` 상태에서 확인
2. 이미 존재하면 확인 다이얼로그 표시: "기존 데이터에 추가 / 기존 데이터 대체"
3. "추가" 선택 시 기존 배열에 `concat` (Map 기반 타입은 기존처럼 키 추가)
4. "대체" 선택 시 기존 동작 유지

```typescript
// 설계: 데이터 병합 로직
function mergeOrReplace(
  existingData: any[],
  newData: any[],
  mode: "merge" | "replace"
): any[] {
  if (mode === "replace") return newData;
  // merge: 중복 제거 기준 필요 (fileType별 식별자)
  // salesList → 전체 concat (날짜+품목+금액 조합이 고유)
  // orgProfit → 영업조직팀+month 기준 dedup
  return [...existingData, ...newData];
}
```

**UI 컴포넌트**:
```tsx
// AlertDialog 활용 (Radix UI 기존 컴포넌트)
<AlertDialog>
  <AlertDialogContent>
    <AlertDialogTitle>동일한 파일 유형이 이미 로드되어 있습니다</AlertDialogTitle>
    <AlertDialogDescription>
      {existingFileName} ({existingCount}행) → {newFileName} ({newCount}행)
    </AlertDialogDescription>
    <div className="flex gap-2">
      <Button onClick={() => handleUpload("merge")}>기존 데이터에 추가</Button>
      <Button variant="destructive" onClick={() => handleUpload("replace")}>대체</Button>
    </div>
  </AlertDialogContent>
</AlertDialog>
```

**Map 기반 타입 (receivableAging, inventoryMovement)**: 이미 소스별 키로 추가되므로 변경 불필요.

---

### B-2: fillDown 안전장치 (H-2, H-3)

**문제**: 역방향 fill-down이 조직 경계를 넘어 오염 가능.

**설계 변경 — `fillDownHierarchicalOrg()`**:

```typescript
// 현재: 무조건 역방향 fill-down
// 개선: "인접 소계 경계" 검사 추가

function fillDownHierarchicalOrg<T extends { 영업조직팀: string }>(
  records: T[], warnings?: string[], fileType?: string
): T[] {
  // 1차: 순방향 fill-down (기존)
  let currentOrg = "";
  for (const rec of records) {
    const org = rec.영업조직팀.trim();
    if (org !== "" && !isTotalRow(org)) {
      currentOrg = org;
    } else if (org === "" && currentOrg !== "") {
      rec.영업조직팀 = currentOrg;
    }
  }

  // 2차: 역방향 fill-down — 소계 경계에서 중단
  currentOrg = "";
  for (let i = records.length - 1; i >= 0; i--) {
    const rec = records[i];
    const org = rec.영업조직팀.trim();
    if (org !== "" && !isTotalRow(org)) {
      currentOrg = org;
    } else if (isTotalRow(org)) {
      // 소계행을 만나면 역방향 전파 중단 (경계)
      currentOrg = "";
    } else if (org === "" && currentOrg !== "") {
      rec.영업조직팀 = currentOrg;
    }
  }

  // 나머지 동일
  if (warnings && fileType) validateOrgField(records, "영업조직팀", warnings, fileType);
  return records.filter((r) => !isTotalRow(r.영업조직팀.trim()));
}
```

**`fillDownMultiLevel()` 변경**:
- 역방향 pass (line 195-208)에도 동일한 소계 경계 중단 로직 추가

```typescript
// 3단계: 역방향 fill-down — 소계 경계에서 중단
let currentTop = "";
for (let i = records.length - 1; i >= 0; i--) {
  const rec = records[i];
  const val = String(rec[topLevelPrimary] || "").trim();
  if (val !== "" && !isTotalRow(val)) {
    currentTop = val;
  } else if (isTotalRow(val)) {
    currentTop = "";  // 소계 경계에서 중단
  } else if (val === "" && currentTop !== "") {
    (rec as Record<string, any>)[topLevelPrimary] = currentTop;
  }
}
```

---

### B-3: receivableAging safeParseRows 전환 (H-4)

**현재**: `data.slice(2).filter().map()` — 에러 격리 없음.

**설계 변경**:

```typescript
function parseReceivableAging(
  data: unknown[][],
  warnings: string[]
): ReceivableAgingRecord[] {
  const { parsed } = safeParseRows<ReceivableAgingRecord>(
    data, 2,
    (row) => {
      const org = str(row[1]).trim();
      const mgr = str(row[2]).trim();
      const customer = str(row[4]).trim();
      if (isTotalRow(org) || isTotalRow(mgr)) throw new Error("SKIP_ROW");
      if (org.includes("소계") || mgr.includes("소계")) throw new Error("SKIP_ROW");
      if (!customer) throw new Error("SKIP_ROW");
      return {
        No: num(row[0]),
        영업조직: org,
        담당자: mgr,
        판매처: str(row[3]),
        판매처명: customer,
        통화: str(row[5]),
        month1: parseAgingAmounts(row, 6),
        month2: parseAgingAmounts(row, 9),
        month3: parseAgingAmounts(row, 12),
        month4: parseAgingAmounts(row, 15),
        month5: parseAgingAmounts(row, 18),
        month6: parseAgingAmounts(row, 21),
        overdue: parseAgingAmounts(row, 24),
        합계: {
          출고금액: num(row[27]),
          장부금액: num(row[29]),
          거래금액: num(row[28]),
        },
        여신한도: num(row[30]),
      };
    },
    warnings, "미수채권연령", true
  );
  return parsed;
}
```

**호출부 변경**: `parseReceivableAging(data)` → `parseReceivableAging(data, warnings)` (warnings 파라미터 추가)

---

### B-4: 월별 시트 합산 전략 분기 (M-01)

**문제**: 모든 파일 타입을 동일하게 concat하지만, orgProfit/teamContribution은 누계 보고서라 이중 카운팅 위험.

**설계 변경**: `schemas.ts`에 `monthlyStrategy` 필드 추가.

```typescript
// schemas.ts 확장
interface FileSchema {
  // ... 기존 필드
  monthlyStrategy?: "concat" | "latest" | "delta";
  // concat: 모든 시트 합산 (기본값, 월별 독립 데이터)
  // latest: 마지막 시트만 사용 (누계 보고서)
  // delta: 전월 차이 계산 후 합산 (향후 확장)
}
```

**파일 타입별 전략**:

| fileType | strategy | 이유 |
|----------|----------|------|
| salesList | concat | 월별 독립 거래 |
| collectionList | concat | 월별 독립 거래 |
| orderList | concat | 월별 독립 거래 |
| orgProfit | latest | 누계 보고서 (기간 합산) |
| teamContribution | latest | 누계 보고서 |
| profitabilityAnalysis | concat | 월별 독립 상세 |
| orgCustomerProfit | concat | 월별 독립 상세 |
| hqCustomerItemProfit | concat | 월별 독립 상세 |
| customerItemDetail | N/A | 단일 시트 (매출연월 필드) |
| itemProfitability | concat | 월별 독립 상세 |
| itemCostDetail | concat | 월별 독립 상세 |
| receivableAging | N/A | 소스별 Map |
| inventoryMovement | N/A | 공장별 Map |

**parser.ts 변경** (line 932-956):

```typescript
if (monthlySheets.length > 0) {
  const strategy = schema.monthlyStrategy || "concat";

  if (strategy === "latest") {
    // 마지막 시트(가장 최근 월)만 사용
    const lastSheet = monthlySheets[monthlySheets.length - 1];
    const sheet = workbook.Sheets[lastSheet.sheetName];
    const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    const sheetResult = parseSheetData(rawData, schema, warnings, fileName);
    for (const row of sheetResult.data) {
      (row as any).month = lastSheet.month;
    }
    parsed = sheetResult.data;
    skippedRows = sheetResult.skippedRows;
    warnings.push(`월별 시트 ${monthlySheets.length}개 중 최신(${lastSheet.month})만 사용 (누계 보고서)`);
  } else {
    // 기존 concat 로직
    const allRows: unknown[] = [];
    for (const ms of monthlySheets) { /* ... 기존 코드 ... */ }
    parsed = allRows;
  }
}
```

---

### B-5: KPI 카드 데이터 소스 표시 (H-6)

**설계**: KpiCard의 기존 `description` prop 활용.

각 KPI를 호출하는 페이지에서 `description`에 데이터 소스를 명시:

```typescript
// Overview page.tsx 예시
<KpiCard
  title="총 매출"
  value={kpis.totalSales}
  format="currency"
  description="데이터 소스: 매출리스트 장부금액 합계"
  formula="Σ(매출리스트.장부금액)"
/>
<KpiCard
  title="영업이익률"
  value={kpis.operatingProfitRate}
  format="percent"
  description="데이터 소스: 조직별손익 영업이익/매출액"
  formula="Σ(조직별손익.영업이익.실적) / Σ(조직별손익.매출액.실적) × 100"
  benchmark="5% 이상 양호"
/>
```

**변경 없는 파일**: KpiCard.tsx 자체는 이미 `description` tooltip을 지원하므로 수정 불필요. 호출부(page.tsx)에서 `description` prop만 추가.

---

## 3. Phase C: 품질 개선

### C-1: fuzzyGet → isSameOrg (M-04)

**현재** (`profitRiskMatrix.ts:133-142`):
```typescript
// key.includes(name) || name.includes(key) — false positive 위험
```

**변경**:
```typescript
import { isSameOrg } from "@/lib/orgMapping";
// isSameOrg는 이미 정규화+부분매칭+별칭 지원
for (const [key, val] of Array.from(map.entries())) {
  if (isSameOrg(key, name)) return val;
}
```

### C-2: isSynthetic 표시 (H-7)

**변경 위치**: DSO/CCC 탭의 trend 차트.
**설계**: `isSynthetic: true`인 데이터 포인트에 점선 스타일 + tooltip "추정치" 표시.

```tsx
<Line
  strokeDasharray={point.isSynthetic ? "5 5" : undefined}
  // tooltip에서: isSynthetic ? "* 추정치 (미수금 스냅샷 기반)" : ""
/>
```

### C-3: 에러 리포팅 확장 (M-08)

**현재**: `if (skipped <= 5)` — 5건만 상세 표시.

**변경**: 전체 에러 기록하되 UI 표시는 최대 20건, 나머지는 개수만.

```typescript
// safeParseRows 내부
const allErrors: string[] = [];
// ...
if (e.message !== "SKIP_ROW") {
  skipped++;
  const lineNum = skipRows + /* 필터링 전 원래 인덱스 */ + 1;
  allErrors.push(`${lineNum}행: ${e.message || "알 수 없는 오류"}`);
}
// ...
if (allErrors.length > 0) {
  const show = allErrors.slice(0, 20);
  show.forEach(msg => warnings.push(`[${fileType}] ${msg}`));
  if (allErrors.length > 20) {
    warnings.push(`[${fileType}] ... 외 ${allErrors.length - 20}행 추가 실패`);
  }
}
```

**행번호 정확도**: 필터링 전 원래 인덱스를 보존하기 위해 `rows` 배열 대신 원본 `data` 기반으로 인덱스 추적.

### C-4: hasMergedHeader 정리

**변경**: `schemas.ts`의 `itemProfitability` 항목에 `hasMergedHeader: true` 설정.
```typescript
{ fileType: "itemProfitability", ..., hasMergedHeader: true }
```

### C-5: dead code 삭제

**삭제 대상**: `aging.ts:183-212` `calcWeightedAverageDays()` 함수 전체.

### C-6: isFinite 가드

**변경**: `page.tsx:864`
```typescript
// Before:
{insight.value.toFixed(1)}
// After:
{isFinite(insight.value) ? insight.value.toFixed(1) : "-"}
```

### C-7: waterfall 영업이익 일관성

**변경**: `itemHierarchy.ts` `calcCostWaterfall()`에서 영업이익을 독립 합산 대신 워터폴 산출값(매출총이익 - 판관비)으로 사용.

```typescript
// Before: operatingProfit = Σ(r.영업이익) (독립 합산)
// After:  operatingProfit = grossProfit - sgna (워터폴 일관성)
const operatingProfitWaterfall = grossProfit - sgna;
```

---

## 4. 구현 순서 및 의존성

```
Phase A (병렬 가능, parser.ts 내 독립 영역)
  ┌─ A-2: 901 컬럼 검증 스크립트 실행 → 인덱스 확인/수정
  ├─ A-1: KG-row 병합 개선
  └─ A-3: 거래처 컬럼 분리
  → npm run build → 커밋

Phase B (순차 실행)
  B-3: receivableAging safeParseRows (독립, 소규모)
  → B-2: fillDown 안전장치 (fillDownHierarchicalOrg + fillDownMultiLevel)
  → B-4: schemas.ts monthlyStrategy + parser.ts 전략 분기
  → B-1: FileUploader merge/replace UI
  → B-5: KPI description prop 추가
  → npm run build → 커밋

Phase C (병렬 가능, 독립 파일들)
  ┌─ C-5: dead code 삭제
  ├─ C-6: isFinite 가드
  ├─ C-4: hasMergedHeader 수정
  ├─ C-7: waterfall 일관성
  ├─ C-1: fuzzyGet → isSameOrg
  ├─ C-2: isSynthetic 표시
  └─ C-3: 에러 리포팅 확장
  → npm run build → Vercel 배포 → 교차 검증
```

---

## 5. 검증 체크리스트

### Phase A 완료 기준
- [ ] A-2: 901 엑셀 Row0/Row1 대조 스크립트 실행 → 인덱스 일치 확인
- [ ] A-1: KG-row 병합 후 200 파일 품목 수 ≥ 기존 품목 수 (데이터 손실 없음)
- [ ] A-3: orgCustomerProfit/hqCustomerItemProfit 거래처코드 ≠ 거래처명 확인
- [ ] `npm run build` 0 errors

### Phase B 완료 기준
- [ ] B-3: aging 파일에 의도적으로 빈 행 삽입해도 파싱 실패 안 함
- [ ] B-2: 901 파일에서 역방향 fill-down이 조직 경계 넘지 않음 (5개 조직 spot check)
- [ ] B-4: orgProfit 파일 월별 시트 → "latest" 전략으로 최신 1개만 사용
- [ ] B-1: 동일 타입 재업로드 시 merge/replace 다이얼로그 표시
- [ ] B-5: Overview KPI tooltip에 데이터 소스 표시
- [ ] `npm run build` 0 errors

### Phase C 완료 기준
- [ ] C-5: `calcWeightedAverageDays` 삭제 + 참조 없음 확인
- [ ] C-1: profitRiskMatrix에서 "광주"가 "광주사무소"만 매칭 (오매칭 없음)
- [ ] C-3: 파싱 에러 시 행번호가 실제 Excel 행번호와 일치
- [ ] `npm run build` 0 errors
- [ ] 5개 교차 검증 KPI 오차 <1%

---

## 6. 수정 파일 목록 (총 10파일)

| # | 파일 | Phase | 변경 내용 |
|---|------|:-----:|----------|
| 1 | `src/lib/excel/parser.ts` | A,B,C | KG머지, 901검증, fillDown, aging, 에러리포팅 |
| 2 | `src/lib/excel/schemas.ts` | B,C | monthlyStrategy 추가, hasMergedHeader 수정 |
| 3 | `src/components/dashboard/FileUploader.tsx` | B | merge/replace 다이얼로그 |
| 4 | `src/app/dashboard/page.tsx` | B,C | KPI description, isFinite 가드 |
| 5 | `src/lib/analysis/profitRiskMatrix.ts` | C | fuzzyGet → isSameOrg |
| 6 | `src/lib/analysis/aging.ts` | C | dead code 삭제 |
| 7 | `src/lib/analysis/itemHierarchy.ts` | C | waterfall 일관성 |
| 8 | `src/lib/analysis/dso.ts` | C | (UI 변경 없음, 타입만) |
| 9 | `src/app/dashboard/receivables/tabs/DsoCccTab.tsx` | C | isSynthetic 점선 표시 |
| 10 | `src/types/excel.ts` or `schemas.ts` | B | FileSchema 타입 확장 |
