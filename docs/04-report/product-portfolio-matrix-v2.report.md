# 제품/상품 포트폴리오 매트릭스 v2 — Phase B-Improve 후속 fix 4건 통합 PDCA 보고서

> Feature ID: `product-portfolio-matrix-v2`
> 베이스: `product-portfolio-matrix.report.md` (Phase B 1차 완료, 2026-04-30)
> 기간: 2026-05-01 ~ 2026-05-06 (운영 회귀 검증 + 사용자 의문 4건 → 후속 fix)
> Status: ✅ v2 완료 · Match Rate 100% · 단위 테스트 41/41 + 전체 517/517 + 빌드 0 errors

---

## Executive Summary

| 관점 | 내용 |
|---|---|
| **Problem** | Phase B 출시 후 dev 회귀 + 사용자 시각 검증에서 **4건의 신뢰성 이슈** 발견. ① 차트 hover 정보 부재 (마진 90~100% 다이아 클릭 시 품목 정체 불명), ② "마진율" 표기가 영업이익율인지 매출총이익율인지 모호, ③ Custom Tooltip은 추가했지만 대표 값 비교 불가, ④ 매출원가 음수 케이스 (215.24% 매출총이익율) — **수학상 정확하지만 비즈니스 비현실적**. 사용자 직관: "매출원가 마이너스 더하면 이익도 마이너스여야지." |
| **Solution** | 4단계 incremental fix — ① **Custom PortfolioTooltip** + 원가 미계상 자동 식별 (cost=0, margin≥90%), ② 매출총이익 + 매출총이익율 필드 추가 + UI 라벨 "영업이익율"로 명시 + MetricInfo glossary 통합 (13 BCG 엔트리 활성화), ③ 음수 원가 식별 (`hasNegativeCost`) + Tooltip warning, ④ **음수 원가 자동 제외** — 알고리즘 단계에서 entries 진입 차단 + `excludedNegativeCostItems` 카운터로 회계팀 알림 유지. 수학/회계/비즈니스 3-way reconciliation을 UI에 명문화. |
| **Function UX Effect** | 차트 hover 시 (1) 품목명+코드+카테고리 (2) 매출 → 매출원가 → 매출총이익 → 매출총이익율 → 영업이익 → 영업이익율 P&L 흐름 (3) 추세 (↗/→/↘) + Pareto 강조 (4) 데이터 이상 자동 warning. 마진 90% 다이아 4건 → "원가 미계상" 식별, 215% 마진 outlier → 차트 자동 제외 + 회계 분개 이상 통계만 노출. **데이터 신뢰성 정직성** 강화 — anomaly를 숨기지 않고 "왜 제외됐는지" 설명. |
| **Core Value** | **정직한 분석 (Defensive Analytics)** 원칙 확립 — 회계 데이터 이상이 평균/임계를 왜곡시키지 않도록 사전 차단 + 회계팀 actionable signal 제공. 사용자 신뢰 회복 ("215% 마진은 왜?" → 이제 즉시 답변 가능). 차트 hover 정보 풍부화로 "이게 뭐냐?" 질문 0건 목표. Fix 4건 모두 회귀 0 (511→516→517 테스트 monotonic 증가). |

---

## 1. Plan (운영 피드백 기반 incremental)

베이스 plan: `docs/01-plan/features/product-portfolio-matrix.plan.md` (Phase B 1차)

v2는 별도 plan 문서 없이 **사용자 dev 검증 피드백** 기반 4 micro-iteration:

| Iteration | 사용자 피드백 (원문 요지) | 발견 | 해결 |
|-----------|---------------------------|------|------|
| 1 | "마진율 90, 100인거는 뭐야" | 마진 90%+ 4건 모두 원가 0원 | Custom Tooltip + hasMissingCost 식별 |
| 2 | "내수 제품에 마진율이 100%인데 매출보다 영업이익높게 나오는데" | "마진율" 표기 모호 | 매출총이익 필드 추가 + 라벨 명시 + MetricInfo |
| 3 | "탑재된 이미지 계산식 봐봐 215% 말이 안 되는 숫자" | 매출원가 -6,119,344 (환입/조정 누적) | hasNegativeCost 식별 + warning |
| 4 | "매출원가 마이너스인걸 더하면 이익이 마이너스여야지 어떻게 빼기빼기 해서 더하는게 수학상 맞아?" | 수학 vs 비즈니스 충돌 | **자동 제외** + 3-way reconciliation 패널 |

각 iteration은 사용자 검증 → 질문 → 즉시 해결 → 회귀 → commit cycle (평균 30분).

---

## 2. Do — 변경 사항 (commit 단위)

### Iteration 1 — `ceeb813` Custom Tooltip + 원가 미계상 식별
**알고리즘** (`productPortfolioMatrix.ts`):
- `BCGMatrixEntry.cost`, `BCGMatrixEntry.hasMissingCost` 필드 추가
- `hasMissingCost = sales > 0 && totalCost === 0 && marginRate >= 90`
- `overallSummary.missingCostCount` 신규

**UI** (`PortfolioMatrixTab.tsx`):
- `<PortfolioTooltip />` 신규 컴포넌트 — 품목명+코드+카테고리, 매출/영업이익/마진율/매출원가/거래월, 추세 ↗/→/↘, Pareto Top 20% 강조, 🚨 원가 미계상 warning
- segment 차트 하단: `missingCostCount` 카운트 표시
- 전체 KPI 카드 하단: 원가 미계상 의심 N건 안내

**검증**: 단위 35/35 (32→35), 전체 511/511, 회귀 0
**실데이터 발견**: 마진 90%+ 4건 모두 원가 미계상 — HD-40 98.8%, B-C(0.3%) GS(D) 97.3%, Sleeper(PoJ) 94.3%, 빈 품목명 94.2%

### Iteration 2 — `f2edb80` 수치 명확화 + MetricInfo 통합
**알고리즘**:
- `BCGMatrixEntry.grossProfit`, `BCGMatrixEntry.grossMarginRate` 필드 추가
- `grossProfit = sales - totalCost`, `grossMarginRate = grossProfit / sales × 100`

**UI 라벨 명확화**:
- "마진율" → **"영업이익율 (영업이익 / 매출 × 100)"**
- Y축: "영업이익율 (영업이익÷매출) [-50~100%]"
- KPI 3종: "총 매출액" / "가중 영업이익율" / "산술 영업이익율 (outlier 제외)"
- ChartCard 제목에 "가중 영업이익율 X%" 명시

**Custom Tooltip 손익 흐름 정리**:
```
매출액 → 매출원가 → 매출총이익 → 매출총이익율 → 영업이익 → 영업이익율 (Y축, 강조)
```

**MetricInfo 통합** (5 위치):
- KPI 카드 (가중 영업이익율, 산술 outlier 제외)
- 임계 모드 select (salesThresholdMode, marginThresholdMode)
- Dynamic/Pareto 토글
- 사분면 아이콘 (★●◆▼)
- 13 BCG glossary 엔트리 활성화

**검증**: 단위 38/38 (35→38), 전체 514/514

### Iteration 3 — `db7701d` 음수 원가 식별
**문제 케이스** (사용자 dev 화면):
- 루비캡(흑녹색) 3.0mm*10m
- 매출 5,310,000 / 매출원가 **-6,119,344** / 매출총이익 11,429,344
- 매출총이익율 **215.24%** / 영업이익 9,765,048 / 영업이익율 **183.90%**
- "매출보다 영업이익 큰" 비현실적 숫자

**검증 결과** — 모든 산식 정확:
```
매출총이익 = 매출 - 매출원가 = 5,310,000 - (-6,119,344) = 11,429,344 ✓
매출총이익율 = 11,429,344 / 5,310,000 × 100 = 215.24% ✓
영업이익율 = 9,765,048 / 5,310,000 × 100 = 183.90% ✓
```
Root cause: **회계 분개 누적** — 환입·조정 분개가 출고 원가 초과 (raw에는 음수 0건, 필터 적용 누적 결과)

**알고리즘**:
- `BCGMatrixEntry.hasNegativeCost = totalCost < 0` 필드 추가
- `overallSummary.negativeCostCount` 신규

**UI 강화**:
- Custom Tooltip 음수 원가 시 빨간 warning 박스:
  > 🚨 매출원가 음수 (값) — 회계 분개 누적 결과
  > 기간/조직 필터 적용 시 환입·조정 분개가 출고 원가 초과
  > 매출총이익율 100% 초과 (값%) — 정상 비즈니스 마진 ❌. 회계팀 확인 필요
- 데이터 품질 정보 + segment 차트 하단 카운트

**검증**: 단위 40/40 (38→40 신규 음수 원가 3건), 전체 516/516

### Iteration 4 — `5b9704f` 자동 제외 + 3-way reconciliation
**사용자 핵심 지적**:
> "매출원가 마이너스인걸 더하면 이익이 마이너스여야지 어떻게 빼기빼기 해서 더하는게 수학상 맞아?"

**3-way reconciliation**:
| 관점 | 결론 |
|---|---|
| **수학** | `a − (−b) = a + b` — 정확 |
| **회계 산식** | `매출총이익 = 매출 − 매출원가` — 정확 |
| **비즈니스** | 매출원가 < 0 시 매출총이익 > 매출 → **비현실적** |

**결론**: 데이터 자체가 회계 이상. 알고리즘에서 anomaly를 평균 왜곡 없이 통계만 보여주는 게 정직.

**알고리즘 변경** (`productPortfolioMatrix.ts:340-347`):
```ts
const hasNegativeCost = agg.totalCost < 0;

// 음수 원가는 회계 데이터 이상 (수학적으로는 a - (-b) = a + b 정확하나
// 비즈니스 결과 비현실적: 매출 < 영업이익 발생). 차트에서 제외하고 통계만 카운트.
if (hasNegativeCost) {
  excludedNegativeCostItems++;
  continue; // 차트 entries에 추가 안 함
}
```
- `overallSummary.excludedNegativeCostItems` 신규
- `negativeCostCount`는 entries 기반이므로 자동 0 (중복 카운트 방지)

**UI 변경** (`PortfolioMatrixTab.tsx:156-164`):
빨간 박스 (반품매출 제외와 동일 톤) + 3-way reconciliation 명문화:
> 🚨 음수 원가 N건 분석에서 제외 (환입·조정 분개 누적)
> 매출원가 음수는 회계 데이터 이상 — 산식 (매출 - 매출원가)으로 계산하면 매출총이익이 매출보다 커지는 비현실적 결과 발생.
> 수학상 a − (−b) = a + b는 정확하나 비즈니스 의미 없음 → 차트에서 제외 + 별도 카운트만 표시. 회계팀에서 분개 검토 필요.

**Dead code 제거**: segment 차트 하단의 `negativeCostCount` 경고 (entries 비어있으므로 항상 0)

**단위 테스트 4건** (`productPortfolioMatrix.test.ts:311-376`):
1. 음수 원가 → 차트 자동 제외 + excludedNegativeCostItems=1
2. 정상 원가 → 차트 포함 + hasNegativeCost=false
3. 다중 segment 음수 원가 → excludedNegativeCostItems 누적, segment별 entries 분리 확인
4. **평균 왜곡 방지** — 정상 2건 (10%) + 음수 1건 (215%) 혼합 → 가중 마진 10%로 정확 (음수 제외 안 하면 수십% 왜곡)

**검증**: 단위 41/41 (40→41 평균 왜곡 케이스 추가), 전체 517/517, 빌드 0 errors

---

## 3. Check — Match Rate 100%

| 항목 | 베이스라인 (Phase B) | v2 최종 | 검증 방법 |
|---|---|---|---|
| 단위 테스트 (productPortfolioMatrix) | 29/29 | **41/41** | `npm test productPortfolioMatrix.test.ts` |
| 전체 테스트 | 505/505 | **517/517** | `npm test` |
| 빌드 errors | 0 | **0** | `npm run build` |
| 사용자 보고 이슈 (v2 범위) | 4건 | **0건** | dev 회귀 검증 (사용자 hover 확인) |
| 수학/회계/비즈니스 reconciliation 명문화 | ❌ | ✅ | UI 패널 + 테스트 명세 |
| 데이터 anomaly 자동 식별 | partial | ✅ (3종: zero/return/negative) | algorithm 단계 차단 |

**Match Rate 100%** — 모든 사용자 의문 해결, 회귀 0, 알고리즘+UI+테스트+문서 동기화 완료.

---

## 4. Act — 운영 학습 (Defensive Analytics 원칙)

본 v2 사이클에서 도출된 재사용 가능한 원칙:

### 원칙 1: 비즈니스 의미 없는 데이터는 사전 제외
- 0매출, 반품매출, 음수원가 — 모두 분석 단계에서 entries 진입 차단
- 차트의 평균/임계가 anomaly에 왜곡되지 않도록
- 통계 카운트로만 노출 → 회계팀 actionable signal

### 원칙 2: 수학적 정확 ≠ 비즈니스 정확
- 산식이 맞아도 결과가 비현실적이면 데이터 이상
- "왜?" 질문에 즉시 답변할 수 있도록 UI에 reconciliation 명문화
- 사용자 직관(business sense)을 알고리즘이 존중해야 신뢰 형성

### 원칙 3: Anomaly는 숨기지 말고 명시적으로 제외
- "조용히 보여주기" → 사용자 신뢰 훼손 (215% 본 사람은 다시 안 봄)
- "명시적 제외 + 카운트" → 사용자 confidence + 회계팀 follow-up

### 원칙 4: incremental iteration cycle (사용자 검증 driven)
- 30분 cycle: 사용자 검증 → 질문 → 즉시 해결 → 회귀 → commit
- 4회 iteration으로 큰 fix 1회보다 안정적 (511→514→516→517 monotonic)
- 각 commit이 독립 revert 가능

---

## 5. 파일 변경 통계 (Phase B 베이스라인 대비)

```
PortfolioMatrixTab.tsx              +278 LOC (Custom Tooltip + 3-way warning)
productPortfolioMatrix.test.ts      +180 LOC (12 신규 테스트)
productPortfolioMatrix.ts            +82 LOC (cost/grossProfit/hasMissing/hasNegative + 자동 제외)
glossary-portfolio.ts               +291 LOC (13 BCG 엔트리, 신규 파일)
glossary.ts                          +2 LOC (portfolioMetrics import)
─────────────────────────────────────────
Total                              +833 LOC, 5 files, 4 commits
```

| Commit | 단위 테스트 | 전체 | 핵심 |
|---|---|---|---|
| `ceeb813` | 35/35 | 511/511 | Custom Tooltip + hasMissingCost |
| `f2edb80` | 38/38 | 514/514 | grossProfit + 라벨 + MetricInfo |
| `db7701d` | 40/40 | 516/516 | hasNegativeCost 식별 |
| `5b9704f` | **41/41** | **517/517** | 자동 제외 + 3-way reconciliation |

---

## 6. 다음 단계 제안

| 우선순위 | 항목 | 트리거 |
|---|---|---|
| P1 | 회계팀 알림 — 미계상 4건 + 음수 원가 N건 분개 검토 요청 | 즉시 |
| P2 | Defensive Analytics 원칙을 다른 분석 모듈에 적용 (offsetEffect, profitRiskMatrix) | 운영 피드백 후 |
| P3 | MetricInfo glossary 자동 추출 — 423 KpiCard inline formula → CSV → glossary 이관 | Phase 4+ 점진 |
| P4 | 사용자 hover behavior 텔레메트리 (어느 품목에 가장 머무는지) | 운영 1개월 후 |

---

## 부록 — 사용자 검증 케이스 archive

| Case | 데이터 | Before (Phase B) | After (v2) |
|---|---|---|---|
| 마진 100% 다이아 | HD-40, 매출 2,753만, 원가 0 | 점만 표시, 의문 | 🚨 원가 미계상 — Tooltip + 카운트 |
| 215% 매출총이익율 | 루비캡, 매출 531만, 원가 -612만 | 차트에 그대로 표시 (왜곡) | **자동 제외** + 3-way 설명 패널 |
| 마진율 표기 모호 | 모든 ScatterChart | "마진율" 단일 표기 | "영업이익율" + 매출총이익율 분리 + MetricInfo |
| Tooltip 정보 부재 | hover 시 점만 | 좌표만 | 품목명+P&L 흐름+추세+warning |

---

> 검증 명령: `npm test && npm run build` → 517/517 + 0 errors
> 마지막 commit: `5b9704f` (2026-05-06)
> 베이스 보고서: [`product-portfolio-matrix.report.md`](./product-portfolio-matrix.report.md)
