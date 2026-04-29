# Silent Risk Detection — 조용한 위험 감지 모듈 Plan

**Workstream**: Phase v3 P2 후보 (보류 — 1-2개월 운영 후 재검토)
**작성일**: 2026-04-29
**상태**: 🟡 **계획만 수립 (구현 보류)** — Decision Gate D+60 (2026-06-28)
**Trigger 케이스**: 리본TS (Composite Score 43, "안전" 영역) — 정밀 분석 시 5대 조용한 위험 발견

---

## Executive Summary

| 축 | 내용 |
|---|---|
| **Problem** | 현행 Composite Risk Score는 점수 ≥70 거래처(대성/건진 등 *명백한 위험*)만 AlertPanel에 표시. 점수 40-69 영역은 "단가조정/안전"으로 분류돼 자동 알림 없음. **리본TS 정밀 검증 결과**: 점수 43임에도 (1) 출고 0원+미수만 잔존 거래정체, (2) Top1 품목 마진 0.1%, (3) 적자 품목 2건, (4) 매출 -13.8% 위축, (5) 장기연체 1,779만 — 5개 조용한 위험 동시 보유. 이런 *Slow Death* 패턴은 6개월 후 점수 70+로 진입하기 전까지 사각지대. |
| **Solution** | `silentRiskDetection.ts` 신규 — Composite Score와 직교한 5개 *Slow Death* 시그널 별도 산출: (1) **거래 정체 지수** (최근 3M 출고 / 직전 3M 출고), (2) **저마진 품목 비중** (Top N 매출 품목 중 마진 < 5% 비중), (3) **적자 품목 자동 감지** (마진 < 0% + 매출 비중 ≥ 5%), (4) **매출 추세 기울기** (선형 회귀 slope), (5) **무이익 출고 비중** (마진 < 1% 출고액 / 총 출고액). 각 시그널 0-100 점수 + Slow Death Composite (가중평균). 별도 탭 "조용한 위험" — 점수 40-69 거래처 자동 정렬. |
| **Function UX Effect** | NegotiationPriorityTab 옆에 **🐢 조용한 위험 탭** 신설. Slow Death Score Top 20 + 5개 시그널 분해 표시. 거래처 클릭 → 리본TS 제안서 같은 5대 이슈 자동 카드. **단가 시뮬레이터** (현재 마진 + X% 인상 시 신규 마진 + 연환산 추가이익) 인라인 표시. **Bulk PDF**: 조용한 위험 거래처 협상 카드 일괄 출력 (현행 NegotiationPriority와 동일 메커니즘 재활용). |
| **Core Value** | 자동화 범위를 점수 ≥70 (현재 알림 대상 ~5%)에서 점수 ≥40 (Slow Death 포함 ~15%)로 **3배 확장**. 리본TS 같은 케이스에서 사용자가 *수동으로 11개월 데이터 추출*해야 했던 작업이 1클릭. **단가 인상 시뮬레이션**으로 협상 카드의 *압박 강도 정량화*. 다만 임계값은 1-2개월 운영 데이터로 캘리브레이션 필요 — 그래서 지금은 계획만. |

---

## Context

### 왜 이 계획이 필요한가 — 리본TS 케이스

**기존 자동화의 사각지대**:
| 거래처 | Composite Score | 카테고리 | 자동 알림 | 실제 위험 |
|---|---|---|---|---|
| 대성이앤씨 | 75 | 회수+단가 | ✅ AlertPanel | High (방문 완료) |
| 건진케미컬 | 73 | 회수+단가 | ✅ AlertPanel | High (방문 완료) |
| 티아이브이건설 | 67 | 회수+단가 | ⚠ Top 정렬만 | High (신규 발견) |
| **리본TS** | **43** | **단가조정** | **❌ 미알림** | **🐢 Slow Death** |

리본TS 정밀 분석으로 확인된 5대 위험:
1. **출고 0원 정체** (6개월 연속) + 미수 1.51억 (한도 75.7%)
2. **Top 1 품목 마진 0.1%** (KP-NT 우레탄, 매출 21% 차지)
3. **적자 품목 2건** (Black EZone -4.6%, KP-H -1.2%)
4. **매출 -13.8%** (최근 3M vs 직전 3M)
5. **장기연체 1,779만** (작지만 회계 대손충당 검토 임박)

**현행 알고리즘이 놓치는 이유**:
- Composite Score 가중치는 *큰 숫자*에 민감 (미수 25점, 적자 25점, 장기연체 20점)
- 리본TS 미수 1.51억은 임계 50%로 부분 점수만 (vs 대성 5.7억)
- 마진 887만/2.26억 = 3.9%는 적자가 아니므로 deficit 시그널 0
- *Slow Death*는 *큰 숫자가 아니라 패턴* — 별도 시그널 체계 필요

### 의도한 결과

> 사용자가 매월 마감 직후 dashboard 진입 → AlertPanel(High Risk 5건) + 🐢 조용한 위험 탭(Slow Death 15건) → 두 그룹 통합 협상 카드 PDF 30초 출력. 리본TS 케이스에서 11개월 데이터 수동 추출 → Python 스크립트 작성에 30분 소요했던 작업이 **클릭 2회**.

---

## 변경 파일 (구현 시 추정)

| 파일 | 변경 성격 | LOC |
|---|---|---|
| `src/lib/analysis/silentRiskDetection.ts` | **신규** — 5개 시그널 + Slow Death Composite | +320 |
| `src/lib/analysis/silentRiskDetection.test.ts` | **신규** — 30+ 테스트 (시그널별 + 통합) | +220 |
| `src/lib/analysis/priceHikeSimulator.ts` | **신규** — 단가 인상 시뮬 (마진 변화 + 연환산 이익) | +120 |
| `src/lib/analysis/priceHikeSimulator.test.ts` | **신규** — 15+ 테스트 | +100 |
| `src/app/dashboard/receivables/tabs/SilentRiskTab.tsx` | **신규** — 🐢 탭 UI (Top N + 시그널 분해 + 단가 시뮬) | +280 |
| `src/components/dashboard/SilentRiskCard.tsx` | **신규** — 거래처 카드 (5대 이슈 자동 표시) | +180 |
| `src/app/dashboard/receivables/page.tsx` | 탭 추가 (NegotiationPriorityTab 옆) | +20 |
| `src/lib/analysis/customerCompositeRisk.ts` | `slowDeathScore?` 옵셔널 필드 추가 | +30 |
| `src/lib/analysis/negotiationMemoGenerator.ts` | Slow Death 카테고리 NLG 템플릿 추가 | +60 |
| `src/components/dashboard/PdfBulkExportButton.tsx` | Slow Death 카드 템플릿 (5대 이슈 형식) | +40 |
| `docs/01-plan/features/silent-risk-detection.plan.md` | 본 문서 | (이미 작성) |
| `docs/02-design/features/silent-risk-detection.design.md` | 구현 시점에 작성 | TBD |

**총 추정**: +1,370 LOC (모듈 5개 + UI 2개 + 통합 패치 4개)
**예상 공수**: 5-7 영업일 (테스트 포함)

---

## 재사용 자산 (Phase v3 누적)

| 자산 | 경로 | 활용 |
|---|---|---|
| `customerCompositeRisk.ts` | `src/lib/analysis/` | Slow Death Score 와 직교 결합 |
| `aggregateCustomerItemDetail` | `src/lib/utils.ts` | 거래처×품목 월별 집계 |
| `customerItemDetail` (100) | dataStore | 11~14개월 시계열 source |
| `receivableAging` | dataStore | 거래 정체 지수 입력 |
| `NegotiationPriorityTab.tsx` | `src/app/dashboard/receivables/tabs/` | 탭 UI 구조 패턴 |
| `negotiationMemoGenerator.ts` | `src/lib/analysis/` | NLG 템플릿 (Slow Death 카테고리 추가) |
| `PdfBulkExportButton.tsx` | `src/components/dashboard/` | Bulk PDF 메커니즘 (템플릿만 추가) |
| `MetricInfo` glossary | `src/lib/metrics/` | 5개 시그널 툴팁 (slow_death_score, stagnation_index 등) |
| `priceElasticity.ts` (WS4) | `src/lib/analysis/` | 단가 인상 시 수요 변화 결합 옵션 |

**재활용률 예상**: 75%+ (Phase v3 P0+P1+UX 자산 위에 박스만 추가)

---

## 핵심 알고리즘

### 시그널 1. 거래 정체 지수 (Stagnation Index)

```
입력: receivableAging (월별 출고/미수)
공식:
  recent_shipment = sum(shipment[2025-10..2025-12])
  prior_shipment  = sum(shipment[2025-07..2025-09])

  stagnation_ratio = recent_shipment / max(prior_shipment, 1)

점수:
  stagnation_ratio = 0   → 100점 (완전 정체)
  stagnation_ratio < 0.3 → 80점 (심각한 위축)
  stagnation_ratio < 0.7 → 50점 (위축 진행)
  stagnation_ratio ≥ 1.0 → 0점 (정상)

리본TS 적용: recent=0 / prior=0 → 분모 보호 → 100점
```

### 시그널 2. 저마진 품목 비중

```
입력: customerItemDetail (거래처별 품목 매출+마진)
공식:
  top_n_items = top 5 매출 품목
  low_margin_items = top_n_items 중 마진 < 5%
  low_margin_sales_share = sum(low_margin_items.sales) / sum(top_n_items.sales)

점수:
  share ≥ 0.6 → 100점 (Top 5의 60%+ 가 저마진)
  share ≥ 0.4 → 70점
  share ≥ 0.2 → 40점
  share < 0.2 → 0점

리본TS 적용: Top 5 = [4802만(0.1%), 2563만(5.4%), 2055만(6.9%), 1367만(4.0%), 1176만(29%)]
              저마진 (<5%) = [4802, 1367] = 6,169만 / 11,963만 = 51.6% → 70점
```

### 시그널 3. 적자 품목 비중

```
공식:
  loss_items = 마진 < 0% + 매출 비중 ≥ 5%
  loss_sales_share = sum(loss_items.sales) / sum(all_items.sales)

점수:
  share ≥ 0.2 → 100점
  share ≥ 0.1 → 60점
  share ≥ 0.05 → 30점
  share < 0.05 → 0점 (개수 가중치 별도)

리본TS 적용: 적자 품목 = [1069만 (-4.6%), 875만 (-1.2%)] = 1,944만 / 22,600만 = 8.6% → 60점
```

### 시그널 4. 매출 추세 기울기 (Sales Trend Slope)

```
입력: 월별 매출 시계열 (최소 6개월)
공식:
  selectedMonths = 최근 6개월
  slope = LinearRegression(selectedMonths).slope
  slope_pct = slope / mean(sales) * 100

점수:
  slope_pct ≤ -20% → 100점 (급격 감소)
  slope_pct ≤ -10% → 70점
  slope_pct ≤  -5% → 40점
  slope_pct >    0% → 0점

리본TS 적용: -13.8% (3M Δ) → 회귀 slope 환산 → 약 -10% → 70점
```

### 시그널 5. 무이익 출고 비중 (Zero-Margin Volume)

```
공식:
  zero_margin_sales = sum(items where margin < 1%)
  zero_margin_share = zero_margin_sales / total_sales

점수:
  share ≥ 0.5 → 100점 (절반 이상이 무이익)
  share ≥ 0.3 → 70점
  share ≥ 0.15 → 40점
  share < 0.15 → 0점

리본TS 적용: <1% 마진 품목 = KP-NT(0.1%) + 우레탄프라이머(1.0%) = 5,975만 / 22,600만 = 26.4% → 40점
```

### Slow Death Composite

```
SDS = 0.30 * stagnation
    + 0.25 * lowMargin
    + 0.20 * loss
    + 0.15 * trendSlope
    + 0.10 * zeroMarginVolume

리본TS 적용:
  = 0.30*100 + 0.25*70 + 0.20*60 + 0.15*70 + 0.10*40
  = 30 + 17.5 + 12 + 10.5 + 4
  = 74점 → AlertPanel 진입 임계 (≥70)

→ 즉, Slow Death 별도 점수로 보면 리본TS는 "위험" 등급으로 자동 분류됨.
```

---

## 단가 인상 시뮬레이터 (priceHikeSimulator)

```typescript
interface PriceHikeScenario {
  itemCode: string;
  currentSales: number;
  currentMargin: number;
  currentMarginPct: number;
  hikePct: number;          // 0.03 = 3%
  // 출력
  newSales: number;          // 인상 후 매출 (수요 변화 미고려 시)
  newMargin: number;         // 인상 후 마진
  newMarginPct: number;      // 인상 후 마진율
  monthlyDelta: number;      // 월 추가 영업이익
  annualDelta: number;       // 연환산 추가 영업이익
  breakEvenHikePct?: number; // 흑자 전환에 필요한 최소 인상률 (적자 품목만)
}

// 옵션: WS4 가격탄력성 결합
function simulateWithElasticity(
  scenario: PriceHikeScenario,
  ped: number  // 가격탄력 (음수)
): PriceHikeScenario {
  const demandDelta = scenario.hikePct * ped;
  // newSales는 (1+hikePct) * (1+demandDelta) 결합
  ...
}
```

리본TS 시뮬 결과 자동 생성 (제안서에 작성한 시나리오 A/B/C와 동일):
- KP-NT +3% → 연 +157만
- 적자품 2종 +5% → 연 +93만
- 합계 → 연 +250만 (=11M 누적 887만의 28% 증가)

---

## UI 와이어프레임 (개념)

```
┌─ 채권 페이지 탭 ─────────────────────────────────────────┐
│ [현황] [리스크] [여신] [DSO/CCC] [채권 상세] [장기 미수]│
│ [선수금] [담당자 인사이트] [수금지연]                    │
│ [🚨 협상 우선순위] [🐢 조용한 위험 ◀ NEW]               │
└─────────────────────────────────────────────────────────┘

┌─ 🐢 조용한 위험 탭 ─────────────────────────────────────┐
│  Slow Death Score 임계: [70 ━━○━━━━] (드래그)          │
│                                                          │
│  Top 15 거래처 (Slow Death Score 순)                    │
│  ┌────────────────────────────────────────────────────┐ │
│  │ ☐ 리본TS                              74점 🐢      │ │
│  │   정체:100 / 저마진:70 / 적자:60 / 추세:70 / 무이익:40│
│  │   미수 1.51억 / 한도 75.7% / Top1 마진 0.1%        │ │
│  │   ▼ 클릭 → 5대 이슈 + 단가 시뮬 + 협상 멘트         │ │
│  └────────────────────────────────────────────────────┘ │
│  ☐ ___                                  68점          │ │
│  ☐ ___                                  62점          │ │
│  ...                                                     │
│                                                          │
│  [선택 항목 PDF 일괄 출력] (현행 메커니즘 재활용)        │
└─────────────────────────────────────────────────────────┘
```

---

## Out of Scope (명시적 제외)

| 항목 | 제외 사유 |
|---|---|
| Composite Score 알고리즘 변경 | 기존 P0 자산 영향 차단 — 직교 신호로 분리 |
| AlertPanel 통합 | 알림 폭증 우려 — Slow Death는 별도 탭만, 알림은 ≥70만 유지 |
| 자동 단가 인상 권고 메일 발송 | 협상은 사람의 영역 — 시뮬 데이터만 제공 |
| 12개월 자동 시뮬 (WS7 통합) | 1차 구현은 단일 시점만, 통합은 P3 검토 |
| 가격탄력성(WS4) 자동 결합 | 옵셔널 — 사용자가 토글로 활성 |
| 공급중단 자동 트리거 | 의사결정은 사람의 영역 |

---

## Acceptance Criteria

| # | 기준 | 검증 방법 |
|---|---|---|
| 1 | 5개 시그널 함수 단위 테스트 100% 통과 | `npm run test silentRiskDetection` |
| 2 | Slow Death Composite 정확성 (리본TS 케이스 74±5점) | 단위 테스트 + dry-run 비교 |
| 3 | 🐢 탭 진입 1초 이내 (558 거래처 처리) | Performance.measure |
| 4 | 단가 시뮬 결과 = Python dry-run 결과 ±1% 오차 | scripts/dry-run-silent-risk.py 비교 |
| 5 | Bulk PDF 출력 30초 이내 (10건) | 사용자 stopwatch |
| 6 | Composite Score ≥70 거래처는 🐢 탭에서 제외 (중복 방지) | UI 검증 |
| 7 | 임계값(시그널별)이 사용자 슬라이더로 조정 가능 | UI 검증 |

**Match Rate 목표**: 100% (사용자 피드백: "Match Rate 90% 기준 절대 불가, 100% 필수")

---

## Risks & Mitigations

| 리스크 | 영향 | 완화책 |
|---|---|---|
| **임계값이 잘못 캘리브레이션** | 거짓양성/거짓음성 폭증 | 1-2개월 운영 데이터 → 사용자 수동 검토 결과 → 임계값 학습 후 구현 |
| **558 거래처 × 11M 시계열 처리 지연** | UI freeze | useMemo + Web Worker 옵션 검토 |
| **Composite Score와 신호 충돌** | 사용자 혼란 | 직교 신호임을 UI 명시 ("이 점수는 Composite Risk와 다른 시그널입니다") |
| **PDF 템플릿 추가 → 기존 양식 회귀** | 신뢰 손실 | E2E 테스트 + 기존 4건 (구산/티아이브이/유현/세광) PDF 회귀 검증 |
| **Slow Death 알림으로 사용자 피로** | 자동화 가치 하락 | AlertPanel 통합 안 함 — 탭 클릭 진입 only |

---

## Decision Gate (구현 트리거)

본 계획은 **D+60 (2026-06-28) P2 우선순위 재결정 시점에 활성화 여부 결정**.

### Go 조건 (4개 중 3개 이상)

- [ ] D+30 dry-run에서 Slow Death 패턴 거래처 ≥ 10건 확인 (운영-추적-템플릿 §2.2 결과)
- [ ] 사용자가 운영 중 "수동으로 점수 40-69 거래처 정밀 분석" 횟수 ≥ 3회
- [ ] 운영-추적-템플릿 §3.1 "P2 후보 A (자동 협상 시뮬)" 평가 = 🟢 (실제 가치 높음)
- [ ] 단가 인상 시뮬 결과를 협상에 실제 사용한 사례 ≥ 2건

### No-Go 조건

- 운영 1-2개월간 Slow Death 패턴 거래처 < 5건 (수요 부족)
- 사용자가 점수 ≥70 알림만으로 충분하다고 평가
- 기존 NegotiationPriorityTab Top 15 정렬로 이미 발견 가능

### Re-evaluation 조건

- 신규 데이터 소스 추가 (예: CRM 통합) → Slow Death 시그널 정확도 향상 가능 시 재검토
- 회수율 / 대손충당 비율 악화 → 자동화 우선순위 상승

---

## Implementation Roadmap (Go 결정 시)

| 단계 | 산출물 | 예상 일수 |
|---|---|---|
| **Day 0** | `/pdca design silent-risk-detection` 실행 → 설계서 작성 | 1일 |
| **Day 1-2** | `silentRiskDetection.ts` + 30 테스트 (5개 시그널 함수) | 2일 |
| **Day 3** | `priceHikeSimulator.ts` + 15 테스트 | 1일 |
| **Day 4-5** | `SilentRiskTab.tsx` + `SilentRiskCard.tsx` + 통합 | 2일 |
| **Day 6** | NLG 템플릿 추가 + PDF 템플릿 추가 + 회귀 검증 | 1일 |
| **Day 7** | dry-run 검증 + Match Rate 100% 도달 + 사용자 검수 | 1일 |
| **합계** | 7 영업일 (1주일) | — |

---

## 참조 자료

| 자료 | 경로 | 용도 |
|---|---|---|
| 리본TS 정밀 분석 | `docs/03-analysis/채권방문-리본TS-제안서-2026-04-29.md` | Trigger 케이스 + 5대 이슈 출처 |
| 운영 추적 템플릿 | `docs/03-analysis/운영-추적-템플릿-2026-04-29.md` | Decision Gate D+60 데이터 source |
| Phase v3 dry-run 검증 | `docs/03-analysis/phase-v3-dry-run-report-2026-04-29.md` | Composite Score 사각지대 증거 |
| 신규 위험 협상 카드 | `docs/03-analysis/채권방문-신규위험4건-협상카드-2026-04-29.md` | NLG/PDF 템플릿 패턴 reference |
| Composite Risk 알고리즘 | `src/lib/analysis/customerCompositeRisk.ts` | 직교 신호 설계 baseline |
| Python 검증 스크립트 | `scripts/customer-visit-ribbon.py` | 알고리즘 1:1 포팅 검증용 |

---

## Status & Next Action

**현재 상태**: 🟡 **계획만 수립 (구현 보류)**
**다음 액션**: D+60 (2026-06-28) 운영 추적 템플릿 §3.1 결과 기반으로 Go/No-Go 결정
**구현 시작 트리거**: 위 Decision Gate "Go 조건 4개 중 3개 이상 만족" 시 `/pdca design silent-risk-detection`

---

**작성**: 2026-04-29 — 리본TS 정밀 분석 결과로 발견된 자동화 사각지대를 정리한 보류 계획서
