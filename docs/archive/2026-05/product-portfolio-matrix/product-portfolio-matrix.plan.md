# 제품/상품 포트폴리오 매트릭스 (4-way BCG + SQA) — 최종 강화 Plan

> **상태**: 🟢 **개발 시작 준비 완료** (사용자 강화 검토 + 보완 5건 반영)
> **작성일**: 2026-04-30 (강화)
> **참조 plan**: `C:/Users/rcnd/.claude/plans/logical-mixing-hammock.md`

## Executive Summary

| 관점 | 내용 |
|---|---|
| **Problem** | 거래처/협상 자동화는 강하나(Phase A 95%) 품목/제품/상품 **포트폴리오 의사결정** 자동화 부재. "제품/상품 어디 집중?", "내수/해외 비중?" 본부장 질문에 답할 시각화 없음. **추가 발견**: 100 손익 매출유형/계정구분 컬럼 78.5%/8%가 fill-down 미처리로 빈값 → 분류 정합성 위협. |
| **Solution** | **Strategic Quadrant Analysis (SQA)** — BCG 4-way (제품/상품 × 내수/해외) + 정통 BCG 한계 보완 3종(Dynamic 화살표/가중 마진/Pareto 80/20). **선행 작업**: parser.ts에 매출유형/계정구분 fill-down 추가 (B-0) → 알고리즘 모듈(B-1) → UI 탭(B-2) → 진단 보고서(B-3). |
| **Function UX Effect** | Profitability 페이지에 **🎯 포트폴리오 매트릭스** 탭. 4 사분면 산점도 + 시계열 화살표 + Pareto + Median 슬라이더 + NLG 인사이트. 가중 vs 산술 마진 비교 KPI (사용자 신뢰 강화). |
| **Core Value** | 매월 30분 수동 분석 → 1클릭 자동화. 영업진 포트폴리오 의사결정 시간 90% 단축. **수치 정확성 보강**: 매출유형/계정구분 fill-down으로 분류 누락 0건 + 가중 마진으로 산술 평균 왜곡 -9.88%p ~ +5.68%p 회피. |

---

## 강화 검토 — 보완 사항 5건 (Critical 발견)

### 🚨 보완 1: 매출유형 / 계정구분 fill-down 미처리 (CRITICAL — 선행 작업)

**발견**: 100 손익 raw 데이터에서:
- 매출유형(col 12) **빈값 39,993 / 50,927 (78.5%)**
- 계정구분(col 8) 빈값 3,868 / 50,927 (7.6%)

**현재 parser.ts** (`parser.ts:902-906`):
```ts
parsed = fillDownMultiLevel(r.parsed, [
  ["영업조직팀"],
  ["매출거래처", "매출거래처명"],
  ["품목", "품목명", "제품군"],  // 매출유형/계정구분 누락!
], warnings, "거래처별품목별손익");
```

**해결**: fillDownMultiLevel에 **["계정구분"], ["매출유형"]** 두 레벨 추가. SAP 패턴상 같은 품목 그룹 내에서 반복값 생략.

**영향**:
- 4-way segment 분류 정확도 ↑ (현재 78% 누락 → 0%)
- 다른 분석 모듈 (수익성/거래처 손익)에도 호의적 영향
- 회귀 위험 낮음 (fill-down 로직 자체는 검증됨)

### 🚨 보완 2: Dynamic BCG 부분 적용 (거래월 6개 미만 25% 품목)

**발견**: 거래월 분포:
- 1개월: 219 품목 (25%) → Dynamic 불가
- 2-5개월: 292 품목 (33%) → 시계열 분할 의미 약함
- 6-9개월: 140 품목 (16%) → 6M+6M 분할 가능
- 10-12개월: 95 품목 (11%) → 풀 적용

**해결**: 거래월 6개 미만 품목은 **점만 표시 + tooltip "데이터 부족 — 화살표 미표시"**. 화살표는 6개+ 품목만.

### 🚨 보완 3: 가중 마진 vs 산술 평균 왜곡 (실데이터 -9.88%p ~ +5.68%p)

**발견** (실측 차이):
- 상품×내수: 가중 5.23% vs 산술 -2.32% (**-7.55%p** 왜곡)
- 제품×내수: 가중 4.74% vs 산술 10.42% (**+5.68%p** 왜곡)
- 제품×해외: 가중 6.45% vs 산술 0.03% (**-6.42%p** 왜곡)

**해결**:
- 알고리즘: **가중 마진율 = Σ영업이익 / Σ매출액** (산술 평균 절대 사용 X)
- UI: 두 값 모두 KPI로 표시 + tooltip 차이 설명 + "가중 권장" 표기

### 🚨 보완 4: 0 매출 행 22.39% 사전 필터링

**발견**: 50,927 행 중 11,405 (22.39%)가 매출 0. 계획만 있고 실적 0이거나 빈 데이터.

**해결**: 알고리즘 진입 시 `record.매출액.실적 > 0` 필터 후 처리. warning에 "0 매출 N건 제외" 명시.

### 🚨 보완 5: "기타" 매출유형 (45건) 처리

**발견**: fill-down 후 "일반매출" 외 변형:
- 일반매출(주유소): 15건 (거래처 특성)
- 일반매출(품목라인X): 36건 (일반 변형)
- 자동매출: 3건 (시스템 자동)
- 반품매출: 2건 (음수)

**해결**: "일반" 시작 패턴 + "자동매출" → **내수 통합**. "반품매출" → **별도 제외** (음수 매출이라 분류 무의미). "해외" 시작 → 해외.

```ts
function classifySegmentType(매출유형: string): "내수" | "해외" | "제외" {
  const t = 매출유형.trim();
  if (t.includes("해외")) return "해외";
  if (t.includes("반품")) return "제외";
  if (t.startsWith("일반") || t.includes("자동")) return "내수";
  return "내수";  // 빈값 또는 알 수 없는 값 → 내수 default + warning
}
```

---

## 사용자 결정 (이전 세션 확정 — 변경 없음)

| 항목 | 결정 |
|---|---|
| 임계 기준 | Median + 사용자 슬라이더 |
| Dynamic BCG | 포함 (거래월 6개+만 화살표 — 보완 2 반영) |
| Pareto 80/20 | 포함 |
| 포함 범위 | 제품 + 상품만 |

---

## 변경 파일 (강화 plan 기준)

| Phase | 파일 | LOC | 변경 |
|---|---|---|---|
| **B-0** | `src/lib/excel/parser.ts` | +5 | fillDownMultiLevel에 [계정구분], [매출유형] 추가 |
| **B-0** | `src/lib/analysis/customerCompositeRisk.test.ts` 등 | 회귀 검증 | 기존 476 테스트 통과 확인 |
| **B-1** | `src/lib/analysis/productPortfolioMatrix.ts` (신규) | +450 | SQA 알고리즘 (4-way + Dynamic + Pareto + 가중) |
| **B-1** | `src/lib/analysis/productPortfolioMatrix.test.ts` (신규) | +280 | 25+ 단위 테스트 (보완 1-5 검증 포함) |
| **B-2** | `src/types/portfolio.ts` (또는 기존) | +35 | 타입 정의 |
| **B-2** | `src/app/dashboard/profitability/tabs/PortfolioMatrixTab.tsx` (신규) | +650 | UI 탭 |
| **B-2** | `src/app/dashboard/profitability/page.tsx` | +25 | 탭 추가 |
| **B-2** | `src/lib/metrics/glossary-profitability.ts` | +20 | BCG 용어 (star/cash_cow 등) |
| **B-3** | `docs/03-analysis/포트폴리오-매트릭스-진단-2026-04-30.md` | +250 | 진단 보고서 |
| **B-3** | `docs/04-report/product-portfolio-matrix.report.md` | +200 | PDCA 보고서 |

**총**: +1,915 LOC | 공수: 2-3 영업일 | 재사용률 75% | Phase B-0+B-1만 1차 ~ 2시간

---

## 핵심 알고리즘 (강화 버전)

```typescript
interface SegmentMatrixOptions {
  data: CustomerItemDetailRecord[];
  salesThresholdMode?: "median" | "p75" | "weighted_avg" | number;
  marginThresholdMode?: "median" | "weighted_avg" | "zero" | number;
  enableDynamic?: boolean;        // 6M+6M 시계열 (default: true)
  dynamicMinMonths?: number;      // 화살표 최소 거래월 (default: 6)
  enablePareto?: boolean;         // Top 20% 강조 (default: true)
}

function calcPortfolioMatrix(options: SegmentMatrixOptions): PortfolioMatrixResult {
  // 0. 사전 필터: 매출액 > 0 + 계정구분 ∈ {제품, 상품}
  //    + 매출유형 분류 (내수/해외/제외)

  // 1. Segment 분류 — classifySegmentType() 활용
  // 2. 품목별 집계 (segment × item):
  //    sales = Σ매출액.실적 (where 매출액.실적 > 0)
  //    profit = Σ영업이익.실적
  //    margin = profit / sales (산술 평균 ❌ — 가중만)

  // 3. 임계 산출 (segment별):
  //    salesThreshold = (median | p75 | weighted_avg | custom)
  //    marginThreshold = (median | weighted_avg | 0 | custom)

  // 4. 사분면 분류 (classifyQuadrant 재활용 + 옵션 확장):
  //    Star: sales >= salesThreshold && margin >= marginThreshold
  //    Cash Cow: sales >= salesThreshold && margin < marginThreshold
  //    Question Mark: sales < salesThreshold && margin >= marginThreshold
  //    Dog: sales < salesThreshold && margin < marginThreshold

  // 5. Dynamic BCG (옵션):
  //    if (item.monthCount >= dynamicMinMonths):
  //      prevSales = Σ매출 (months 0~5)
  //      currSales = Σ매출 (months 6~11)
  //      arrow = (currSales - prevSales, currMargin - prevMargin)
  //    else:
  //      trendDirection = "insufficient_data" (화살표 X)

  // 6. Pareto 80/20:
  //    items.sort((a,b) => b.sales - a.sales)
  //    cumulativeSales = 0
  //    items[i].isPareto80 = cumulativeSales / totalSales <= 0.8

  // 7. NLG 인사이트 (segment별 Top 3):
  //    - "내수×상품 Dog 영역 매출 49.8억 (29% 비중) — 단가 인상 잠재력 +X%"
  //    - "Top 20% (35개 품목)이 매출 80% 차지 — 집중 관리 필요"
  //    - "지난 6M → 최근 6M 사이 5개 품목이 Star → Dog 이동"
}
```

### 사분면 의사결정 가이드 (자동 NLG)

| 사분면 | 비즈니스 의미 | 권장 액션 |
|---|---|---|
| ⭐ Star (대매출+고마진) | 성장 핵심 | 투자 강화, 시장 점유 확대 |
| 🐄 Cash Cow (대매출+저마진) | 캐시 발생원 | 마진 개선 (단가 인상) 또는 유지 |
| ❓ Question Mark (소매출+고마진) | 잠재 Star | 선별 투자, 매출 확대 |
| 🐕 Dog (소매출+저마진) | 정리 후보 | 단가 인상 또는 거래 정리 |

---

## Phase B 실행 순서 (단계별 commit)

### Phase B-0: parser fill-down 강화 (선행 — 30분)

```ts
// parser.ts:902-906 변경
parsed = fillDownMultiLevel(r.parsed, [
  ["영업조직팀"],
  ["매출거래처", "매출거래처명"],
  ["품목", "품목명", "제품군"],
  ["계정구분"],   // ← 추가
  ["매출유형"],   // ← 추가
], warnings, "거래처별품목별손익");
```

**검증**: 기존 476 테스트 + dev 서버 재로드 → "매출유형 빈값" warning 0건

### Phase B-1: 알고리즘 모듈 + 단위 테스트 (1차 마일스톤 — 2-3시간)

- `productPortfolioMatrix.ts` (450 LOC)
- `productPortfolioMatrix.test.ts` (280 LOC, 25+ 테스트):
  - Segment 분류 (4건: 제품/상품 × 내수/해외)
  - 가중 마진 vs 산술 평균 검증 (실데이터 5.23% vs -2.32% 등 케이스)
  - 사분면 분류 (median/p75/0%/custom 각 케이스)
  - Dynamic BCG (거래월 6개 이상/미만 분기)
  - Pareto 80/20 마킹
  - 빈/edge case (0 매출 / 음수 매출 / 단일 품목 segment)
- 회귀 검증: 전체 테스트 476 + 25 = 501 통과

### Phase B-2: UI 탭 (2차 마일스톤 — 2-3시간)

- `PortfolioMatrixTab.tsx` (650 LOC)
  - 4 ScatterChart 그리드 (2×2 레이아웃)
  - X/Y Reference Line (median 기본 + 슬라이더)
  - Sector 색상 (Star green / Cash Cow blue / ? yellow / Dog red)
  - Pareto 80% 강조 (size 또는 outline)
  - Dynamic 화살표 (Recharts Customized)
  - NLG 인사이트 사이드바
- glossary-profitability.ts에 BCG 용어 추가
- profitability/page.tsx에 탭 추가

### Phase B-3: 진단 + PDCA 보고서 + 최종 commit

---

## Verification 강화

### 1. 단위 테스트 (Phase B-1)
```bash
npm run test productPortfolioMatrix -- --run
# Expected: 25+ 통과
```

### 2. 회귀 (전체)
```bash
npm run test -- --run
# Expected: 476 + 25 = 501 통과 (회귀 0)
```

### 3. 빌드
```bash
npm run build
# Expected: 0 errors
```

### 4. 실데이터 검증 (B-2 후)
- 4 매트릭스 분포가 사전 예상과 일치:
  - 내수×제품: 230 품목, 가중 마진 5.0%
  - 내수×상품: 397 품목, 가중 마진 0.7% (Dog 다수)
  - 해외×제품: 35 품목, 가중 마진 7.2% (Star 강세)
  - 해외×상품: 97 품목, 가중 마진 0.8%
- 적자 품목 43.3% → Dog 사분면 우세
- Pareto: Top 20% 품목이 매출 75-85% (80/20 룰 검증)

---

## Risks (강화)

| 리스크 | 완화책 |
|---|---|
| **B-0 fill-down으로 다른 모듈 회귀** | 전체 476 테스트 회귀 검증 + dev 회귀 확인 |
| **매출유형 fill-down이 잘못된 그룹 경계 cross-contamination** | fillDownMultiLevel 양방향 안전 처리 (Phase A C-04 패턴 — 이미 검증됨) |
| **0 매출 22% 필터로 매출 부풀림** | warning에 명시 "0 매출 N건 제외" + 사용자 검증 가능 |
| **거래월 1-5개 품목 Dynamic 처리 불가** | tooltip "데이터 부족" + 점만 표시 (UX 명확) |
| **Median 슬라이더 770 품목 × 4 매트릭스 재계산 지연** | useMemo + slider debounce 200ms |
| **NLG 인사이트 정확성** | 단위 테스트로 멘트 패턴 검증 + 사용자 검수 후 안정화 |

---

## Decision Gate (즉시 시작 결정)

이전 세션에서 "Phase A 안정화 (D+14) 후 시작 권장"이었으나, **사용자가 즉시 시작 명시 + Phase A와 코드 분리되어 회귀 영향 없음** → 즉시 시작.

### 안전 보장
- Phase B-0 (parser fill-down)만 기존 코드 변경 — 회귀 검증으로 안전 확보
- Phase B-1 (신규 모듈) 이후는 100% 신규 코드 — Phase A 영향 0
- 단계별 commit + 회귀 테스트로 Phase A 운영 안정화에 영향 없음

---

## 결론

| 질문 | 답변 |
|---|---|
| **사용자 강화 검토 반영?** | 🟢 보완 5건 (fill-down / Dynamic / 가중 / 0매출 / 기타) 모두 plan 반영 |
| **수치 정확성 보강?** | 🟢 가중 마진 강제 + fill-down으로 78.5% 빈값 해결 + 0매출 필터 |
| **즉시 시작 가능?** | 🟢 Phase B-0 회귀 검증 후 B-1 신규 모듈 → Phase A 영향 0 |
| **공수?** | B-0 (30분) + B-1 (2-3시간) + B-2 (2-3시간) + B-3 (1시간) = 6-8시간 |
| **본 세션 완료 가능?** | B-0 + B-1 (1차 마일스톤) 가능. B-2 UI는 별도 세션 또는 시간 여유 시 |

### 핵심 메시지

> **이전 plan 대비 보완 5건 추가 — 매출유형 fill-down 78.5% 누락 / Dynamic 부분 적용 / 가중 마진 강제 / 0매출 필터 / 기타 매출유형 처리. 즉시 시작 안전하며 본 세션에 Phase B-0 (선행) + B-1 (알고리즘) 1차 마일스톤 완료 목표. UI는 별도 세션.**

---

**다음 액션**: Phase B-0 시작 (parser.ts fill-down 추가 + 회귀 검증)
