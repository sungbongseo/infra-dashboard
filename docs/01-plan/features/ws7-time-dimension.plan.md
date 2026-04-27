# WS7 — 시간 차원 (12개월 롤링 + 학습곡선) Plan

**Workstream**: v2 Phase C · WS7 (Phase C 두 번째)
**작성일**: 2026-04-27
**목표 Match Rate**: 95%+
**참조**: `~/.claude/plans/reactive-leaping-backus.md` v2.1

## Executive Summary

| 축 | 내용 |
|---|---|
| **Problem** | 현재 모델은 **t=0 단일 스냅샷** 시뮬레이션. "초기 6개월 손실 → 후반 6개월 학습곡선으로 흑자 전환" 같은 시간 차원 시나리오 평가 불가. 원가 인상 3-6개월 지연(구매 선행 → 실제 impact)이 모델 부재. 계절성·할인율(NPV) 미반영. McKinsey D축(확률론) 75%이지만 시간 차원이 빠져 정밀도 한계. |
| **Solution** | `timeSeriesSimulation.ts` 신규 — 12개월 월별 시뮬레이션 엔진. **Wright 학습곡선** (누적량 2배 → 단위VC -10%~-20%), **원가 인상 지연** (3개월 lag), **계절성** (timeSeriesDecomposition 재활용), **NPV 할인** (월 0.5% 기본, 사용자 조정). 누적 효과 + 손익분기 시점 자동 산출. |
| **Function UX Effect** | 판단기에 **🕒 12개월 시뮬** 토글. 활성 시 월별 waterfall(12 막대) + 누적 NPV 라인차트. "초기 3개월 손실 -2,100만, 6개월차 BEP 도달, 12개월 누적 +5,800만" 같은 동적 인사이트. 학습률 슬라이더(80~95%) 수동 조정. |
| **Core Value** | McKinsey D축 75→**90%** (+15%p). 시간 차원이 모든 다른 축의 정밀도를 향상(A·B·C 결정도 12개월 내에서 검증). Phase C 2/3 완료, McKinsey ~80%. WS8 카니발라이제이션만 남김. 경영진에 "단기 vs 장기" 의사결정 프레임 도입 — McKinsey 95% 도달의 마지막 3대 자산 중 하나. |

## Context

**왜 지금?**
- WS6 완료로 6/6 축 50%+ 달성. 시간 차원이 다음 도약점
- v2.1 Data Validation: 14개월 데이터 확보 → 학습곡선·계절성 추출 충분
- 기존 모듈(`timeSeriesDecomposition`, `forecast`) 재활용 ROI 큼
- 영업/재무 의사결정자가 "이 결정 1년 후엔?"을 직관적으로 묻는 빈도 높음

**의도한 결과**:
판단기에서 "단독 결정 +6,319만"이 **12개월 NPV로 +5,800만 (BEP 6개월차)**로 확장되어 표시. 학습곡선 가정과 원가 지연이 자동 반영되어 "단기 적자 → 장기 흑자" 시나리오를 즉답.

## 변경 파일

| 파일 | 변경 성격 | LOC |
|---|---|---|
| `src/lib/analysis/timeSeriesSimulation.ts` | **신규** — Wright 학습곡선 + costLag + 계절성 + NPV | +250 |
| `src/lib/analysis/timeSeriesSimulation.test.ts` | **신규** — 22 테스트 | +160 |
| `src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx` | 12개월 waterfall + 누적 NPV 차트 + 토글 | +110 |
| (옵션) `glossary-profitability.ts` | `learning_curve`, `npv_cumulative` 엔트리 | +20 |

**총 추정**: +520 LOC (Plan v2.1 +400 추정 +30%. 이유: NPV + 계절성 통합 +60, waterfall + line chart 동시 표시 +60)

## 재사용 자산 (Phase A/B/C 누적 자산 활용)

| 자산 | 경로 | WS7 활용 |
|---|---|---|
| `decomposeTimeSeries` | `timeSeriesDecomposition.ts:28` | 14개월 매출 데이터에서 계절성 패턴 12개월 factor 추출 |
| `calcMonthlySalesTotals` | `forecast.ts:34` | 월별 합산 유틸 |
| `calcSalesForecast` | `forecast.ts:191` | baseline trend 추정 (옵션) |
| `applyPED` (WS4) | `priceElasticity.ts:256` | 월별 수량 반응 |
| `calcCompetitorResponse` (WS6) | `competitorResponse.ts:64` | 시장 균형 변화의 시간 분포 (선택) |
| `calcCustomerLTVImpact` (WS5) | `customerLTV.ts:74` | 12개월 누적 후 LTV 가산 |
| Recharts ComposedChart | 기존 chart 패턴 | 12 막대 + NPV 라인 결합 |

**재활용률 예상**: 75%+ (Phase A/B/C 누적 효과)

## 핵심 알고리즘

### 1. Wright 학습곡선

```
unitVC_t = unitVC_0 × (cumQty_t / cumQty_0) ^ log2(learningRate)

학습률 r=0.85 (85%): 누적량 2배 → 단위VC 15% 감소
학습률 r=0.90 (90%): 누적량 2배 → 단위VC 10% 감소
학습률 r=1.00 (100%): 학습 없음 (현재 모델)
```

### 2. 원가 인상 지연 (costLag)

```
입력: 원가 인상률 +5%, lag = 3개월
적용: t<3 → 인상 0%, t=3 → +1.67%, t=4 → +3.33%, t≥5 → +5%
       (선형 ramp-up 3개월)
```

### 3. 계절성 적용

```
seasonalPattern[m] = decomposeTimeSeries 결과에서 추출 (1~12월)
월별 baseQty_m = baseQty_avg × seasonalPattern[m]
→ 매출 패턴이 7-8월 비수기, 11-12월 성수기 등 자동 반영
```

### 4. NPV 누적

```
discountRate = 0.005 (월 0.5%, 연 ~6%)
NPV_t = Σ(monthly_effect_t / (1 + discountRate)^t)  for t=0..11
BEP_month = min t where Σ_{0..t} ≥ 0
```

### 5. 출력 구조

```ts
interface TimeSeriesSimulationResult {
  months: Array<{
    month: string;        // YYYYMM 또는 t+1, t+2...
    revenue: number;
    variableCost: number;  // 학습곡선 + lag 반영
    profit: number;        // 월별 손익
    cumulativeProfit: number;
    npvCumulative: number;
    learningCurveFactor: number;  // 학습 진행도 표시
  }>;
  totalNPV: number;
  bepMonth: number | null;        // 손익분기 시점 (null = 도달 안 함)
  finalCumulative: number;
  notes: string[];
}
```

## UI 통합 (12개월 waterfall + NPV 라인)

```
🕒 12개월 시뮬레이션 (학습곡선 85% · 원가 lag 3M · 할인율 6%/년)
┌─ Waterfall (월별 손익) ─┬─ NPV 라인 (누적) ─┐
│ ▂▃▅▇█▇▆▅▄▃▂▂            │     ╱─────         │
│ M1 M3 M5 M7 M9 M11       │  ╱─               │
└──────────────────────────┴────────────────────┘
BEP: 6개월차 · 12개월 NPV: +5,800만 · 단순합계 +6,319만
```

## Verification

### 단위 테스트 (22개 예상)
1. Wright 공식 — 학습률 100% (효과 없음), 85% (15% 감소), 50% (50% 감소)
2. costLag — 0개월(즉시), 3개월(ramp), 12개월(미반영)
3. 계절성 — 7월 비수기, 11월 성수기 패턴 적용
4. NPV — 할인율 0% (단순 합계와 동일), 6%/년 (감소)
5. BEP — 도달 / 미도달 / 시작부터 흑자
6. 누적 합산 정확성 (12개 월별 합 = 최종)
7. PED 재사용 일치 (WS4)
8. 음수 baseQty 방어
9. 학습률 클램핑 [0.5, 1.0]
10. 14개월 데이터 → 12 시뮬 정상 매핑

### 빌드/회귀
- `useTimeSeries?` 옵셔널 → Phase A/B/C 동작 그대로
- 토글 OFF (기본) → 기존 단일 스냅샷 시뮬

## 성공 판정 기준

- [ ] 12개월 시뮬 결과 합계 ≈ 단순 12배 단일 시뮬 (학습+lag 효과만큼 차이)
- [ ] 학습률 0.85 시뮬에서 12월차 단위VC가 1월차 대비 약 5-10% 감소 확인
- [ ] 22 단위 테스트 전원 통과
- [ ] BEP 시점 표시 작동 (성공/실패 양 케이스)
- [ ] NPV 라인차트 + waterfall 막대 동시 시각화

## 회귀 방어

| 항목 | 보장 |
|---|---|
| `useTimeSeries=false` 기본 | Phase A/B/C 동작 그대로 |
| 옵셔널 props 패턴 | WS1/WS4/WS6와 동일 |
| 기존 차트 무변경 | 12개월 차트는 별도 영역 |
| 모듈 독립성 | timeSeriesSimulation는 offsetEffect 의존 X (PED·costEffect 패러미터로 전달) |

## 범위 외

- **외생 변수 영향 (환율 변동·원자재 선물)** — Phase v3
- **계약 갱신 주기 외부 입력** — WS5에서 이미 처리
- **24개월+ 시뮬** — 14개월 데이터로 신뢰도 한계
- **다중 시나리오 동시 비교** — WS6 스타일 프리셋은 향후 사이클

## 리스크와 완화

| 리스크 | 가능성 | 완화 |
|---|---|---|
| 학습률 가정 (0.85) 부정확 | 중-상 | UI에 슬라이더 노출, 기본값 + 사용자 조정 |
| costLag 3개월 가정 | 중 | 슬라이더 0-12개월 |
| 계절성 14M 데이터로는 약함 | 중 | "데이터 한계" 배지, 24M+ 누적 후 향상 |
| 12 월별 막대 + NPV 라인 = 차트 복잡도 | 낮음 | Recharts ComposedChart 표준 패턴 |
| 사용자 NPV 개념 부족 | 중 | MetricInfo 툴팁에 "할인율 = 자본비용" 비유 |

## 예상 영향

- **LOC**: +520 (Plan +400 추정 +30%)
- **McKinsey D축**: 75% → **90%** (+15%p, Phase C에서 D축 마지막 정밀화)
- **McKinsey 전체**: ~70% → **~80%** (+10%p)
- **WS8 자산**: 12개월 매트릭스가 카니발라이제이션 시계열에도 재활용
- **Phase C 진행률**: 2/3 완료 (WS8만 남음 → 95% 도달)

## 다음 단계 (Plan 승인 후)

1. `/pdca do ws7-time-dimension` 또는 바로 구현 착수
2. Match Rate ≥ 95% 후 Gap 분석 + Report
3. **WS8 카니발라이제이션** (마지막 WS) → McKinsey 95% 달성
