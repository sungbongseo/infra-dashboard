# Plan: 저가수주 상계효과 탭 — 데이터 출처 & 계산 로직 인라인 문서화

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem** | 저가수주 상계효과 탭의 5개 Step(진단/CVP/4사분면/총액시뮬/배분시뮬/무결성)이 어떤 엑셀 파일의 어떤 컬럼을 사용해 어떤 공식으로 계산되는지 대시보드에 노출되지 않아, 사용자가 수치의 신뢰도를 판단할 수 없음. |
| **Solution** | 탭 상단에 "📘 계산 방법론" 전역 아코디언을 추가하고, 각 Step 섹션 헤더 옆에 "🔍 데이터 출처" 인라인 토글을 배치하여 (1) 원본 SAP 보고서 (100/200), (2) 사용 컬럼, (3) 계산 공식, (4) 가정을 단계별로 명시. |
| **Function/UX 효과** | 영업사원·관리자가 30초 안에 "이 숫자가 어디서 왔는지" 확인 가능. 클릭 1회로 SAP 컬럼명까지 추적 가능. 수치 신뢰도에 대한 질문이 대폭 감소. |
| **Core Value** | 대시보드를 **블랙박스 → 감사 가능한(Auditable) 분석 도구**로 전환. 회계팀/CFO 보고에 그대로 인용 가능한 계산 투명성 확보. |

---

## Context (문제 배경)

**현 상태**: 저가수주 상계효과 탭은 5-Step 듀얼 뷰 CVP 시뮬레이터로, 2개 SAP 보고서(100, 200)에서 다음을 도출:
- 거래처×품목 공헌이익, 4사분면, 손익분기점
- 전사 영업이익 시나리오 분석 (총액 관점)
- 품목별 고정비 재배분 시나리오 (배분 관점)
- 무결성 항등식 검증

**문제**:
1. 사용자는 화면에 표시된 숫자가 **어떤 컬럼에서 나왔는지** 모름
   - 예: "매출액 123억" → 100의 `매출액.실적` 합계? 200의 `매출액` 합계? 월별 합산 전/후?
2. **변동비 vs 고정비 분리 로직**이 보이지 않음
   - 100은 `매출원가 = 변동비` 가정, 200은 `변동비 = 실적매출원가 − 제조 고정비`
3. **가정이 숨겨져 있음**: "고정비 총액 불변", "매출원가=변동비 근사", "풀은 SAP 계층을 프록시로 사용"
4. KpiCard에 `formula` prop이 있지만 **컬럼명 수준까지 내려가지 않음**

**목표**: 모든 숫자에 대해 클릭 2회 이내로 `엑셀파일 → 컬럼 → 공식` 추적 가능.

---

## 데이터 출처 매핑 (구현 전 준비)

### Step 1~3 + Step 4a (총액 관점)

**원본 파일**: `100.거래처별품목별손익.xlsx` → `customerItemDetail` 타입
**분석 함수**: `calcCustomerItemCVP()` in [src/lib/analysis/offsetEffect.ts:183](src/lib/analysis/offsetEffect.ts#L183)

| 화면 수치 | 사용 컬럼 | 계산 공식 |
|-----------|-----------|-----------|
| 거래처 (key) | `매출거래처` | trim |
| 품목 (key) | `품목` | trim |
| 수량 | `매출수량.실적` | Σ |
| 매출 | `매출액.실적` | Σ |
| 변동비 | `매출액.실적 − 매출총이익.실적` | Σ (매출원가 근사) |
| 단위 단가 | — | `매출 / 수량` |
| 단위 변동비 | — | `변동비 / 수량` |
| 단위 공헌이익 | — | `단위 단가 − 단위 변동비` |
| 공헌이익률 | — | `공헌이익 / 매출` |

**가정**: ① 100 보고서는 원가 분리가 없으므로 `매출원가 ≈ 변동비` 로 근사. ② `매출액/수량 ≤ 0`인 행은 제외.

### Step 4a 고정비 (총액 관점)

**원본 파일**: `200.품목별수익성분석(회계).xlsx` → `itemProfitability` 타입
**분석 함수**: `extractManufacturingFixedCost()` in [src/lib/analysis/offsetEffect.ts:161](src/lib/analysis/offsetEffect.ts#L161)

| 사용 컬럼 | 설명 |
|-----------|------|
| `제조고정노무비` | 공장 노무비 중 고정 성격 |
| `감가상각비` | 설비 감가상각비 |
| `기타경비` | 공장 고정 기타경비 |

**공식**: `총 고정비 = Σ(제조고정노무비 + 감가상각비 + 기타경비)` (전체 품목)
**가정**: ① SGA 고정비는 제외 (CVP 무관). ② 제조 관련만 "풀"로 간주.

### Step 4b (배분 관점 — 풀 재배분)

**원본 파일**: `200.품목별수익성분석(회계).xlsx`
**분석 함수**: `calcItemPool()` + `calcPoolSimulation()` in [src/lib/analysis/offsetEffect.ts:440](src/lib/analysis/offsetEffect.ts#L440)

| 화면 수치 | 사용 컬럼 | 계산 공식 |
|-----------|-----------|-----------|
| 풀 필터 | `대분류` or `중분류` or `품목계정그룹` | 선택된 수준 |
| 품목 | `품목` | `[코드] 명` 패턴 정규화 → 코드 추출 |
| 품목 수량 | `매출수량` | 월별 합산 |
| 품목 매출 | `매출액` | 월별 합산 |
| 품목 총원가 | `실적매출원가` | 월별 합산 |
| 품목 고정비 | `제조고정노무비 + 감가상각비 + 기타경비` | Σ |
| 품목 변동비 | — | `실적매출원가 − 고정비` |
| 배분 고정비 | — | `풀고정비 × (품목 weight / 풀 weight)` |
| 단위 고정비 | — | `배분 고정비 / 수량` |
| 장부상 마진 | — | `매출 − 변동비 − 배분 고정비` |

**배분 기준**: 매출 비중(기본) 또는 수량 비중 (사용자 토글)
**가정**: ① 같은 대분류/중분류/품목계정그룹을 "풀"로 간주 — SAP 계층이 실제 생산 풀의 프록시. ② 고정비 총액 풀 내 불변 (재배분만 발생). ③ 품목 코드는 `[P001] 품목명` → `P001` 정규화 (100과 키 일치).

### Step 5 (무결성)

**분석 함수**: `verifyIntegrity()` in [src/lib/analysis/offsetEffect.ts:708](src/lib/analysis/offsetEffect.ts#L708)

| 검증 항등식 | 출처 |
|------------|------|
| **4a 총액 항등식**: `netOffsetEffect ≡ priceReductionLoss + volumeContributionGain` | `calcTotalViewSimulation` 내부 분해 |
| **4b 배분 항등식**: `netPoolMarginDelta ≡ targetItemMarginDelta + otherItemsMarginDelta` | `calcPoolSimulation` 내부 분해 |

**왜 내부 항등식만 검증?**: 4a(전체 CVP 범위)와 4b(선택된 풀만)는 데이터 범위가 달라 직접 비교 불가. 각 관점의 수학적 무결성만 확인.

---

## 변경 파일

| 파일 | 변경 유형 | 예상 LOC |
|------|---------|---------|
| `src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx` | 수정 | +180 |
| `src/lib/analysis/offsetEffect.ts` | 주석 보강만 (선택) | +20 |

**범위**: 단일 UI 파일에 새 컴포넌트 섹션 추가. 분석 로직 변경 없음 → 기존 24개 단위 테스트 그대로 통과.

---

## UI 설계 (3-Layer Documentation)

### Layer 1: 전역 방법론 패널 (탭 최상단)

```tsx
<details className="border-2 border-indigo-300 bg-indigo-50/50 rounded-lg p-4 mb-4">
  <summary className="cursor-pointer font-semibold text-sm">
    📘 이 분석은 어떻게 계산되나요? — 데이터 출처 & 방법론 전체 보기
  </summary>
  <div className="mt-4 space-y-4 text-xs">
    {/* 원본 파일 카드 2개 (100 + 200) */}
    <section>
      <h4>📂 원본 SAP 보고서</h4>
      <ul>
        <li><strong>100. 거래처별품목별손익</strong> (파일명 패턴)
          <ul>
            <li>사용 필드: 매출거래처, 품목, 매출수량·실적, 매출액·실적, 매출총이익·실적</li>
            <li>사용 Step: Step 1~3, Step 4a (총액 관점)</li>
          </ul>
        </li>
        <li><strong>200. 품목별수익성분석(회계)</strong>
          <ul>
            <li>사용 필드: 대분류, 중분류, 품목계정그룹, 품목, 매출수량, 매출액, 실적매출원가,
                제조고정노무비, 감가상각비, 기타경비</li>
            <li>사용 Step: 고정비 합계, Step 4b (배분 관점)</li>
          </ul>
        </li>
      </ul>
    </section>

    {/* 핵심 가정 */}
    <section>
      <h4>📐 핵심 가정</h4>
      <ol>
        <li>100의 매출원가 = 변동비 근사 (원가 분리 불가)</li>
        <li>제조 고정비 = 제조고정노무비 + 감가상각비 + 기타경비 (SGA 제외)</li>
        <li>고정비 총액 불변 (설비 캐파 내 생산)</li>
        <li>풀 = SAP 품목 계층(대분류/중분류/품목계정그룹)을 생산 풀의 프록시로 사용</li>
        <li>품목 코드 정규화: `[P001] 명` → `P001` (100 ↔ 200 키 일치)</li>
      </ol>
    </section>

    {/* 왜 듀얼 뷰? */}
    <section>
      <h4>🎯 왜 두 가지 관점?</h4>
      <p>총액 관점(Step 4a)은 수학적으로 정확한 전사 이익 변화, 배분 관점(Step 4b)은
         품목별 수익성 장부상 재배분. 두 관점은 데이터 범위가 달라 합산하지 않음.</p>
    </section>
  </div>
</details>
```

### Layer 2: Step별 인라인 토글 (각 Step 헤더 옆)

각 Step 2 헤더(`<h2>`) 옆에 작은 토글 버튼:

```tsx
<div className="flex items-center gap-2 mb-3">
  <h2 className="text-lg font-semibold">Step 1. 현재 상태 진단</h2>
  <details className="text-xs">
    <summary className="cursor-pointer px-2 py-1 rounded bg-muted hover:bg-muted/70">
      🔍 데이터 출처
    </summary>
    <div className="mt-2 p-3 border rounded bg-background absolute z-10 w-96 shadow-lg">
      <p className="font-medium mb-1">📂 100. 거래처별품목별손익</p>
      <p className="text-muted-foreground">사용 컬럼: 매출액·실적, 매출총이익·실적, 매출수량·실적</p>
      <table className="w-full mt-2 text-[11px]">
        <tr><td>총 매출</td><td>Σ 매출액·실적</td></tr>
        <tr><td>총 변동비</td><td>Σ (매출액·실적 − 매출총이익·실적)</td></tr>
        <tr><td>총 고정비</td><td>200 → Σ (제조고정노무비 + 감가상각비 + 기타경비)</td></tr>
        <tr><td>영업이익</td><td>매출 − 변동비 − 고정비</td></tr>
      </table>
    </div>
  </details>
</div>
```

**대상 Step**: Step 1 (진단), Step 2 (CVP), Step 3 (4사분면), Step 4a (총액), Step 4b (배분), Step 5 (무결성) — 총 6개.

### Layer 3: KpiCard 툴팁 보강

기존 `formula` prop을 **컬럼명 수준**으로 구체화:

**Before**:
```tsx
formula="매출 - 변동비 - 고정비"
```

**After**:
```tsx
formula="[100.매출액.실적] − [100.매출원가(=매출액-매출총이익).실적] − [200.제조고정노무비+감가상각비+기타경비]"
```

대상: Step 1의 4개 KPI, Step 4a의 4개 KPI, Step 4b의 3개 KPI → 총 11개.

---

## 구현 단계

### Phase 1: 분석 함수 docstring 보강 (선택, offsetEffect.ts)
각 export 함수에 `@source` 주석 추가:
```typescript
/**
 * @source 100.거래처별품목별손익.xlsx
 * @fields 매출거래처, 품목, 매출수량.실적, 매출액.실적, 매출총이익.실적
 * @assumption 매출원가 = 매출액 − 매출총이익 (변동비 근사)
 */
export function calcCustomerItemCVP(...) { ... }
```

### Phase 2: 전역 방법론 패널 컴포넌트 추가 (OffsetEffectTab)
- 분석 개요 배너(L264) 아래에 `<details>` 패널 1개
- 원본 파일 카드 2개(100, 200) + 가정 리스트 + 듀얼 뷰 설명
- 약 +80 LOC

### Phase 3: Step별 인라인 토글 6개
- 각 Step 섹션 `<h2>` 옆에 `<details>` 토글
- 콘텐츠: 원본 파일명, 사용 컬럼 리스트, 단순 공식 테이블
- 각 ~15 LOC × 6 = +90 LOC

### Phase 4: KpiCard formula 보강
- Step 1/4a/4b의 총 11개 KpiCard `formula` prop 구체화
- 컬럼명을 `[파일.컬럼]` 형태로 명시

### Phase 5: 빌드 + 테스트
```bash
cd "d:\분석\인프라 대시보드"
npm run build                                    # 0 errors
npx vitest run src/lib/analysis/offsetEffect.test.ts  # 24 tests pass (unchanged)
```

### Phase 6: 수동 검증 (브라우저)
- 전역 방법론 패널 펼침 확인
- 6개 Step 인라인 토글 펼침 확인
- KpiCard 호버 툴팁에 컬럼명 표시 확인

### Phase 7: 커밋
```
feat: 저가수주 상계효과 — 데이터 출처·계산 로직 인라인 문서화

- 전역 방법론 패널 (📘 원본 파일 2개 + 5개 가정 + 듀얼 뷰 설명)
- Step별 인라인 토글 6개 (🔍 사용 컬럼 + 공식 테이블)
- KpiCard formula prop 컬럼명 수준으로 보강 (11개)
- offsetEffect.ts 함수 docstring @source 태그 추가
```

---

## 수용 기준 (Acceptance)

1. **전역 방법론 패널**: 탭 상단에 `<details>` 1개, 펼침 시 100/200 원본 파일 + 컬럼 + 가정 5개 표시
2. **Step별 토글**: 6개 Step 헤더 옆에 `🔍 데이터 출처` 버튼, 펼침 시 해당 Step 사용 컬럼 + 공식 표시
3. **KpiCard 툴팁**: 11개 KpiCard의 `formula`에 `[파일.컬럼]` 표기 포함
4. **문서↔코드 일치**: 화면에 표시된 컬럼명이 `offsetEffect.ts` 실제 코드 참조와 100% 일치
5. `npm run build` 0 errors
6. 기존 24개 단위 테스트 통과 (분석 로직 무변경)
7. 영업사원이 "이 숫자는 어느 엑셀 어느 컬럼인가?"를 **30초 이내** 자가 확인 가능

---

## 리스크 및 대응

| 리스크 | 대응 |
|-------|------|
| Step별 토글이 화면을 어지럽게 만듦 | `<details>` 기본 닫힘 + 작은 배지 형태로 최소화 |
| 컬럼명과 실제 코드 불일치 | Phase 1의 `@source` 주석과 UI 동시 업데이트 + 커밋 전 교차 확인 |
| 전역 패널이 너무 길어 UX 저해 | `<details>` 접기 + 섹션별 서브 접기로 계층화 |
| 한글 컬럼명 길이로 모바일 레이아웃 깨짐 | `overflow-x-auto` + `whitespace-nowrap` |
| `formula` prop이 너무 길어 KpiCard 툴팁 깨짐 | 2-3줄 제한, 전체 설명은 Step 토글로 위임 |

---

## 재사용 (기존 컴포넌트/유틸)

| 기존 | 사용처 |
|------|-------|
| `KpiCard` `formula` prop | Layer 3 툴팁 보강 |
| `ChartCard` `formula`/`description`/`benchmark`/`reason` props | 섹션별 설명 보강 |
| HTML 네이티브 `<details>/<summary>` | 전역/Step 토글 (별도 라이브러리 불필요) |
| Tailwind `border-l-4 border-{color}-500` | 섹션 경계 강조 |
| 기존 P0/P1 개선 패턴 (emerald/amber/blue 카드) | 시각적 일관성 유지 |

---

## 예상 결과

- **투명성**: 블랙박스 → 감사 가능한 분석 도구
- **신뢰도**: 사용자가 수치 출처를 직접 확인 → 회의/보고 인용 가능
- **교육 효과**: 새 영업사원이 SAP 보고서와 대시보드 관계 학습
- **변경 규모**: 단일 파일 UI만, 약 +180 LOC
- **분석 로직 영향**: 0 (주석/문서만 추가)

---

## 작업 순서 (권장)

1. **Phase 1** — `offsetEffect.ts` 함수 docstring `@source` 태그 추가 (5분)
2. **Phase 2** — Layer 1 전역 방법론 패널 추가
3. **Phase 3** — Layer 2 Step별 인라인 토글 6개 추가
4. **Phase 4** — Layer 3 KpiCard `formula` 11개 보강
5. **Phase 5** — `npm run build` + vitest 검증
6. **Phase 6** — 브라우저 수동 확인
7. **Phase 7** — 커밋
