# WS8 — 카니발라이제이션 (자기잠식 + 포트폴리오 순효과) Plan

**Workstream**: v2 Phase C · WS8 (Phase C 마지막 — McKinsey 95% 도달 자산)
**작성일**: 2026-04-27
**목표 Match Rate**: 95%+
**참조**: `~/.claude/plans/reactive-leaping-backus.md` v2.1 + WS6/WS7 패턴

## Executive Summary

| 축 | 내용 |
|---|---|
| **Problem** | 저가수주 판단기는 **단일 품목×거래처 결정의 직접 효과**만 평가. "Item A 가격 인하 → 같은 거래처 Item B 매출 잠식" 같은 **포트폴리오 내부 잠식**이 모델 부재. McKinsey E축(포트폴리오) 50%로 가장 약함. 14M 거래처×품목 시계열을 갖고 있으면서도 상관 관계를 미활용. 영업 현장 질문 "이거 인하하면 우리 다른 품목 매출 빠지지 않나?" 미해결. |
| **Solution** | `cannibalization.ts` 신규 — **거래처×품목 14개월 시계열에서 Pearson 상관계수 매트릭스** 추출. 같은 거래처 내 품목 쌍 (A,B)에 대해 음의 상관 = 잠식 가능성. **카니발 계수 c_ij** 산출(Item j 매출 -1% 시 Item i 매출 변화율). **대분류 동일 + 음의 상관**을 잠식 시그널로 가중. 시뮬레이션에 적용: 단독 결정 결과를 **포트폴리오 순효과로 재계산** (자기잠식 손실 차감). 3 프리셋(약함/중간/강함) + 사용자 슬라이더. |
| **Function UX Effect** | 판단기에 **🔄 카니발라이제이션 토글** + 3 프리셋 버튼. 활성 시 **단독 결정 vs 포트폴리오 보정** △ 비교: "단독 +6,319만 → 자기잠식 -1,319만 → **포트폴리오 순효과 +5,000만**". 잠식 위험 Top-N 품목 리스트 + 거래처×품목 잠식 강도 heatmap. WS7 12M 시뮬에 통합 시 12M 누적 잠식 손실까지 자동 산출. |
| **Core Value** | McKinsey E축 50→**85%** (+35%p, Phase C 최대 도약). F축(공학적 제약)도 부분 향상 48→55% (포트폴리오 capacity 동시 평가). **McKinsey 전체 ~80% → ~95% 달성** ✅. Phase C 종료 자산. 경영진 의사결정에 "포트폴리오 관점" 도입 — 단일 품목 최적이 회사 전체 최적이 아님을 정량화. |

## Context

**왜 지금?**
- WS7 완료로 D축 90% + 시간 차원 자산 확보. Phase C 마지막 1/3
- **데이터 풍부**: `100.거래처별품목별손익` (14M × 거래처 × 품목) + `304.본부거래처품목손익` + 200 품목 계층 = 카니발 분석 데이터 완비
- 기존 `customerItemAnalysis.ts` (crossProfitability, ABC 매트릭스) 자산 재활용 가능
- WS7 12M 매트릭스 패턴이 이미 구축되어 카니발 시계열 통합 자연스러움
- McKinsey 95% 도달의 **마지막 단일 자산** — Phase C 완료 = 도약 종료

**의도한 결과**:
판단기에서 "단독 결정 +6,319만"이 자동으로 **"단독 +6,319만 / 자기잠식 -1,319만 / 순효과 +5,000만 / 12M NPV +4,200만"** 4단 분석으로 확장. 잠식 위험 Top-3 품목 + 위험도 점수가 동일 화면에 표시. 의사결정자는 "이 결정이 진짜 +인가?"를 포트폴리오 관점에서 즉답.

## 변경 파일

| 파일 | 변경 성격 | LOC |
|---|---|---|
| `src/lib/analysis/cannibalization.ts` | **신규** — Pearson 상관 매트릭스 + 카니발 계수 + 카테고리 가중 + 시뮬 통합 | +280 |
| `src/lib/analysis/cannibalization.test.ts` | **신규** — 25 테스트 | +180 |
| `src/lib/analysis/offsetEffect.ts` | `calcTotalViewSimulation`에 `cannibalCorrection?` + 후처리 옵션 | +30 |
| `src/app/dashboard/profitability/tabs/OffsetEffectTab.tsx` | 카니발 토글 + 3 프리셋 + 잠식 heatmap + Top-N 리스트 + △ 비교 | +130 |
| (옵션) `glossary-profitability.ts` | `cannibalization`, `portfolio_net_effect`, `cannibal_rate` 3 엔트리 | +25 |

**총 추정**: +645 LOC (Plan v2.1 +500 추정 +29%. 이유: heatmap + Top-N 리스트 + WS7 12M 통합 +145 LOC. WS7 +485 실측 대비 큰 폭 — 매트릭스 시각화 비용)

## 재사용 자산 (Phase A/B/C 누적 자산 활용)

| 자산 | 경로 | WS8 활용 |
|---|---|---|
| `calcCrossProfitability` | `customerItemAnalysis.ts:19` | 거래처×품목 매출 매트릭스 baseline |
| `calcItemHierarchy` | `itemHierarchy.ts` | 대분류 동일 여부 → 잠식 가능성 가중 |
| `customerItemDetail` (100) | dataStore | 14M 시계열 source |
| `aggregateCustomerItemDetail` | `lib/utils.ts` | 월별 → 거래처×품목 집계 |
| `calcTimeSeriesSimulation` (WS7) | `timeSeriesSimulation.ts` | 12M 누적 잠식 손실 NPV 계산 |
| `applyPED` (WS4) | `priceElasticity.ts:256` | 카니발 효과 + 가격탄력 결합 |
| `MetricInfo` glossary | `lib/metrics/` | 카니발 계수 툴팁 |
| `costChangePct`, `usePED` 옵셔널 패턴 | offsetEffect.ts | `cannibalCorrection?` 동일 패턴 |
| Recharts ResponsiveContainer + Tooltip 패턴 | OffsetEffectTab | heatmap도 동일 컨테이너 |

**재활용률 예상**: 80%+ (Phase A/B/C 누적 효과 정점)

## 핵심 알고리즘

### 1. 거래처×품목 시계열 매트릭스

```
입력: customerItemDetail (100, 14개월)
1단계: 거래처별로 그룹화
2단계: 각 거래처에서 품목별 월별 매출 시계열 추출
       Series_customer_item = [m1, m2, ..., m14]
3단계: 거래처 c 안에서 품목 쌍 (A, B) 모든 조합
       (단, 매출 발생 월 ≥ 4개 이상인 쌍만 — 신뢰도 확보)
```

### 2. Pearson 상관계수

```
ρ_AB = Σ((A_t - μ_A)(B_t - μ_B)) / sqrt(Σ(A_t - μ_A)² × Σ(B_t - μ_B)²)

ρ < -0.3: 강한 음의 상관 → 잠식 가능성 높음
-0.3 ≤ ρ < 0:  약한 음의 상관 → 잠식 가능성 있음
0 ≤ ρ < 0.3:  중립
ρ ≥ 0.3:       양의 상관 → 보완재 가능성
```

### 3. 카니발 계수 (cannibalRate) — elasticity-weighted

```
선형 회귀 기울기 β:
  β_AB = Cov(A, B) / Var(B)
       = "B 매출 1단위 증가 시 A 매출 평균 변화량"

무차원 탄력성 ε:
  ε_AB = β_AB × mean(B) / mean(A)
       = "B 매출이 1% 증가할 때 A 매출의 % 변화"
       (β/mean(A)만으로는 1/won 단위라 dimensionally 부정확)

정규화 카니발 계수 c_AB ∈ [0, 1]:
  c_raw = max(0, -ρ_AB × |ε_AB|)
        (음의 상관일 때만 활성, 탄력성 크기로 가중)

대분류 동일 보정:
  if sameCategory(A, B): c_raw *= 1.5  (같은 카테고리는 잠식 가능성↑)
  c_AB = min(1, c_raw)
```

### 4. 시뮬레이션 적용 (단독 → 포트폴리오 순효과)

```
입력: 단독 시뮬 결과 (target item에 대한 결정 효과)
       targetItem, deltaQty (수량 변화), deltaSales (매출 변화)

각 다른 품목 i에 대해:
  잠식 손실 i = c_i_target × (deltaQty / baseQty_target) × baseSales_i × (-1)
              (target 매출 +X% → item i 매출 -c × X%)
  
포트폴리오 순효과 = 단독 효과 + Σ(잠식 손실_i)
                  = 단독 효과 - 자기잠식 합계
```

### 5. 3 프리셋 시나리오

```ts
type CannibalScenario = "weak" | "medium" | "strong";

const PRESETS: Record<CannibalScenario, { multiplier: number; label: string; description: string }> = {
  weak:   { multiplier: 0.5, label: "약한 잠식",   description: "데이터 상관의 50% 적용 (보수적)" },
  medium: { multiplier: 1.0, label: "중간 잠식",   description: "데이터 상관 그대로 적용 (기본)" },
  strong: { multiplier: 1.5, label: "강한 잠식",   description: "데이터 상관의 150% 적용 (비관적)" },
};
```

### 6. 출력 구조

```ts
interface CannibalizationResult {
  matrix: Array<{
    itemA: string;          // 품목 코드
    itemAName: string;      // 품목명
    itemB: string;
    itemBName: string;
    correlation: number;    // Pearson [-1, 1]
    cannibalRate: number;   // [0, 1] 정규화된 잠식 계수
    sameCategory: boolean;  // 대분류 동일?
    sampleMonths: number;   // 동시 발생 월 수
    confidenceLevel: "high" | "medium" | "low";  // 샘플 크기 기반
  }>;
  itemRiskScores: Array<{
    item: string;
    itemName: string;
    inboundRisk: number;    // 다른 품목으로부터 잠식당할 가능성 합계
    outboundRisk: number;   // 다른 품목을 잠식할 가능성 합계
  }>;
  netImpact: {
    aloneEffect: number;       // 단독 결정 효과
    cannibalLoss: number;      // 자기잠식 손실 (음수)
    portfolioNet: number;      // 포트폴리오 순효과
    cannibalizedTopN: Array<{  // 잠식되는 Top-5 품목
      item: string;
      itemName: string;
      expectedLoss: number;
    }>;
  };
  notes: string[];
}
```

## UI 통합 (3 프리셋 + heatmap + Top-N 리스트 + △ 비교)

```
🔄 카니발라이제이션 (포트폴리오 보정)
┌──────────┬──────────┬──────────┐
│ 약한 잠식 │ 중간 잠식 │ 강한 잠식 │  ← 클릭 토글
└──────────┴──────────┴──────────┘
잠식 강도: [════════] 100% (수동 조정 0~200%)

┌─ 잠식 매트릭스 (Top 15 × 15) ─────────────────┐
│         Item1 Item2 Item3 ... (heatmap 색상)   │
│  Item1  ░░░  ███  ░░░ ...                      │
│  Item2  ███  ░░░  ▒▒▒ ...                      │
│  ...                                           │
└────────────────────────────────────────────────┘

📊 효과 분해
┌──────────────┬───────────────┐
│ 단독 결정     │ +6,319만      │
│ 자기잠식      │ -1,319만 (▼)  │
│ 포트폴리오 순 │ +5,000만 (=)  │
│ 12M NPV (WS7) │ +4,200만      │
└──────────────┴───────────────┘

⚠️ 잠식되는 Top-3 품목
1. ItemX  -520만 (대분류 동일·강한 음의 상관)
2. ItemY  -380만 (같은 거래처 빈번 동시 거래)
3. ItemZ  -290만 (보완재로 추정 — 잠식 약함)
```

## Verification

### 단위 테스트 (25개 예상)

1. **Pearson 상관**: 완전 양의 상관 (+1), 완전 음의 상관 (-1), 무상관 (0)
2. **카니발 계수**: 양의 상관 시 c=0, 강한 음의 상관 시 c→1
3. **대분류 동일 보정**: 같은 카테고리 = 1.5배 보정 + 클램핑
4. **샘플 크기 임계**: 동시 발생 월 < 4 → 매트릭스 제외
5. **포트폴리오 순효과**: 단독 효과 - Σ(잠식 손실) = 출력값
6. **3 프리셋 multiplier**: 0.5/1.0/1.5 정확히 적용
7. **음수 baseQty 방어**: 0/음수 입력 시 c=0
8. **inbound/outbound risk 합계**: 매트릭스 모든 셀 합 ≡ 모든 품목 risk 합
9. **WS7 통합**: 12M 시뮬에 카니발 적용 시 누적 NPV 일관성
10. **거래처 분리**: 거래처 1과 거래처 2의 상관은 별개 계산
11. **신뢰도 레벨**: 4M (low) / 8M (medium) / 12M+ (high) 분류
12. **NaN 방어**: 분산 0 시리즈 (전월 동일) → 상관 무효 처리
13. **빈 데이터**: customerItemDetail 없을 때 빈 매트릭스 반환
14. **양의 상관 처리**: ρ > 0.3 → 보완재로 분류, 잠식 0
15. **PED 통합**: applyPED와 카니발 동시 적용 시 순서 일관성

### 빌드/회귀

- `useCannibalization?` 옵셔널 → Phase A/B/C/WS7 동작 그대로
- 토글 OFF (기본) → 기존 단독/12M 시뮬 그대로
- 매트릭스 무거우면 Top-15 품목 한정 (성능)

## 성공 판정 기준

- [ ] 25 단위 테스트 전원 통과 (378 → 403)
- [ ] 같은 거래처 14M 데이터에서 카니발 매트릭스 추출 정상
- [ ] 단독 효과 vs 포트폴리오 순효과 △ 표시 작동
- [ ] heatmap + Top-N 리스트 동시 시각화
- [ ] WS7 12M 시뮬과 통합 시 누적 잠식 NPV 일관
- [ ] 대분류 동일 보정 작동 확인
- [ ] 영업 현장 검증: "Top 잠식 품목 = 같은 카테고리 품목" 직관 일치

## 회귀 방어

| 항목 | 보장 |
|---|---|
| `useCannibalization=false` 기본 | Phase A/B/C/WS7 동작 그대로 |
| 옵셔널 props 패턴 | WS1/WS4/WS6/WS7와 동일 |
| 기존 차트 무변경 | heatmap은 별도 영역 |
| 모듈 독립성 | cannibalization는 offsetEffect 의존 X (cvpItems · timeSeriesResult 패러미터로 전달) |
| 성능 | Top-15 품목 한정 + memoization |
| 데이터 부재 시 | customerItemDetail 비어있으면 모듈 자체가 disabled (UI에 "데이터 부족" 배지) |

## 범위 외

- **외부 시장 잠식 (경쟁사 → 우리)** — WS6에서 처리 완료
- **계열사 간 잠식** — 데이터 부재
- **광고/프로모션 잠식** — 마케팅 데이터 부재
- **동적 잠식 학습** (시간에 따라 c 변화) — Phase v3 이상
- **24개월+ 시계열** — WS7과 동일 한계 (14M)

## 리스크와 완화

| 리스크 | 가능성 | 완화 |
|---|---|---|
| 14M 시계열로 상관 신뢰도 낮음 | 중-상 | 샘플 ≥ 4M 필터 + 신뢰도 배지 표시 (high/medium/low) |
| Pearson은 선형 관계만 포착 | 중 | "단순 상관" 명시, Spearman 대안은 v3 |
| 대분류 보정 1.5배 가정 | 중 | 슬라이더로 사용자 조정 가능 |
| heatmap 시각화 복잡 | 낮음 | Top-15 품목 한정 + 색상 범례 명확 |
| 인과관계 ≠ 상관 | 상 | "상관 기반 추정"임을 UI 명시, 의사결정 보조 도구로 위치 |
| 거래처별 분산 시 데이터 희소 | 중 | 거래처 평균 우선 + 개별 거래처 드릴다운은 옵션 |

## 예상 영향

- **LOC**: +645 (Plan +500 추정 +29%)
- **McKinsey E축**: 50% → **85%** (+35%p, Phase C 최대 단일 도약)
- **McKinsey F축**: 48% → **55%** (+7%p, capacity 영향 부분)
- **McKinsey 전체**: ~80% → **~95%** ✅
- **Phase C 진행률**: **3/3 완료** → Phase C 종료
- **Phase D (v3) 자산**: 카니발 매트릭스가 향후 다이나믹 가격 결정 엔진의 입력으로 재사용

## 다음 단계 (Plan 승인 후)

1. `/pdca design ws8-cannibalization` 또는 바로 구현 착수 (`/pdca do`)
2. Match Rate ≥ 95% 후 Gap 분석 + Report
3. **Phase C 종료** → McKinsey 95% 달성 자축 + v3 로드맵 검토
4. (옵션) 6 WS 통합 회고 보고서 — Phase A+B+C 전체 자산 인벤토리

## Phase C 진행 현황 (WS8 착수 시점)

| WS | 축 | 변화 | 상태 |
|---|---|---|---|
| WS6 경쟁사 반응 | C | 15% → 55% | ✅ 완료 |
| WS7 시간 차원 | D | 75% → 90% | ✅ 완료 |
| **WS8 카니발라이제이션** | **E** | **50% → 85%** | **🔄 진행** |
| Phase C 종료 후 평균 | — | ~80% → **~95%** | 🎯 목표 |
